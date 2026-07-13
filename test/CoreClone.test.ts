import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '../src/core/errors.js';
import { cloneCoreState } from '../src/core/common/clone.js';
import {
  createNativeRef,
  createTransientNativeRef,
  isNativeRef,
  isTransientNativeRef,
  type NativeRef,
  type TransientNativeRef
} from '../src/core/native/types.js';
import { createNativeStyleRef, isNativeStyleRef, type NativeStyleRef } from '../src/core/style/types.js';

function reflectedBrand(value: object): symbol {
  const brand = Reflect.ownKeys(value).find((key): key is symbol => typeof key === 'symbol');
  if (brand === undefined) throw new Error('Expected an opaque token brand');
  return brand;
}

describe('cloneCoreState', () => {
  it('deeply clones coordinates, arrays, and plain objects', () => {
    const state = {
      coordinate: [10, 20, 30] as const,
      rings: [
        [
          [0, 0],
          [1, 1]
        ]
      ],
      metadata: { nested: { label: 'A' }, optional: undefined }
    };

    const cloned = cloneCoreState(state);

    expect(cloned).toEqual(state);
    expect(cloned).not.toBe(state);
    expect(cloned.coordinate).not.toBe(state.coordinate);
    expect(cloned.rings).not.toBe(state.rings);
    expect(cloned.rings[0][0]).not.toBe(state.rings[0][0]);
    expect(cloned.metadata.nested).not.toBe(state.metadata.nested);
  });

  it('preserves frozen persistent and native-style tokens by identity', () => {
    const nativeElement = createNativeRef('element');
    const nativeStyle = createNativeStyleRef();
    const state = { nativeElement, nativeStyle };

    const cloned = cloneCoreState(state);

    expect(Object.isFrozen(nativeElement)).toBe(true);
    expect(Object.isFrozen(nativeStyle)).toBe(true);
    expect(cloned).not.toBe(state);
    expect(cloned.nativeElement).toBe(nativeElement);
    expect(cloned.nativeStyle).toBe(nativeStyle);
  });

  it('recognizes only frozen tokens issued by their module-private factories', () => {
    const persistent = createNativeRef('element');
    const transient = createTransientNativeRef('input-event');
    const nativeStyle = createNativeStyleRef();
    const cases: readonly {
      readonly token: NativeRef | TransientNativeRef | NativeStyleRef;
      readonly brandValue: string | boolean;
      readonly guard: (value: unknown) => boolean;
    }[] = [
      { token: persistent, brandValue: 'element', guard: isNativeRef },
      { token: transient, brandValue: 'input-event', guard: isTransientNativeRef },
      { token: nativeStyle, brandValue: true, guard: isNativeStyleRef }
    ];

    for (const { token, brandValue, guard } of cases) {
      const brand = reflectedBrand(token);
      const reflectedFake = Object.freeze({ [brand]: brandValue });
      const inheritedFake = Object.freeze(Object.create(token) as object);
      const callbackFake = Object.freeze({ [brand]: brandValue, callback: () => undefined });

      expect(guard(token)).toBe(true);
      expect(guard(reflectedFake)).toBe(false);
      expect(guard(inheritedFake)).toBe(false);
      expect(guard(callbackFake)).toBe(false);
      expect(() => cloneCoreState(reflectedFake)).toThrow(InvalidArgumentError);
      expect(() => cloneCoreState(inheritedFake)).toThrow(InvalidArgumentError);
      expect(() => cloneCoreState(callbackFake)).toThrow(InvalidArgumentError);
    }
  });

  it('rejects transient native references', () => {
    expect(() => cloneCoreState(createTransientNativeRef('input-event'))).toThrow(InvalidArgumentError);
    expect(() => cloneCoreState({ event: createTransientNativeRef('input-event') })).toThrow(InvalidArgumentError);
  });

  it('rejects functions and unknown class instances', () => {
    class ForeignState {
      constructor(readonly value: number) {}
    }

    expect(() => cloneCoreState(() => undefined)).toThrow(InvalidArgumentError);
    expect(() => cloneCoreState({ callback: () => undefined })).toThrow(InvalidArgumentError);
    expect(() => cloneCoreState(new ForeignState(1))).toThrow(InvalidArgumentError);
    expect(() => cloneCoreState(new Date())).toThrow(InvalidArgumentError);
  });

  it('rejects circular object graphs instead of producing non-data snapshots', () => {
    const circular: { self?: object } = {};
    circular.self = circular;

    expect(() => cloneCoreState(circular)).toThrow(InvalidArgumentError);
  });

  it('preserves non-circular shared aliases while still rejecting active ancestor cycles', () => {
    const shared = { nested: { value: 1 } };
    const state = { first: shared, second: shared };

    const cloned = cloneCoreState(state);

    expect(cloned.first).not.toBe(shared);
    expect(cloned.first).toBe(cloned.second);
    expect(cloned.first.nested).not.toBe(shared.nested);

    const circular: { child?: { parent: object } } = {};
    circular.child = { parent: circular };
    expect(() => cloneCoreState(circular)).toThrow(InvalidArgumentError);
  });

  it('defines own __proto__ data safely without changing the clone prototype', () => {
    const state: Record<string, unknown> = { id: 'safe' };
    Object.defineProperty(state, '__proto__', {
      value: { polluted: true },
      enumerable: true,
      writable: true,
      configurable: true
    });

    const cloned = cloneCoreState(state);

    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(cloned, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(cloned, '__proto__')?.value).toEqual({ polluted: true });
    expect(Object.getOwnPropertyDescriptor(cloned, '__proto__')?.value).not.toBe(Object.getOwnPropertyDescriptor(state, '__proto__')?.value);
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('preserves sparse arrays without invoking instance map or Symbol.species', () => {
    const sparse: Array<{ value: number } | undefined> = new Array(3);
    sparse[1] = { value: 2 };

    const cloned = cloneCoreState(sparse);

    expect(cloned).not.toBe(sparse);
    expect(cloned).toHaveLength(3);
    expect(0 in cloned).toBe(false);
    expect(1 in cloned).toBe(true);
    expect(2 in cloned).toBe(false);
    expect(cloned[1]).toEqual({ value: 2 });
    expect(cloned[1]).not.toBe(sparse[1]);

    class SpeciesTrap<T> extends Array<T> {
      static get [Symbol.species](): ArrayConstructor {
        throw new Error('Symbol.species must not be read');
      }
    }
    const subclass = new SpeciesTrap<number>();
    subclass.push(1);
    expect(() => cloneCoreState(subclass)).toThrow(InvalidArgumentError);
  });

  it('rejects array accessors, attached properties, symbol keys, and function entries without invoking them', () => {
    let accessorReads = 0;
    const accessorArray: number[] = [];
    Object.defineProperty(accessorArray, '0', {
      get: () => {
        accessorReads += 1;
        return 1;
      },
      enumerable: true,
      configurable: true
    });

    const attachedString = [1] as number[] & { metadata?: string };
    attachedString.metadata = 'forbidden';
    const attachedSymbol = [1];
    Object.defineProperty(attachedSymbol, Symbol('metadata'), { value: 'forbidden' });

    expect(() => cloneCoreState(accessorArray)).toThrow(InvalidArgumentError);
    expect(accessorReads).toBe(0);
    expect(() => cloneCoreState(attachedString)).toThrow(InvalidArgumentError);
    expect(() => cloneCoreState(attachedSymbol)).toThrow(InvalidArgumentError);
    expect(() => cloneCoreState([() => undefined])).toThrow(InvalidArgumentError);
  });
});
