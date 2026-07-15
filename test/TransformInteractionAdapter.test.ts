import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import Observable from 'ol/Observable.js';
import BaseEvent from 'ol/events/Event.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { TransformInteractionAdapter } from '../src/adapters/openlayers/interactions/TransformInteractionAdapter.js';
import type { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import type { TransformHitTest } from '../src/adapters/openlayers/transform/HitTest.js';
import type { LayerRenderPort } from '../src/core/ports/LayerRenderPort.js';
import type { TransformInteractionOptions, TransformInteractionTarget } from '../src/core/ports/TransformInteractionPort.js';

const handleMetadata = 'ol-engine-transform-handle';

class MapHarness extends Observable {
  readonly layers = new Collection<BaseLayer>();
  readonly interactions = new Collection<Interaction>();
  readonly viewport = new EventTarget();
  readonly view = new View({ projection: 'EPSG:4326', center: [0, 0], zoom: 2 });
  hitHandleKey: string | undefined;

  addLayer(layer: BaseLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: BaseLayer): BaseLayer | undefined {
    return this.layers.remove(layer);
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

  getViewport(): HTMLElement {
    return this.viewport as unknown as HTMLElement;
  }

  getView(): View {
    return this.view;
  }

  forEachFeatureAtPixel<T>(
    _pixel: readonly number[],
    callback: (feature: Feature<Geometry>, layer: BaseLayer) => T,
    options: Readonly<{ layerFilter?: (layer: BaseLayer) => boolean }> = {}
  ): T | undefined {
    for (const layer of this.layers.getArray()) {
      if (options.layerFilter?.(layer) === false || !(layer instanceof VectorLayer)) continue;
      const source = (layer as VectorLayer<VectorSource<Feature<Geometry>>>).getSource();
      if (source === null) continue;
      for (const feature of source.getFeatures()) {
        const metadata = feature.get(handleMetadata) as Readonly<{ key?: unknown }> | undefined;
        if (metadata?.key !== this.hitHandleKey) continue;
        return callback(feature, layer);
      }
    }
    return undefined;
  }
}

const options: TransformInteractionOptions = {
  hitTolerance: 2,
  translate: 'feature',
  scale: true,
  stretch: true,
  rotate: true,
  translateBBox: false,
  noFlip: true,
  keepRectangle: true,
  buffer: 16,
  pointRadius: 8
};

describe('TransformInteractionAdapter', () => {
  it('accepts only singleclick events whose immediate click source was observed after the Transform session opened', () => {
    const map = new MapHarness();
    const hitTest = { atPixel: vi.fn(() => [{ elementId: 'candidate', layerId: 'default' }]) } as unknown as TransformHitTest;
    const listener = vi.fn();
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, hitTest, {} as FeatureBinding, {} as StyleCompiler, {} as LayerRenderPort);
    let handle: ReturnType<TransformInteractionAdapter['open']> | undefined;
    map.once('click', () => {
      handle = adapter.open('transform-stale-singleclick', options, listener);
    });
    const staleSource = new Event('pointerdown');
    map.dispatchEvent(mapPointerEvent('click', [3, 4], staleSource));
    if (handle === undefined) throw new Error('Transform interaction did not open from the map click.');
    try {
      map.dispatchEvent(mapPointerEvent('singleclick', [3, 4], staleSource));
      expect(hitTest.atPixel).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();

      const freshSource = new Event('pointerdown');
      map.dispatchEvent(mapPointerEvent('click', [7, 8], freshSource));
      map.dispatchEvent(mapPointerEvent('singleclick', [7, 8], freshSource));
      expect(hitTest.atPixel).toHaveBeenNthCalledWith(1, [7, 8], options.hitTolerance);
      expect(listener).toHaveBeenNthCalledWith(1, { type: 'select-request', pixel: [7, 8], candidateIds: ['candidate'] });

      map.dispatchEvent(mapPointerEvent('singleclick', [9, 10], freshSource));
      expect(hitTest.atPixel).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      handle.destroy();
    }
  });

  it.each(['click', 'singleclick'])('removes map listeners when %s registration mutates before throwing', (failureType) => {
    const map = new MapHarness();
    const installationFailure = new Error(`${failureType} installation failed`);
    const nativeOn = map.on.bind(map) as unknown as (type: string, listener: (event: unknown) => void) => unknown;
    vi.spyOn(map, 'on').mockImplementation(((type: string, listener: (event: unknown) => void) => {
      const key = nativeOn(type, listener);
      if (type === failureType) throw installationFailure;
      return key;
    }) as never);
    const adapter = new TransformInteractionAdapter(
      map as unknown as OlMap,
      { atPixel: () => [] } as unknown as TransformHitTest,
      {} as FeatureBinding,
      {} as StyleCompiler,
      {} as LayerRenderPort
    );

    expect(() => adapter.open('transform-singleclick', options, vi.fn())).toThrow(installationFailure);
    expect(map.interactions.getLength()).toBe(0);
    expect(map.getListeners('click') ?? []).toHaveLength(0);
    expect(map.getListeners('singleclick') ?? []).toHaveLength(0);
    expect(map.layers.getLength()).toBe(0);
  });

  it('removes the interaction, map listener, viewport listener, and handle layer after a partial open failure', () => {
    const map = new MapHarness();
    const installationFailure = new Error('contextmenu installation failed');
    const nativeAdd = map.viewport.addEventListener.bind(map.viewport);
    vi.spyOn(map.viewport, 'addEventListener').mockImplementation((type, listener, eventOptions) => {
      nativeAdd(type, listener, eventOptions);
      if (type === 'contextmenu') throw installationFailure;
    });
    const removeViewport = vi.spyOn(map.viewport, 'removeEventListener');
    const adapter = new TransformInteractionAdapter(
      map as unknown as OlMap,
      { atPixel: () => [] } as unknown as TransformHitTest,
      {} as FeatureBinding,
      {} as StyleCompiler,
      {} as LayerRenderPort
    );

    expect(() => adapter.open('transform-test', options, vi.fn())).toThrow(installationFailure);
    expect(map.interactions.getLength()).toBe(0);
    expect(map.getListeners('click') ?? []).toHaveLength(0);
    expect(map.getListeners('singleclick') ?? []).toHaveLength(0);
    expect(removeViewport).toHaveBeenCalledWith('contextmenu', expect.any(Function), true);
    expect(map.layers.getLength()).toBe(0);
  });

  it('keeps corner scaling proportional while Shift is pressed', () => {
    const map = new MapHarness();
    const binding = { suppressProjection: vi.fn(() => ({ release: vi.fn() })) } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open('transform-shift-scale', { ...options, keepRectangle: false }, (event) => received.push(event));
    handle.setTarget(polygonTarget());
    map.hitHandleKey = 'scale-ne';
    const input = map.interactions.item(0);
    if (input === null) throw new Error('Transform interaction was not installed.');

    input.handleEvent(pointerGestureEvent('pointerdown', [2, 1]));
    input.handleEvent(pointerGestureEvent('pointerdrag', [4, 3], true));
    input.handleEvent(pointerGestureEvent('pointerup', [4, 3], true));

    expect(received).toEqual([
      expect.objectContaining({ type: 'operation-start', operation: 'scale' }),
      expect.objectContaining({ type: 'operation-change', operation: 'scale', delta: { type: 'scale', scaleX: 2, scaleY: 2, center: [0, 0] } }),
      expect.objectContaining({ type: 'operation-end', operation: 'scale', delta: { type: 'scale', scaleX: 2, scaleY: 2, center: [0, 0] } })
    ]);
    handle.destroy();
  });
});

function mapPointerEvent(type: 'click' | 'singleclick', pixel: readonly [number, number], originalEvent: Event): BaseEvent {
  return Object.assign(new BaseEvent(type), { pixel, originalEvent });
}

function pointerGestureEvent(type: 'pointerdown' | 'pointerdrag' | 'pointerup', coordinate: readonly [number, number], shiftKey = false): BaseEvent {
  return Object.assign(new BaseEvent(type), {
    coordinate,
    pixel: coordinate,
    originalEvent: { type, button: 0, isPrimary: true, shiftKey, preventDefault: vi.fn() }
  });
}

function polygonTarget(): TransformInteractionTarget {
  const ring = [
    [-10, -5],
    [-10, 5],
    [10, 5],
    [10, -5],
    [-10, -5]
  ] as const;
  return {
    elementId: 'polygon',
    type: 'polygon',
    layerId: 'default',
    geometry: { type: 'polygon', coordinates: [ring] },
    style: {},
    mode: 'transform',
    controlPoints: ring,
    canTranslate: true,
    canRotate: true,
    canScale: true,
    canStretch: true,
    canEditVertices: false
  };
}
