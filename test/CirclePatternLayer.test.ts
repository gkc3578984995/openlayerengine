import Circle from 'ol/geom/Circle.js';
import { describe, expect, it } from 'vitest';
import type { StyleSpec } from '../src/core/style/types.js';
import { compileStyles } from './helpers/styleCompilerHarness.js';

describe('Circle pattern v2 回归', () => {
  it('从结构化样式编译纹理并且不反向修改声明', () => {
    const style: StyleSpec = {
      strokes: [{ color: '#1677ff', width: 2 }],
      fill: { type: 'pattern', pattern: 'cross', size: 32 }
    };
    const snapshot = structuredClone(style);
    const compiled = compileStyles(style, new Circle([1, 2], 10));

    expect(compiled).toHaveLength(1);
    expect(compiled[0]?.getFill()?.getColor()).toBeTypeOf('object');
    expect(compiled[0]?.getStroke()?.getColor()).toBe('#1677ff');
    expect(style).toEqual(snapshot);
  });
});
