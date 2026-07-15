import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import Observable from 'ol/Observable.js';
import BaseEvent from 'ol/events/Event.js';
import { clearUserProjection, fromUserCoordinate, getUserProjection, setUserProjection } from 'ol/proj.js';
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
  readonly view: View;
  hitHandleKey: string | undefined;

  constructor(options: Readonly<{ projection?: string; center?: readonly [number, number]; resolution?: number }> = {}) {
    super();
    this.view = new View({
      projection: options.projection ?? 'EPSG:4326',
      center: [...(options.center ?? [0, 0])],
      ...(options.resolution === undefined ? { zoom: 2 } : { resolution: options.resolution }),
      multiWorld: true
    });
  }

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

  getCoordinateFromPixelInternal(pixel: readonly number[]): [number, number] {
    if (getUserProjection() === null) return [pixel[0], pixel[1]];
    const coordinate = fromUserCoordinate([...pixel], this.view.getProjection());
    return [coordinate[0], coordinate[1]];
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
    input.handleEvent(pointerGestureEvent('pointerdrag', [4, 3], { shiftKey: true }));
    input.handleEvent(pointerGestureEvent('pointerup', [4, 3], { shiftKey: true }));

    expect(received.filter((event) => (event as { type?: string }).type !== 'bounds-change')).toEqual([
      expect.objectContaining({ type: 'operation-start', operation: 'scale' }),
      expect.objectContaining({ type: 'operation-change', operation: 'scale', delta: { type: 'scale', scaleX: 2, scaleY: 2, center: [0, 0] } }),
      expect.objectContaining({ type: 'operation-end', operation: 'scale', delta: { type: 'scale', scaleX: 2, scaleY: 2, center: [0, 0] } })
    ]);
    handle.destroy();
  });

  it('keeps corner scaling active while Alt is pressed', () => {
    const map = new MapHarness();
    const binding = { suppressProjection: vi.fn(() => ({ release: vi.fn() })) } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open('transform-alt-scale', { ...options, keepRectangle: false }, (event) => received.push(event));
    handle.setTarget(polygonTarget());
    map.hitHandleKey = 'scale-ne';
    const input = map.interactions.item(0);
    if (input === null) throw new Error('Transform interaction was not installed.');

    input.handleEvent(pointerGestureEvent('pointerdown', [2, 1], { altKey: true }));
    input.handleEvent(pointerGestureEvent('pointerdrag', [4, 3], { altKey: true }));
    input.handleEvent(pointerGestureEvent('pointerup', [4, 3], { altKey: true }));

    expect(received.filter((event) => (event as { type?: string }).type !== 'bounds-change')).toEqual([
      expect.objectContaining({ type: 'operation-start', operation: 'scale' }),
      expect.objectContaining({ type: 'operation-change', operation: 'scale', delta: { type: 'scale', scaleX: 2, scaleY: 3, center: [0, 0] } }),
      expect.objectContaining({ type: 'operation-end', operation: 'scale', delta: { type: 'scale', scaleX: 2, scaleY: 3, center: [0, 0] } })
    ]);
    handle.destroy();
  });

  it('coalesces browser pointerdrag events per animation frame and flushes pending input before pointerup', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    const cancelFrame = vi.fn((id: number) => {
      frames.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const map = new MapHarness();
    const binding = { suppressProjection: vi.fn(() => ({ release: vi.fn() })) } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open('transform-coalesced-drag', { ...options, keepRectangle: false }, (event) => received.push(event));
    try {
      handle.setTarget(polygonTarget());
      map.hitHandleKey = 'scale-ne';
      const input = map.interactions.item(0);
      if (input === null) throw new Error('Transform interaction was not installed.');

      input.handleEvent(pointerGestureEvent('pointerdown', [2, 1]));
      for (let index = 1; index <= 100; index += 1) input.handleEvent(pointerGestureEvent('pointerdrag', [index, 1]));
      expect(requestFrame).toHaveBeenCalledOnce();
      expect(received.filter((event) => (event as { type?: string }).type === 'operation-change')).toHaveLength(0);

      const firstFrame = frames.get(1);
      if (firstFrame === undefined) throw new Error('Missing coalesced animation frame');
      frames.delete(1);
      firstFrame(16);
      expect(received).toContainEqual(expect.objectContaining({ type: 'operation-change', delta: { type: 'scale', scaleX: 50, scaleY: 1, center: [0, 0] } }));

      input.handleEvent(pointerGestureEvent('pointerdrag', [102, 2]));
      input.handleEvent(pointerGestureEvent('pointerup', [103, 3]));
      expect(received.slice(-2)).toEqual([
        expect.objectContaining({ type: 'operation-change', delta: { type: 'scale', scaleX: 51, scaleY: 2, center: [0, 0] } }),
        expect.objectContaining({ type: 'operation-end', delta: { type: 'scale', scaleX: 51.5, scaleY: 3, center: [0, 0] } })
      ]);

      input.handleEvent(pointerGestureEvent('pointerdown', [2, 1]));
      input.handleEvent(pointerGestureEvent('pointerdrag', [4, 2]));
      const destroyedFrame = frames.get(3);
      if (destroyedFrame === undefined) throw new Error('Missing destroy animation frame');
      const beforeDestroy = received.length;
      handle.destroy();
      destroyedFrame(32);
      expect(received).toHaveLength(beforeDestroy);
      expect(cancelFrame).toHaveBeenCalledTimes(2);
    } finally {
      handle.destroy();
      vi.unstubAllGlobals();
    }
  });

  it.each([1, -1, 50, -50])('keeps Transform math canonical and renders one handle set in wrapped world %s', (world) => {
    const map = new MapHarness();
    map.view.setCenter([world * 360, 0]);
    const binding = {
      wrapsX: vi.fn(() => true),
      suppressProjection: vi.fn(() => ({ release: vi.fn() }))
    } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open(`transform-world-${world}`, { ...options, keepRectangle: false }, (event) => received.push(event));
    handle.setTarget(polygonTarget());
    const handleLayer = map.layers.item(0) as VectorLayer<VectorSource<Feature<Geometry>>>;
    expect(handleLayer.getSource()?.getWrapX()).toBe(false);
    map.hitHandleKey = 'scale-ne';
    const input = map.interactions.item(0);
    if (input === null) throw new Error('Transform interaction was not installed.');
    const offset = world * 360;

    input.handleEvent(pointerGestureEvent('pointerdown', [offset + 2, 1]));
    input.handleEvent(pointerGestureEvent('pointerdrag', [offset + 4, 3]));
    input.handleEvent(pointerGestureEvent('pointerup', [offset + 4, 3]));

    expect(received).toContainEqual(expect.objectContaining({ type: 'operation-end', delta: { type: 'scale', scaleX: 2, scaleY: 3, center: [0, 0] } }));
    handle.destroy();
  });

  it.each([50, -50])('hits a 50k MultiPoint vertex batch with canonical deltas in wrapped world %s', (world) => {
    const map = new MapHarness();
    map.view.setCenter([world * 360, 0]);
    const binding = {
      wrapsX: vi.fn(() => true),
      suppressProjection: vi.fn(() => ({ release: vi.fn() }))
    } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open(`transform-vertex-batch-world-${world}`, options, (event) => received.push(event));
    const target = largeEditTarget(50_000);
    handle.setTarget(target);
    const source = transformSource(map);
    const batch = source.getFeatures().find((feature) => feature.get('ol-engine-transform-vertex-batch') === true);
    const geometry = batch?.getGeometry();
    if (!(geometry instanceof MultiPoint)) throw new Error('Transform vertex batch was not created as MultiPoint.');
    const selectedIndex = 23_456;
    const selected = target.controlPoints[selectedIndex];
    const offset = world * 360;
    const presented: [number, number] = [selected[0] + offset, selected[1]];
    const input = map.interactions.item(0);
    if (input === null) throw new Error('Transform interaction was not installed.');

    expect(source.getFeatures()).toHaveLength(3);
    expect(geometry.getCoordinates()).toHaveLength(50_000);
    expect(geometry.getCoordinates()[selectedIndex]).toEqual(presented);
    input.handleEvent(pointerGestureEvent('pointerdown', presented));
    input.handleEvent(pointerGestureEvent('pointerup', [presented[0] + 0.5, presented[1] + 0.5]));

    expect(received).toContainEqual(
      expect.objectContaining({ type: 'operation-start', operation: 'vertex', delta: { type: 'vertex', index: selectedIndex, coordinate: selected } })
    );
    expect(received).toContainEqual(
      expect.objectContaining({
        type: 'operation-end',
        operation: 'vertex',
        delta: { type: 'vertex', index: selectedIndex, coordinate: [selected[0] + 0.5, selected[1] + 0.5] }
      })
    );
    handle.destroy();
    expect(batch?.getGeometry()).toBeUndefined();
  });

  it.each([50, -50])('repositions an idle wrapped target when the view moves to world %s and releases the center listener', (world) => {
    const map = new MapHarness();
    const initialCenterListeners = map.view.getListeners('change:center')?.length ?? 0;
    const binding = {
      wrapsX: vi.fn(() => true),
      suppressProjection: vi.fn(() => ({ release: vi.fn() }))
    } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open(`transform-view-world-${world}`, options, vi.fn());
    handle.setTarget(polygonTarget());
    const source = transformSource(map);
    const preview = transformHandleFeature(map, 'feature');
    const featureCount = source.getFeatures().length;

    map.view.setCenter([world * 360, 0]);

    expect(transformHandleFeature(map, 'feature')).toBe(preview);
    expect(geometryCenterX(preview)).toBe(world * 360);
    expect(source.getFeatures()).toHaveLength(featureCount);
    handle.destroy();
    expect(map.view.getListeners('change:center')?.length ?? 0).toBe(initialCenterListeners);
  });

  it('freezes the selected world during a drag and applies a pending world change after pointerup', () => {
    const map = new MapHarness();
    const binding = {
      wrapsX: vi.fn(() => true),
      suppressProjection: vi.fn(() => ({ release: vi.fn() }))
    } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open('transform-view-during-drag', { ...options, keepRectangle: false }, (event) => received.push(event));
    handle.setTarget(polygonTarget());
    const preview = transformHandleFeature(map, 'feature');
    map.hitHandleKey = 'scale-ne';
    const input = map.interactions.item(0);
    if (input === null) throw new Error('Transform interaction was not installed.');

    input.handleEvent(pointerGestureEvent('pointerdown', [2, 1]));
    map.view.setCenter([50 * 360, 0]);
    expect(geometryCenterX(preview)).toBe(0);

    input.handleEvent(pointerGestureEvent('pointerdrag', [50 * 360 + 4, 3]));
    input.handleEvent(pointerGestureEvent('pointerup', [50 * 360 + 4, 3]));

    expect(received).toContainEqual(expect.objectContaining({ type: 'operation-end', delta: { type: 'scale', scaleX: 2, scaleY: 3, center: [0, 0] } }));
    expect(geometryCenterX(preview)).toBe(50 * 360);
    handle.destroy();
  });

  it.each(([1, -1, 50, -50] as const).flatMap((world) => (['translate', 'vertex', 'scale'] as const).map((operation) => ({ world, operation }))))(
    'normalizes real $operation pointer coordinates back to the frozen drag world after moving to wrapped world $world',
    ({ world, operation }) => {
      const map = new MapHarness();
      const binding = {
        wrapsX: vi.fn(() => true),
        suppressProjection: vi.fn(() => ({ release: vi.fn() }))
      } as unknown as FeatureBinding;
      const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
      const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
      const received: unknown[] = [];
      const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
      const handle = adapter.open(`transform-drag-world-${world}-${operation}`, { ...options, keepRectangle: false }, (event) => received.push(event));
      const target = operation === 'vertex' ? smallEditTarget() : polygonTarget();
      handle.setTarget(target);
      map.hitHandleKey = operation === 'translate' ? 'feature' : operation === 'vertex' ? 'vertex-0' : 'scale-ne';
      const input = map.interactions.item(0);
      if (input === null) throw new Error('Transform interaction was not installed.');
      const start: readonly [number, number] = operation === 'translate' ? [0, 0] : operation === 'vertex' ? [-10, -5] : [2, 1];
      const current: readonly [number, number] = operation === 'translate' ? [2, 3] : operation === 'vertex' ? [-9, -4] : [4, 3];
      const offset = world * 360;

      input.handleEvent(pointerGestureEvent('pointerdown', start));
      map.view.setCenter([offset, 0]);
      input.handleEvent(pointerGestureEvent('pointerdrag', [current[0] + offset, current[1]]));
      input.handleEvent(pointerGestureEvent('pointerup', [current[0] + offset, current[1]]));

      const expectedDelta =
        operation === 'translate'
          ? { type: 'translate', x: 2, y: 3 }
          : operation === 'vertex'
            ? { type: 'vertex', index: 0, coordinate: [-9, -4] }
            : { type: 'scale', scaleX: 2, scaleY: 3, center: [0, 0] };
      expect(received).toContainEqual(expect.objectContaining({ type: 'operation-change', operation, delta: expectedDelta, coordinate: current }));
      expect(received).toContainEqual(expect.objectContaining({ type: 'operation-end', operation, delta: expectedDelta, coordinate: current }));
      handle.destroy();
    }
  );

  it.each([50, -50])('uses EPSG:4326 user coordinates for wrapped placement and internal EPSG:3857 coordinates for 50k vertex hits in world %s', (world) => {
    setUserProjection('EPSG:4326');
    let handle: ReturnType<TransformInteractionAdapter['open']> | undefined;
    try {
      const map = new MapHarness({ projection: 'EPSG:3857', center: [world * 360, 0], resolution: 1 });
      const binding = {
        wrapsX: vi.fn(() => true),
        suppressProjection: vi.fn(() => ({ release: vi.fn() }))
      } as unknown as FeatureBinding;
      const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
      const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
      const received: unknown[] = [];
      const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
      handle = adapter.open(`transform-user-projection-world-${world}`, options, (event) => received.push(event));
      const target = largeGeographicEditTarget(50_000);
      handle.setTarget(target);
      const source = transformSource(map);
      const batch = source.getFeatures().find((feature) => feature.get('ol-engine-transform-vertex-batch') === true);
      const geometry = batch?.getGeometry();
      if (!(geometry instanceof MultiPoint)) throw new Error('Transform user-projection vertex batch was not created.');
      const selectedIndex = 23_456;
      const selected = target.controlPoints[selectedIndex];
      const presented: [number, number] = [selected[0] + world * 360, selected[1]];
      const input = map.interactions.item(0);
      if (input === null) throw new Error('Transform interaction was not installed.');

      expect(source.getFeatures()).toHaveLength(3);
      expect(geometry.getCoordinates()[selectedIndex]).toEqual(presented);
      input.handleEvent(pointerGestureEvent('pointerdown', presented));
      input.handleEvent(pointerGestureEvent('pointerup', [presented[0] + 0.00001, presented[1] + 0.00001]));

      const startEvent = received.find((event) => (event as { type?: string }).type === 'operation-start') as
        Readonly<{ delta: Readonly<{ type: string; index: number; coordinate: readonly number[] }> }> | undefined;
      const endEvent = received.find((event) => (event as { type?: string }).type === 'operation-end') as
        Readonly<{ delta: Readonly<{ type: string; index: number; coordinate: readonly number[] }> }> | undefined;
      expect(startEvent?.delta).toMatchObject({ type: 'vertex', index: selectedIndex });
      expect(startEvent?.delta.coordinate[0]).toBeCloseTo(selected[0], 8);
      expect(startEvent?.delta.coordinate[1]).toBeCloseTo(selected[1], 8);
      expect(endEvent?.delta).toMatchObject({ type: 'vertex', index: selectedIndex });
      expect(endEvent?.delta.coordinate[0]).toBeCloseTo(selected[0] + 0.00001, 8);
      expect(endEvent?.delta.coordinate[1]).toBeCloseTo(selected[1] + 0.00001, 8);
    } finally {
      handle?.destroy();
      clearUserProjection();
    }
  });

  it('moves an active copy preview with the selected world without changing its user delta', () => {
    const map = new MapHarness();
    const binding = {
      wrapsX: vi.fn(() => true),
      suppressProjection: vi.fn(() => ({ release: vi.fn() }))
    } as unknown as FeatureBinding;
    const styles = { compile: vi.fn(() => new Style()) } as unknown as StyleCompiler;
    const render = { registerTarget: vi.fn(() => ({ destroy: vi.fn() })) } as unknown as LayerRenderPort;
    const received: unknown[] = [];
    const adapter = new TransformInteractionAdapter(map as unknown as OlMap, { atPixel: () => [] } as unknown as TransformHitTest, binding, styles, render);
    const handle = adapter.open('transform-copy-view-world', options, (event) => received.push(event));
    const target = polygonTarget();
    handle.setTarget(target);
    handle.startCopyPreview({ geometry: target.geometry, style: target.style });
    const copy = transformSource(map)
      .getFeatures()
      .find((feature) => feature.get('ol-engine-transform-copy') === true);
    if (copy === undefined) throw new Error('Transform copy preview was not created.');
    const input = map.interactions.item(0);
    if (input === null) throw new Error('Transform interaction was not installed.');

    map.view.setCenter([50 * 360, 0]);
    expect(geometryCenterX(copy)).toBe(50 * 360);
    input.handleEvent(pointerGestureEvent('pointermove', [50 * 360 + 5, 0]));
    expect(geometryCenterX(copy)).toBe(50 * 360 + 5);
    input.handleEvent(pointerGestureEvent('pointerdown', [50 * 360 + 5, 0]));

    expect(received).toContainEqual({ type: 'copy-preview-confirm', delta: { x: 5, y: 0 } });
    handle.destroy();
  });
});

function mapPointerEvent(type: 'click' | 'singleclick', pixel: readonly [number, number], originalEvent: Event): BaseEvent {
  return Object.assign(new BaseEvent(type), { pixel, originalEvent });
}

function pointerGestureEvent(
  type: 'pointerdown' | 'pointerdrag' | 'pointermove' | 'pointerup',
  coordinate: readonly [number, number],
  modifiers: Readonly<{ shiftKey?: boolean; altKey?: boolean }> = {}
): BaseEvent {
  return Object.assign(new BaseEvent(type), {
    coordinate,
    pixel: coordinate,
    originalEvent: { type, button: 0, isPrimary: true, shiftKey: modifiers.shiftKey === true, altKey: modifiers.altKey === true, preventDefault: vi.fn() }
  });
}

function transformSource(map: MapHarness): VectorSource<Feature<Geometry>> {
  const layer = map.layers.item(0) as VectorLayer<VectorSource<Feature<Geometry>>>;
  const source = layer.getSource();
  if (source === null) throw new Error('Transform handle source was not installed.');
  return source;
}

function transformHandleFeature(map: MapHarness, key: string): Feature<Geometry> {
  const feature = transformSource(map)
    .getFeatures()
    .find((candidate) => (candidate.get(handleMetadata) as Readonly<{ key?: string }> | undefined)?.key === key);
  if (feature === undefined) throw new Error(`Transform handle ${key} was not found.`);
  return feature;
}

function geometryCenterX(feature: Feature<Geometry>): number {
  const extent = feature.getGeometry()?.getExtent();
  if (extent === undefined) throw new Error('Transform feature geometry was not found.');
  return (extent[0] + extent[2]) / 2;
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

function largeEditTarget(length: number): TransformInteractionTarget {
  const base = polygonTarget();
  const controlPoints = Object.freeze(
    Array.from({ length }, (_, index): readonly [number, number] => {
      if (index === 0) return Object.freeze([0, 0]);
      return Object.freeze([(index % 300) - 150, Math.floor(index / 300) * 10 + 1]);
    })
  );
  return {
    ...base,
    mode: 'edit',
    controlPoints,
    canTranslate: false,
    canRotate: false,
    canScale: false,
    canStretch: false,
    canEditVertices: true
  };
}

function smallEditTarget(): TransformInteractionTarget {
  const target = polygonTarget();
  return {
    ...target,
    mode: 'edit',
    canTranslate: false,
    canRotate: false,
    canScale: false,
    canStretch: false,
    canEditVertices: true
  };
}

function largeGeographicEditTarget(length: number): TransformInteractionTarget {
  const target = smallEditTarget();
  const controlPoints = Object.freeze(
    Array.from({ length }, (_, index): readonly [number, number] =>
      Object.freeze([(index % 1_000) * 0.0001 - 0.05, Math.floor(index / 1_000) * 0.0001 - 0.0025])
    )
  );
  return { ...target, controlPoints };
}
