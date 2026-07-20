import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import { describe, expect, it } from 'vitest';
import {
  extractPathContours,
  measurePath,
  projectLocalPoint,
  repeatPathAnchors,
  repeatPathDistances,
  samplePath,
  sliceMeasuredPath,
  uprightTextRotation
} from '../src/adapters/openlayers/style/pathLayout.js';

describe('pathLayout', () => {
  it('从 LineString 与 Polygon 提取开放路径和唯一 outer ring', () => {
    const line = extractPathContours(
      new LineString([
        [0, 0],
        [10, 0],
        [10, 10]
      ])
    );
    expect(line).toEqual([
      {
        coordinates: [
          [0, 0],
          [10, 0],
          [10, 10]
        ],
        closed: false,
        role: 'line'
      }
    ]);

    const polygon = extractPathContours(
      new Polygon([
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
          [0, 0]
        ],
        [
          [5, 5],
          [15, 5],
          [15, 15],
          [5, 15],
          [5, 5]
        ]
      ])
    );
    expect(polygon).toHaveLength(1);
    expect(polygon[0]).toMatchObject({ closed: true, role: 'outer' });
    expect(polygon[0].coordinates).toEqual([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20]
    ]);

    const clockwise = extractPathContours(
      new Polygon([
        [
          [0, 0],
          [0, 20],
          [20, 20],
          [20, 0],
          [0, 0]
        ]
      ])
    );
    expect(clockwise[0].coordinates).toEqual([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20]
    ]);
  });

  it('按完整累计长度采样折线中点并忽略零长度段', () => {
    const path = measurePath({
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 0],
        [10, 30]
      ],
      closed: false,
      role: 'line'
    });
    expect(path.length).toBe(40);
    expect(path.segments).toHaveLength(2);
    expect(samplePath(path, path.length / 2)).toMatchObject({
      coordinate: [10, 10],
      tangent: [0, 1],
      normal: [1, -0],
      distance: 20
    });
  });

  it('在折点合成相邻切线，180 度折返稳定退化为进入段', () => {
    const corner = measurePath({
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 10]
      ],
      closed: false,
      role: 'line'
    });
    const sample = samplePath(corner, 10);
    expect(sample?.coordinate).toEqual([10, 0]);
    expect(sample?.tangent[0]).toBeCloseTo(Math.SQRT1_2);
    expect(sample?.tangent[1]).toBeCloseTo(Math.SQRT1_2);

    const reversal = measurePath({
      coordinates: [
        [0, 0],
        [10, 0],
        [0, 0]
      ],
      closed: false,
      role: 'line'
    });
    expect(samplePath(reversal, 10)?.tangent).toEqual([1, 0]);
  });

  it('开放路径对称分配余量，闭环把余量集中到 seam', () => {
    expect(repeatPathDistances(100, 40, false)).toEqual([10, 50, 90]);
    expect(repeatPathDistances(20, 40, false)).toEqual([10]);
    expect(repeatPathDistances(100, 40, true)).toEqual([30, 70]);
    expect(repeatPathDistances(20, 40, true)).toEqual([10]);
  });

  it('按端帽独立排除完整开放路径的首末重复锚点', () => {
    const distances = (exclusion?: { readonly startBoundary?: number; readonly endBoundary?: number }) =>
      repeatPathAnchors(100, 40, false, undefined, 0, exclusion).map(({ distance }) => distance);

    expect(distances()).toEqual([10, 50, 90]);
    expect(distances({ startBoundary: 0 })).toEqual([50, 90]);
    expect(distances({ endBoundary: 100 })).toEqual([10, 50]);
    expect(distances({ startBoundary: 0, endBoundary: 100 })).toEqual([50]);
    expect(repeatPathAnchors(20, 40, false, undefined, 0, { startBoundary: 0, endBoundary: 20 })).toEqual([]);
    expect(repeatPathAnchors(40, 40, false, undefined, 0, { startBoundary: 0 }).map(({ distance }) => distance)).toEqual([40]);
    expect(repeatPathAnchors(40, 40, false, undefined, 0, { endBoundary: 40 }).map(({ distance }) => distance)).toEqual([0]);
    expect(repeatPathAnchors(100, 40, false, undefined, 15, { startBoundary: 0 }).map(({ distance }) => distance)).toEqual([65]);
    expect(repeatPathAnchors(100, 40, false, undefined, 15, { endBoundary: 100 }).map(({ distance }) => distance)).toEqual([25]);
  });

  it('端点避让使用全局锚点序号，不误删视口内首末装饰', () => {
    expect(repeatPathAnchors(100, 20, false, [[40, 80]], 0, { startBoundary: 0, endBoundary: 100 })).toEqual([
      { index: 2, distance: 40 },
      { index: 3, distance: 60 },
      { index: 4, distance: 80 }
    ]);
  });

  it('移动起点端帽跳过 reveal 窗口内的首个全局锚点', () => {
    expect(repeatPathAnchors(800, 40, false, [[600, 800]], 0, { startBoundary: 600, endBoundary: 800 }).map(({ distance }) => distance)).toEqual([
      640, 680, 720, 760
    ]);
  });

  it('按累计长度切分轨道并保留切口两侧折点', () => {
    const path = measurePath({
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 20],
        [30, 20]
      ],
      closed: false,
      role: 'line'
    });
    expect(path.length).toBe(50);
    expect(sliceMeasuredPath(path, 0, 20)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10]
    ]);
    expect(sliceMeasuredPath(path, 30, 50)).toEqual([
      [10, 20],
      [30, 20]
    ]);
  });

  it('把 glyph 局部 CSS 像素映射到切线和右法线坐标', () => {
    const path = measurePath({
      coordinates: [
        [0, 0],
        [0, 10]
      ],
      closed: false,
      role: 'line'
    });
    const sample = samplePath(path, 5);
    expect(sample).toBeDefined();
    expect(projectLocalPoint(sample!, [2, 3], 2)).toEqual([6, 9]);
  });

  it('内嵌文字旋转始终保持屏幕正向', () => {
    const rightToLeft = measurePath({
      coordinates: [
        [10, 0],
        [0, 0]
      ],
      closed: false,
      role: 'line'
    });
    const sample = samplePath(rightToLeft, 5);
    expect(sample).toBeDefined();
    expect(Math.abs(uprightTextRotation(sample!, 0))).toBeLessThan(1e-12);
  });
});
