import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { CapabilityError, ObjectDisposedError } from '../src/core/errors.js';
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
  const codec = new GeometryCodec(shapes, identityShapeProjection);
  const errorReporter = vi.fn();
  const binding = new FeatureBinding(store, adapter, codec, new StyleCompiler(refs), { errorReporter });
  return { adapter, binding, codec, errorReporter, manager, refs, store, subscribe };
}

describe('FeatureBinding', () => {
  coversCapabilities('element-icon-point', 'layer-feature-hide-show', 'layer-param-live-sync');

  it('subscribes once before seeding existing Store state', () => {
    const { adapter, binding, store, subscribe } = setup([point('seed')]);
    const feature = binding.requireFeature('seed');
    const get = vi.spyOn(store, 'get');

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(adapter.requireVectorSource('default').getFeatures()).toEqual([feature]);
    expect(binding.elementIdFor(feature)).toBe('seed');
    expect(binding.resolveFeature(feature)).toEqual({ elementId: 'seed', layerId: 'default', visible: true });
    expect(get).not.toHaveBeenCalled();
    expect(binding.wrapsX('seed')).toBe(adapter.requireVectorSource('default').getWrapX());
    expect(feature.getId()).toBe('seed');
  });

  it('地图连续缩放时复用已绑定要素的静态样式', () => {
    const { binding } = setup([point('zoom-static')]);
    const feature = binding.requireFeature('zoom-static');
    const styleFunction = feature.getStyleFunction();
    expect(styleFunction).toBeDefined();

    const first = styleFunction?.(feature, 1);
    for (const resolution of [0.5, 0.25, 2, 4, 8]) {
      expect(styleFunction?.(feature, resolution)).toBe(first);
    }
    feature.changed();
    expect(styleFunction?.(feature, 16)).toBe(first);
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

    const binding = new FeatureBinding(store, adapter, new GeometryCodec(shapes, identityShapeProjection), new StyleCompiler(refs));
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

  it('keeps a persistent Feature detached until the final nested suppression lease is released', () => {
    const { adapter, binding } = setup([point('suppressed')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('suppressed');

    const first = binding.suppressProjection('suppressed');
    const second = binding.suppressProjection('suppressed');

    expect(first.active).toBe(true);
    expect(second.active).toBe(true);
    expect(source.hasFeature(feature)).toBe(false);

    first.release();
    first.release();
    binding.reconcile();
    expect(first.active).toBe(false);
    expect(source.hasFeature(feature)).toBe(false);

    second.release();
    second.release();
    expect(second.active).toBe(false);
    expect(source.hasFeature(feature)).toBe(true);
  });

  it('hands off suppression ownership without changing source membership', () => {
    const { adapter, binding } = setup([point('handoff')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('handoff');
    const removeFeatures = vi.spyOn(source, 'removeFeatures');
    const addFeatures = vi.spyOn(source, 'addFeatures');

    const predecessor = binding.suppressProjection('handoff');
    const successor = predecessor.handoff();

    expect(predecessor.active).toBe(false);
    expect(successor.active).toBe(true);
    expect(source.hasFeature(feature)).toBe(false);
    expect(removeFeatures).toHaveBeenCalledTimes(1);
    expect(addFeatures).not.toHaveBeenCalled();
    expect(() => predecessor.handoff()).toThrowError(ObjectDisposedError);

    predecessor.release();
    expect(source.hasFeature(feature)).toBe(false);
    successor.release();
    expect(source.hasFeature(feature)).toBe(true);
    expect(addFeatures).toHaveBeenCalledTimes(1);
    expect(() => successor.handoff()).toThrowError(ObjectDisposedError);
  });

  it('projects Store updates while suppressed and restores only the latest layer and visibility', () => {
    const { adapter, binding, store } = setup([point('moving')]);
    const originalSource = adapter.requireVectorSource('default');
    const nextSource = adapter.requireVectorSource('second');
    const feature = binding.requireFeature('moving');
    const geometry = feature.getGeometry();
    const style = feature.getStyle();
    const lease = binding.suppressProjection('moving');

    store.update(
      { id: 'moving' },
      {
        geometry: { type: 'point', controlPoints: [[9, 10]] },
        layerId: 'second',
        style: { symbol: { type: 'circle', radius: 7, fill: { type: 'solid', color: '#ff0000' } } }
      }
    );

    expect(binding.requireFeature('moving')).toBe(feature);
    expect(feature.getGeometry()).toBe(geometry);
    expect((geometry as Point).getCoordinates()).toEqual([9, 10]);
    expect(feature.getStyle()).not.toBe(style);
    expect(originalSource.hasFeature(feature)).toBe(false);
    expect(nextSource.hasFeature(feature)).toBe(false);

    store.hide({ id: 'moving' });
    store.show({ id: 'moving' });
    expect(nextSource.hasFeature(feature)).toBe(false);
    store.hide({ id: 'moving' });
    lease.release();
    expect(nextSource.hasFeature(feature)).toBe(false);

    store.show({ id: 'moving' });
    expect(originalSource.hasFeature(feature)).toBe(false);
    expect(nextSource.hasFeature(feature)).toBe(true);
  });

  it('rolls back suppression acquisition when the persistent Feature cannot be detached', () => {
    const { adapter, binding, errorReporter } = setup([point('blocked-suppression')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('blocked-suppression');
    vi.spyOn(source, 'removeFeatures').mockImplementation(() => {
      throw new Error('batch removal failed');
    });
    vi.spyOn(source, 'removeFeature').mockImplementation(() => {
      throw new Error('single removal failed');
    });

    expect(() => binding.suppressProjection('blocked-suppression')).toThrowError(CapabilityError);
    expect(source.hasFeature(feature)).toBe(true);
    expect(binding.requireFeature('blocked-suppression')).toBe(feature);
    expect(errorReporter).toHaveBeenCalled();
  });

  it('does not leak a token when suppression setup fails before source detachment', () => {
    const { adapter, binding, errorReporter } = setup([point('setup-failure')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('setup-failure');
    vi.spyOn(adapter, 'vectorSources').mockImplementationOnce(() => {
      throw new Error('source enumeration failed');
    });

    expect(() => binding.suppressProjection('setup-failure')).toThrowError(CapabilityError);
    expect(source.hasFeature(feature)).toBe(true);
    expect(errorReporter).toHaveBeenCalled();

    const lease = binding.suppressProjection('setup-failure');
    expect(lease.active).toBe(true);
    expect(source.hasFeature(feature)).toBe(false);
    lease.release();
    expect(source.hasFeature(feature)).toBe(true);
  });

  it('invalidates the whole reentrant suppression cohort when the initial detachment fails', () => {
    const { adapter, binding } = setup([point('reentrant-suppression')]);
    const defaultSource = adapter.requireVectorSource('default');
    const secondSource = adapter.requireVectorSource('second');
    const feature = binding.requireFeature('reentrant-suppression');
    secondSource.addFeature(feature);
    let nestedLease: ReturnType<FeatureBinding['suppressProjection']> | undefined;
    defaultSource.once('removefeature', () => {
      nestedLease = binding.suppressProjection('reentrant-suppression');
      expect(nestedLease.active).toBe(false);
    });
    const removeFeatures = vi.spyOn(secondSource, 'removeFeatures').mockImplementation(() => {
      throw new Error('batch removal failed');
    });
    const removeFeature = vi.spyOn(secondSource, 'removeFeature').mockImplementation(() => {
      throw new Error('single removal failed');
    });

    expect(() => binding.suppressProjection('reentrant-suppression')).toThrowError(CapabilityError);
    expect(nestedLease?.active).toBe(false);
    expect(() => nestedLease?.handoff()).toThrowError(ObjectDisposedError);
    expect(() => nestedLease?.release()).not.toThrow();
    expect(secondSource.hasFeature(feature)).toBe(true);

    removeFeatures.mockRestore();
    removeFeature.mockRestore();
    const retry = binding.suppressProjection('reentrant-suppression');
    expect(retry.active).toBe(true);
    expect(defaultSource.hasFeature(feature)).toBe(false);
    expect(secondSource.hasFeature(feature)).toBe(false);
    retry.release();
    expect(defaultSource.hasFeature(feature)).toBe(true);
  });

  it('allows a pending reentrant suppression lease to hand off before the cohort commits', () => {
    const { adapter, binding } = setup([point('reentrant-handoff')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('reentrant-handoff');
    let predecessor: ReturnType<FeatureBinding['suppressProjection']> | undefined;
    let successor: ReturnType<FeatureBinding['suppressProjection']> | undefined;
    source.once('removefeature', () => {
      predecessor = binding.suppressProjection('reentrant-handoff');
      successor = predecessor.handoff();
    });

    const outer = binding.suppressProjection('reentrant-handoff');

    expect(predecessor?.active).toBe(false);
    expect(successor?.active).toBe(true);
    outer.release();
    expect(source.hasFeature(feature)).toBe(false);
    successor?.release();
    expect(source.hasFeature(feature)).toBe(true);
  });

  it('accepts suppression when a source listener throws after detachment succeeds', () => {
    const { adapter, binding, errorReporter } = setup([point('listener-failure')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('listener-failure');
    source.on('removefeature', () => {
      throw new Error('remove listener failed after mutation');
    });

    const lease = binding.suppressProjection('listener-failure');

    expect(lease.active).toBe(true);
    expect(source.hasFeature(feature)).toBe(false);
    expect(errorReporter).toHaveBeenCalled();
    lease.release();
    expect(source.hasFeature(feature)).toBe(true);
  });

  it('does not resurrect a binding when a source listener destroys it during acquisition', () => {
    const { adapter, binding } = setup([point('reentrant-destroy')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('reentrant-destroy');
    source.once('removefeature', () => binding.destroy());

    expect(() => binding.suppressProjection('reentrant-destroy')).toThrowError(ObjectDisposedError);
    expect(source.getFeatures()).toEqual([]);
    expect(binding.elementIdFor(feature)).toBeUndefined();
    expect(() => binding.requireFeature('reentrant-destroy')).toThrowError(ObjectDisposedError);
  });

  it('orphans old-generation leases when an id is removed and recreated', () => {
    const { adapter, binding, store } = setup([point('generation')]);
    const source = adapter.requireVectorSource('default');
    const previousFeature = binding.requireFeature('generation');
    const staleLease = binding.suppressProjection('generation');

    store.remove({ id: 'generation' });
    expect(staleLease.active).toBe(false);
    expect(() => staleLease.handoff()).toThrowError(ObjectDisposedError);
    expect(binding.elementIdFor(previousFeature)).toBeUndefined();

    store.add(point('generation', 'default', { geometry: { type: 'point', controlPoints: [[30, 40]] } }));
    const currentFeature = binding.requireFeature('generation');
    expect(currentFeature).not.toBe(previousFeature);
    expect(source.hasFeature(currentFeature)).toBe(true);

    staleLease.release();
    staleLease.release();
    expect(source.hasFeature(currentFeature)).toBe(true);
    expect((currentFeature.getGeometry() as Point).getCoordinates()).toEqual([30, 40]);
  });

  it('makes final release non-throwing when Store replay is unavailable', () => {
    const { adapter, binding, errorReporter, store } = setup([point('release-failure')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('release-failure');
    const lease = binding.suppressProjection('release-failure');
    store.destroy();

    expect(() => lease.release()).not.toThrow();
    expect(() => lease.release()).not.toThrow();
    expect(lease.active).toBe(false);
    expect(source.hasFeature(feature)).toBe(false);
    expect(errorReporter).toHaveBeenCalled();

    expect(() => binding.destroy()).not.toThrow();
  });

  it('keeps a failed release detached and repairs it from Store truth on reconcile', () => {
    const { adapter, binding, codec, errorReporter } = setup([point('dirty-release')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('dirty-release');
    const lease = binding.suppressProjection('dirty-release');
    const project = vi.spyOn(codec, 'project').mockImplementationOnce(() => {
      throw new Error('release projection failed');
    });

    expect(() => lease.release()).not.toThrow();
    expect(source.hasFeature(feature)).toBe(false);
    expect(errorReporter).toHaveBeenCalled();

    project.mockRestore();
    binding.reconcile();
    expect(source.hasFeature(feature)).toBe(true);
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
  });

  it('reports failed source restoration without throwing and repairs it later', () => {
    const { adapter, binding, errorReporter } = setup([point('restore-failure')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('restore-failure');
    const lease = binding.suppressProjection('restore-failure');
    const addFeatures = vi.spyOn(source, 'addFeatures').mockImplementation(() => {
      throw new Error('batch add failed');
    });
    const addFeature = vi.spyOn(source, 'addFeature').mockImplementation(() => {
      throw new Error('single add failed');
    });

    expect(() => lease.release()).not.toThrow();
    expect(source.hasFeature(feature)).toBe(false);
    expect(errorReporter).toHaveBeenCalled();

    addFeatures.mockRestore();
    addFeature.mockRestore();
    binding.reconcile();
    expect(source.hasFeature(feature)).toBe(true);
  });

  it('replays Store truth over direct native mutation before revealing a released Feature', () => {
    const { adapter, binding } = setup([point('release-replay')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('release-replay');
    const lease = binding.suppressProjection('release-replay');
    feature.setId('forged');
    feature.setGeometry(new Point([90, 91]));
    feature.setStyle(new Style());

    lease.release();

    expect(source.hasFeature(feature)).toBe(true);
    expect(feature.getId()).toBe('release-replay');
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
    expect(feature.getStyle()).not.toBeInstanceOf(Style);
  });

  it('replays only the released element without repairing unrelated native mutations', () => {
    const { binding } = setup([point('released'), point('unrelated')]);
    const unrelated = binding.requireFeature('unrelated');
    unrelated.setGeometry(new Point([101, 102]));
    const lease = binding.suppressProjection('released');

    lease.release();

    expect((binding.requireFeature('unrelated').getGeometry() as Point).getCoordinates()).toEqual([101, 102]);
  });

  it('never assigns reverse identity to an adapter-owned preview Feature', () => {
    const { binding, store } = setup([point('persistent')]);
    const preview = new Feature<Geometry>(new Point([70, 80]));
    preview.setId('persistent');

    expect(binding.elementIdFor(preview)).toBeUndefined();
    expect(binding.resolveFeature(preview)).toBeUndefined();
    preview.setGeometry(new Point([90, 100]));
    expect(store.get('persistent')?.geometry).toEqual({ type: 'point', controlPoints: [[1, 2]] });
    expect((binding.requireFeature('persistent').getGeometry() as Point).getCoordinates()).toEqual([1, 2]);
  });

  it('rejects missing and stale suppression handles while keeping cleanup idempotent', () => {
    const { binding } = setup([point('destroyed-lease')]);
    expect(() => binding.suppressProjection('missing')).toThrowError(ObjectDisposedError);
    const lease = binding.suppressProjection('destroyed-lease');

    binding.destroy();

    expect(lease.active).toBe(false);
    expect(() => lease.release()).not.toThrow();
    expect(() => lease.release()).not.toThrow();
    expect(() => lease.handoff()).toThrowError(ObjectDisposedError);
    expect(() => binding.suppressProjection('destroyed-lease')).toThrowError(ObjectDisposedError);
  });

  it('isolates suppression ownership between FeatureBinding instances with the same element id', () => {
    const first = setup([point('shared-id')]);
    const second = setup([point('shared-id')]);
    const firstSource = first.adapter.requireVectorSource('default');
    const secondSource = second.adapter.requireVectorSource('default');
    const firstFeature = first.binding.requireFeature('shared-id');
    const secondFeature = second.binding.requireFeature('shared-id');

    const lease = first.binding.suppressProjection('shared-id');
    expect(firstSource.hasFeature(firstFeature)).toBe(false);
    expect(secondSource.hasFeature(secondFeature)).toBe(true);

    first.binding.destroy();
    lease.release();
    expect(second.binding.requireFeature('shared-id')).toBe(secondFeature);
    expect(secondSource.hasFeature(secondFeature)).toBe(true);
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
    expect(binding.resolveFeature(feature)).toBeUndefined();
    expect(errorReporter).toHaveBeenCalled();

    store.update({ id: 'dirty' }, { data: { label: 'next' } });
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([5, 6]);
    expect(binding.requireFeature('dirty')).toBe(feature);
    expect(binding.resolveFeature(feature)).toEqual({ elementId: 'dirty', layerId: 'default', visible: true });
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

  it('invalidates suppression leases before source callbacks run during destroy', () => {
    const { adapter, binding } = setup([point('destroying-lease')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('destroying-lease');
    const lease = binding.suppressProjection('destroying-lease');
    source.addFeature(feature);
    source.once('removefeature', () => lease.release());

    binding.destroy();

    expect(lease.active).toBe(false);
    expect(source.getFeatures()).toEqual([]);
    expect(feature.getGeometry()).toBeUndefined();
    expect(binding.elementIdFor(feature)).toBeUndefined();
  });

  it('runs every destroy finalizer and retries only unfinished cleanup', () => {
    const { adapter, binding } = setup([point('retry-destroy')]);
    const source = adapter.requireVectorSource('default');
    const feature = binding.requireFeature('retry-destroy');
    const enumerationFailure = new Error('source enumeration failed');
    vi.spyOn(adapter, 'vectorSources').mockImplementationOnce(() => {
      throw enumerationFailure;
    });
    const setGeometry = vi.spyOn(feature, 'setGeometry');
    const setStyle = vi.spyOn(feature, 'setStyle');
    const dispose = vi.spyOn(feature, 'dispose');

    expect(() => binding.destroy()).toThrow(enumerationFailure);
    expect(() => binding.requireFeature('retry-destroy')).toThrowError(ObjectDisposedError);
    expect(source.hasFeature(feature)).toBe(true);
    expect(setGeometry).toHaveBeenCalledTimes(1);
    expect(setStyle).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);

    binding.destroy();
    binding.destroy();
    expect(source.hasFeature(feature)).toBe(false);
    expect(setGeometry).toHaveBeenCalledTimes(1);
    expect(setStyle).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
