import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '../src/core/errors.js';
import { createRenderGeometryDetails } from '../src/core/shape/geometryDetails.js';
import type { RenderGeometryState, ShapeState } from '../src/core/shape/types.js';
import { createElementGeometryDetails } from '../src/facade/resolveElementGeometryDetails.js';

describe('RenderGeometry 详情', () => {
  it('复制并递归冻结 Point，且不冻结或复用输入', () => {
    const coordinates = [3, 4, 9] as [number, number, number];
    const source: RenderGeometryState = { type: 'point', coordinates };

    const details = createRenderGeometryDetails(source);

    expect(details).toEqual({ renderGeometry: { type: 'point', coordinates: [3, 4, 9] }, extent: [3, 4, 3, 4] });
    expect(details.renderGeometry).not.toBe(source);
    if (details.renderGeometry.type !== 'point') throw new Error('应返回 Point RenderGeometry');
    expect(details.renderGeometry.coordinates).not.toBe(coordinates);
    expect(Object.isFrozen(details)).toBe(true);
    expect(Object.isFrozen(details.extent)).toBe(true);
    expect(Object.isFrozen(details.renderGeometry)).toBe(true);
    expect(Object.isFrozen(details.renderGeometry.coordinates)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(coordinates)).toBe(false);

    coordinates[0] = 30;
    expect(details.renderGeometry.coordinates).toEqual([3, 4, 9]);
  });

  it('复制并冻结 Polyline 的全部二维和三维坐标', () => {
    const coordinates = [
      [-4, 8, 2],
      [6, -3, 7],
      [1, 5, 9]
    ] as Array<[number, number, number]>;
    const source: RenderGeometryState = { type: 'polyline', coordinates };

    const details = createRenderGeometryDetails(source);

    expect(details).toEqual({ renderGeometry: { type: 'polyline', coordinates }, extent: [-4, -3, 6, 8] });
    if (details.renderGeometry.type !== 'polyline') throw new Error('应返回 Polyline RenderGeometry');
    expect(details.renderGeometry.coordinates).not.toBe(coordinates);
    expect(details.renderGeometry.coordinates[0]).not.toBe(coordinates[0]);
    expect(Object.isFrozen(details.renderGeometry.coordinates)).toBe(true);
    expect(details.renderGeometry.coordinates.every(Object.isFrozen)).toBe(true);

    coordinates[0][0] = 100;
    coordinates.push([200, 200, 0]);
    expect(details.renderGeometry.coordinates).toEqual([
      [-4, 8, 2],
      [6, -3, 7],
      [1, 5, 9]
    ]);
  });

  it('复制 Polygon 的全部 rings，并将每个 ring 纳入 extent', () => {
    const coordinates = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0]
      ],
      [
        [-5, -3],
        [20, 4],
        [2, 30],
        [-5, -3]
      ]
    ] as Array<Array<[number, number]>>;
    const source: RenderGeometryState = { type: 'polygon', coordinates };

    const details = createRenderGeometryDetails(source);

    expect(details.extent).toEqual([-5, -3, 20, 30]);
    expect(details.renderGeometry).toEqual(source);
    if (details.renderGeometry.type !== 'polygon') throw new Error('应返回 Polygon RenderGeometry');
    expect(details.renderGeometry.coordinates).not.toBe(coordinates);
    expect(details.renderGeometry.coordinates[1]).not.toBe(coordinates[1]);
    expect(details.renderGeometry.coordinates.flat().every(Object.isFrozen)).toBe(true);
    expect(details.renderGeometry.coordinates.every(Object.isFrozen)).toBe(true);

    coordinates[1][1][0] = 200;
    expect(details.extent).toEqual([-5, -3, 20, 30]);
    expect(details.renderGeometry.coordinates[1][1]).toEqual([20, 4]);
  });

  it('以当前 View 半径计算并冻结 Circle 的精确 extent', () => {
    const center = [12, -8, 100] as [number, number, number];
    const source: RenderGeometryState = { type: 'circle', center, radius: 5 };

    const details = createRenderGeometryDetails(source);

    expect(details).toEqual({ renderGeometry: { type: 'circle', center: [12, -8, 100], radius: 5 }, extent: [7, -13, 17, -3] });
    if (details.renderGeometry.type !== 'circle') throw new Error('应返回 Circle RenderGeometry');
    expect(details.renderGeometry.center).not.toBe(center);
    expect(Object.isFrozen(details.renderGeometry.center)).toBe(true);

    center[0] = 120;
    expect(details.renderGeometry.center).toEqual([12, -8, 100]);
  });

  it('允许零半径 Circle 返回零面积 extent', () => {
    expect(createRenderGeometryDetails({ type: 'circle', center: [2, 3], radius: 0 }).extent).toEqual([2, 3, 2, 3]);
  });

  it.each([
    { name: '空 Polyline', geometry: { type: 'polyline', coordinates: [] } },
    { name: '无 rings 的 Polygon', geometry: { type: 'polygon', coordinates: [] } },
    { name: '包含空 ring 的 Polygon', geometry: { type: 'polygon', coordinates: [[]] } },
    { name: '非有限坐标', geometry: { type: 'point', coordinates: [Number.NaN, 0] } },
    { name: '坐标维度非法', geometry: { type: 'point', coordinates: [0] } },
    { name: '负 Circle 半径', geometry: { type: 'circle', center: [0, 0], radius: -1 } },
    { name: '非有限 Circle 半径', geometry: { type: 'circle', center: [0, 0], radius: Number.POSITIVE_INFINITY } },
    { name: '未知类型', geometry: { type: 'multipolygon', coordinates: [] } }
  ])('稳定拒绝$name', ({ geometry }) => {
    expect(() => createRenderGeometryDetails(geometry as RenderGeometryState)).toThrowError(InvalidArgumentError);
  });

  it('拒绝 Circle extent 的数值溢出', () => {
    expect(() => createRenderGeometryDetails({ type: 'circle', center: [Number.MAX_VALUE, 0], radius: Number.MAX_VALUE })).toThrowError(InvalidArgumentError);
  });
});

describe('Element 统一几何详情', () => {
  it('统一返回 Point 的范围角点、最终点组和独立控制点快照', () => {
    const controlPoints = [[3, 4, 9]] as Array<[number, number, number]>;
    const renderCoordinate = [3, 4, 9] as [number, number, number];
    const state: ShapeState<'point'> = { type: 'point', controlPoints };

    const details = createElementGeometryDetails(state, { type: 'point', coordinates: renderCoordinate });

    expect(details).toEqual({
      renderGeometry: { type: 'point', coordinates: [3, 4, 9] },
      extent: [3, 4, 3, 4],
      extentPoints: [
        [3, 4],
        [3, 4],
        [3, 4],
        [3, 4]
      ],
      rangePoints: [[[3, 4, 9]]],
      controlPoints: [[3, 4, 9]],
      center: null,
      radius: null
    });
    expect(details.controlPoints).not.toBe(controlPoints);
    expect(details.controlPoints?.[0]).not.toBe(controlPoints[0]);
    expect(Object.isFrozen(details.extentPoints)).toBe(true);
    expect(details.extentPoints.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(details.rangePoints)).toBe(true);
    expect(details.rangePoints.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(details.controlPoints)).toBe(true);
    expect(details.controlPoints?.every(Object.isFrozen)).toBe(true);

    controlPoints[0][0] = 30;
    renderCoordinate[0] = 40;
    expect(details.controlPoints).toEqual([[3, 4, 9]]);
    expect(details.rangePoints).toEqual([[[3, 4, 9]]]);
  });

  it('统一返回 Circle 双单位半径，并拒绝状态与渲染类型不一致', () => {
    const details = createElementGeometryDetails({ type: 'circle', center: [10, 20], radius: 5 }, { type: 'circle', center: [10, 20], radius: 10 });

    expect(details).toEqual({
      renderGeometry: { type: 'circle', center: [10, 20], radius: 10 },
      extent: [0, 10, 20, 30],
      extentPoints: [
        [0, 10],
        [20, 10],
        [20, 30],
        [0, 30]
      ],
      rangePoints: [],
      controlPoints: null,
      center: [10, 20],
      radius: { meters: 5, projected: 10 }
    });
    expect(Object.isFrozen(details.center)).toBe(true);
    expect(Object.isFrozen(details.radius)).toBe(true);

    expect(() => createElementGeometryDetails({ type: 'circle', center: [0, 0], radius: 1 }, { type: 'point', coordinates: [0, 0] })).toThrowError(
      InvalidArgumentError
    );
    expect(() => createElementGeometryDetails({ type: 'point', controlPoints: [[0, 0]] }, { type: 'circle', center: [0, 0], radius: 1 })).toThrowError(
      InvalidArgumentError
    );
  });
});
