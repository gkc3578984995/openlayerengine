import LineString from 'ol/geom/LineString.js';
import { describe, expect, it } from 'vitest';
import { compileStyles } from './helpers/styleCompilerHarness.js';

describe('Polyline 宽度 v2 回归', () => {
  it('由结构化 stroke.width 唯一决定渲染宽度', () => {
    const styles = compileStyles(
      { strokes: [{ color: '#f00', width: 4 }] },
      new LineString([
        [0, 0],
        [1, 1]
      ])
    );
    expect(styles).toHaveLength(1);
    expect(styles[0]?.getStroke()?.getWidth()).toBe(4);
  });
});
