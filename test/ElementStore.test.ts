import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { DuplicateElementIdError, InvalidArgumentError, InvalidSelectorError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeState } from '../src/core/shape/types.js';
import { createNativeStyleRef } from '../src/core/style/types.js';

function createStore(options?: ConstructorParameters<typeof ElementStore>[1]): ElementStore {
  return new ElementStore(new ShapeRegistry(basicShapeDefinitions), options);
}

function pointElement(overrides: Partial<ElementState<{ label: string }>> = {}): ElementState<{ label: string }> {
  return {
    id: 'point-1',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[10, 20]] },
    style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#f00' } } },
    data: { label: 'origin' },
    module: 'draw',
    layerId: 'business-layer',
    visible: true,
    ...overrides
  };
}

describe('ElementStore', () => {
  it('adds a normalized isolated state and retrieves an isolated snapshot by id', () => {
    const store = createStore();
    const input = pointElement();

    const added = store.add(input);
    const first = store.get<{ label: string }>('point-1');
    const second = store.get<{ label: string }>('point-1');

    expect(added).toEqual(input);
    expect(first).toEqual(input);
    expect(first).not.toBe(input);
    expect(first).not.toBe(second);
    expect(first?.geometry).not.toBe(input.geometry);
    expect(first?.data).not.toBe(input.data);
  });

  it('queries all elements or combines selector criteria without inventing a default layer', () => {
    const store = createStore();
    store.add(pointElement());
    store.add(pointElement({ id: 'point-2', module: 'measure', layerId: 'measure-layer', visible: false, data: { label: 'measure' } }));

    expect(store.query().map(({ id }) => id)).toEqual(['point-1', 'point-2']);
    expect(store.query({ module: 'measure', layerId: 'measure-layer', visible: false }).map(({ id }) => id)).toEqual(['point-2']);
    expect(store.query({ predicate: (state) => state.data?.label === 'origin' }).map(({ id }) => id)).toEqual(['point-1']);
    expect(store.get('missing')).toBeUndefined();
    expect(store.query({ id: 'missing' })).toEqual([]);
    expect(store.get('point-1')?.layerId).toBe('business-layer');
  });

  it('rejects a duplicate id without replacing the existing state', () => {
    const store = createStore();
    store.add(pointElement());

    expect(() => store.add(pointElement({ data: { label: 'replacement' } }))).toThrow(DuplicateElementIdError);
    expect(store.get<{ label: string }>('point-1')?.data?.label).toBe('origin');
  });

  it('updates every match atomically and returns before/after snapshots', () => {
    const store = createStore();
    store.add(pointElement());
    store.add(pointElement({ id: 'point-2', data: { label: 'second' } }));

    const changes = store.update<{ label: string }>({ module: 'draw' }, { visible: false, data: { label: 'updated' } });

    expect(changes.changes).toHaveLength(2);
    expect(changes.changes[0]).toMatchObject({ kind: 'update', id: 'point-1', before: { visible: true }, after: { visible: false } });
    expect(changes.changes[0].before?.data).toEqual({ label: 'origin' });
    expect(changes.changes[0].after?.data).toEqual({ label: 'updated' });
    expect(store.query({ visible: false }).map(({ id }) => id)).toEqual(['point-1', 'point-2']);
  });

  it('treats empty patches and repeated visibility commands as semantic no-ops', () => {
    const store = createStore();
    store.add(pointElement());

    expect(store.update({ id: 'point-1' }, {}).changes).toEqual([]);
    expect(store.show({ id: 'point-1' }).changes).toEqual([]);
    expect(store.hide({ id: 'point-1' }).changes).toHaveLength(1);
    expect(store.hide({ id: 'point-1' }).changes).toEqual([]);
  });

  it('normalizes updated geometry through the registered definition and rejects type mismatches', () => {
    const store = createStore();
    store.add(pointElement());
    const geometry = { type: 'point', controlPoints: [[30, 40]] } as const;

    store.update({ id: 'point-1' }, { geometry });
    expect(store.get('point-1')?.geometry).toEqual(geometry);
    expect(store.get('point-1')?.geometry).not.toBe(geometry);

    expect(() =>
      store.update({ id: 'point-1' }, {
        geometry: {
          type: 'polyline',
          controlPoints: [
            [0, 0],
            [1, 1]
          ]
        }
      } as never)
    ).toThrow(InvalidArgumentError);
    expect(store.get('point-1')?.type).toBe('point');
  });

  it('accepts only complete registered geometry and explicitly projects canonical element fields', () => {
    const store = createStore();
    const incompletePolygon = {
      id: 'polygon-1',
      type: 'polygon',
      geometry: {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [1, 1]
        ]
      },
      style: {},
      layerId: 'business-layer',
      visible: true
    } as const;
    const transientlyDecorated = { ...pointElement(), animation: { type: 'blink' }, session: { id: 'draw-1' } };

    expect(() => store.add(incompletePolygon)).toThrow(InvalidArgumentError);
    expect(() => store.add(transientlyDecorated)).toThrow(InvalidArgumentError);
    expect(() => store.update({ id: 'missing' }, { type: 'polyline' } as never)).toThrow(InvalidArgumentError);
    expect(() => store.update({ id: 'missing' }, { animation: { type: 'blink' } } as never)).toThrow(InvalidArgumentError);
  });

  it('persists finalized canonical geometry and rejects a finalizer result that remains incomplete', () => {
    const plotStore = new ElementStore(new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]));
    const doubleArrow = plotStore.add({
      id: 'double-arrow-1',
      type: 'double-arrow',
      geometry: {
        type: 'double-arrow',
        controlPoints: [
          [0, 0],
          [4, 0],
          [3, 3],
          [1, 3]
        ]
      },
      style: {},
      layerId: 'business-layer',
      visible: true
    });
    expect('controlPoints' in doubleArrow.geometry && doubleArrow.geometry.controlPoints).toHaveLength(5);

    const incompleteFinalizer: ShapeDefinition<ShapeState<'point'>> = {
      type: 'point',
      capabilities: new Set(),
      normalize: (input) => input as ShapeState<'point'>,
      clone: (shape) => ({ type: 'point', controlPoints: shape.controlPoints.map((coordinate) => [...coordinate]) }),
      isComplete: (shape) => shape.controlPoints.length === 1,
      finalize: () => ({ type: 'point', controlPoints: [] }),
      toRenderGeometry: (shape) => ({ type: 'point', coordinates: shape.controlPoints[0] })
    };
    const incompleteStore = new ElementStore(new ShapeRegistry([incompleteFinalizer]));
    expect(() => incompleteStore.add(pointElement())).toThrow(InvalidArgumentError);
  });

  it('passes isolated immutable snapshots to predicates for query, update, and remove', () => {
    const store = createStore();
    store.add(pointElement());
    const predicateStates: Readonly<ElementState>[] = [];
    const selector = {
      predicate: (state: Readonly<ElementState>) => {
        predicateStates.push(state);
        expect(Object.isFrozen(state)).toBe(true);
        expect(Object.isFrozen(state.geometry)).toBe(true);
        return true;
      }
    };

    const queried = store.query(selector);
    const updated = store.update(selector, { visible: false });
    const removed = store.remove(selector);

    expect(predicateStates).toHaveLength(3);
    expect(predicateStates[0]).not.toBe(queried[0]);
    expect(predicateStates[1]).not.toBe(updated.changes[0].before);
    expect(predicateStates[2]).not.toBe(removed.changes[0].before);
  });

  it('normalizes only matched writes and never re-finalizes read or predicate snapshots', () => {
    const pointDefinition = basicShapeDefinitions.find(({ type }) => type === 'point');
    if (pointDefinition === undefined) throw new Error('Expected point definition');
    const normalizedX: number[] = [];
    const countingDefinition: ShapeDefinition<ShapeState<'point'>> = {
      ...(pointDefinition as ShapeDefinition<ShapeState<'point'>>),
      normalize: (input) => {
        const normalized = pointDefinition.normalize(input) as ShapeState<'point'>;
        normalizedX.push(normalized.controlPoints[0][0]);
        return normalized;
      }
    };
    const store = new ElementStore(new ShapeRegistry([countingDefinition]));
    store.add(pointElement({ id: 'matched', geometry: { type: 'point', controlPoints: [[1, 0]] } }));
    store.add(pointElement({ id: 'unmatched', geometry: { type: 'point', controlPoints: [[2, 0]] } }));
    normalizedX.length = 0;

    store.get('matched');
    store.query({ predicate: () => true });
    expect(normalizedX).toEqual([]);

    store.update({ id: 'matched' }, { visible: false });
    expect(normalizedX).toEqual([1, 1]);
  });

  it('hides, shows, removes, and clears selected states with explicit change kinds', () => {
    const store = createStore();
    store.add(pointElement());
    store.add(pointElement({ id: 'point-2', module: 'measure' }));

    const hidden = store.hide({ id: 'point-1' });
    expect(hidden.changes).toHaveLength(1);
    expect(hidden.changes[0]).toMatchObject({ kind: 'update', id: 'point-1', before: { visible: true }, after: { visible: false } });
    expect(store.show({ id: 'point-1' }).changes[0]).toMatchObject({ kind: 'update', id: 'point-1', after: { visible: true } });

    const removed = store.remove({ module: 'measure' });
    expect(removed.changes[0]).toMatchObject({ kind: 'remove', id: 'point-2', before: { module: 'measure' } });
    expect(removed.changes[0].after).toBeUndefined();

    const cleared = store.clear();
    expect(cleared.changes.map(({ kind, id }) => [kind, id])).toEqual([['remove', 'point-1']]);
    expect(store.query()).toEqual([]);
  });

  it('rejects empty destructive selectors while explicit no-match selectors are safe no-ops', () => {
    const store = createStore();
    store.add(pointElement());

    expect(() => store.update({}, { visible: false })).toThrow(InvalidSelectorError);
    expect(() => store.remove({})).toThrow(InvalidSelectorError);
    expect(() => store.hide({})).toThrow(InvalidSelectorError);
    expect(() => store.show({})).toThrow(InvalidSelectorError);
    expect(store.remove({ ids: [] }).changes).toEqual([]);
    expect(store.update({ id: 'missing' }, { visible: false }).changes).toEqual([]);
  });

  it.each([undefined, null, 0, '', false, []])('rejects a non-object destructive selector as InvalidSelectorError: %j', (selector) => {
    const store = createStore();
    store.add(pointElement());

    expect(() => store.update(selector as never, { visible: false })).toThrow(InvalidSelectorError);
    expect(() => store.remove(selector as never)).toThrow(InvalidSelectorError);
    expect(() => store.hide(selector as never)).toThrow(InvalidSelectorError);
    expect(() => store.show(selector as never)).toThrow(InvalidSelectorError);
  });

  it('copies pure state deeply, preserves NativeStyleRef identity, and always uses a generated id', () => {
    const nativeStyle = createNativeStyleRef();
    const createId = vi.fn(() => 'point-copy');
    const store = createStore({ createId });
    store.add(pointElement({ style: nativeStyle, data: { label: 'native' } }));

    const copied = store.copy<{ label: string }>('point-1', { module: 'copy', data: { label: 'copied' } });
    const source = store.get<{ label: string }>('point-1');

    expect(createId).toHaveBeenCalledTimes(1);
    expect(copied.id).toBe('point-copy');
    expect(copied.module).toBe('copy');
    expect(copied.style).toBe(nativeStyle);
    expect(copied.geometry).not.toBe(source?.geometry);
    expect(copied.data).toEqual({ label: 'copied' });
    expect(copied.data).not.toBe(source?.data);
    expect(source?.data).toEqual({ label: 'native' });
  });

  it('fails a colliding injected copy id deterministically without retrying or changing the store', () => {
    const createId = vi.fn(() => 'point-1');
    const store = createStore({ createId });
    store.add(pointElement());

    expect(() => store.copy('point-1')).toThrow(DuplicateElementIdError);
    expect(createId).toHaveBeenCalledTimes(1);
    expect(store.query()).toHaveLength(1);
  });
});
