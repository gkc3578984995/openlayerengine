import type { Coordinate } from '../core/common/types.js';

/** 复制一个坐标，避免和原数组共享数据。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

/** 判断两个坐标的维度和数值是否完全相同。 */
function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * 把二维坐标数组展开成一维数组。
 *
 * @param coordinates 坐标。需要依次展开的二维数组。
 * @returns 新的一维数组，不会修改原数组。
 *
 * @example
 * ```ts
 * import { toFlatCoordinates } from '@vrsim/earth-engine-ol';
 *
 * const saved = toFlatCoordinates([[120, 0], [110, 0]]);
 * // [120, 0, 110, 0]
 * ```
 */
export function toFlatCoordinates(coordinates: readonly (readonly number[])[]): number[] {
  const result: number[] = [];
  for (const coordinate of coordinates) result.push(...coordinate);
  return result;
}

/**
 * 把角度转换为弧度。
 *
 * @param degrees 角度。要转换的角度值。
 * @returns 对应的弧度值。
 *
 * @example
 * ```ts
 * import { degToRad } from '@vrsim/earth-engine-ol';
 *
 * const radians = degToRad(180);
 * ```
 */
export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 把弧度转换为 `0` 到 `360` 之间的角度。
 *
 * @param radians 弧度。要转换的弧度值。
 * @returns 规范到一圈范围内的角度值。
 *
 * @example
 * ```ts
 * import { radToDeg } from '@vrsim/earth-engine-ol';
 *
 * const degrees = radToDeg(Math.PI);
 * ```
 */
export function radToDeg(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/**
 * 按倍数缩放二维向量。
 *
 * @param vector 向量。要缩放的二维坐标。
 * @param factor 倍数。横纵分量共同使用的缩放倍数。
 * @returns 缩放后的新二维坐标。
 *
 * @example
 * ```ts
 * import { scale2 } from '@vrsim/earth-engine-ol';
 *
 * const result = scale2([2, 3], 2);
 * ```
 */
export function scale2(vector: Coordinate, factor: number): Coordinate {
  return [vector[0] * factor, vector[1] * factor];
}

/**
 * 把两个二维向量相加。
 *
 * @param left 左侧向量。相加时使用的第一个坐标。
 * @param right 右侧向量。相加时使用的第二个坐标。
 * @returns 两个向量相加后的新二维坐标。
 *
 * @example
 * ```ts
 * import { add2 } from '@vrsim/earth-engine-ol';
 *
 * const result = add2([1, 2], [3, 4]);
 * ```
 */
export function add2(left: Coordinate, right: Coordinate): Coordinate {
  return [left[0] + right[0], left[1] + right[1]];
}

/**
 * 计算两个坐标之间的线性插值。
 *
 * @param start 起点。插值开始的坐标。
 * @param end 终点。插值结束的坐标。
 * @param ratio 比例。`0` 返回起点，`1` 返回终点。
 * @returns 插值得到的新二维坐标。
 *
 * @example
 * ```ts
 * import { lerp2 } from '@vrsim/earth-engine-ol';
 *
 * const midpoint = lerp2([0, 0], [10, 20], 0.5);
 * ```
 */
export function lerp2(start: Coordinate, end: Coordinate, ratio: number): Coordinate {
  return add2(scale2(start, 1 - ratio), scale2(end, ratio));
}

/**
 * 计算二次贝塞尔曲线上的坐标。
 *
 * @param start 起点。曲线开始的坐标。
 * @param control 控制点。控制曲线弯曲方向的坐标。
 * @param end 终点。曲线结束的坐标。
 * @param ratio 比例。曲线上的取值位置，通常为 `0` 到 `1`。
 * @returns 曲线上对应位置的新二维坐标。
 *
 * @example
 * ```ts
 * import { quadraticBezier2 } from '@vrsim/earth-engine-ol';
 *
 * const point = quadraticBezier2([0, 0], [5, 10], [10, 0], 0.5);
 * ```
 */
export function quadraticBezier2(start: Coordinate, control: Coordinate, end: Coordinate, ratio: number): Coordinate {
  const remaining = 1 - ratio;
  return add2(add2(scale2(start, remaining ** 2), scale2(control, 2 * ratio * remaining)), scale2(end, ratio ** 2));
}

/**
 * 闭合一组环坐标。
 *
 * @param coordinates 坐标。需要闭合的坐标列表。
 * @returns 独立的新坐标列表，末项会和首项相同。
 *
 * @example
 * ```ts
 * import { closeRing } from '@vrsim/earth-engine-ol';
 *
 * const ring = closeRing([[0, 0], [10, 0], [10, 10]]);
 * ```
 */
export function closeRing(coordinates: readonly Coordinate[]): Coordinate[] {
  if (coordinates.length === 0) return [];
  const result = coordinates.map(cloneCoordinate);
  if (!coordinatesEqual(result[0], result[result.length - 1])) result.push(cloneCoordinate(result[0]));
  return result;
}

/**
 * 移除环坐标末尾重复的闭合点。
 *
 * @param coordinates 坐标。可能已经闭合的坐标列表。
 * @returns 移除重复闭合点后的新坐标列表。
 *
 * @example
 * ```ts
 * import { trimClosingCoordinate } from '@vrsim/earth-engine-ol';
 *
 * const points = trimClosingCoordinate([[0, 0], [10, 0], [0, 0]]);
 * ```
 */
export function trimClosingCoordinate(coordinates: readonly Coordinate[]): Coordinate[] {
  const end = coordinates.length >= 2 && coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1]) ? coordinates.length - 1 : coordinates.length;
  return coordinates.slice(0, end).map(cloneCoordinate);
}
