import { describe, expect, it } from 'vitest';
import { InvalidArgumentError, InvalidSelectorError } from '../src/core/errors.js';
import type { ElementState } from '../src/core/element/types.js';
import { assertDestructiveSelector, compileSelector } from '../src/core/element/selector.js';

function element(overrides: Partial<ElementState<{ role: string }>> = {}): ElementState<{ role: string }> {
  return {
    id: 'element-1',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'circle', radius: 4, fill: { type: 'solid', color: '#f00' } } },
    data: { role: 'primary' },
    module: 'draw',
    layerId: 'layer-1',
    visible: true,
    ...overrides
  };
}

describe('ElementSelector', () => {
  it('matches every element when a non-destructive query omits the selector', () => {
    expect(compileSelector()(element())).toBe(true);
  });

  it('combines id, module, layer, type, visibility, and predicate criteria with AND semantics', () => {
    const matches = compileSelector<{ role: string }>({
      id: 'element-1',
      module: 'draw',
      layerId: 'layer-1',
      type: 'point',
      visible: true,
      predicate: (state) => state.data?.role === 'primary'
    });

    expect(matches(element())).toBe(true);
    expect(matches(element({ module: 'measure' }))).toBe(false);
    expect(matches(element({ visible: false }))).toBe(false);
    expect(matches(element({ data: { role: 'secondary' } }))).toBe(false);
  });

  it('matches an immutable snapshot of the ids criterion', () => {
    const ids = ['element-1'];
    const matches = compileSelector({ ids });
    ids.push('element-2');

    expect(matches(element())).toBe(true);
    expect(matches(element({ id: 'element-2' }))).toBe(false);
  });

  it('rejects ambiguous id and ids inputs', () => {
    const selector = { id: 'element-1', ids: ['element-2'] } as const;
    expect(() => compileSelector(selector)).toThrow(InvalidArgumentError);
    expect(() => assertDestructiveSelector(selector)).toThrow(InvalidArgumentError);
  });

  it('rejects empty destructive selectors while accepting explicit criteria', () => {
    expect(() => assertDestructiveSelector({})).toThrow(InvalidSelectorError);
    expect(() => assertDestructiveSelector({ id: undefined, module: undefined })).toThrow(InvalidSelectorError);
    expect(() => assertDestructiveSelector({ ids: [] })).not.toThrow();
    expect(() => assertDestructiveSelector({ predicate: () => false })).not.toThrow();
  });
});
