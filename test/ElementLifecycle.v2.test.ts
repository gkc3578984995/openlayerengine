import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { DuplicateElementIdError, InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { createNativeStyleRef } from '../src/core/style/types.js';

function state(overrides: Partial<ElementState<{ nested: { label: string } }>> = {}): ElementState<{ nested: { label: string } }> {
  return {
    id: 'point-1',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[5, 6]] },
    style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#f00' } } },
    data: { nested: { label: 'original' } },
    module: 'draw',
    layerId: 'business-layer',
    visible: true,
    ...overrides
  };
}

function createStore(options?: ConstructorParameters<typeof ElementStore>[1]): ElementStore {
  return new ElementStore(new ShapeRegistry(basicShapeDefinitions), options);
}

describe('ElementStore lifecycle and snapshots', () => {
  it('deeply isolates and freezes ingress, return values, and historical changes', () => {
    const store = createStore();
    const input = state();
    const added = store.add(input);

    (input.geometry as { controlPoints: number[][] }).controlPoints[0][0] = 99;
    if (input.data !== undefined) input.data.nested.label = 'mutated';
    const structuredStyle = input.style as { symbol?: { radius: number } };
    if (structuredStyle.symbol !== undefined) structuredStyle.symbol.radius = 99;

    expect(store.get('point-1')).toEqual(added);
    expect(Object.isFrozen(added)).toBe(true);
    expect(Object.isFrozen(added.geometry)).toBe(true);
    expect(Object.isFrozen(added.data?.nested)).toBe(true);

    const firstChange = store.update({ id: 'point-1' }, { data: { nested: { label: 'second' } } });
    store.update({ id: 'point-1' }, { data: { nested: { label: 'third' } } });
    expect(firstChange.changes[0].before?.data).toEqual({ nested: { label: 'original' } });
    expect(firstChange.changes[0].after?.data).toEqual({ nested: { label: 'second' } });
  });

  it('preserves a NativeStyleRef by identity through snapshots, updates, and copies', () => {
    const nativeStyle = createNativeStyleRef();
    const store = createStore({ createId: () => 'point-copy' });

    const added = store.add(state({ style: nativeStyle }));
    const changes = store.update({ id: 'point-1' }, { visible: false });
    const copied = store.copy('point-1');

    expect(added.style).toBe(nativeStyle);
    expect(store.get('point-1')?.style).toBe(nativeStyle);
    expect(changes.changes[0].before?.style).toBe(nativeStyle);
    expect(changes.changes[0].after?.style).toBe(nativeStyle);
    expect(copied.style).toBe(nativeStyle);
  });

  it('uses a collision-free default copy id and rejects one invalid generated id without retrying', () => {
    const store = createStore();
    store.add(state());
    store.add(state({ id: 'element-1' }));
    expect(store.copy('point-1').id).toBe('element-2');

    const createId = vi.fn(() => '');
    const invalidStore = createStore({ createId });
    invalidStore.add(state());
    expect(() => invalidStore.copy('point-1')).toThrow(InvalidArgumentError);
    expect(createId).toHaveBeenCalledTimes(1);
    expect(invalidStore.query()).toHaveLength(1);
  });

  it('rejects missing required fields rather than synthesizing layer, style, or visibility state', () => {
    const store = createStore();

    expect(() => store.add({ ...state(), layerId: undefined } as never)).toThrow(InvalidArgumentError);
    expect(() => store.add({ ...state(), style: undefined } as never)).toThrow(InvalidArgumentError);
    expect(() => store.add({ ...state(), visible: undefined } as never)).toThrow(InvalidArgumentError);
    expect(() => store.add({ ...state(), module: '' })).toThrow(InvalidArgumentError);
  });

  it('clears state and subscriptions on idempotent destroy, then rejects every other public operation', () => {
    const store = createStore();
    store.add(state());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(() => store.destroy()).not.toThrow();
    expect(() => store.destroy()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();

    const calls = [
      () => store.add(state({ id: 'after-destroy' })),
      () => store.get('point-1'),
      () => store.query(),
      () => store.update({ id: 'point-1' }, { visible: false }),
      () => store.remove({ id: 'point-1' }),
      () => store.hide({ id: 'point-1' }),
      () => store.show({ id: 'point-1' }),
      () => store.copy('point-1'),
      () => store.clear(),
      () => store.transaction(() => undefined),
      () => store.subscribe(() => undefined)
    ];
    for (const call of calls) expect(call).toThrow(ObjectDisposedError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps duplicate-id failure stable after lifecycle operations', () => {
    const store = createStore();
    store.add(state());
    store.hide({ id: 'point-1' });
    expect(() => store.add(state({ visible: false }))).toThrow(DuplicateElementIdError);
  });
});
