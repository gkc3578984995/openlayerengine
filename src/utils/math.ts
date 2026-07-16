import type { Coordinate } from '../core/common/types.js';

/** 返回坐标副本，避免共享原数组。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

/** 判断两个坐标的维度和数值是否完全相同。 */
function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * 将二维坐标数组依次展开为一维数组。
 *
 * @param coordinates 待展开的二维坐标数组。
 * @returns 新的一维数组；原数组保持不变。
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
 * 将角度换算为弧度。
 *
 * @param degrees 待换算的角度值。
 * @returns 对应的弧度。
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
 * 将弧度换算为 `0`（含）到 `360`（不含）之间的角度。
 *
 * @param radians 待换算的弧度值。
 * @returns 归一化到一圈以内的角度。
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
 * @param vector 待缩放的二维向量。
 * @param factor 横纵分量共用的缩放倍数。
 * @returns 缩放后的新向量。
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
 * 将两个二维向量相加。
 *
 * @param left 第一个向量。
 * @param right 第二个向量。
 * @returns 相加后的新向量。
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
 * @param start 插值起点。
 * @param end 插值终点。
 * @param ratio 插值比例；`0` 返回起点，`1` 返回终点。
 * @returns 插值得到的新坐标。
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
 * @param start 曲线起点。
 * @param control 决定曲线弯曲方向的控制点。
 * @param end 曲线终点。
 * @param ratio 曲线上的取值比例，通常为 `0` 到 `1`。
 * @returns 曲线上对应位置的新坐标。
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
 * 闭合一组环坐标，必要时在末尾补上首坐标。
 *
 * @param coordinates 待闭合的坐标列表。
 * @returns 首尾相同的新坐标列表。
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
 * @param coordinates 可能已经闭合的坐标列表。
 * @returns 去除末尾重复闭合点的新列表。
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
