import { describe, expect, it } from 'vitest';
import Projection from 'ol/proj/Projection.js';
import { fromLonLat, get as getProjection, getPointResolution } from 'ol/proj.js';
import { ShapeProjectionAdapter } from '../src/adapters/openlayers/ShapeProjectionAdapter.js';
import type { Coordinate } from '../src/core/common/types.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import type { ShapeState } from '../src/core/shape/types.js';

describe('ShapeProjectionAdapter', () => {
  it('按圆心处的局部比例把米制半径转换为 View 投影半径并可往返', () => {
    const projection = requireProjection('EPSG:3857');
    const adapter = new ShapeProjectionAdapter(projection);
    const center = Object.freeze(projectCoordinate([120, 60], projection));
    const state: ShapeState<'circle'> = Object.freeze({ type: 'circle', center, radius: 1_000 });

    const viewed = adapter.toViewState(state);
    if (viewed.type !== 'circle') throw new Error('测试需要圆状态');
    const metersPerProjectionUnit = getPointResolution(projection, 1, [center[0], center[1]], 'm');

    expect(viewed.radius).toBeCloseTo(1_000 / metersPerProjectionUnit, 10);
    expect(viewed.radius).toBeGreaterThan(1_900);
    expect(viewed.center).toEqual(center);
    expect(viewed.center).not.toBe(state.center);
    expect(adapter.toElementState(viewed)).toEqual(state);
    expect(state.radius).toBe(1_000);
  });

  it('在赤道附近保持近似的一投影单位一米，并保留三维圆心', () => {
    const projection = requireProjection('EPSG:3857');
    const adapter = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([0, 0], projection);
    const viewed = adapter.toViewState({ type: 'circle', center: [center[0], center[1], 80], radius: 500 });

    expect(viewed).toEqual({ type: 'circle', center: [center[0], center[1], 80], radius: expect.closeTo(500, 8) });
  });

  it('移动圆心控制点时保持米制半径，并按新圆心重新生成 View 半径', () => {
    const projection = requireProjection('EPSG:3857');
    const adapter = new ShapeProjectionAdapter(projection);
    const originalCenter = projectCoordinate([120, 30], projection);
    const movedCenter = projectCoordinate([120, 70], projection);
    const original: ShapeState<'circle'> = { type: 'circle', center: originalCenter, radius: 1_000 };
    const originalView = adapter.toViewState(original);
    if (originalView.type !== 'circle') throw new Error('测试需要圆状态');

    const moved = adapter.toElementState({ type: 'circle', center: movedCenter, radius: originalView.radius }, original);
    if (moved.type !== 'circle') throw new Error('测试需要圆状态');
    const movedView = adapter.toViewState(moved);
    if (movedView.type !== 'circle') throw new Error('测试需要圆状态');

    expect(moved.center).toEqual(movedCenter);
    expect(moved.radius).toBe(1_000);
    expect(movedView.radius).not.toBeCloseTo(originalView.radius, 6);
  });

  it('移动半径控制点时按当前圆心重新计算米制半径', () => {
    const projection = requireProjection('EPSG:3857');
    const adapter = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([120, 60], projection);
    const original: ShapeState<'circle'> = { type: 'circle', center, radius: 1_000 };
    const originalView = adapter.toViewState(original);
    if (originalView.type !== 'circle') throw new Error('测试需要圆状态');

    const resized = adapter.toElementState({ ...originalView, radius: originalView.radius * 2 }, original);

    expect(resized).toEqual({ type: 'circle', center, radius: expect.closeTo(2_000, 8) });
  });

  it('带参考状态时仍拒绝非有限 View 半径', () => {
    const adapter = new ShapeProjectionAdapter(requireProjection('EPSG:3857'));
    const reference: ShapeState<'circle'> = { type: 'circle', center: [0, 0], radius: 1_000 };

    expect(() => adapter.toElementState({ type: 'circle', center: [0, 0], radius: Number.POSITIVE_INFINITY }, reference)).toThrow(InvalidArgumentError);
  });

  it('按实例隔离 EPSG:4326 与 EPSG:3857，并让水平世界副本保持相同米制比例', () => {
    const geographicProjection = requireProjection('EPSG:4326');
    const mercatorProjection = requireProjection('EPSG:3857');
    const geographic = new ShapeProjectionAdapter(geographicProjection);
    const mercator = new ShapeProjectionAdapter(mercatorProjection);
    const geographicCenter = [120, 60] as const;
    const mercatorCenter = projectCoordinate(geographicCenter, mercatorProjection);
    const geographicView = requireCircle(geographic.toViewState({ type: 'circle', center: geographicCenter, radius: 1_000 }));
    const mercatorView = requireCircle(mercator.toViewState({ type: 'circle', center: mercatorCenter, radius: 1_000 }));
    const extent = mercatorProjection.getExtent();
    if (extent === null) throw new Error('EPSG:3857 测试需要投影范围');
    const wrappedCenter = [mercatorCenter[0] + extent[2] - extent[0], mercatorCenter[1]] as const;
    const wrappedView = requireCircle(mercator.toViewState({ type: 'circle', center: wrappedCenter, radius: 1_000 }));

    expect(geographicView.radius).toBeGreaterThan(0.01);
    expect(geographicView.radius).toBeLessThan(0.02);
    expect(mercatorView.radius).toBeGreaterThan(1_900);
    expect(wrappedView.radius).toBeCloseTo(mercatorView.radius, 8);
    expect(geographic.toElementState(geographicView)).toEqual({ type: 'circle', center: geographicCenter, radius: expect.closeTo(1_000, 8) });
    expect(mercator.toElementState(mercatorView)).toEqual({ type: 'circle', center: mercatorCenter, radius: expect.closeTo(1_000, 8) });
  });

  it('非圆图形无需距离换算并保持同一只读状态', () => {
    const adapter = new ShapeProjectionAdapter(requireProjection('EPSG:3857'));
    const state = Object.freeze({ type: 'polyline' as const, controlPoints: Object.freeze([Object.freeze([1, 2] as const)]) });

    expect(adapter.toViewState(state)).toBe(state);
    expect(adapter.toElementState(state)).toBe(state);
  });

  it('无法得到有限正局部比例时拒绝包括零在内的全部半径', () => {
    const projection = new Projection({ code: 'TEST:UNKNOWN-UNITS', units: 'tile-pixels' });
    const adapter = new ShapeProjectionAdapter(projection);

    expect(() => adapter.toViewState({ type: 'circle', center: [0, 0], radius: 1 })).toThrow(CapabilityError);
    expect(() => adapter.toViewState({ type: 'circle', center: [0, 0], radius: 0 })).toThrow(CapabilityError);
  });

  it('把投影点分辨率回调异常统一转换为 CapabilityError', () => {
    const failure = new Error('projection callback failed');
    const projection = new Projection({
      code: 'TEST:THROWING-POINT-RESOLUTION',
      units: 'm',
      getPointResolution: () => {
        throw failure;
      }
    });
    const adapter = new ShapeProjectionAdapter(projection);
    let caught: unknown;

    try {
      adapter.toViewState({ type: 'circle', center: [0, 0], radius: 1 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CapabilityError);
    expect(caught).not.toBe(failure);
  });
});

/** 确认测试状态是几何圆。 */
function requireCircle(state: ShapeState): ShapeState<'circle'> {
  if (state.type !== 'circle') throw new Error('测试需要圆状态');
  return state;
}

/** 将经纬度转为测试使用的严格二维坐标。 */
function projectCoordinate(coordinate: readonly [number, number], projection: Projection): Coordinate {
  const projected = fromLonLat([...coordinate], projection);
  return [projected[0], projected[1]];
}

/** 获取测试所需的已注册投影。 */
function requireProjection(code: string): Projection {
  const projection = getProjection(code);
  if (projection === null) throw new Error(`测试投影不存在：${code}`);
  return projection;
}
