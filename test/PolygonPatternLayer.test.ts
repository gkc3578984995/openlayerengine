import Polygon from 'ol/geom/Polygon.js';
import { describe, expect, it } from 'vitest';
import type { StyleSpec } from '../src/core/style/types.js';
import { compileStyles } from './helpers/styleCompilerHarness.js';

describe('Polygon pattern v2 回归', () => {
  it('同时支持纹理、显式颜色和实体填充且保持输入快照', () => {
    const geometry = new Polygon([
      [
        [0, 0],
        [10, 0],
        [0, 10],
        [0, 0]
      ]
    ]);
    const pattern: StyleSpec = {
      strokes: [{ color: '#1677ff', width: 2 }],
      fill: { type: 'pattern', pattern: 'diagonal', color: '#f00', backgroundColor: '#fff' }
    };
    const snapshot = structuredClone(pattern);

    expect(compileStyles(pattern, geometry)[0]?.getFill()?.getColor()).toBeTypeOf('object');
    expect(
      compileStyles({ fill: { type: 'solid', color: '#0f0' } }, geometry)[0]
        ?.getFill()
        ?.getColor()
    ).toBe('#0f0');
    expect(pattern).toEqual(snapshot);
  });
});
