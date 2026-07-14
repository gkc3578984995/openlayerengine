import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../src/core/style/types.js';
import { assertStructuredStyleSpec } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

function point(id: string, layerId = 'default', overrides: Partial<ElementState<{ label: string }>> = {}): ElementState<{ label: string }> {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'icon', src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', size: [10, 12] } },
    data: { label: id },
    module: 'markers',
    layerId,
    visible: true,
    ...overrides
  };
}

function setup(seed: ElementState[] = []) {
  const map = createTestMap();
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes, {
    validateElement(state) {
      manager.requireVector(state.layerId);
      if (isNativeStyleRef(state.style)) void refs.requireStyle(state.style);
      else assertStructuredStyleSpec(state.style);
    }
  });
  const adapter = new LayerAdapter(map, refs);
  const manager = new LayerManager(store, adapter);
  manager.ensureDefaultVector();
  manager.add({ kind: 'vector', id: 'second', visible: true, opacity: 1, wrapX: true, declutter: false });
  for (const state of seed) store.add(state);
  const subscribe = vi.spyOn(store, 'subscribe');
  const codec = new GeometryCodec(shapes);
  const errorReporter = vi.fn();
  const binding = new FeatureBinding(store, adapter, codec, new StyleCompiler(refs), { errorReporter });
  return { adapter, binding, codec, errorReporter, manager, refs, store, subscribe };
}

describe('FeatureBinding', () => {
  coversCapabilities('element-icon-point', 'layer-feature-hide-show', 'layer-param-live-sync');

  it('subscribes once before seeding existing Store state', () => {
    const { adapter, binding, subscribe } = setup([point('seed')]);
    const feature = binding.requireFeature('seed');

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(adapter.requireVectorSource('default').getFeatures()).toEqual([feature]);
    expect(binding.elementIdFor(feature)).toBe('seed');
    expect(feature.getId()).toBe('seed');
  });

  it('closes the subscribe-before-seed initialization window', () => {
    const map = createTestMap();
    const refs = new NativeRefRegistry();
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes, { validateElement: (state) => void manager.requireVector(state.layerId) });
    const adapter = new LayerAdapter(map, refs);
    const manager = new LayerManager(store, adapter);
    manager.ensureDefaultVector();
    const nativeSubscribe = store.subscribe.bind(store);
    const subscribe = vi.spyOn(store, 'subscribe').mockImplementation((listener) => {
      const unsubscribe = nativeSubscribe(listener);
      store.add(point('during-subscribe'));
      return unsubscribe;
    });

    const binding = new FeatureBinding(store, adapter, new GeometryCodec(shapes), new StyleCompiler(refs));
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(binding.requireFeature('during-subscribe').getId()).toBe('during-subscribe');
    expect(adapter.requireVectorSource('default').getFeatures()).toHaveLength(1);
  });

  it('batches add/update/move/hide/show and keeps Feature/compatible Geometry identity stable', () => {
    const { adapter, binding, store } = setup();
    const addFeatures = vi.spyOn(adapter.requireVectorSource('default'), 'addFeatures');
    store.transaction((transaction) => {
      transaction.add(point('first'));
      transaction.add(point('second-item'));
    });
    const feature = binding.requireFeature('first');
    const geometry = feature.getGeometry();
    expect(adapter.requireVectorSource('default').getFeatures()).toHaveLength(2);
    expect(addFeatures).toHaveBeenCalledTimes(1);

    store.update({ id: 'first' }, { geometry: { type: 'point', controlPoints: [[7, 8]] }, layerId: 'second' });
    expect(binding.requireFeature('first')).toBe(feature);
    expect(feature.getGeometry()).toBe(geometry);
    expect((geometry as Point).getCoordinates()).toEqual([7, 8]);
    expect(adapter.requireVectorSource('default').hasFeature(feature)).toBe(false);
    expect(adapter.requireVectorSource('second').hasFeature(feature)).toBe(true);

    store.hide({ id: 'first' });
    expect(adapter.requireVectorSource('second').hasFeature(feature)).toBe(false);
    expect(feature.getStyleFunction()?.(feature, 1)).toEqual([]);
    store.show({ id: 'first' });
    expect(adapter.requireVectorSource('second').hasFeature(feature)).toBe(true);
    expect(feature.getStyle()).toBeDefined();
  });

  it('replays Store truth after direct native mutation on the next real committed update', () => {
    const { binding, store } = setup([point('target')]);
    const feature = binding.requireFeature('target');
    feature.setGeometry(new Point([99, 99]));
    feature.setId('forged');
    feature.setStyle(new Style());
    feature.set('module', 'forged');

    expect(store.get('target')).toMatchObject({ module: 'markers', geometry: { controlPoints: [[1, 2]] } });
    store.update({ id: 'target' }, { data: { label: 'updated' } });

    expect(feature.getId()).toBe('target');
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
    expect(feature.getStyle()).not.toBeInstanceOf(Style);
    expect(feature.get('module')).toBe('forged');
    expect(store.get('target')?.module).toBe('markers');
  });

  it('preserves native style identity without duplicating Store metadata on Feature', () => {
    const native = new Style();
    const { binding, refs, store } = setup();
    const reference = refs.registerStyle(native);
    store.add(point('native', 'default', { style: reference, module: 'private-module', data: { label: 'private-data' } }));
    const feature = binding.requireFeature('native');

    expect(feature.getStyle()).toBe(native);
    expect(feature.getKeys()).toEqual(['geometry']);
    expect(feature.get('module')).toBeUndefined();
    expect(feature.get('data')).toBeUndefined();
    expect(feature.get('layerId')).toBeUndefined();
    expect(feature.get('style')).toBeUndefined();
    expect(binding.elementIdFor(new Feature<Geometry>())).toBeUndefined();
  });

  it('reports projection failure, keeps committed Core truth dirty, and reconciles on the next operation', () => {
    const { binding, codec, errorReporter, store } = setup([point('dirty')]);
    const feature = binding.requireFeature('dirty');
    const project = vi.spyOn(codec, 'project');
    project.mockImplementationOnce(() => {
      throw new Error('unexpected projection failure');
    });

    expect(() => store.update({ id: 'dirty' }, { geometry: { type: 'point', controlPoints: [[5, 6]] } })).not.toThrow();
    expect(store.get('dirty')?.geometry).toEqual({ type: 'point', controlPoints: [[5, 6]] });
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
    expect(errorReporter).toHaveBeenCalled();

    store.update({ id: 'dirty' }, { data: { label: 'next' } });
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([5, 6]);
    expect(binding.requireFeature('dirty')).toBe(feature);
  });

  it('isolates a dirty projection within a multi-change set and reconciles idempotently without reverse reads', () => {
    const { adapter, binding, codec, errorReporter, store } = setup([point('first'), point('second-item')]);
    const first = binding.requireFeature('first');
    const second = binding.requireFeature('second-item');
    const nativeProject = codec.project.bind(codec);
    let failed = false;
    vi.spyOn(codec, 'project').mockImplementation((feature, state) => {
      if (!failed) {
        failed = true;
        throw new Error('first binding failed');
      }
      return nativeProject(feature, state);
    });

    store.update({ ids: ['first', 'second-item'] }, { geometry: { type: 'point', controlPoints: [[8, 9]] } });
    expect((first.getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
    expect((second.getGeometry() as Point).getCoordinates()).toEqual([8, 9]);
    expect(errorReporter).toHaveBeenCalled();

    adapter.requireVectorSource('second').addFeature(first);
    binding.reconcile();
    binding.reconcile();
    expect((first.getGeometry() as Point).getCoordinates()).toEqual([8, 9]);
    expect(adapter.requireVectorSource('second').hasFeature(first)).toBe(false);
    expect(adapter.requireVectorSource('default').hasFeature(first)).toBe(true);
  });

  it('preflights missing adapter vector sources before Store commit or notification', () => {
    const { adapter, binding, store } = setup([point('existing')]);
    const notification = vi.fn();
    store.subscribe(notification);
    adapter.detach('second');
    const before = store.query();

    expect(() =>
      store.transaction((transaction) => {
        const state = transaction.add(point('blocked', 'second'));
        binding.preflight(state);
      })
    ).toThrow();
    expect(() =>
      store.transaction((transaction) => {
        const [state] = transaction.update({ id: 'existing' }, { layerId: 'second' });
        binding.preflight(state);
      })
    ).toThrow();
    expect(store.query()).toEqual(before);
    expect(notification).not.toHaveBeenCalled();
  });

  it('does not repair native mutation on a semantic no-op but repairs it on the next real transaction', () => {
    const { binding, store } = setup([point('no-op')]);
    const feature = binding.requireFeature('no-op');
    feature.setGeometry(new Point([99, 99]));

    expect(store.update({ id: 'no-op' }, {}).changes).toEqual([]);
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([99, 99]);
    store.update({ id: 'no-op' }, { data: { label: 'repair' } });
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
  });

  it('detaches, clears reverse identity, clears projection, and disposes an owned Feature on remove', () => {
    const { adapter, binding, store } = setup([point('removed')]);
    const feature = binding.requireFeature('removed');
    const dispose = vi.spyOn(feature, 'dispose');
    store.remove({ id: 'removed' });

    expect(adapter.requireVectorSource('default').hasFeature(feature)).toBe(false);
    expect(binding.elementIdFor(feature)).toBeUndefined();
    expect(feature.getGeometry()).toBeUndefined();
    expect(feature.getStyle()).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('reports source-listener and Feature disposal failures while completing removal', () => {
    const { adapter, binding, errorReporter, store } = setup([point('failing-remove')]);
    const feature = binding.requireFeature('failing-remove');
    adapter.requireVectorSource('default').on('removefeature', () => {
      throw new Error('remove listener failed');
    });
    vi.spyOn(feature, 'dispose').mockImplementation(() => {
      throw new Error('feature dispose failed');
    });

    expect(() => store.remove({ id: 'failing-remove' })).not.toThrow();
    expect(store.get('failing-remove')).toBeUndefined();
    expect(binding.elementIdFor(feature)).toBeUndefined();
    expect(errorReporter).toHaveBeenCalled();
  });

  it('destroy unsubscribes first and removes/disposes every owned Feature idempotently', () => {
    const { adapter, binding, store } = setup([point('a'), point('b')]);
    const features = [binding.requireFeature('a'), binding.requireFeature('b')];
    const disposals = features.map((feature) => vi.spyOn(feature, 'dispose'));

    binding.destroy();
    binding.destroy();
    expect(adapter.requireVectorSource('default').getFeatures()).toEqual([]);
    expect(disposals.map((spy) => spy.mock.calls.length)).toEqual([1, 1]);
    store.add(point('after-destroy'));
    expect(adapter.requireVectorSource('default').getFeatures()).toEqual([]);
  });
});
