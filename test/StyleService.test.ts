import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, InvalidSelectorError, UnsupportedOperationError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { createNativeStyleRef, type StylePatch, type StyleSpec } from '../src/core/style/types.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

function element(id: string, style: ElementState['style'] = baseStyle(), module = 'roads'): ElementState {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style,
    module,
    layerId: 'business',
    visible: true
  };
}

function baseStyle(): StyleSpec {
  return {
    symbol: {
      type: 'circle',
      radius: 6,
      fill: { type: 'solid', color: '#1677ff' },
      stroke: { color: '#ffffff', width: 2 }
    },
    strokes: [
      { color: '#000000', width: 8, lineDash: [8, 4] },
      { color: '#1677ff', width: 3 }
    ],
    fill: { type: 'solid', color: '#f0f5ff' },
    text: {
      text: 'road',
      font: '12px sans-serif',
      fill: { type: 'solid', color: '#111111' },
      backgroundFill: { type: 'solid', color: '#ffffff' },
      padding: [1, 2, 3, 4]
    },
    decorations: [{ type: 'arrow', placement: 'end' }],
    zIndex: 4
  };
}

function createFixture(): { store: ElementStore; service: StyleService } {
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  return { store, service: new StyleService(store) };
}

describe('StyleService', () => {
  coversCapabilities('style-native-feature-override', 'style-label-full', 'style-icon-full');

  it('sets a full structured style on every selected element and isolates caller input', () => {
    const { store, service } = createFixture();
    store.add(element('a'));
    store.add(element('b'));
    store.add(element('c', baseStyle(), 'labels'));
    const next: StyleSpec = {
      symbol: { type: 'icon', src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', displacement: [4, 5] },
      strokes: [{ color: '#ff0000', width: 2, lineDash: [3, 1] }],
      text: { text: 'next', padding: [5, 6, 7, 8] }
    };

    const changes = service.set({ module: 'roads' }, next);
    next.strokes?.[0].lineDash?.push(99);
    next.text?.padding?.splice(0, 1, 99);
    if (next.symbol?.type === 'icon') next.symbol.displacement?.splice(0, 1, 99);

    expect(changes.changes.map((change) => change.id)).toEqual(['a', 'b']);
    expect(store.get('a')?.style).toEqual({
      symbol: { type: 'icon', src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', displacement: [4, 5] },
      strokes: [{ color: '#ff0000', width: 2, lineDash: [3, 1] }],
      text: { text: 'next', padding: [5, 6, 7, 8] }
    });
    expect(store.get('b')?.style).toEqual(store.get('a')?.style);
    expect(store.get('c')?.style).toEqual(baseStyle());
  });

  it('deeply patches objects, replaces arrays, deletes undefined fields, and evaluates the selector once', () => {
    const { store, service } = createFixture();
    store.add(element('a'));
    store.add(element('b'));
    store.add(element('c', baseStyle(), 'labels'));
    const predicate = vi.fn((state: Readonly<ElementState>) => state.module === 'roads');
    const patch: StylePatch = {
      symbol: {
        radius: 10,
        fill: { color: '#00ff00' },
        stroke: { width: 5 }
      },
      strokes: [{ color: '#00ff00', width: 1, lineDash: [2, 2] }],
      text: {
        fontSize: 18,
        fill: { color: '#222222' },
        backgroundFill: undefined,
        padding: [9, 8, 7, 6]
      },
      decorations: [],
      zIndex: undefined
    };

    const changes = service.patch({ predicate }, patch);
    patch.strokes?.[0].lineDash?.push(99);
    patch.text?.padding?.push(99);

    expect(predicate).toHaveBeenCalledTimes(3);
    expect(changes.changes.map((change) => change.id)).toEqual(['a', 'b']);
    expect(store.get('a')?.style).toEqual({
      symbol: {
        type: 'circle',
        radius: 10,
        fill: { type: 'solid', color: '#00ff00' },
        stroke: { color: '#ffffff', width: 5 }
      },
      strokes: [{ color: '#00ff00', width: 1, lineDash: [2, 2] }],
      fill: { type: 'solid', color: '#f0f5ff' },
      text: {
        text: 'road',
        font: '12px sans-serif',
        fontSize: 18,
        fill: { type: 'solid', color: '#222222' },
        padding: [9, 8, 7, 6]
      },
      decorations: []
    });
  });

  it('replaces discriminated branches when their type changes', () => {
    const { store, service } = createFixture();
    store.add(element('a'));

    service.patch(
      { id: 'a' },
      {
        symbol: { type: 'icon', src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', opacity: 0.5 },
        fill: { type: 'pattern', pattern: 'dot', dotRadius: 2 }
      }
    );

    expect(store.get('a')?.style).toMatchObject({
      symbol: { type: 'icon', src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', opacity: 0.5 },
      fill: { type: 'pattern', pattern: 'dot', dotRadius: 2 }
    });
    expect((store.get('a')?.style as StyleSpec).symbol).not.toHaveProperty('radius');
    expect((store.get('a')?.style as StyleSpec).fill).not.toHaveProperty('color');
  });

  it('atomically rejects required-field deletion, unknown fields, and mixed variants', () => {
    const { store, service } = createFixture();
    store.add(element('a'));
    store.add(element('b'));
    const before = store.query();

    expect(() => service.patch({ ids: ['a', 'b'] }, { symbol: { radius: undefined } })).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual(before);
    expect(() => service.patch({ ids: ['a', 'b'] }, { text: { text: undefined } })).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual(before);
    expect(() => service.patch({ ids: ['a', 'b'] }, { unknown: true } as never)).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual(before);
    expect(() => service.patch({ ids: ['a', 'b'] }, { symbol: { radius: 3, scale: 2 } } as never)).toThrow(InvalidArgumentError);
    expect(store.query()).toEqual(before);
  });

  it('returns no changes for a no-match or empty patch', () => {
    const { store, service } = createFixture();
    store.add(element('a'));

    expect(service.set({ id: 'missing' }, { zIndex: 5 }).changes).toEqual([]);
    expect(service.patch({ id: 'a' }, {}).changes).toEqual([]);
    expect(store.get('a')?.style).toEqual(baseStyle());
  });

  it('checks selected native styles before treating an empty patch as a no-op and evaluates predicates once', () => {
    const { store, service } = createFixture();
    store.add(element('structured'));
    store.add(element('native', createNativeStyleRef()));
    const before = store.query();
    const predicate = vi.fn(() => true);

    expect(() => service.patch({ predicate }, {})).toThrow(UnsupportedOperationError);
    expect(predicate).toHaveBeenCalledTimes(2);
    expect(store.query()).toEqual(before);
  });

  it('clones and serializes frozen Store snapshots into deeply independent writable style data', () => {
    const { store, service } = createFixture();
    store.add(element('a'));
    const snapshot = store.get('a')?.style as StyleSpec;

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.strokes?.[0].lineDash)).toBe(true);

    const cloned = service.clone(snapshot) as StyleSpec;
    const serialized = service.serialize(snapshot);

    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
    expect(Object.isFrozen(cloned)).toBe(false);
    expect(Object.isFrozen(cloned.strokes?.[0].lineDash)).toBe(false);
    cloned.strokes?.[0].lineDash?.push(99);
    if (cloned.symbol?.type === 'circle') cloned.symbol.radius = 12;
    serialized.text?.padding?.push(9);
    if (serialized.symbol?.type === 'circle') serialized.symbol.stroke = { color: '#00ff00', width: 7 };

    expect(snapshot).toEqual(baseStyle());
    expect(cloned.strokes?.[0].lineDash).toEqual([8, 4, 99]);
    expect(serialized.strokes?.[0].lineDash).toEqual([8, 4]);
    expect(serialized.text?.padding).toEqual([1, 2, 3, 4, 9]);
    expect(cloned.text?.padding).toEqual([1, 2, 3, 4]);
  });

  it('preserves the explicit destructive-selector boundary', () => {
    const { store, service } = createFixture();
    store.add(element('a'));

    expect(() => service.set(undefined as never, { zIndex: 2 })).toThrow(InvalidSelectorError);
    expect(() => service.patch(null as never, { zIndex: 2 })).toThrow(InvalidSelectorError);
    expect(store.get('a')?.style).toEqual(baseStyle());
  });

  it('contains hostile style input traps inside the Store transaction', () => {
    const { store, service } = createFixture();
    store.add(element('a'));
    let entered = false;
    const hostile = new Proxy<StyleSpec>(
      { zIndex: 2 },
      {
        ownKeys(target) {
          if (!entered) {
            entered = true;
            store.add(element('leak'));
          }
          return Reflect.ownKeys(target);
        }
      }
    );

    expect(() => service.set({ id: 'a' }, hostile)).toThrow(InvalidArgumentError);
    expect(store.get('leak')).toBeUndefined();
    expect(store.get('a')?.style).toEqual(baseStyle());
  });

  it('rejects a mixed native selection atomically and permits a full native-to-structured replacement', () => {
    const { store, service } = createFixture();
    const native = createNativeStyleRef();
    store.add(element('a'));
    store.add(element('b', native));
    const beforeA = store.get('a');
    const beforeB = store.get('b');

    expect(() => service.patch({ ids: ['a', 'b'] }, { text: { fontSize: 20 } })).toThrow(UnsupportedOperationError);
    expect(store.get('a')).toEqual(beforeA);
    expect(store.get('b')).toEqual(beforeB);

    expect(() => service.assertStructured(native)).toThrow(UnsupportedOperationError);
    const changes = service.set({ id: 'b' }, { symbol: { type: 'circle', radius: 3 } });
    expect(changes.changes).toHaveLength(1);
    expect(store.get('b')?.style).toEqual({ symbol: { type: 'circle', radius: 3 } });
    expect(() => service.assertStructured(store.get('b')?.style as StyleSpec)).not.toThrow();
  });
});
