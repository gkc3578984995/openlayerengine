import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '../src/core/errors.js';
import { cloneCoreState } from '../src/core/common/clone.js';
import { createNativeRef, createTransientNativeRef } from '../src/core/native/types.js';
import { createNativeStyleRef } from '../src/core/style/types.js';

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
});
