import type { Coordinate } from '../core/common/types.js';

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function scale2(vector: Coordinate, factor: number): Coordinate {
  return [vector[0] * factor, vector[1] * factor];
}

export function add2(left: Coordinate, right: Coordinate): Coordinate {
  return [left[0] + right[0], left[1] + right[1]];
}

export function lerp2(start: Coordinate, end: Coordinate, ratio: number): Coordinate {
  return add2(scale2(start, 1 - ratio), scale2(end, ratio));
}

export function quadraticBezier2(start: Coordinate, control: Coordinate, end: Coordinate, ratio: number): Coordinate {
  const remaining = 1 - ratio;
  return add2(add2(scale2(start, remaining ** 2), scale2(control, 2 * ratio * remaining)), scale2(end, ratio ** 2));
}

export function closeRing(coordinates: readonly Coordinate[]): Coordinate[] {
  if (coordinates.length === 0) return [];
  const result = coordinates.map(cloneCoordinate);
  if (!coordinatesEqual(result[0], result[result.length - 1])) result.push(cloneCoordinate(result[0]));
  return result;
}

export function trimClosingCoordinate(coordinates: readonly Coordinate[]): Coordinate[] {
  const end = coordinates.length >= 2 && coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1]) ? coordinates.length - 1 : coordinates.length;
  return coordinates.slice(0, end).map(cloneCoordinate);
}
