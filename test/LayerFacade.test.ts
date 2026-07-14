import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { describe, expect, it, vi } from 'vitest';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { Layer } from '../src/facade/Layer.js';
import { LayerServiceImpl } from '../src/facade/LayerService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

function setup() {
  const map = createTestMap();
  const refs = new NativeRefRegistry();
  const adapter = new LayerAdapter(map, refs);
  const manager = new LayerManager(new ElementStore(new ShapeRegistry()), adapter);
  const layers = new LayerServiceImpl(manager, adapter, refs);
  return { adapter, layers, manager, map, refs };
}

describe('Layer facade', () => {
  coversCapabilities('earth-layer-handle-lifecycle', 'layer-visibility-opacity-order', 'layer-param-snapshot');

  it('returns one handle per attached generation and safe Core-backed snapshots', () => {
    const { layers } = setup();
    const created = layers.add({ kind: 'vector', id: 'business', wrapX: false, declutter: true, opacity: 0.5, zIndex: 4 });

    expect(layers.get('business')).toBe(created);
    expect(layers.query('vector')).toContain(created);
    expect(Object.isFrozen(layers.query())).toBe(true);
    expect(created.state).toEqual({ kind: 'vector', id: 'business', visible: true, opacity: 0.5, zIndex: 4, wrapX: false, declutter: true });
    expect(Object.isFrozen(created.state)).toBe(true);
    expect(created.kind).toBe('vector');
    expect(created.visible).toBe(true);
    expect(created.opacity).toBe(0.5);
    expect(created.zIndex).toBe(4);
    expect(created.state).not.toHaveProperty('source');
    expect(created.state).not.toHaveProperty('ref');
  });

  it('captures native presentation once and never reverse reads later direct mutations', () => {
    const { layers } = setup();
    const native = new VectorLayer({ source: new VectorSource(), visible: false, opacity: 0.25, zIndex: 7 });
    const layer = layers.add({ kind: 'native', id: 'native', layer: native });

    expect(layer.state).toEqual({ kind: 'native', id: 'native', visible: false, opacity: 0.25, zIndex: 7 });
    native.setVisible(true);
    native.setOpacity(0.9);
    native.setZIndex(99);
    expect(layer.state).toEqual({ kind: 'native', id: 'native', visible: false, opacity: 0.25, zIndex: 7 });
  });

  it('updates/show/hide and fully replays Core presentation after native mutation', () => {
    const { layers } = setup();
    const layer = layers.add({ kind: 'vector', id: 'business', visible: true, opacity: 0.4, zIndex: 3 });
    const native = layer.olLayer;
    native.setVisible(false);
    native.setOpacity(1);
    native.setZIndex(100);

    layer.update({ opacity: 0.4 });
    expect(native.getVisible()).toBe(true);
    expect(native.getOpacity()).toBe(0.4);
    expect(native.getZIndex()).toBe(3);

    native.setVisible(false);
    native.setOpacity(1);
    native.setZIndex(100);
    layer.update({ opacity: 0.6 });
    expect(native.getVisible()).toBe(true);
    expect(native.getOpacity()).toBe(0.6);
    expect(native.getZIndex()).toBe(3);
    layer.hide();
    expect(layer.visible).toBe(false);
    expect(native.getVisible()).toBe(false);
    layer.show();
    expect(layer.visible).toBe(true);
    const unset = vi.spyOn(native, 'unset');
    layer.update({ zIndex: undefined });
    expect(layer.zIndex).toBeUndefined();
    expect(native.getZIndex()).toBeUndefined();
    expect(unset).toHaveBeenCalledWith('zIndex');
  });

  it('accepts opacity boundaries and rejects invalid finite/range presentation values atomically', () => {
    const { layers } = setup();
    const layer = layers.add({ kind: 'vector', id: 'business' });

    layer.update({ opacity: 0 });
    expect(layer.opacity).toBe(0);
    layer.update({ opacity: 1 });
    expect(layer.opacity).toBe(1);
    for (const opacity of [-0.01, 1.01, Infinity, Number.NaN]) {
      expect(() => layer.update({ opacity })).toThrow(InvalidArgumentError);
      expect(layer.opacity).toBe(1);
    }
    expect(() => layer.update({ zIndex: Infinity })).toThrow(InvalidArgumentError);
    expect(() => layer.update({ visible: undefined } as never)).toThrow(InvalidArgumentError);
  });

  it('removes idempotently, invalidates the old generation, and never resurrects it', () => {
    const { layers } = setup();
    const old = layers.add({ kind: 'vector', id: 'same' });
    const oldNative = old.olLayer;
    old.remove();
    expect(() => old.remove()).not.toThrow();
    const current = layers.add({ kind: 'vector', id: 'same' });

    expect(current).not.toBe(old);
    expect(current.olLayer).not.toBe(oldNative);
    expect(() => old.state).toThrow(ObjectDisposedError);
    expect(() => old.update({ visible: false })).toThrow(ObjectDisposedError);
    expect(() => old.olLayer).toThrow(ObjectDisposedError);
    expect(() => new Layer()).toThrow(InvalidArgumentError);
    const constructorArgs: ConstructorParameters<typeof Layer> = [];
    expect(constructorArgs).toEqual([]);
  });

  it('does not resurrect an old handle when the same external native object and id are registered again', () => {
    const { layers } = setup();
    const native = new VectorLayer({});
    const old = layers.add({ kind: 'native', id: 'reused', layer: native });
    old.remove();
    const current = layers.add({ kind: 'native', id: 'reused', layer: native });

    expect(current.olLayer).toBe(native);
    expect(current).not.toBe(old);
    expect(() => old.state).toThrow(ObjectDisposedError);
    expect(() => old.olLayer).toThrow(ObjectDisposedError);
  });
});
