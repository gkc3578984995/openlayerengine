import { readFileSync } from 'node:fs';
import Collection from 'ol/Collection.js';
import type { FeatureLike } from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import type Layer from 'ol/layer/Layer.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { clearUserProjection, setUserProjection } from 'ol/proj.js';
import type Source from 'ol/source/Source.js';
import VectorSource from 'ol/source/Vector.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { FeatureBinding, type ProjectionSuppressionLease } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { EditInteractionAdapter } from '../src/adapters/openlayers/interactions/EditInteractionAdapter.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { Coordinate } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import type { EditInteractionEvent, EditInteractionRenderState } from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ElementStyleState } from '../src/core/style/types.js';

const style: ElementStyleState = { strokes: [{ color: '#3366ff', width: 3 }] };

interface FeatureAtPixelOptions {
  readonly layerFilter?: (layer: Layer<Source>) => boolean;
}

class MapHarness {
  readonly layers = new Collection<BaseLayer>();
  readonly interactions = new Collection<Interaction>();
  readonly view: View;

  constructor(center: Coordinate = [0, 0], projection = 'EPSG:4326') {
    this.view = new View({ projection, center: [...center], zoom: 2 });
  }

  getLayers(): Collection<BaseLayer> {
    return this.layers;
  }

  getAllLayers(): Layer<Source>[] {
    const visit = (layers: readonly BaseLayer[]): Layer<Source>[] =>
      layers.flatMap((layer) => (layer instanceof LayerGroup ? visit(layer.getLayers().getArray()) : [layer as Layer<Source>]));
    return visit(this.layers.getArray());
  }

  addLayer(layer: BaseLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: BaseLayer): BaseLayer | undefined {
    return this.layers.remove(layer);
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

  forEachFeatureAtPixel<T>(
    pixel: readonly number[],
    callback: (feature: FeatureLike, layer: Layer<Source>, geometry: Geometry) => T,
    options: FeatureAtPixelOptions = {}
  ): T | undefined {
    for (const candidate of [...this.layers.getArray()].reverse()) {
      if (!(candidate instanceof VectorLayer) || (options.layerFilter !== undefined && !options.layerFilter(candidate))) continue;
      const source = candidate.getSource();
      if (source === null) continue;
      for (const feature of [...source.getFeatures()].reverse()) {
        const geometry = feature.getGeometry();
        if (!(geometry instanceof Point)) continue;
        const coordinate = geometry.getCoordinates();
        if (coordinate[0] !== pixel[0] || coordinate[1] !== pixel[1]) continue;
        const result = callback(feature, candidate, geometry);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  }
}

function element(
  controlPoints: readonly Coordinate[] = [
    [0, 0],
    [8, 0]
  ]
): ElementState {
  return {
    id: 'editable',
    type: 'polyline',
    geometry: { type: 'polyline', controlPoints },
    style,
    module: 'routes',
    layerId: 'edit-layer',
    visible: true
  };
}

function renderState(
  coordinates: readonly Coordinate[] = [
    [0, 0],
    [8, 0]
  ],
  insertion: Coordinate = [4, 0]
): EditInteractionRenderState {
  return {
    geometry: { type: 'polyline', coordinates },
    style,
    anchors: [
      { kind: 'control', index: 0, coordinate: coordinates[0], role: 'start', removable: false },
      { kind: 'control', index: 1, coordinate: coordinates[1], role: 'end', removable: true },
      { kind: 'insertion', index: 1, coordinate: insertion }
    ]
  };
}

function setup(options: Readonly<{ wrapX?: boolean; center?: Coordinate; projection?: string; state?: ElementState }> = {}) {
  const map = new MapHarness(options.center, options.projection);
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  const layers = new LayerAdapter(map as unknown as OlMap, refs);
  layers.attach({ kind: 'vector', id: 'edit-layer', visible: true, opacity: 1, wrapX: options.wrapX ?? true, declutter: false });
  const entry = options.state ?? element();
  store.add(entry);
  const styles = new StyleCompiler(refs);
  const binding = new FeatureBinding(store, layers, new GeometryCodec(shapes), styles);
  const reports: unknown[] = [];
  const adapter = new EditInteractionAdapter(map as unknown as OlMap, layers, binding, styles, {
    errorReporter: (error) => reports.push(error)
  });
  return {
    adapter,
    binding,
    entry,
    layers,
    map,
    persistentFeature: binding.requireFeature(entry.id),
    persistentSource: layers.requireVectorSource(entry.layerId),
    reports,
    store,
    styles
  };
}

function temporaryLayer(map: MapHarness): VectorLayer<VectorSource<FeatureLike>> {
  const layer = map.layers.getArray().find((candidate, index) => candidate instanceof VectorLayer && index > 0);
  if (!(layer instanceof VectorLayer)) throw new Error('Missing temporary edit layer');
  return layer as VectorLayer<VectorSource<FeatureLike>>;
}

function editInteraction(map: MapHarness): Interaction {
  const current = map.interactions.item(0);
  if (current === null) throw new Error('Missing edit interaction');
  return current;
}

function pointerEvent(
  type: string,
  coordinate: Coordinate,
  fields: Readonly<{ altKey?: boolean; button?: number; isPrimary?: boolean; nativeType?: string }> = {}
): MapBrowserEvent {
  return {
    type,
    coordinate: [...coordinate],
    pixel: [coordinate[0], coordinate[1]],
    originalEvent: {
      type: fields.nativeType ?? type,
      altKey: fields.altKey ?? false,
      button: fields.button ?? 0,
      isPrimary: fields.isPrimary ?? true
    }
  } as unknown as MapBrowserEvent;
}

describe('EditInteractionAdapter', () => {
  it('hands off persistent projection suppression and renders detached preview, underlay, and anchors in the selected world copy', () => {
    const entry = element([
      [170, 10],
      [190, 20]
    ]);
    const { adapter, binding, map, persistentFeature, persistentSource, store } = setup({ center: [540, 0], state: entry, wrapX: true });
    const nativeSuppress = binding.suppressProjection.bind(binding);
    let acquisition: ProjectionSuppressionLease | undefined;
    vi.spyOn(binding, 'suppressProjection').mockImplementation((id) => {
      acquisition = nativeSuppress(id);
      return acquisition;
    });
    const callerControlPoints: Coordinate[] = [
      [170, 10],
      [190, 20]
    ];

    const handle = adapter.open({ elementId: entry.id, controlPoints: callerControlPoints, underlay: true }, vi.fn());
    callerControlPoints[0] = [999, 999];

    expect(acquisition?.active).toBe(false);
    expect(handle.placement).toEqual({
      controlPoints: [
        [530, 10],
        [550, 20]
      ],
      handoff: { kind: 'wrapped', world: { minX: -180, width: 360 } }
    });
    expect(persistentSource.hasFeature(persistentFeature)).toBe(false);
    expect(map.layers.getLength()).toBe(2);
    expect(map.interactions.getLength()).toBe(1);

    const firstCoordinates: Coordinate[] = [
      [530, 10],
      [550, 20]
    ];
    const first = renderState(firstCoordinates, [540, 15]);
    handle.render(first);
    firstCoordinates[0] = [1, 1];

    const layer = temporaryLayer(map);
    const source = layer.getSource();
    if (source === null) throw new Error('Missing temporary source');
    const firstLines = source
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is LineString => geometry instanceof LineString);
    expect(firstLines).toHaveLength(2);
    expect(firstLines.map((line) => line.getCoordinates())).toEqual([
      [
        [530, 10],
        [550, 20]
      ],
      [
        [530, 10],
        [550, 20]
      ]
    ]);
    expect(source.getFeatures().filter((feature) => feature.getGeometry() instanceof Point)).toHaveLength(3);
    expect(store.get(entry.id)).toEqual(entry);

    handle.render(
      renderState(
        [
          [530, 10],
          [560, 30]
        ],
        [545, 20]
      )
    );
    const secondSource = layer.getSource();
    if (secondSource === null) throw new Error('Missing replaced temporary source');
    const secondLines = secondSource
      .getFeatures()
      .map((feature) => feature.getGeometry())
      .filter((geometry): geometry is LineString => geometry instanceof LineString);
    expect(secondLines.map((line) => line.getCoordinates())).toEqual([
      [
        [530, 10],
        [550, 20]
      ],
      [
        [530, 10],
        [560, 30]
      ]
    ]);

    acquisition?.release();
    expect(persistentSource.hasFeature(persistentFeature)).toBe(false);
    handle.destroy();

    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(secondSource.getFeatures()).toEqual([]);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    expect(store.get(entry.id)).toEqual(entry);
  });

  it('omits the entry underlay when disabled and never publishes temporary features through FeatureBinding', () => {
    const { adapter, binding, map, persistentFeature, persistentSource, store } = setup({ wrapX: false });
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());

    const source = temporaryLayer(map).getSource();
    if (source === null) throw new Error('Missing temporary source');
    expect(
      source
        .getFeatures()
        .map((feature) => feature.getGeometry())
        .filter((geometry) => geometry instanceof LineString)
    ).toHaveLength(1);
    expect(source.getFeatures()).toHaveLength(4);
    for (const feature of source.getFeatures()) {
      expect(binding.elementIdFor(feature as never)).toBeUndefined();
      expect(binding.resolveFeature(feature as never)).toBeUndefined();
    }
    expect(persistentSource.hasFeature(persistentFeature)).toBe(false);
    expect(store.get('editable')?.geometry).toEqual(element().geometry);

    handle.destroy();
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
  });

  it('maps control drags, insertion clicks, and Alt-removal clicks to detached semantic events', () => {
    const { adapter, map, reports } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => {
        received.push(event);
        if (event.type === 'insert') throw new Error('listener failed');
      }
    );
    handle.render(renderState());
    const input = editInteraction(map);

    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    input.handleEvent(pointerEvent('pointerdrag', [2, 1], { button: -1 }));
    input.handleEvent(pointerEvent('pointercancel', [2, 1], { button: -1 }));
    input.handleEvent(pointerEvent('pointerdown', [8, 0]));
    input.handleEvent(pointerEvent('pointerdrag', [9, 2], { button: -1 }));
    input.handleEvent(pointerEvent('pointerup', [10, 3], { button: -1 }));
    input.handleEvent(pointerEvent('click', [4, 0]));
    input.handleEvent(pointerEvent('click', [8, 0], { altKey: true }));

    expect(received).toEqual([
      { type: 'move-start', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false }, coordinate: [0, 0] },
      { type: 'move', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false }, coordinate: [2, 1] },
      { type: 'move-cancel', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false } },
      { type: 'move-start', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }, coordinate: [8, 0] },
      { type: 'move', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }, coordinate: [9, 2] },
      { type: 'move-end', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true }, coordinate: [10, 3] },
      { type: 'insert', anchor: { kind: 'insertion', index: 1, coordinate: [4, 0] } },
      { type: 'remove', anchor: { kind: 'control', index: 1, coordinate: [8, 0], role: 'end', removable: true } }
    ]);
    expect(received.every(Object.isFrozen)).toBe(true);
    expect(reports.map((error) => (error as Error).message)).toEqual(['listener failed']);

    handle.destroy();
    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    expect(received).toHaveLength(8);
  });

  it('maps an OL pointerup that wraps a native pointercancel to move-cancel', () => {
    const { adapter, map } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const input = editInteraction(map);

    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    input.handleEvent(pointerEvent('pointerup', [2, 1], { button: -1, nativeType: 'pointercancel' }));

    expect(received).toEqual([
      { type: 'move-start', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false }, coordinate: [0, 0] },
      { type: 'move-cancel', anchor: { kind: 'control', index: 0, coordinate: [0, 0], role: 'start', removable: false } }
    ]);
    handle.destroy();
  });

  it('uses the OpenLayers user projection for wrapped edit placement', () => {
    setUserProjection('EPSG:4326');
    try {
      const entry = element([
        [170, 10],
        [190, 20]
      ]);
      const { adapter } = setup({ center: [540, 0], projection: 'EPSG:3857', state: entry, wrapX: true });

      const handle = adapter.open({ elementId: entry.id, controlPoints: entry.geometry.controlPoints, underlay: false }, vi.fn());

      expect(handle.placement).toEqual({
        controlPoints: [
          [530, 10],
          [550, 20]
        ],
        handoff: { kind: 'wrapped', world: { minX: -180, width: 360 } }
      });
      handle.destroy();
    } finally {
      clearUserProjection();
    }
  });

  it('retires superseded render resources immediately and retains only failed retirement for destroy retry', () => {
    const { adapter, map, reports } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const firstSource = layer.getSource();
    if (firstSource === null) throw new Error('Missing first render source');
    const firstFeatures = firstSource.getFeatures();
    const firstClear = vi.spyOn(firstSource, 'clear');
    const firstDispose = vi.spyOn(firstSource, 'dispose');
    const firstFeatureDisposals = firstFeatures.map((feature) => vi.spyOn(feature, 'dispose'));

    handle.render(
      renderState(
        [
          [0, 0],
          [10, 2]
        ],
        [5, 1]
      )
    );

    expect(firstClear).toHaveBeenCalledOnce();
    expect(firstSource.getFeatures()).toEqual([]);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(firstFeatures.every((feature) => feature.getGeometry() === undefined && feature.getStyle() === undefined)).toBe(true);
    expect(firstFeatureDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);

    const secondSource = layer.getSource();
    if (secondSource === null) throw new Error('Missing second render source');
    const nativeSecondClear = secondSource.clear.bind(secondSource);
    const secondDispose = vi.spyOn(secondSource, 'dispose');
    const secondClear = vi.spyOn(secondSource, 'clear').mockImplementationOnce(() => {
      throw new Error('retirement clear failed');
    });
    secondClear.mockImplementation((fast) => nativeSecondClear(fast));

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      )
    ).not.toThrow();
    expect(secondClear).toHaveBeenCalledOnce();
    expect(secondSource.getFeatures()).not.toEqual([]);
    expect(reports.map((error) => (error as Error).message)).toContain('retirement clear failed');

    handle.destroy();
    expect(firstClear).toHaveBeenCalledOnce();
    expect(secondClear).toHaveBeenCalledTimes(2);
    expect(secondSource.getFeatures()).toEqual([]);
    expect(secondDispose).toHaveBeenCalledOnce();
  });

  it('preserves the preceding render atomically and emits nothing from a failing source handoff', () => {
    const { adapter, map, styles } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const input = editInteraction(map);
    const previousSource = layer.getSource();
    if (previousSource === null) throw new Error('Missing previous source');
    const previousFeatures = previousSource.getFeatures();

    vi.spyOn(styles, 'compile').mockImplementationOnce(() => {
      throw new Error('compile failed');
    });
    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      )
    ).toThrowError('compile failed');
    expect(layer.getSource()).toBe(previousSource);
    expect(previousSource.getFeatures()).toEqual(previousFeatures);

    const nativeSetSource = layer.setSource.bind(layer);
    const setSource = vi.spyOn(layer, 'setSource').mockImplementationOnce((source) => {
      nativeSetSource(source);
      input.handleEvent(pointerEvent('click', [7, 2]));
      throw new Error('source handoff failed');
    });
    setSource.mockImplementation((source) => nativeSetSource(source));

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [14, 4]
          ],
          [7, 2]
        )
      )
    ).toThrowError('source handoff failed');
    expect(setSource).toHaveBeenCalledTimes(2);
    expect(layer.getSource()).toBe(previousSource);
    expect(previousSource.getFeatures()).toEqual(previousFeatures);
    expect(received).toEqual([]);

    input.handleEvent(pointerEvent('click', [4, 0]));
    expect(received).toEqual([{ type: 'insert', anchor: { kind: 'insertion', index: 1, coordinate: [4, 0] } }]);
    handle.destroy();
  });

  it('keeps the layer source cleared when change:source destroys the handle during render', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);

    layer.once('change:source', () => handle.destroy());

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      )
    ).toThrowError('OpenLayers did not install the edit render snapshot');
    expect(layer.getSource()).toBeNull();

    expect(() => handle.destroy()).not.toThrow();
    expect(layer.getSource()).toBeNull();
  });

  it('throws when retiring the preceding source synchronously destroys the handle', () => {
    const { adapter, map } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const precedingSource = layer.getSource();
    if (precedingSource === null) throw new Error('Missing preceding source');
    precedingSource.once('clear', () => handle.destroy());

    expect(() =>
      handle.render(
        renderState(
          [
            [0, 0],
            [12, 4]
          ],
          [6, 2]
        )
      )
    ).toThrowError('Edit interaction was destroyed during render');
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(() => handle.destroy()).not.toThrow();
  });

  it('rolls back a failed open, including suppression, after partial OL layer and interaction attachment', () => {
    const { adapter, binding, map, persistentFeature, persistentSource } = setup();
    const events: EditInteractionEvent[] = [];
    const nativeSuppress = binding.suppressProjection.bind(binding);
    let acquisition: ProjectionSuppressionLease | undefined;
    vi.spyOn(binding, 'suppressProjection').mockImplementation((id) => {
      acquisition = nativeSuppress(id);
      return acquisition;
    });
    const nativeAddLayer = map.addLayer.bind(map);
    let candidateLayer: BaseLayer | undefined;
    vi.spyOn(map, 'addLayer').mockImplementation((layer) => {
      candidateLayer = layer;
      nativeAddLayer(layer);
    });
    const nativeAddInteraction = map.addInteraction.bind(map);
    let candidateInteraction: Interaction | undefined;
    vi.spyOn(map, 'addInteraction').mockImplementation((interaction) => {
      candidateInteraction = interaction;
      nativeAddInteraction(interaction);
      interaction.handleEvent(pointerEvent('click', [4, 0]));
      throw new Error('interaction attach failed');
    });
    const nativeRemoveLayer = map.removeLayer.bind(map);
    const removeLayer = vi.spyOn(map, 'removeLayer').mockImplementationOnce(() => {
      throw new Error('first layer rollback failed');
    });
    removeLayer.mockImplementation((layer) => nativeRemoveLayer(layer));
    const nativeRemoveInteraction = map.removeInteraction.bind(map);
    const removeInteraction = vi.spyOn(map, 'removeInteraction').mockImplementationOnce(() => {
      throw new Error('first interaction rollback failed');
    });
    removeInteraction.mockImplementation((interaction) => nativeRemoveInteraction(interaction));

    expect(() =>
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        (event) => events.push(event)
      )
    ).toThrowError('interaction attach failed');

    expect(events).toEqual([]);
    expect(acquisition?.active).toBe(false);
    expect(map.layers.getArray()).not.toContain(candidateLayer);
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getArray()).not.toContain(candidateInteraction);
    expect(map.interactions.getLength()).toBe(0);
    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    candidateInteraction?.handleEvent(pointerEvent('click', [4, 0]));
    expect(events).toEqual([]);
  });

  it('surfaces both installation and unrecoverable rollback failures', () => {
    const { adapter, map } = setup();
    const events: EditInteractionEvent[] = [];
    const nativeAddInteraction = map.addInteraction.bind(map);
    vi.spyOn(map, 'addInteraction').mockImplementation((interaction) => {
      nativeAddInteraction(interaction);
      throw new Error('installation failed');
    });
    vi.spyOn(map, 'removeInteraction').mockImplementation(() => {
      throw new Error('map interaction removal failed');
    });
    vi.spyOn(map, 'removeLayer').mockImplementation(() => {
      throw new Error('map layer removal failed');
    });
    vi.spyOn(map.interactions, 'remove').mockImplementation(() => {
      throw new Error('collection interaction removal failed');
    });
    vi.spyOn(map.layers, 'remove').mockImplementation(() => {
      throw new Error('collection layer removal failed');
    });

    let failure: unknown;
    try {
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        (event) => events.push(event)
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toContain('installation failed');
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toContain('map layer removal failed');
    const abandoned = editInteraction(map);
    expect(abandoned.getActive()).toBe(false);
    abandoned.handleEvent(pointerEvent('click', [4, 0]));
    expect(events).toEqual([]);
  });

  it('attempts every early-open cleanup and surfaces the original and rollback failures', () => {
    const { adapter, binding, layers } = setup();
    const releaseFailure = new Error('suppression release failed');
    const installFailure = new Error('z-index lookup failed');
    const release = vi.fn(() => {
      throw releaseFailure;
    });
    const lease: ProjectionSuppressionLease = {
      elementId: 'editable',
      active: true,
      handoff: () => lease,
      release
    };
    vi.spyOn(binding, 'suppressProjection').mockReturnValue(lease);
    vi.spyOn(layers.requireLayer('edit-layer'), 'getZIndex').mockImplementationOnce(() => {
      throw installFailure;
    });
    const disposeSource = vi.spyOn(VectorSource.prototype, 'dispose');

    let failure: unknown;
    let disposeCalls = 0;
    try {
      adapter.open(
        {
          elementId: 'editable',
          controlPoints: [
            [0, 0],
            [8, 0]
          ],
          underlay: false
        },
        vi.fn()
      );
    } catch (error) {
      failure = error;
    } finally {
      disposeCalls = disposeSource.mock.calls.length;
      disposeSource.mockRestore();
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual(expect.arrayContaining([installFailure, releaseFailure]));
    expect(release).toHaveBeenCalledOnce();
    expect(disposeCalls).toBe(1);
  });

  it('stops events first, attempts every destroy cleanup, and retries only unfinished work', () => {
    const { adapter, map, persistentFeature, persistentSource, reports } = setup();
    const received: EditInteractionEvent[] = [];
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => received.push(event)
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const source = layer.getSource();
    if (source === null) throw new Error('Missing temporary source');
    const input = editInteraction(map);
    const order: string[] = [];
    const nativeSetActive = input.setActive.bind(input);
    const setActive = vi.spyOn(input, 'setActive').mockImplementation((active) => {
      order.push('deactivate');
      nativeSetActive(active);
    });
    const nativeRemoveLayer = map.removeLayer.bind(map);
    const removeLayer = vi.spyOn(map, 'removeLayer').mockImplementationOnce(() => {
      order.push('layer');
      throw new Error('layer cleanup failed');
    });
    removeLayer.mockImplementation((candidate) => {
      order.push('layer');
      return nativeRemoveLayer(candidate);
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
    const nativeClear = source.clear.bind(source);
    const clear = vi.spyOn(source, 'clear').mockImplementationOnce(() => {
      order.push('source');
      throw new Error('source cleanup failed');
    });
    clear.mockImplementation((fast) => {
      order.push('source');
      nativeClear(fast);
    });

    expect(() => handle.destroy()).toThrowError('layer cleanup failed');
    expect(order).toEqual(['deactivate', 'layer', 'interaction', 'source']);
    expect(reports.map((error) => (error as Error).message)).toEqual(['layer cleanup failed', 'interaction cleanup failed', 'source cleanup failed']);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    input.handleEvent(pointerEvent('pointerdown', [0, 0]));
    expect(received).toEqual([]);

    handle.destroy();
    expect(order).toEqual(['deactivate', 'layer', 'interaction', 'source', 'layer', 'interaction', 'source']);
    expect(setActive).toHaveBeenCalledOnce();
    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(2);
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(source.getFeatures()).toEqual([]);

    handle.destroy();
    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeInteraction).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('continues all destroy finalizers when a post-deactivation state check throws', () => {
    const { adapter, map, persistentFeature, persistentSource, reports } = setup();
    const handle = adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      vi.fn()
    );
    handle.render(renderState());
    const layer = temporaryLayer(map);
    const source = layer.getSource();
    if (source === null) throw new Error('Missing temporary source');
    const input = editInteraction(map);
    vi.spyOn(input, 'getActive').mockImplementation(() => {
      throw new Error('active state check failed');
    });

    expect(() => handle.destroy()).toThrowError('active state check failed');
    expect(map.layers.getLength()).toBe(1);
    expect(map.interactions.getLength()).toBe(0);
    expect(source.getFeatures()).toEqual([]);
    expect(persistentSource.getFeatures()).toEqual([persistentFeature]);
    expect(reports.map((error) => (error as Error).message)).toContain('active state check failed');
    expect(() => handle.destroy()).not.toThrow();
  });

  it('isolates native edit resources and suppression ownership between maps', () => {
    const first = setup({ wrapX: false });
    const second = setup({ wrapX: true });
    const firstEvents: EditInteractionEvent[] = [];
    const secondEvents: EditInteractionEvent[] = [];
    const firstHandle = first.adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: false
      },
      (event) => firstEvents.push(event)
    );
    const secondHandle = second.adapter.open(
      {
        elementId: 'editable',
        controlPoints: [
          [0, 0],
          [8, 0]
        ],
        underlay: true
      },
      (event) => secondEvents.push(event)
    );
    firstHandle.render(renderState());
    secondHandle.render(renderState());

    editInteraction(first.map).handleEvent(pointerEvent('click', [4, 0]));
    editInteraction(second.map).handleEvent(pointerEvent('click', [8, 0], { altKey: true }));
    expect(firstEvents.map(({ type }) => type)).toEqual(['insert']);
    expect(secondEvents.map(({ type }) => type)).toEqual(['remove']);
    expect(first.persistentSource.hasFeature(first.persistentFeature)).toBe(false);
    expect(second.persistentSource.hasFeature(second.persistentFeature)).toBe(false);

    firstHandle.destroy();
    editInteraction(second.map).handleEvent(pointerEvent('click', [4, 0]));
    expect(first.map.layers.getLength()).toBe(1);
    expect(first.map.interactions.getLength()).toBe(0);
    expect(first.persistentSource.getFeatures()).toEqual([first.persistentFeature]);
    expect(second.map.layers.getLength()).toBe(2);
    expect(second.map.interactions.getLength()).toBe(1);
    expect(secondEvents.map(({ type }) => type)).toEqual(['remove', 'insert']);
    expect(second.persistentSource.hasFeature(second.persistentFeature)).toBe(false);

    secondHandle.destroy();
    expect(second.persistentSource.getFeatures()).toEqual([second.persistentFeature]);

    const source = readFileSync('src/adapters/openlayers/interactions/EditInteractionAdapter.ts', 'utf8');
    expect(source).not.toMatch(/\.(?:anchor_|coordinate_|pixel_|map_|source_|handleEvent_)\b/u);
    expect(source).not.toContain("from 'ol/interaction.js'");
  });
});
