import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Style from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError, InvalidSelectorError, ObjectDisposedError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import type { HitTestPort } from '../src/core/ports/HitTestPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../src/core/style/types.js';
import { Element } from '../src/facade/Element.js';
import { ElementServiceImpl } from '../src/facade/ElementService.js';
import { LayerServiceImpl } from '../src/facade/LayerService.js';
import type { ElementHit } from '../src/facade/types.js';
import { assertStructuredStyleSpec } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

class FakeHitTest implements HitTestPort {
  hit: { readonly elementId: string; readonly layerId: string } | undefined;
  extent: readonly [number, number, number, number] | undefined;
  atPixel(): { readonly elementId: string; readonly layerId: string } | undefined {
    return this.hit;
  }
  getScreenExtent(): readonly [number, number, number, number] | undefined {
    return this.extent;
  }
}

function setup(createIds: string[] = []) {
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  let nextId = 0;
  const createId = () => createIds[nextId++] ?? `generated-${nextId}`;
  const store = new ElementStore(shapes, {
    createId,
    validateElement(state) {
      manager.requireVector(state.layerId);
      if (isNativeStyleRef(state.style)) void refs.requireStyle(state.style);
      else assertStructuredStyleSpec(state.style);
    }
  });
  const adapter = new LayerAdapter(createTestMap(), refs);
  const manager = new LayerManager(store, adapter);
  const layers = new LayerServiceImpl(manager, adapter, refs);
  const binding = new FeatureBinding(store, adapter, new GeometryCodec(shapes), new StyleCompiler(refs));
  const hitTest = new FakeHitTest();
  const elements = new ElementServiceImpl(store, manager, binding, layers, refs, hitTest, { createId });
  return { adapter, binding, elements, hitTest, layers, manager, refs, store };
}

describe('ElementService', () => {
  coversCapabilities('element-point', 'element-polyline', 'element-polygon', 'element-circle', 'layer-param-snapshot');

  it('passes the exact public ElementCreateInput and named ElementHit type fixture', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
    const fixture = fileURLToPath(new URL('./fixtures/ElementTypes.ts', import.meta.url));
    expect(() =>
      execFileSync(
        process.execPath,
        [
          tsc,
          '--noEmit',
          '--pretty',
          'false',
          '--strict',
          '--exactOptionalPropertyTypes',
          '--skipLibCheck',
          'false',
          '--types',
          'node',
          '--target',
          'ES2022',
          '--module',
          'ESNext',
          '--moduleResolution',
          'Bundler',
          fixture
        ],
        { cwd: root, encoding: 'utf8' }
      )
    ).not.toThrow();
  });

  it('derives type from geometry, applies defaults, and rejects a repeated top-level type', () => {
    const { elements, layers } = setup(['created']);
    const created = elements.add({ geometry: { type: 'point', controlPoints: [[1, 2]] } });

    expect(created.id).toBe('created');
    expect(created.state).toMatchObject({ id: 'created', type: 'point', layerId: 'default', visible: true });
    expect(Object.isFrozen(created.state)).toBe(true);
    expect(Object.isFrozen(created.state.geometry)).toBe(true);
    expect(created.state.style).toMatchObject({ symbol: { type: 'circle' } });
    expect(layers.get('default')?.state).toMatchObject({ kind: 'vector', wrapX: true, declutter: false });
    expect(() => elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] }, type: 'point' } as never)).toThrow(InvalidArgumentError);
    expect(() => elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] }, unknown: true } as never)).toThrow(InvalidArgumentError);
  });

  it('supports named vector layers and rejects explicit missing/non-vector targets', () => {
    const { elements, layers } = setup(['named']);
    layers.add({ kind: 'vector', id: 'business', wrapX: false });
    layers.add({ kind: 'tile', id: 'tiles', preset: 'osm' });

    expect(elements.add({ geometry: { type: 'circle', center: [0, 0], radius: 2 }, layerId: 'business' }).state.layerId).toBe('business');
    expect(() => elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] }, layerId: 'missing' })).toThrow(InvalidArgumentError);
    expect(() => elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] }, layerId: 'tiles' })).toThrow(InvalidArgumentError);
  });

  it('queries, updates, copies, hides, shows, removes, and clears with frozen arrays', () => {
    const { elements } = setup(['one', 'two', 'copy']);
    elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] }, module: 'group', data: { value: 1 } });
    elements.add({
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [1, 1]
        ]
      },
      module: 'group',
      data: { value: 2 }
    });

    const queried = elements.query<{ value: number }>({ module: 'group' });
    expect(Object.isFrozen(queried)).toBe(true);
    expect(queried.map(({ id }) => id)).toEqual(['one', 'two']);
    expect(elements.get('one')).toBe(queried[0]);
    const updated = elements.update({ module: 'group' }, { data: { value: 3 } });
    expect(Object.isFrozen(updated)).toBe(true);
    expect(updated.every(({ state }) => state.data?.value === 3)).toBe(true);
    const copied = elements.copy<{ value: number }>('one', { module: 'copy' });
    expect(copied.id).toBe('copy');
    expect(elements.hide({ id: 'one' })[0].state.visible).toBe(false);
    expect(elements.show({ id: 'one' })[0].state.visible).toBe(true);
    expect(elements.remove({ module: 'copy' })).toBe(1);
    elements.clear();
    expect(elements.query()).toEqual([]);
  });

  it('uses the same destructive selector guard for every batch entry', () => {
    const { elements } = setup(['one']);
    elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });

    expect(() => elements.update({} as never, { visible: false })).toThrow(InvalidSelectorError);
    expect(() => elements.remove({} as never)).toThrow(InvalidSelectorError);
    expect(() => elements.hide({} as never)).toThrow(InvalidSelectorError);
    expect(() => elements.show({} as never)).toThrow(InvalidSelectorError);
    expect(elements.query()).toHaveLength(1);
  });

  it('atomically rejects invalid structured and cross-Earth native style states', () => {
    const { elements, store } = setup(['valid', 'invalid']);
    const otherRefs = new NativeRefRegistry();
    const valid = elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });
    const before = store.query();

    expect(() => elements.add({ geometry: { type: 'point', controlPoints: [[1, 1]] }, style: { symbol: { type: 'circle', radius: -1 } } })).toThrow(
      InvalidArgumentError
    );
    expect(() => valid.update({ style: otherRefs.registerStyle(new Style()) })).toThrow(ObjectDisposedError);
    expect(store.query()).toEqual(before);
  });

  it('preflights missing adapter vector sources through public add/update without Store changes or notifications', () => {
    const { adapter, elements, layers, store } = setup(['existing', 'blocked']);
    layers.add({ kind: 'vector', id: 'second' });
    const existing = elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });
    const notification = vi.fn();
    store.subscribe(notification);
    adapter.detach('second');
    const before = store.query();

    expect(() => elements.add({ geometry: { type: 'point', controlPoints: [[1, 1]] }, layerId: 'second' })).toThrow();
    expect(() => existing.update({ layerId: 'second' })).toThrow();
    expect(store.query()).toEqual(before);
    expect(notification).not.toHaveBeenCalled();
  });

  it('accepts a native style at creation and preserves exact identity on the Feature', () => {
    const { elements } = setup(['native']);
    const style = new Style();
    const element = elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] }, style: { nativeStyle: style } });

    expect(element.olFeature.getStyle()).toBe(style);
    expect(isNativeStyleRef(element.state.style)).toBe(true);
  });

  it('binds handles to a Feature generation and never resurrects them after same-id re-add', () => {
    const { elements } = setup();
    const old = elements.add({ id: 'same', geometry: { type: 'point', controlPoints: [[0, 0]] } });
    const oldFeature = old.olFeature;
    old.remove();
    expect(() => old.remove()).not.toThrow();
    const current = elements.add({ id: 'same', geometry: { type: 'point', controlPoints: [[1, 1]] } });

    expect(current.olFeature).not.toBe(oldFeature);
    expect(() => old.state).toThrow(ObjectDisposedError);
    expect(() => old.olFeature).toThrow(ObjectDisposedError);
    expect(() => old.update({ visible: false })).toThrow(ObjectDisposedError);
    expect(elements.get('same')).not.toBe(old);
    expect(() => new Element()).toThrow(InvalidArgumentError);
    const constructorArgs: ConstructorParameters<typeof Element> = [];
    expect(constructorArgs).toEqual([]);
  });

  it('wraps only current consistent hit ids and rejects foreign handles for extents', () => {
    const first = setup(['first']);
    const second = setup(['second']);
    const element = first.elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });
    first.hitTest.hit = { elementId: 'first', layerId: 'default' };
    first.hitTest.extent = [1, 2, 3, 4];

    const hit: ElementHit | undefined = first.elements.atPixel([10, 20]);
    expect(hit).toMatchObject({ element: { id: 'first' }, layer: { id: 'default' } });
    first.hitTest.hit = { elementId: 'missing', layerId: 'default' };
    expect(first.elements.atPixel([10, 20])).toBeUndefined();
    first.hitTest.hit = { elementId: 'first', layerId: 'missing' };
    expect(first.elements.atPixel([10, 20])).toBeUndefined();
    first.hitTest.hit = { elementId: 'first', layerId: 'default' };
    expect(first.elements.getScreenExtent(element)).toEqual([1, 2, 3, 4]);
    expect(first.elements.getScreenExtent('missing')).toBeUndefined();
    const foreign = second.elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });
    expect(() => first.elements.getScreenExtent(foreign)).toThrow(InvalidArgumentError);
  });

  it('recreates the default layer after an explicit clear on the next implicit add', () => {
    const { elements, layers } = setup(['after-clear']);
    layers.clear();
    expect(layers.get('default')).toBeUndefined();

    expect(
      elements.add({
        geometry: {
          type: 'polygon',
          controlPoints: [
            [0, 0],
            [2, 0],
            [1, 1]
          ]
        }
      }).state.layerId
    ).toBe('default');
    expect(layers.get('default')).toBeDefined();
  });

  it('invalidates existing handles when clear removes every element', () => {
    const { elements } = setup(['cleared']);
    const element = elements.add({ geometry: { type: 'point', controlPoints: [[0, 0]] } });
    elements.clear();

    expect(() => element.state).toThrow(ObjectDisposedError);
    expect(() => element.olFeature).toThrow(ObjectDisposedError);
    expect(() => element.remove()).toThrow(ObjectDisposedError);
  });
});
