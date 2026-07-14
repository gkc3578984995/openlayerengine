import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError, UnsupportedOperationError } from '../src/core/errors.js';
import { createNativeRef } from '../src/core/native/types.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { isNativeStyleRef, type NativeStyleRef, type StyleSpec } from '../src/core/style/types.js';
import { StyleFacade } from '../src/facade/StyleFacade.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

function element(id: string, style: ElementState['style'] = { symbol: { type: 'circle', radius: 4 } }): ElementState {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style,
    module: 'native-boundary',
    layerId: 'business',
    visible: true
  };
}

function createStore(createId?: () => string): ElementStore {
  return new ElementStore(new ShapeRegistry(basicShapeDefinitions), createId === undefined ? {} : { createId });
}

describe('NativeRefRegistry and native style boundary', () => {
  coversCapabilities('public-ol-native-escape', 'style-native-feature-override');

  it('preserves exact Style, Style array, and function identities in one registry', () => {
    const registry = new NativeRefRegistry();
    const style = new Style({ stroke: new Stroke({ color: '#f00', width: 2 }) });
    const styles = [style, new Style()];
    const styleFunction: StyleFunction = () => undefined;

    const styleRef = registry.registerStyle(style);
    const arrayRef = registry.registerStyle(styles);
    const functionRef = registry.registerStyle(styleFunction);

    expect(Object.isFrozen(styleRef)).toBe(true);
    expect(isNativeStyleRef(styleRef)).toBe(true);
    expect(registry.requireStyle(styleRef)).toBe(style);
    expect(registry.requireStyle(arrayRef)).toBe(styles);
    expect(registry.requireStyle(functionRef)).toBe(styleFunction);
    expect((registry.requireStyle(functionRef) as StyleFunction)(new Feature(new Point([0, 0])), 1)).toBeUndefined();
  });

  it('rejects malformed native styles before registration', () => {
    const registry = new NativeRefRegistry();

    expect(() => registry.registerStyle({} as never)).toThrow(InvalidArgumentError);
    expect(() => registry.registerStyle([new Style(), {}] as never)).toThrow(InvalidArgumentError);
    expect(() => registry.registerStyle([new Style(), null] as never)).toThrow(InvalidArgumentError);
  });

  it('rejects cross-registry, unknown, and wrong-kind references without returning undefined', () => {
    const first = new NativeRefRegistry();
    const second = new NativeRefRegistry();
    const layer = { id: 'layer' };
    const layerRef = first.register('layer', layer);
    const styleRef = first.registerStyle(new Style());

    expect(first.require('layer', layerRef)).toBe(layer);
    expect(() => first.require('source', layerRef as never)).toThrow(InvalidArgumentError);
    expect(() => second.require('layer', layerRef)).toThrow(ObjectDisposedError);
    expect(() => second.requireStyle(styleRef)).toThrow(ObjectDisposedError);
    expect(() => first.require('layer', createNativeRef('layer'))).toThrow(ObjectDisposedError);
    expect(() => first.require('layer', {} as never)).toThrow(InvalidArgumentError);
  });

  it('keeps persistent references alive through release, copy, and remove', () => {
    const registry = new NativeRefRegistry();
    const nativeStyles = [new Style({ stroke: new Stroke({ color: '#00f' }) })];
    const nativeRef = registry.registerStyle(nativeStyles);
    const layer = { id: 'layer' };
    const layerRef = registry.register('layer', layer);
    const store = createStore(() => 'copy');
    store.add(element('original', nativeRef));

    registry.releaseStyle(nativeRef);
    registry.releaseStyle(nativeRef);
    registry.release('layer', layerRef);
    registry.release('layer', layerRef);
    const copy = store.copy('original');
    store.remove({ id: 'original' });

    expect(copy.style).toBe(nativeRef);
    expect(registry.requireStyle(copy.style as NativeStyleRef)).toBe(nativeStyles);
    expect(registry.require('layer', layerRef)).toBe(layer);
  });

  it('invalidates transient references immediately and releases them idempotently', () => {
    const registry = new NativeRefRegistry();
    const inputEvent = { type: 'pointerdown' };
    const reference = registry.registerTransient('input-event', inputEvent);

    expect(registry.requireTransient('input-event', reference)).toBe(inputEvent);
    registry.releaseTransient('input-event', reference);
    registry.releaseTransient('input-event', reference);
    expect(() => registry.requireTransient('input-event', reference)).toThrow(ObjectDisposedError);
  });

  it('invalidates all owned references on idempotent destroy and rejects later operations', () => {
    const registry = new NativeRefRegistry();
    const layerRef = registry.register('layer', { id: 'layer' });
    const styleRef = registry.registerStyle(new Style());
    const transientRef = registry.registerTransient('input-event', { type: 'click' });

    expect(() => registry.destroy()).not.toThrow();
    expect(() => registry.destroy()).not.toThrow();
    expect(() => registry.require('layer', layerRef)).toThrow(ObjectDisposedError);
    expect(() => registry.requireStyle(styleRef)).toThrow(ObjectDisposedError);
    expect(() => registry.requireTransient('input-event', transientRef)).toThrow(ObjectDisposedError);
    expect(() => registry.register('layer', {})).toThrow(ObjectDisposedError);
    expect(() => registry.registerStyle(new Style())).toThrow(ObjectDisposedError);
    expect(() => registry.release('layer', layerRef)).toThrow(ObjectDisposedError);
    expect(() => registry.releaseStyle(styleRef)).toThrow(ObjectDisposedError);
    expect(() => registry.releaseTransient('input-event', transientRef)).toThrow(ObjectDisposedError);
  });

  it('lets the facade cross only an opaque token and preserves it through Store copy', () => {
    const store = createStore(() => 'copy');
    const internal = new StyleService(store);
    const registry = new NativeRefRegistry();
    const facade = new StyleFacade(internal, registry);
    const native = [new Style(), new Style({ stroke: new Stroke({ color: '#0f0' }) })];
    store.add(element('original'));

    expect(facade.set({ id: 'original' }, { nativeStyle: native })).toBeUndefined();
    const storedRef = store.get('original')?.style;
    const copied = store.copy('original');

    expect(isNativeStyleRef(storedRef)).toBe(true);
    expect(copied.style).toBe(storedRef);
    expect(registry.requireStyle(storedRef as NativeStyleRef)).toBe(native);
  });

  it('discards provisional native styles when facade set has no match or fails', () => {
    const store = createStore();
    const internal = new StyleService(store);
    const registry = new NativeRefRegistry();
    const facade = new StyleFacade(internal, registry);
    const registered: NativeStyleRef[] = [];
    const registerProvisionalStyle = registry.registerProvisionalStyle.bind(registry);
    vi.spyOn(registry, 'registerProvisionalStyle').mockImplementation((style) => {
      const reference = registerProvisionalStyle(style);
      registered.push(reference);
      return reference;
    });
    store.add(element('target'));

    facade.set({ id: 'missing' }, { nativeStyle: new Style() });
    expect(() => registry.requireStyle(registered[0])).toThrow(ObjectDisposedError);

    expect(() => facade.set({} as never, { nativeStyle: new Style() })).toThrow();
    expect(() => registry.requireStyle(registered[1])).toThrow(ObjectDisposedError);

    const retained = new Style();
    facade.set({ id: 'target' }, { nativeStyle: retained });
    expect(registry.requireStyle(registered[2])).toBe(retained);
    expect(() => registry.discardProvisionalStyle(registered[2])).toThrow(InvalidArgumentError);
    expect(registry.requireStyle(registered[2])).toBe(retained);
  });

  it('rejects external serialization and atomically rejects structured patching across native state', () => {
    const registry = new NativeRefRegistry();
    const nativeRef = registry.registerStyle(new Style());
    const store = createStore();
    const internal = new StyleService(store);
    const facade = new StyleFacade(internal, registry);
    store.add(element('structured'));
    store.add(element('native', nativeRef));
    const before = store.query();

    expect(() => internal.serialize(nativeRef)).toThrow(UnsupportedOperationError);
    expect(() => facade.patch({ ids: ['structured', 'native'] }, { symbol: { scale: 2 } })).toThrow(UnsupportedOperationError);
    expect(store.query()).toEqual(before);

    const serialized = internal.serialize({ strokes: [{ color: '#f00', lineDash: [3, 2] }] });
    (serialized as StyleSpec).strokes?.[0].lineDash?.push(1);
    expect(serialized).toEqual({ strokes: [{ color: '#f00', lineDash: [3, 2, 1] }] });
  });
});
