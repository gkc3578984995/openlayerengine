import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import { describe, expect, it } from 'vitest';
import { compileStyles } from './helpers/styleCompilerHarness.js';

describe('多层描边 v2 回归', () => {
  it('按数组顺序渲染背景描边和前景描边，并只在前景保留填充与文本', () => {
    const styles = compileStyles(
      {
        strokes: [
          { color: '#fff', width: 6 },
          { color: '#1677ff', width: 2 }
        ],
        fill: { type: 'solid', color: '#0003' },
        text: { text: '区域', fill: { type: 'solid', color: '#fff' } }
      },
      new Polygon([
        [
          [0, 0],
          [10, 0],
          [0, 10],
          [0, 0]
        ]
      ])
    );

    expect(styles.map((style) => style.getStroke()?.getWidth())).toEqual([6, 2]);
    expect(styles[0]?.getFill()).toBeNull();
    expect(styles[0]?.getText()).toBeNull();
    expect(styles[1]?.getFill()).not.toBeNull();
    expect(styles[1]?.getText()?.getText()).toBe('区域');
  });

  it('折线多层描边不会创建填充', () => {
    const styles = compileStyles(
      { strokes: [{ width: 5 }, { width: 2 }] },
      new LineString([
        [0, 0],
        [10, 0]
      ])
    );
    expect(styles).toHaveLength(2);
    expect(styles.every((style) => style.getFill() === null)).toBe(true);
  });
});
