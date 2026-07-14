import { readFileSync } from 'node:fs';
import TileLayer from 'ol/layer/Tile.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageTileSource from 'ol/source/ImageTile.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import { describe, expect, it, vi } from 'vitest';
import { compactTileUrl, LayerAdapter, wrapTileUrlFunction } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { LayerServiceImpl } from '../src/facade/LayerService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

function setup(errorReporter = vi.fn()) {
  const map = createTestMap();
  const refs = new NativeRefRegistry();
  const adapter = new LayerAdapter(map, refs, { errorReporter });
  const store = new ElementStore(new ShapeRegistry());
  const manager = new LayerManager(store, adapter);
  return { adapter, errorReporter, manager, map, refs };
}

describe('LayerAdapter ownership', () => {
  coversCapabilities('layer-native-layer-access', 'layer-registration-lifecycle', 'public-ol-native-escape');

  it('detaches external native layers and disposes earth-owned native layers exactly once', () => {
    const { adapter, manager, map, refs } = setup();
    const external = new VectorLayer({ source: new VectorSource() });
    const owned = new VectorLayer({ source: new VectorSource() });
    const externalDispose = vi.spyOn(external, 'dispose');
    const ownedDispose = vi.spyOn(owned, 'dispose');

    manager.add({ kind: 'native', id: 'external', ref: refs.register('layer', external), ownership: 'external' });
    manager.add({ kind: 'native', id: 'owned', ref: refs.register('layer', owned), ownership: 'earth' });

    expect(adapter.requireLayer('external')).toBe(external);
    expect(adapter.requireLayer('owned')).toBe(owned);
    expect(map.getLayers().getArray()).toEqual([external, owned]);
    manager.remove('external');
    manager.remove('owned');
    manager.destroy();

    expect(externalDispose).not.toHaveBeenCalled();
    expect(ownedDispose).toHaveBeenCalledTimes(1);
    expect(map.getLayers().getLength()).toBe(0);
  });

  it('owns vector and preset wrappers/sources and uses ImageTile for xyz/compact presets', () => {
    const { adapter, manager } = setup();
    manager.add({ kind: 'vector', id: 'vector', visible: true, opacity: 1, wrapX: false, declutter: true });
    manager.add({ kind: 'tile', id: 'osm', source: { preset: 'osm' }, sourceOwnership: 'earth', visible: true, opacity: 1 });
    manager.add({
      kind: 'tile',
      id: 'xyz',
      source: { preset: 'xyz', url: 'https://example.test/{z}/{x}/{y}.png' },
      sourceOwnership: 'earth',
      visible: true,
      opacity: 1
    });
    manager.add({
      kind: 'tile',
      id: 'compact',
      source: { preset: 'compact-xyz', baseUrl: 'https://example.test/tiles///' },
      sourceOwnership: 'earth',
      visible: true,
      opacity: 1
    });

    const vector = adapter.requireLayer('vector') as VectorLayer;
    const osm = adapter.requireLayer('osm') as TileLayer;
    const xyz = adapter.requireLayer('xyz') as TileLayer;
    const compact = adapter.requireLayer('compact') as TileLayer;
    expect(vector.getSource()).toBe(adapter.requireVectorSource('vector'));
    expect(vector.getStyle()).toBeNull();
    expect(osm.getSource()).toBeInstanceOf(OSM);
    expect(xyz.getSource()).toBeInstanceOf(ImageTileSource);
    expect(compact.getSource()).toBeInstanceOf(ImageTileSource);
    expect(compact.getSource()).toBeInstanceOf(ImageTileSource);
    expect(compactTileUrl('https://example.test/tiles///', 3, 10, 11)).toBe('https://example.test/tiles/L03/R0000000B/C0000000A.jpg');
    for (const coordinate of [
      [-1, 0, 0],
      [1.5, 0, 0],
      [1, Number.NaN, 0],
      [1, 0, Infinity]
    ] as const) {
      expect(() => compactTileUrl('https://example.test/tiles', coordinate[0], coordinate[1], coordinate[2])).toThrow(InvalidArgumentError);
    }
    expect(() => compactTileUrl('///', 1, 1, 1)).toThrow(InvalidArgumentError);
  });

  it('isolates attribution arrays and validates custom URL callback results when invoked', () => {
    const { adapter, manager } = setup();
    const attributions = ['first'];
    manager.add({
      kind: 'tile',
      id: 'attributed',
      source: { preset: 'xyz', url: 'https://example.test/{z}/{x}/{y}.png', attributions },
      sourceOwnership: 'earth',
      visible: true,
      opacity: 1
    });
    attributions.push('mutated');
    const source = (adapter.requireLayer('attributed') as TileLayer).getSource() as ImageTileSource;
    expect(source.getAttributions()?.({} as never)).toEqual(['first']);

    const callback = vi.fn(([z, x, y]: [number, number, number]) => `${z}/${x}/${y}`);
    const wrapped = wrapTileUrlFunction(callback);
    expect(wrapped(3, 4, 5, {} as never)).toBe('3/4/5');
    expect(callback).toHaveBeenCalledWith([3, 4, 5]);
    expect(() => wrapTileUrlFunction(() => '')(1, 2, 3, {} as never)).toThrow(InvalidArgumentError);
  });

  it('shares custom sources only under one ownership mode and ref-counts earth ownership', () => {
    const { manager, refs } = setup();
    const external = new ImageTileSource({ url: 'https://example.test/{z}/{x}/{y}.png' });
    const owned = new ImageTileSource({ url: 'https://example.test/{z}/{x}/{y}.png' });
    const externalDispose = vi.spyOn(external, 'dispose');
    const ownedDispose = vi.spyOn(owned, 'dispose');
    const externalRef = refs.register('source', external);
    const ownedRef = refs.register('source', owned);
    const tile = (id: string, source: typeof externalRef, sourceOwnership: 'external' | 'earth') => ({
      kind: 'tile' as const,
      id,
      source,
      sourceOwnership,
      visible: true,
      opacity: 1
    });

    manager.add(tile('external-a', externalRef, 'external'));
    manager.add(tile('external-b', externalRef, 'external'));
    manager.add(tile('owned-a', ownedRef, 'earth'));
    manager.add(tile('owned-b', ownedRef, 'earth'));
    expect(() => manager.add(tile('mixed', ownedRef, 'external'))).toThrow(InvalidArgumentError);

    manager.remove('owned-a');
    expect(ownedDispose).not.toHaveBeenCalled();
    manager.remove('owned-b');
    expect(ownedDispose).toHaveBeenCalledTimes(1);
    manager.remove('external-a');
    manager.remove('external-b');
    expect(externalDispose).not.toHaveBeenCalled();
  });

  it('rejects duplicate native layer identity before mutating the root collection', () => {
    const { manager, map, refs } = setup();
    const layer = new VectorLayer({});
    const reference = refs.register('layer', layer);
    manager.add({ kind: 'native', id: 'first', ref: reference, ownership: 'external' });

    expect(() => manager.add({ kind: 'native', id: 'second', ref: reference, ownership: 'external' })).toThrow(InvalidArgumentError);
    expect(map.getLayers().getArray()).toEqual([layer]);
  });

  it('rejects native layers already present in root or nested managed collections using public APIs', () => {
    const root = setup();
    const rootLayer = new VectorLayer({});
    root.map.getLayers().push(rootLayer);
    expect(() => root.manager.add({ kind: 'native', id: 'root-duplicate', ref: root.refs.register('layer', rootLayer), ownership: 'external' })).toThrow(
      InvalidArgumentError
    );

    const nested = setup();
    const nestedLayer = new VectorLayer({});
    nested.map.getLayers().push(new LayerGroup({ layers: [nestedLayer] }));
    expect(() =>
      nested.manager.add({ kind: 'native', id: 'nested-duplicate', ref: nested.refs.register('layer', nestedLayer), ownership: 'external' })
    ).toThrow(InvalidArgumentError);
  });

  it('does not use private unmanaged-layer reverse lookup and documents detached setMap input as caller responsibility', () => {
    const source = readFileSync('src/adapters/openlayers/LayerAdapter.ts', 'utf8');
    expect(source).not.toContain('getMapInternal');
    expect(source).not.toContain('map_');
  });

  it('rolls back failed insertion without disposing user resources', () => {
    const { manager, map, refs } = setup();
    const layer = new VectorLayer({});
    const dispose = vi.spyOn(layer, 'dispose');
    vi.spyOn(map.getLayers(), 'push').mockImplementation(() => {
      throw new Error('push failed');
    });

    expect(() => manager.add({ kind: 'native', id: 'failed', ref: refs.register('layer', layer), ownership: 'earth' })).toThrow('push failed');
    expect(dispose).not.toHaveBeenCalled();
    expect(manager.get('failed')).toBeUndefined();
  });

  it('treats an inserted layer as success when a collection listener throws and reports it', () => {
    const reporter = vi.fn();
    const { manager, map, refs } = setup(reporter);
    const layer = new VectorLayer({});
    map.getLayers().on('add', () => {
      throw new Error('listener failed after insert');
    });

    expect(() => manager.add({ kind: 'native', id: 'inserted', ref: refs.register('layer', layer), ownership: 'external' })).not.toThrow();
    expect(manager.get('inserted')?.id).toBe('inserted');
    expect(map.getLayers().getArray()).toContain(layer);
    expect(reporter).toHaveBeenCalled();
  });

  it('supports deterministic generic provisional reference commit/discard without disposal', () => {
    const first = new NativeRefRegistry();
    const second = new NativeRefRegistry();
    const source = new ImageTileSource();
    const dispose = vi.spyOn(source, 'dispose');
    const pending = first.registerProvisional('source', source);

    expect(first.require('source', pending)).toBe(source);
    expect(first.isProvisional('source', pending)).toBe(true);
    expect(() => second.commitProvisional('source', pending)).toThrow(ObjectDisposedError);
    expect(() => first.commitProvisional('layer', pending as never)).toThrow(InvalidArgumentError);
    first.commitProvisional('source', pending);
    expect(first.isProvisional('source', pending)).toBe(false);
    expect(() => first.commitProvisional('source', pending)).toThrow(InvalidArgumentError);
    expect(first.require('source', pending)).toBe(source);

    const discarded = first.registerProvisional('source', source);
    first.discardProvisional('source', discarded);
    expect(() => first.require('source', discarded)).toThrow(ObjectDisposedError);
    expect(() => first.discardProvisional('source', pending)).toThrow(InvalidArgumentError);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('pre-creates callback ImageTile sources and commits or rolls back their provisional handoff', () => {
    const success = setup();
    const successLayers = new LayerServiceImpl(success.manager, success.adapter, success.refs);
    const register = vi.spyOn(success.refs, 'registerProvisional');
    const commit = vi.spyOn(success.refs, 'commitProvisional');
    successLayers.add({ kind: 'tile', id: 'callback', preset: 'xyz', tileUrlFunction: ([z, x, y]) => `${z}/${x}/${y}` });
    const registeredSource = register.mock.calls.find(([kind]) => kind === 'source')?.[1];
    expect(registeredSource).toBeInstanceOf(ImageTileSource);
    expect(commit).toHaveBeenCalledWith('source', expect.anything());
    expect((success.adapter.requireLayer('callback') as TileLayer).getSource()).toBe(registeredSource);
    expect(success.manager.get('callback')).not.toHaveProperty('tileUrlFunction');
    const successfulSourceDispose = vi.spyOn(registeredSource as ImageTileSource, 'dispose');
    successLayers.remove('callback');
    expect(successfulSourceDispose).toHaveBeenCalledTimes(1);

    const failed = setup();
    const failedLayers = new LayerServiceImpl(failed.manager, failed.adapter, failed.refs);
    let provisionalSource: ImageTileSource | undefined;
    let provisionalDisposeCalls = 0;
    const nativeRegister = failed.refs.registerProvisional.bind(failed.refs);
    vi.spyOn(failed.refs, 'registerProvisional').mockImplementation((kind, value) => {
      if (kind === 'source') {
        provisionalSource = value as ImageTileSource;
        vi.spyOn(provisionalSource, 'dispose').mockImplementation(() => {
          provisionalDisposeCalls += 1;
        });
      }
      return nativeRegister(kind, value);
    });
    vi.spyOn(failed.map.getLayers(), 'push').mockImplementation(() => {
      throw new Error('attach failed');
    });
    expect(() => failedLayers.add({ kind: 'tile', id: 'failed-callback', preset: 'xyz', tileUrlFunction: () => 'x' })).toThrow('attach failed');
    expect(provisionalSource).toBeDefined();
    expect(provisionalDisposeCalls).toBe(1);
    expect(failed.manager.get('failed-callback')).toBeUndefined();

    const commitFailure = setup();
    const commitFailureLayers = new LayerServiceImpl(commitFailure.manager, commitFailure.adapter, commitFailure.refs);
    let commitSourceDisposeCalls = 0;
    const commitRegister = commitFailure.refs.registerProvisional.bind(commitFailure.refs);
    vi.spyOn(commitFailure.refs, 'registerProvisional').mockImplementation((kind, value) => {
      if (kind === 'source') {
        vi.spyOn(value as ImageTileSource, 'dispose').mockImplementation(() => {
          commitSourceDisposeCalls += 1;
        });
      }
      return commitRegister(kind, value);
    });
    const discard = vi.spyOn(commitFailure.refs, 'discardProvisional');
    vi.spyOn(commitFailure.refs, 'commitProvisional').mockImplementation(() => {
      throw new Error('commit failed');
    });
    expect(() => commitFailureLayers.add({ kind: 'tile', id: 'commit-failure', preset: 'xyz', tileUrlFunction: () => 'x' })).toThrow('commit failed');
    expect(commitFailure.manager.get('commit-failure')).toBeUndefined();
    expect(commitSourceDisposeCalls).toBe(1);
    expect(discard).toHaveBeenCalled();
  });

  it('provisionally hands off public custom sources/native layers and never disposes user resources on failed registration', () => {
    const success = setup();
    const layers = new LayerServiceImpl(success.manager, success.adapter, success.refs);
    const source = new ImageTileSource();
    const native = new VectorLayer({});
    const sourceDispose = vi.spyOn(source, 'dispose');
    const nativeDispose = vi.spyOn(native, 'dispose');
    const register = vi.spyOn(success.refs, 'registerProvisional');
    const commit = vi.spyOn(success.refs, 'commitProvisional');
    layers.add({ kind: 'tile', id: 'user-source', source });
    layers.add({ kind: 'native', id: 'user-layer', layer: native });
    expect(register).toHaveBeenCalledWith('source', source);
    expect(register).toHaveBeenCalledWith('layer', native);
    expect(commit).toHaveBeenCalledWith('source', expect.anything());
    expect(commit).toHaveBeenCalledWith('layer', expect.anything());
    layers.remove('user-source');
    layers.remove('user-layer');
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(nativeDispose).not.toHaveBeenCalled();

    const failed = setup();
    const failedLayers = new LayerServiceImpl(failed.manager, failed.adapter, failed.refs);
    const failedSource = new ImageTileSource();
    const failedLayer = new VectorLayer({});
    const failedSourceDispose = vi.spyOn(failedSource, 'dispose');
    const layerDispose = vi.spyOn(failedLayer, 'dispose');
    const discard = vi.spyOn(failed.refs, 'discardProvisional');
    const push = vi.spyOn(failed.map.getLayers(), 'push').mockImplementation(() => {
      throw new Error('user attach failed');
    });
    expect(() => failedLayers.add({ kind: 'tile', id: 'failed-source', source: failedSource, ownership: 'earth' })).toThrow('user attach failed');
    expect(failedSourceDispose).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith('source', expect.anything());
    push.mockClear();
    expect(() => failedLayers.add({ kind: 'native', id: 'failed-layer', layer: failedLayer, ownership: 'earth' })).toThrow('user attach failed');
    expect(layerDispose).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith('layer', expect.anything());
  });

  it('preserves earth-owned user resources when provisional commit fails', () => {
    const sourceContext = setup();
    const sourceLayers = new LayerServiceImpl(sourceContext.manager, sourceContext.adapter, sourceContext.refs);
    const source = new ImageTileSource();
    const sourceDispose = vi.spyOn(source, 'dispose');
    const sourceDiscard = vi.spyOn(sourceContext.refs, 'discardProvisional');
    vi.spyOn(sourceContext.refs, 'commitProvisional').mockImplementation(() => {
      throw new Error('source commit failed');
    });

    expect(() => sourceLayers.add({ kind: 'tile', id: 'source-commit-failure', source, ownership: 'earth' })).toThrow('source commit failed');
    expect(sourceContext.manager.get('source-commit-failure')).toBeUndefined();
    expect(sourceContext.map.getLayers().getLength()).toBe(1);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(sourceDiscard).toHaveBeenCalledWith('source', expect.anything());

    const layerContext = setup();
    const nativeLayers = new LayerServiceImpl(layerContext.manager, layerContext.adapter, layerContext.refs);
    const nativeLayer = new VectorLayer({});
    const layerDispose = vi.spyOn(nativeLayer, 'dispose');
    const layerDiscard = vi.spyOn(layerContext.refs, 'discardProvisional');
    vi.spyOn(layerContext.refs, 'commitProvisional').mockImplementation(() => {
      throw new Error('layer commit failed');
    });

    expect(() => nativeLayers.add({ kind: 'native', id: 'layer-commit-failure', layer: nativeLayer, ownership: 'earth' })).toThrow('layer commit failed');
    expect(layerContext.manager.get('layer-commit-failure')).toBeUndefined();
    expect(layerContext.map.getLayers().getArray()).not.toContain(nativeLayer);
    expect(layerDispose).not.toHaveBeenCalled();
    expect(layerDiscard).toHaveBeenCalledWith('layer', expect.anything());
  });

  it('activates earth ownership only after a successful provisional commit', () => {
    const context = setup();
    const layers = new LayerServiceImpl(context.manager, context.adapter, context.refs);
    const source = new ImageTileSource();
    const nativeLayer = new VectorLayer({});
    const sourceDispose = vi.spyOn(source, 'dispose');
    const layerDispose = vi.spyOn(nativeLayer, 'dispose');

    layers.add({ kind: 'tile', id: 'owned-source', source, ownership: 'earth' });
    layers.add({ kind: 'native', id: 'owned-layer', layer: nativeLayer, ownership: 'earth' });
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(layerDispose).not.toHaveBeenCalled();

    layers.remove('owned-source');
    layers.remove('owned-layer');
    expect(sourceDispose).toHaveBeenCalledTimes(1);
    expect(layerDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes internally-created vector and preset wrappers/sources exactly once in cleanup order', () => {
    const { adapter, manager } = setup();
    manager.add({ kind: 'vector', id: 'vector-owned', visible: true, opacity: 1, wrapX: true, declutter: false });
    manager.add({ kind: 'tile', id: 'osm-owned', source: { preset: 'osm' }, sourceOwnership: 'earth', visible: true, opacity: 1 });
    manager.add({
      kind: 'tile',
      id: 'xyz-owned',
      source: { preset: 'xyz', url: 'https://example.test/{z}/{x}/{y}.png' },
      sourceOwnership: 'earth',
      visible: true,
      opacity: 1
    });
    manager.add({
      kind: 'tile',
      id: 'compact-owned',
      source: { preset: 'compact-xyz', baseUrl: 'https://example.test/tiles' },
      sourceOwnership: 'earth',
      visible: true,
      opacity: 1
    });
    const records = ['vector-owned', 'osm-owned', 'xyz-owned', 'compact-owned'].map((id) => {
      const layer = adapter.requireLayer(id) as VectorLayer | TileLayer;
      const source = id === 'vector-owned' ? adapter.requireVectorSource(id) : (layer as TileLayer).getSource();
      if (source === null) throw new Error('Expected owned source');
      return { layerDispose: vi.spyOn(layer, 'dispose'), sourceDispose: vi.spyOn(source, 'dispose') };
    });
    const vectorClear = vi.spyOn(adapter.requireVectorSource('vector-owned'), 'clear');

    manager.destroy();
    manager.destroy();
    for (const { layerDispose, sourceDispose } of records) {
      expect(layerDispose).toHaveBeenCalledTimes(1);
      expect(sourceDispose).toHaveBeenCalledTimes(1);
      expect(layerDispose.mock.invocationCallOrder[0]).toBeLessThan(sourceDispose.mock.invocationCallOrder[0]);
    }
    expect(vectorClear).toHaveBeenCalledTimes(1);
    expect(vectorClear.mock.invocationCallOrder[0]).toBeLessThan(records[0].layerDispose.mock.invocationCallOrder[0]);
  });

  it('disposes a callback source if provisional registration itself fails', () => {
    const context = setup();
    const layers = new LayerServiceImpl(context.manager, context.adapter, context.refs);
    const dispose = vi.spyOn(ImageTileSource.prototype, 'dispose');
    vi.spyOn(context.refs, 'registerProvisional').mockImplementation(() => {
      throw new Error('registration failed');
    });
    try {
      expect(() => layers.add({ kind: 'tile', id: 'registration-failure', preset: 'xyz', tileUrlFunction: () => 'x' })).toThrow('registration failed');
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
    }
  });

  it('disposes custom wrappers and sources according to independent ownership/ref-count rules', () => {
    const { adapter, manager, refs } = setup();
    const external = new ImageTileSource({ url: 'https://example.test/{z}/{x}/{y}.png' });
    const owned = new ImageTileSource({ url: 'https://example.test/{z}/{x}/{y}.png' });
    const externalRef = refs.register('source', external);
    const ownedRef = refs.register('source', owned);
    manager.add({ kind: 'tile', id: 'external', source: externalRef, sourceOwnership: 'external', visible: true, opacity: 1 });
    manager.add({ kind: 'tile', id: 'owned-a', source: ownedRef, sourceOwnership: 'earth', visible: true, opacity: 1 });
    manager.add({ kind: 'tile', id: 'owned-b', source: ownedRef, sourceOwnership: 'earth', visible: true, opacity: 1 });
    const wrapperDisposals = ['external', 'owned-a', 'owned-b'].map((id) => vi.spyOn(adapter.requireLayer(id), 'dispose'));
    const externalDispose = vi.spyOn(external, 'dispose');
    const ownedDispose = vi.spyOn(owned, 'dispose');

    manager.clear();
    expect(wrapperDisposals.map(({ mock }) => mock.calls.length)).toEqual([1, 1, 1]);
    expect(externalDispose).not.toHaveBeenCalled();
    expect(ownedDispose).toHaveBeenCalledTimes(1);
  });

  it('reports update and detach listener failures while completing the requested final state', () => {
    const reporter = vi.fn();
    const { adapter, manager, map } = setup(reporter);
    manager.add({ kind: 'vector', id: 'listeners', visible: true, opacity: 1, zIndex: 2, wrapX: true, declutter: false });
    const layer = adapter.requireLayer('listeners');
    layer.on('change:visible', () => {
      throw new Error('visible listener failed');
    });

    expect(() => manager.update('listeners', { visible: false, opacity: 0.4, zIndex: undefined })).not.toThrow();
    expect(manager.get('listeners')).toMatchObject({ visible: false, opacity: 0.4 });
    expect(layer.getVisible()).toBe(false);
    expect(layer.getOpacity()).toBe(0.4);
    expect(layer.getZIndex()).toBeUndefined();

    map.getLayers().on('remove', () => {
      throw new Error('remove listener failed');
    });
    expect(() => manager.remove('listeners')).not.toThrow();
    expect(manager.get('listeners')).toBeUndefined();
    expect(map.getLayers().getArray()).not.toContain(layer);
    expect(reporter).toHaveBeenCalled();
  });

  it('continues detach cleanup and reports user disposal errors without throwing', () => {
    const reporter = vi.fn();
    const { manager, map, refs } = setup(reporter);
    const layer = new VectorLayer({});
    vi.spyOn(layer, 'dispose').mockImplementation(() => {
      throw new Error('dispose failed');
    });
    manager.add({ kind: 'native', id: 'owned', ref: refs.register('layer', layer), ownership: 'earth' });

    expect(() => manager.remove('owned')).not.toThrow();
    expect(map.getLayers().getArray()).not.toContain(layer);
    expect(manager.get('owned')).toBeUndefined();
    expect(reporter).toHaveBeenCalled();
    expect(() => manager.destroy()).not.toThrow();
    expect(() => manager.destroy()).not.toThrow();
  });
});
