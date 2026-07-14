import { readFileSync } from 'node:fs';
import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import type Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import type Layer from 'ol/layer/Layer.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { clearUserProjection, getUserProjection, setUserProjection, useGeographic } from 'ol/proj.js';
import type Source from 'ol/source/Source.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { DrawInteractionAdapter } from '../src/adapters/openlayers/interactions/DrawInteractionAdapter.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import type { DrawInteractionEvent } from '../src/core/ports/DrawInteractionPort.js';
import type { ElementStyleState } from '../src/core/style/types.js';

const style: ElementStyleState = { strokes: [{ color: '#3366ff', width: 3 }] };

class MapHarness {
  readonly layers = new Collection<BaseLayer>();
  readonly interactions = new Collection<Interaction>();
  readonly view: View;

  constructor(projection = 'EPSG:4326') {
    this.view = new View({ projection, center: [0, 0], zoom: 2 });
  }

  getLayers(): Collection<BaseLayer> {
    return this.layers;
  }

  getAllLayers(): Layer<Source>[] {
    const visit = (layers: readonly BaseLayer[]): Layer<Source>[] =>
      layers.flatMap((layer) => (layer instanceof LayerGroup ? visit(layer.getLayers().getArray()) : [layer as Layer<Source>]));
    return visit(this.layers.getArray());
  }

  getInteractions(): Collection<Interaction> {
    return this.interactions;
  }

  addInteraction(interaction: Interaction): void {
    this.interactions.push(interaction);
    interaction.setMap(this as unknown as OlMap);
  }

  removeInteraction(interaction: Interaction): Interaction | undefined {
    const removed = this.interactions.remove(interaction);
    if (removed !== undefined) interaction.setMap(null);
    return removed;
  }

  getView(): View {
    return this.view;
  }
}

function setup(wrapX = true, projection = 'EPSG:4326') {
  const map = new MapHarness(projection);
  const refs = new NativeRefRegistry();
  const layers = new LayerAdapter(map as unknown as OlMap, refs);
  layers.attach({ kind: 'vector', id: 'draw-layer', visible: true, opacity: 1, wrapX, declutter: false });
  const styles = new StyleCompiler(refs);
  const reports: unknown[] = [];
  const adapter = new DrawInteractionAdapter(map as unknown as OlMap, layers, styles, { errorReporter: (error) => reports.push(error) });
  return { adapter, layers, map, reports, source: layers.requireVectorSource('draw-layer'), styles };
}

function pointerEvent(
  type: string,
  coordinate: readonly [number, number],
  fields: Readonly<{ shiftKey?: boolean; button?: number; isPrimary?: boolean; nativeType?: string }> = {}
): MapBrowserEvent {
  return {
    type,
    coordinate: [...coordinate],
    originalEvent: {
      type: fields.nativeType ?? type,
      shiftKey: fields.shiftKey ?? false,
      button: fields.button ?? 0,
      isPrimary: fields.isPrimary ?? true
    }
  } as unknown as MapBrowserEvent;
}

function interaction(map: MapHarness): Interaction {
  const current = map.interactions.item(0);
  if (current === null) throw new Error('Missing draw interaction');
  return current;
}

describe('DrawInteractionAdapter', () => {
  it('uses the OpenLayers user projection for both routed coordinates and wrap metadata', () => {
    const previousUserProjection = getUserProjection();
    useGeographic();
    try {
      const { adapter, map } = setup(true, 'EPSG:3857');
      const received: DrawInteractionEvent[] = [];
      const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, (event) => received.push(event));

      interaction(map).handleEvent(pointerEvent('click', [120, 30]));

      expect(received).toEqual([{ type: 'click', coordinate: [120, 30] }]);
      expect(handle.world).toEqual({ minX: -180, width: 360 });
      handle.destroy();
    } finally {
      if (previousUserProjection === null) clearUserProjection();
      else setUserProjection(previousUserProjection);
    }
    expect(getUserProjection()).toBe(previousUserProjection);
  });

  it('does not emit ordinary pointer moves while a freehand gesture is active', () => {
    const { adapter, map } = setup();
    const received: DrawInteractionEvent[] = [];
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: true }, (event) => received.push(event));
    const input = interaction(map);

    expect(input.handleEvent(pointerEvent('pointerdown', [1, 2], { shiftKey: true }))).toBe(false);
    expect(input.handleEvent(pointerEvent('pointermove', [2, 3], { shiftKey: true, button: -1 }))).toBe(true);
    expect(input.handleEvent(pointerEvent('pointerdrag', [3, 4], { shiftKey: true, button: -1 }))).toBe(false);
    expect(input.handleEvent(pointerEvent('pointerup', [4, 5], { shiftKey: true, button: -1 }))).toBe(false);

    expect(received).toEqual([
      { type: 'freehand-start', coordinate: [1, 2] },
      { type: 'freehand-sample', coordinate: [3, 4] },
      { type: 'freehand-complete', coordinate: [4, 5] }
    ]);
    handle.destroy();
  });

  it('consumes double clicks while drawing so default map zoom does not run', () => {
    const { adapter, map } = setup();
    const received: DrawInteractionEvent[] = [];
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, (event) => received.push(event));

    expect(interaction(map).handleEvent(pointerEvent('dblclick', [1, 2]))).toBe(false);
    expect(received).toEqual([]);
    handle.destroy();
  });

  it('uses one public Interaction to translate primary ordinary and Shift-freehand input after open returns', () => {
    const { adapter, map } = setup();
    const received: DrawInteractionEvent[] = [];
    const nativeAdd = map.addInteraction.bind(map);
    vi.spyOn(map, 'addInteraction').mockImplementation((candidate) => {
      candidate.handleEvent(pointerEvent('click', [99, 99]));
      nativeAdd(candidate);
    });

    adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: true }, (event) => received.push(event));
    expect(received).toEqual([]);

    const input = interaction(map);
    input.handleEvent(pointerEvent('pointermove', [1, 2]));
    input.handleEvent(pointerEvent('pointermove', [9, 9], { isPrimary: false }));
    input.handleEvent(pointerEvent('click', [3, 4]));
    input.handleEvent(pointerEvent('pointerdown', [5, 6], { shiftKey: true }));
    input.handleEvent(pointerEvent('pointerdrag', [6, 7], { button: -1 }));
    input.handleEvent(pointerEvent('pointerup', [7, 8], { button: -1 }));
    input.handleEvent(pointerEvent('pointerdown', [9, 10]));
    input.handleEvent(pointerEvent('click', [9, 10]));
    input.handleEvent(pointerEvent('pointerdown', [11, 12], { shiftKey: true }));
    input.handleEvent(pointerEvent('pointerup', [11, 12], { button: -1 }));
    input.handleEvent(pointerEvent('click', [11, 12]));
    input.handleEvent(pointerEvent('pointerdown', [12, 13], { shiftKey: true }));
    input.handleEvent(pointerEvent('pointerup', [13, 14], { button: -1, nativeType: 'pointercancel' }));
    input.handleEvent(pointerEvent('click', [13, 14]));

    expect(received).toEqual([
      { type: 'move', coordinate: [1, 2] },
      { type: 'click', coordinate: [3, 4] },
      { type: 'freehand-start', coordinate: [5, 6] },
      { type: 'freehand-sample', coordinate: [6, 7] },
      { type: 'freehand-complete', coordinate: [7, 8] },
      { type: 'click', coordinate: [9, 10] },
      { type: 'freehand-start', coordinate: [11, 12] },
      { type: 'freehand-complete', coordinate: [11, 12] },
      { type: 'freehand-start', coordinate: [12, 13] },
      { type: 'freehand-cancel' }
    ]);
  });

  it('rejects a non-vector target or a source that does not belong to the target layer before installation', () => {
    const target = setup();
    const other = setup();
    const requireLayer = vi.spyOn(target.layers, 'requireLayer').mockReturnValue(new LayerGroup());

    expect(() => target.adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn())).toThrowError(
      'Draw target must be a registered vector layer'
    );
    requireLayer.mockRestore();
    vi.spyOn(target.layers, 'requireVectorSource').mockReturnValue(other.source);
    expect(() => target.adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn())).toThrowError(
      'Draw target must be a registered vector layer'
    );
    expect(target.map.interactions.getLength()).toBe(0);
  });

  it('publishes a detached wrap world and owns one temporary styled preview Feature', () => {
    const { adapter, map, source } = setup(true);
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    const coordinates: [number, number][] = [
      [0, 0],
      [4, 2]
    ];

    expect(handle.world).toEqual({ minX: -180, width: 360 });
    expect(Object.isFrozen(handle.world)).toBe(true);
    handle.render({ geometry: { type: 'polyline', coordinates }, style });
    coordinates[0][0] = 99;

    const feature = source.getFeatures()[0];
    expect(source.getFeatures()).toHaveLength(1);
    expect(feature.getGeometry()).toBeInstanceOf(LineString);
    expect((feature.getGeometry() as Geometry & LineString).getCoordinates()).toEqual([
      [0, 0],
      [4, 2]
    ]);
    expect(feature.getStyle()).not.toBeNull();

    handle.render(undefined);
    expect(source.getFeatures()).toEqual([]);
    handle.destroy();
    expect(map.interactions.getLength()).toBe(0);
  });

  it('serializes a render reentered by a synchronous source add listener without leaving a ghost preview', () => {
    const { adapter, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    let reentered = false;
    source.on('addfeature', () => {
      if (reentered) return;
      reentered = true;
      handle.render({ geometry: { type: 'point', coordinates: [9, 10] }, style });
    });

    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });

    expect(source.getFeatures()).toHaveLength(1);
    expect((source.getFeatures()[0].getGeometry() as Point).getCoordinates()).toEqual([9, 10]);
    handle.destroy();
    expect(source.getFeatures()).toEqual([]);
  });

  it('exposes only complete geometry and style snapshots during a reentrant preview replacement', () => {
    const { adapter, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    const redStyle: ElementStyleState = { strokes: [{ color: '#ff0000', width: 4 }] };
    const greenStyle: ElementStyleState = { strokes: [{ color: '#00ff00', width: 5 }] };
    handle.render({ geometry: { type: 'point', coordinates: [1, 1] }, style });
    const snapshots: Array<readonly [readonly number[], unknown]> = [];
    let reentered = false;
    const inspect = () => {
      for (const feature of source.getFeatures()) {
        const renderedStyles = feature.getStyleFunction()?.(feature, 1);
        snapshots.push([(feature.getGeometry() as Point).getCoordinates(), renderedStyles?.at(-1)?.getStroke()?.getColor()]);
      }
      if (reentered) return;
      reentered = true;
      handle.render({ geometry: { type: 'point', coordinates: [3, 3] }, style: greenStyle });
    };
    source.on(['addfeature', 'changefeature', 'removefeature'], inspect);

    handle.render({ geometry: { type: 'point', coordinates: [2, 2] }, style: redStyle });

    expect(snapshots).not.toContainEqual([[2, 2], '#3366ff']);
    expect(snapshots).not.toContainEqual([[3, 3], '#ff0000']);
    expect(source.getFeatures()).toHaveLength(1);
    const current = source.getFeatures()[0];
    expect((current.getGeometry() as Point).getCoordinates()).toEqual([3, 3]);
    expect(current.getStyleFunction()?.(current, 1)?.at(-1)?.getStroke()?.getColor()).toBe('#00ff00');
    handle.destroy();
  });

  it('finishes preview cleanup when a synchronous source listener destroys during replacement', () => {
    const { adapter, map, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    handle.render({ geometry: { type: 'point', coordinates: [1, 1] }, style });
    const first = source.getFeatures()[0];
    const firstDispose = vi.spyOn(first, 'dispose');
    let replacement: Feature<Geometry> | undefined;
    let replacementDispose: ReturnType<typeof vi.spyOn> | undefined;
    source.once('addfeature', (event) => {
      // VectorSource 在 addFeature 返回前同步分发事件，此时销毁必须由外层渲染继续收敛所有权。
      replacement = event.feature;
      replacementDispose = vi.spyOn(event.feature, 'dispose');
      handle.destroy();
    });

    expect(() => handle.render({ geometry: { type: 'point', coordinates: [2, 2] }, style })).toThrowError('Draw interaction was destroyed during render');

    expect(source.getFeatures()).toEqual([]);
    expect(map.interactions.getLength()).toBe(0);
    expect(first.getGeometry()).toBeUndefined();
    expect(first.getStyle()).toBeUndefined();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(replacement?.getGeometry()).toBeUndefined();
    expect(replacement?.getStyle()).toBeUndefined();
    expect(replacementDispose).toHaveBeenCalledOnce();
    handle.destroy();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(replacementDispose).toHaveBeenCalledOnce();
  });

  it('supports every RenderGeometryState using only public OL geometry APIs', () => {
    const { adapter, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());

    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0].getGeometry()).toBeInstanceOf(Point);
    handle.render({
      geometry: {
        type: 'polyline',
        coordinates: [
          [0, 0],
          [2, 1]
        ]
      },
      style
    });
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0].getGeometry()).toBeInstanceOf(LineString);
    handle.render({
      geometry: {
        type: 'polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [0, 2],
            [0, 0]
          ]
        ]
      },
      style
    });
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0].getGeometry()).toBeInstanceOf(Polygon);
    handle.render({ geometry: { type: 'circle', center: [3, 4], radius: 5 }, style });
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0].getGeometry()).toBeInstanceOf(Circle);

    const adapterSource = readFileSync('src/adapters/openlayers/interactions/DrawInteractionAdapter.ts', 'utf8');
    expect(adapterSource).not.toMatch(/\.(?:anchor_|coordinate_|pixel_|map_|source_|handleEvent_)\b/u);
    expect(adapterSource).not.toContain("from 'ol/interaction.js'");
  });

  it('preserves the preceding complete preview when preparation, replacement, or clear fails', () => {
    const { adapter, source, styles } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    handle.render({
      geometry: {
        type: 'polyline',
        coordinates: [
          [0, 0],
          [4, 2]
        ]
      },
      style
    });
    const feature = source.getFeatures()[0];
    const previousGeometry = feature.getGeometry();
    const previousStyle = feature.getStyle();

    vi.spyOn(styles, 'compile').mockImplementationOnce(() => {
      throw new Error('compile failed');
    });
    expect(() => handle.render({ geometry: { type: 'point', coordinates: [9, 9] }, style })).toThrowError('compile failed');
    expect(source.getFeatures()).toEqual([feature]);
    expect(feature.getGeometry()).toBe(previousGeometry);
    expect(feature.getStyle()).toBe(previousStyle);

    let rejectedReplacement: Feature<Geometry> | undefined;
    let rejectedDispose: ReturnType<typeof vi.spyOn> | undefined;
    vi.spyOn(source, 'addFeature').mockImplementationOnce((candidate) => {
      rejectedReplacement = candidate;
      rejectedDispose = vi.spyOn(candidate, 'dispose');
      throw new Error('replacement add failed');
    });
    expect(() => handle.render({ geometry: { type: 'point', coordinates: [8, 8] }, style })).toThrowError('replacement add failed');
    expect(source.getFeatures()).toEqual([feature]);
    expect(feature.getGeometry()).toBe(previousGeometry);
    expect(feature.getStyle()).toBe(previousStyle);
    expect(rejectedReplacement?.getGeometry()).toBeUndefined();
    expect(rejectedReplacement?.getStyle()).toBeUndefined();
    expect(rejectedDispose).toHaveBeenCalledOnce();

    const nativeRemove = source.removeFeature.bind(source);
    vi.spyOn(source, 'removeFeature').mockImplementationOnce((candidate) => {
      nativeRemove(candidate);
      throw new Error('clear listener failed');
    });
    expect(() => handle.render(undefined)).toThrowError('clear listener failed');
    expect(source.getFeatures()).toEqual([feature]);
  });

  it('retires replaced and cleared Feature snapshots without retaining native resources', () => {
    const { adapter, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });
    const first = source.getFeatures()[0];
    const firstDispose = vi.spyOn(first, 'dispose');

    handle.render({ geometry: { type: 'point', coordinates: [3, 4] }, style });

    const second = source.getFeatures()[0];
    const secondDispose = vi.spyOn(second, 'dispose');
    expect(second).not.toBe(first);
    expect(source.getFeatures()).toEqual([second]);
    expect(first.getGeometry()).toBeUndefined();
    expect(first.getStyle()).toBeUndefined();
    expect(firstDispose).toHaveBeenCalledOnce();

    handle.render(undefined);

    expect(source.getFeatures()).toEqual([]);
    expect(second.getGeometry()).toBeUndefined();
    expect(second.getStyle()).toBeUndefined();
    expect(secondDispose).toHaveBeenCalledOnce();
    handle.destroy();
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('retains only unfinished replacement retirement work for destroy retry', () => {
    const { adapter, reports, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });
    const retired = source.getFeatures()[0];
    const nativeSetGeometry = retired.setGeometry.bind(retired);
    const setGeometry = vi.spyOn(retired, 'setGeometry').mockImplementationOnce(() => {
      throw new Error('retired geometry cleanup failed');
    });
    setGeometry.mockImplementation((geometry) => nativeSetGeometry(geometry));
    const nativeSetStyle = retired.setStyle.bind(retired);
    const setStyle = vi.spyOn(retired, 'setStyle').mockImplementationOnce((nextStyle) => {
      // OpenLayers 的同步监听器可能在样式已经清空后抛错，后置条件必须优先于异常判断。
      nativeSetStyle(nextStyle);
      throw new Error('retired style listener failed');
    });
    setStyle.mockImplementation((nextStyle) => nativeSetStyle(nextStyle));
    const nativeDispose = retired.dispose.bind(retired);
    const dispose = vi.spyOn(retired, 'dispose').mockImplementationOnce(() => {
      throw new Error('retired dispose failed');
    });
    dispose.mockImplementation(() => nativeDispose());

    handle.render({ geometry: { type: 'point', coordinates: [3, 4] }, style });

    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0]).not.toBe(retired);
    expect(retired.getGeometry()).not.toBeUndefined();
    expect(retired.getStyle()).toBeUndefined();
    expect(setGeometry).toHaveBeenCalledOnce();
    expect(setStyle).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(reports.map((error) => (error as Error).message)).toEqual([
      'retired geometry cleanup failed',
      'retired style listener failed',
      'retired dispose failed'
    ]);

    handle.destroy();

    expect(retired.getGeometry()).toBeUndefined();
    expect(setGeometry).toHaveBeenCalledTimes(2);
    expect(setStyle).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('does not retain a detached preview when initial add rollback listeners throw after removal', () => {
    const { adapter, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    const nativeAdd = source.addFeature.bind(source);
    const nativeRemove = source.removeFeature.bind(source);
    vi.spyOn(source, 'addFeature').mockImplementationOnce((feature) => {
      nativeAdd(feature);
      throw new Error('add listener failed');
    });
    vi.spyOn(source, 'removeFeature').mockImplementationOnce((feature) => {
      nativeRemove(feature);
      throw new Error('remove listener failed after removal');
    });

    expect(() => handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style })).toThrowError('add listener failed');
    expect(source.getFeatures()).toEqual([]);

    handle.render({ geometry: { type: 'point', coordinates: [3, 4] }, style });
    expect(source.getFeatures()).toHaveLength(1);
    expect((source.getFeatures()[0].getGeometry() as Point).getCoordinates()).toEqual([3, 4]);
    handle.destroy();
  });

  it('surfaces an incomplete clear rollback while retaining cleanup ownership', () => {
    const { adapter, map, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });
    const preview = source.getFeatures()[0];
    const dispose = vi.spyOn(preview, 'dispose');
    const nativeRemove = source.removeFeature.bind(source);
    vi.spyOn(source, 'removeFeature').mockImplementationOnce((candidate) => {
      nativeRemove(candidate);
      throw new Error('clear listener failed after mutation');
    });
    vi.spyOn(source, 'addFeature').mockImplementationOnce(() => {
      throw new Error('clear rollback add failed');
    });

    let failure: unknown;
    try {
      handle.render(undefined);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toEqual([
      'clear listener failed after mutation',
      'clear rollback add failed'
    ]);
    expect(source.getFeatures()).toEqual([]);
    expect(preview.getGeometry()).toBeUndefined();
    expect(preview.getStyle()).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => handle.render({ geometry: { type: 'point', coordinates: [3, 4] }, style })).toThrowError('Draw interaction has been destroyed');
    handle.destroy();
    expect(map.interactions.getLength()).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('fully rolls back a partial open even when the first interaction removal fails', () => {
    const { adapter, map } = setup();
    const nativeAdd = map.addInteraction.bind(map);
    vi.spyOn(map, 'addInteraction').mockImplementation((candidate) => {
      nativeAdd(candidate);
      throw new Error('interaction add listener failed');
    });
    const remove = vi.spyOn(map, 'removeInteraction').mockImplementation(() => {
      throw new Error('map rollback removal failed');
    });
    const nativeCollectionRemove = map.interactions.remove.bind(map.interactions);
    const collectionRemove = vi.spyOn(map.interactions, 'remove').mockImplementationOnce(() => {
      throw new Error('first collection rollback failed');
    });
    collectionRemove.mockImplementation((candidate) => nativeCollectionRemove(candidate));

    expect(() => adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn())).toThrowError('interaction add listener failed');
    expect(remove).toHaveBeenCalledTimes(2);
    expect(collectionRemove).toHaveBeenCalledTimes(2);
    expect(map.interactions.getLength()).toBe(0);
  });

  it('surfaces an unrecoverable rollback failure instead of hiding it behind the installation error', () => {
    const { adapter, map } = setup();
    const nativeAdd = map.addInteraction.bind(map);
    const received: DrawInteractionEvent[] = [];
    vi.spyOn(map, 'addInteraction').mockImplementation((candidate) => {
      nativeAdd(candidate);
      throw new Error('installation failed');
    });
    vi.spyOn(map, 'removeInteraction').mockImplementation(() => {
      throw new Error('map removal failed');
    });
    vi.spyOn(map.interactions, 'remove').mockImplementation(() => {
      throw new Error('collection removal failed');
    });

    let failure: unknown;
    try {
      adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, (event) => received.push(event));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toContain('installation failed');
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toContain('map removal failed');
    const abandoned = interaction(map);
    expect(abandoned.getActive()).toBe(false);
    abandoned.handleEvent(pointerEvent('click', [1, 2]));
    expect(received).toEqual([]);
  });

  it('stops events first, attempts every cleanup, and retries only unfinished failures', () => {
    const { adapter, map, reports, source } = setup();
    const received: DrawInteractionEvent[] = [];
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, (event) => received.push(event));
    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });
    const input = interaction(map);
    const order: string[] = [];
    const nativeSetActive = input.setActive.bind(input);
    const setActive = vi.spyOn(input, 'setActive').mockImplementation((active) => {
      order.push('deactivate');
      nativeSetActive(active);
    });
    const nativeRemoveFeature = source.removeFeature.bind(source);
    const removeFeature = vi.spyOn(source, 'removeFeature').mockImplementationOnce(() => {
      order.push('preview');
      throw new Error('preview cleanup failed');
    });
    removeFeature.mockImplementation((candidate) => {
      order.push('preview');
      nativeRemoveFeature(candidate);
    });
    const nativeRemoveInteraction = map.removeInteraction.bind(map);
    const removeInteraction = vi.spyOn(map, 'removeInteraction').mockImplementationOnce(() => {
      order.push('interaction');
      throw new Error('interaction cleanup failed');
    });
    removeInteraction.mockImplementation((candidate) => {
      order.push('interaction');
      return nativeRemoveInteraction(candidate);
    });

    expect(() => handle.destroy()).toThrowError('preview cleanup failed');
    expect(order).toEqual(['deactivate', 'preview', 'interaction']);
    input.handleEvent(pointerEvent('click', [9, 9]));
    expect(received).toEqual([]);
    expect(source.getFeatures()).toHaveLength(1);
    expect(map.interactions.getLength()).toBe(1);
    expect(reports.map((error) => (error as Error).message)).toEqual(['preview cleanup failed', 'interaction cleanup failed']);

    handle.destroy();
    expect(order).toEqual(['deactivate', 'preview', 'interaction', 'preview', 'interaction']);
    expect(setActive).toHaveBeenCalledOnce();
    expect(source.getFeatures()).toEqual([]);
    expect(map.interactions.getLength()).toBe(0);
    handle.destroy();
    expect(removeFeature).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
  });

  it('keeps destroy cleanup steps independent and does not infer deactivation from removal', () => {
    const { adapter, map, reports, source } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    handle.render({ geometry: { type: 'point', coordinates: [1, 2] }, style });
    const feature = source.getFeatures()[0];
    const input = interaction(map);

    const nativeSetActive = input.setActive.bind(input);
    const setActive = vi.spyOn(input, 'setActive').mockImplementationOnce(() => {
      throw new Error('deactivation failed before mutation');
    });
    setActive.mockImplementation((active) => nativeSetActive(active));

    const nativeRemoveFeature = source.removeFeature.bind(source);
    const removeFeature = vi.spyOn(source, 'removeFeature').mockImplementationOnce((candidate) => {
      // VectorSource 会先完成移除再同步通知监听器；异常不能把已完成步骤误判为待重试。
      nativeRemoveFeature(candidate);
      throw new Error('remove listener failed after mutation');
    });
    removeFeature.mockImplementation((candidate) => nativeRemoveFeature(candidate));

    const nativeSetGeometry = feature.setGeometry.bind(feature);
    const setGeometry = vi.spyOn(feature, 'setGeometry').mockImplementationOnce(() => {
      throw new Error('geometry cleanup failed before mutation');
    });
    setGeometry.mockImplementation((geometry) => nativeSetGeometry(geometry));

    const nativeSetStyle = feature.setStyle.bind(feature);
    const setStyle = vi.spyOn(feature, 'setStyle').mockImplementationOnce((nextStyle) => {
      nativeSetStyle(nextStyle);
      throw new Error('style listener failed after mutation');
    });
    setStyle.mockImplementation((nextStyle) => nativeSetStyle(nextStyle));

    const nativeDispose = feature.dispose.bind(feature);
    const dispose = vi.spyOn(feature, 'dispose').mockImplementationOnce(() => {
      throw new Error('dispose failed before mutation');
    });
    dispose.mockImplementation(() => nativeDispose());
    const removeInteraction = vi.spyOn(map, 'removeInteraction');

    expect(() => handle.destroy()).toThrowError('deactivation failed before mutation');

    expect(source.getFeatures()).toEqual([]);
    expect(map.interactions.getLength()).toBe(0);
    expect(feature.getGeometry()).not.toBeUndefined();
    expect(feature.getStyle()).toBeUndefined();
    expect(reports.map((error) => (error as Error).message)).toEqual([
      'deactivation failed before mutation',
      'remove listener failed after mutation',
      'geometry cleanup failed before mutation',
      'style listener failed after mutation',
      'dispose failed before mutation'
    ]);

    handle.destroy();

    expect(setActive).toHaveBeenCalledTimes(2);
    expect(removeFeature).toHaveBeenCalledOnce();
    expect(setGeometry).toHaveBeenCalledTimes(2);
    expect(setStyle).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledOnce();
    expect(feature.getGeometry()).toBeUndefined();
    expect(feature.getStyle()).toBeUndefined();
    handle.destroy();
    expect(setActive).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('does not retry deactivation when a public change listener throws after the interaction became inactive', () => {
    const { adapter, map } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    const input = interaction(map);
    const nativeSetActive = input.setActive.bind(input);
    const setActive = vi.spyOn(input, 'setActive').mockImplementationOnce((active) => {
      nativeSetActive(active);
      throw new Error('deactivation listener failed');
    });
    const nativeRemove = map.removeInteraction.bind(map);
    const remove = vi.spyOn(map, 'removeInteraction').mockImplementationOnce(() => {
      throw new Error('interaction removal failed');
    });
    remove.mockImplementation((candidate) => nativeRemove(candidate));

    expect(() => handle.destroy()).toThrowError('deactivation listener failed');
    expect(input.getActive()).toBe(false);
    handle.destroy();

    expect(setActive).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(map.interactions.getLength()).toBe(0);
  });

  it('retries native cleanup calls that return without satisfying their postconditions', () => {
    const { adapter, map } = setup();
    const handle = adapter.open({ layerId: 'draw-layer', mode: 'vertices', freehand: false }, vi.fn());
    const input = interaction(map);
    const nativeSetActive = input.setActive.bind(input);
    const setActive = vi.spyOn(input, 'setActive').mockImplementationOnce(() => undefined);
    setActive.mockImplementation((active) => nativeSetActive(active));
    const nativeRemoveInteraction = map.removeInteraction.bind(map);
    const removeInteraction = vi.spyOn(map, 'removeInteraction').mockImplementationOnce(() => undefined);
    removeInteraction.mockImplementation((candidate) => nativeRemoveInteraction(candidate));

    expect(() => handle.destroy()).toThrowError('OpenLayers did not deactivate the draw interaction');
    expect(map.interactions.getLength()).toBe(1);

    handle.destroy();
    expect(setActive).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(map.interactions.getLength()).toBe(0);
  });

  it('keeps interactions, previews, and destruction isolated across maps', () => {
    const first = setup(false);
    const second = setup(true);
    const firstEvents: DrawInteractionEvent[] = [];
    const secondEvents: DrawInteractionEvent[] = [];
    const firstHandle = first.adapter.open({ layerId: 'draw-layer', mode: 'point', freehand: false }, (event) => firstEvents.push(event));
    const secondHandle = second.adapter.open({ layerId: 'draw-layer', mode: 'point', freehand: false }, (event) => secondEvents.push(event));
    firstHandle.render({ geometry: { type: 'point', coordinates: [1, 1] }, style });
    secondHandle.render({ geometry: { type: 'point', coordinates: [2, 2] }, style });

    interaction(first.map).handleEvent(pointerEvent('click', [3, 3]));
    interaction(second.map).handleEvent(pointerEvent('click', [4, 4]));
    expect(firstEvents).toEqual([{ type: 'click', coordinate: [3, 3] }]);
    expect(secondEvents).toEqual([{ type: 'click', coordinate: [4, 4] }]);
    expect(firstHandle.world).toBeUndefined();
    expect(secondHandle.world).toEqual({ minX: -180, width: 360 });

    firstHandle.destroy();
    interaction(second.map).handleEvent(pointerEvent('click', [5, 5]));
    expect(first.source.getFeatures()).toEqual([]);
    expect(first.map.interactions.getLength()).toBe(0);
    expect(second.source.getFeatures()).toHaveLength(1);
    expect(secondEvents).toEqual([
      { type: 'click', coordinate: [4, 4] },
      { type: 'click', coordinate: [5, 5] }
    ]);
    secondHandle.destroy();
  });
});
