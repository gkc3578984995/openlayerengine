import { InvalidArgumentError } from '../../../core/errors.js';
import type { Coordinate } from '../../../core/common/types.js';

export type Point = Coordinate;
export const FITTING_COUNT = 100;
export const HALF_PI = Math.PI / 2;
export const ZERO_TOLERANCE = 0.0001;
const MIN_NORMAL = 2 ** -1022;

function vectorLength(deltaX: number, deltaY: number): number {
  const squaredDistance = deltaX ** 2 + deltaY ** 2;
  const legacyDistance = Math.sqrt(squaredDistance);
  const reliableSquaredDistance = squaredDistance === 0 ? deltaX === 0 && deltaY === 0 : squaredDistance >= MIN_NORMAL;
  if (Number.isFinite(legacyDistance) && reliableSquaredDistance) return legacyDistance;
  return Math.hypot(deltaX, deltaY);
}

export function distance(left: Point, right: Point): number {
  const deltaX = left[0] - right[0];
  const deltaY = left[1] - right[1];
  return vectorLength(deltaX, deltaY);
}

export const wholeDistance = (points: readonly Point[]): number => points.slice(1).reduce((total, point, index) => total + distance(points[index], point), 0);

export const baseLength = (points: readonly Point[]): number => wholeDistance(points) ** 0.99;

function midpointComponent(left: number, right: number): number {
  const legacyMidpoint = (left + right) / 2;
  return Number.isFinite(legacyMidpoint) ? legacyMidpoint : left / 2 + right / 2;
}

export const midpoint = (left: Point, right: Point): Point => [midpointComponent(left[0], right[0]), midpointComponent(left[1], right[1])];

export function intersectPoint(pointA: Point, pointB: Point, pointC: Point, pointD: Point): Point {
  if (pointA[1] === pointB[1]) {
    const factor = (pointD[0] - pointC[0]) / (pointD[1] - pointC[1]);
    return [factor * (pointA[1] - pointC[1]) + pointC[0], pointA[1]];
  }
  if (pointC[1] === pointD[1]) {
    const factor = (pointB[0] - pointA[0]) / (pointB[1] - pointA[1]);
    return [factor * (pointC[1] - pointA[1]) + pointA[0], pointC[1]];
  }
  const leftFactor = (pointB[0] - pointA[0]) / (pointB[1] - pointA[1]);
  const rightFactor = (pointD[0] - pointC[0]) / (pointD[1] - pointC[1]);
  const y = (leftFactor * pointA[1] - pointA[0] - rightFactor * pointC[1] + pointC[0]) / (leftFactor - rightFactor);
  return [leftFactor * y - leftFactor * pointA[1] + pointA[0], y];
}

export function circleCenter(point1: Point, point2: Point, point3: Point): Point {
  const pointA: Point = [(point1[0] + point2[0]) / 2, (point1[1] + point2[1]) / 2];
  const pointB: Point = [pointA[0] - point1[1] + point2[1], pointA[1] + point1[0] - point2[0]];
  const pointC: Point = [(point1[0] + point3[0]) / 2, (point1[1] + point3[1]) / 2];
  const pointD: Point = [pointC[0] - point1[1] + point3[1], pointC[1] + point1[0] - point3[0]];
  const legacyCenter = intersectPoint(pointA, pointB, pointC, pointD);
  if (legacyCenter.every(Number.isFinite)) return legacyCenter;

  const deltaX2 = point2[0] - point1[0];
  const deltaY2 = point2[1] - point1[1];
  const deltaX3 = point3[0] - point1[0];
  const deltaY3 = point3[1] - point1[1];
  const scale = Math.max(Math.abs(deltaX2), Math.abs(deltaY2), Math.abs(deltaX3), Math.abs(deltaY3));
  if (!Number.isFinite(scale) || scale === 0) return legacyCenter;
  const x2 = deltaX2 / scale;
  const y2 = deltaY2 / scale;
  const x3 = deltaX3 / scale;
  const y3 = deltaY3 / scale;
  const square2 = x2 * x2 + y2 * y2;
  const square3 = x3 * x3 + y3 * y3;
  const denominator = 2 * (x2 * y3 - y2 * x3);
  const offsetX = ((square2 * y3 - square3 * y2) / denominator) * scale;
  const offsetY = ((x2 * square3 - x3 * square2) / denominator) * scale;
  return [point1[0] + offsetX, point1[1] + offsetY];
}

export function azimuth(start: Point, end: Point): number {
  let result = 0;
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const ratio = Math.abs(deltaY) / distance(start, end);
  const angle = Math.asin(ratio);
  if (end[1] >= start[1] && end[0] >= start[0]) result = angle + Math.PI;
  else if (end[1] >= start[1] && end[0] < start[0]) result = Math.PI * 2 - angle;
  else if (end[1] < start[1] && end[0] < start[0]) result = angle;
  else if (end[1] < start[1] && end[0] >= start[0]) result = Math.PI - angle;
  if (!Number.isFinite(result) || (deltaX !== 0 && ratio === 1) || (deltaY !== 0 && ratio === 0)) {
    const stableResult = Math.atan2(start[1] - end[1], start[0] - end[0]);
    return stableResult < 0 ? stableResult + Math.PI * 2 : stableResult;
  }
  return result;
}

export function angleOfThreePoints(pointA: Point, pointB: Point, pointC: Point): number {
  const angle = azimuth(pointB, pointA) - azimuth(pointB, pointC);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

export function isClockWise(point1: Point, point2: Point, point3: Point): boolean {
  const deltaY31 = point3[1] - point1[1];
  const deltaX21 = point2[0] - point1[0];
  const deltaY21 = point2[1] - point1[1];
  const deltaX31 = point3[0] - point1[0];
  const leftProduct = deltaY31 * deltaX21;
  const rightProduct = deltaY21 * deltaX31;
  const leftProductReliable = leftProduct === 0 ? deltaY31 === 0 || deltaX21 === 0 : Math.abs(leftProduct) >= MIN_NORMAL;
  const rightProductReliable = rightProduct === 0 ? deltaY21 === 0 || deltaX31 === 0 : Math.abs(rightProduct) >= MIN_NORMAL;
  if (Number.isFinite(leftProduct) && Number.isFinite(rightProduct) && leftProductReliable && rightProductReliable) return leftProduct > rightProduct;

  const deltaScale = Math.max(Math.abs(deltaY31), Math.abs(deltaX21), Math.abs(deltaY21), Math.abs(deltaX31));
  if (Number.isFinite(deltaScale) && deltaScale > 0) {
    return (deltaY31 / deltaScale) * (deltaX21 / deltaScale) > (deltaY21 / deltaScale) * (deltaX31 / deltaScale);
  }

  const coordinateScale = Math.max(
    Math.abs(point1[0]),
    Math.abs(point1[1]),
    Math.abs(point2[0]),
    Math.abs(point2[1]),
    Math.abs(point3[0]),
    Math.abs(point3[1])
  );
  if (coordinateScale === 0) return false;
  const normalizedY31 = point3[1] / coordinateScale - point1[1] / coordinateScale;
  const normalizedX21 = point2[0] / coordinateScale - point1[0] / coordinateScale;
  const normalizedY21 = point2[1] / coordinateScale - point1[1] / coordinateScale;
  const normalizedX31 = point3[0] / coordinateScale - point1[0] / coordinateScale;
  return normalizedY31 * normalizedX21 > normalizedY21 * normalizedX31;
}

function stableConvexComponent(points: readonly Point[], weights: readonly number[], component: 0 | 1, legacyValue: number): number {
  let lower = Number.POSITIVE_INFINITY;
  let upper = Number.NEGATIVE_INFINITY;
  let scale = 0;
  for (const point of points) {
    const value = point[component];
    lower = Math.min(lower, value);
    upper = Math.max(upper, value);
    scale = Math.max(scale, Math.abs(value));
  }
  if (Number.isFinite(legacyValue) && legacyValue >= lower && legacyValue <= upper && (scale === 0 || scale >= MIN_NORMAL)) return legacyValue;
  if (scale === 0) return 0;

  let normalizedValue = 0;
  let totalWeight = 0;
  for (let index = 0; index < points.length; index += 1) {
    normalizedValue += weights[index] * (points[index][component] / scale);
    totalWeight += weights[index];
  }
  const normalizedLower = lower / scale;
  const normalizedUpper = upper / scale;
  const weightedValue = normalizedValue / totalWeight;
  const boundedValue = Math.max(normalizedLower, Math.min(normalizedUpper, weightedValue));
  return boundedValue * scale;
}

/** 使用调用方持有的坐标容器写入凸组合，供稳定几何工作区复用。 */
export function writeWeightedCoordinate(output: number[], points: readonly Point[], weights: readonly number[]): Coordinate {
  if (points.length === 0 || points.length !== weights.length) throw new InvalidArgumentError('Weighted coordinate requires matching non-empty inputs');
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    x += weights[index] * points[index][0];
    y += weights[index] * points[index][1];
  }
  output.length = 2;
  output[0] = stableConvexComponent(points, weights, 0, x);
  output[1] = stableConvexComponent(points, weights, 1, y);
  return output as unknown as Coordinate;
}

export function cubicValue(t: number, start: Point, control1: Point, control2: Point, end: Point): Point {
  const boundedT = Math.max(Math.min(t, 1), 0);
  const inverse = 1 - boundedT;
  const squared = boundedT * boundedT;
  const cubed = squared * boundedT;
  const inverseSquared = inverse * inverse;
  const inverseCubed = inverseSquared * inverse;
  const points = [start, control1, control2, end];
  const weights = [inverseCubed, 3 * inverseSquared * boundedT, 3 * inverse * squared, cubed];
  const legacyX = inverseCubed * start[0] + 3 * inverseSquared * boundedT * control1[0] + 3 * inverse * squared * control2[0] + cubed * end[0];
  const legacyY = inverseCubed * start[1] + 3 * inverseSquared * boundedT * control1[1] + 3 * inverse * squared * control2[1] + cubed * end[1];
  return [stableConvexComponent(points, weights, 0, legacyX), stableConvexComponent(points, weights, 1, legacyY)];
}

export function thirdPoint(start: Point, end: Point, angle: number, targetDistance: number, clockWise?: boolean): Point {
  const alpha = azimuth(start, end) + (clockWise ? angle : -angle);
  return [end[0] + targetDistance * Math.cos(alpha), end[1] + targetDistance * Math.sin(alpha)];
}

export function arcPoints(center: Point, radius: number, startAngle: number, endAngle: number): Point[] {
  let difference = endAngle - startAngle;
  if (difference < 0) difference += Math.PI * 2;
  const points: Point[] = [];
  for (let index = 0; index <= FITTING_COUNT; index += 1) {
    const angle = startAngle + (difference * index) / FITTING_COUNT;
    points.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  return points;
}

export function normal(point1: Point, point2: Point, point3: Point): Point {
  let dx1 = point1[0] - point2[0];
  let dy1 = point1[1] - point2[1];
  const distance1 = vectorLength(dx1, dy1);
  dx1 /= distance1;
  dy1 /= distance1;
  let dx2 = point3[0] - point2[0];
  let dy2 = point3[1] - point2[1];
  const distance2 = vectorLength(dx2, dy2);
  dx2 /= distance2;
  dy2 /= distance2;
  return [dx1 + dx2, dy1 + dy2];
}

export function bisectorNormals(t: number, point1: Point, point2: Point, point3: Point): Point[] {
  const vector = normal(point1, point2, point3);
  const vectorDistance = vectorLength(vector[0], vector[1]);
  const unitX = vector[0] / vectorDistance;
  const unitY = vector[1] / vectorDistance;
  const distance1 = distance(point1, point2);
  const distance2 = distance(point2, point3);
  if (vectorDistance > ZERO_TOLERANCE) {
    if (isClockWise(point1, point2, point3)) {
      return [
        [point2[0] - t * distance1 * unitY, point2[1] + t * distance1 * unitX],
        [point2[0] + t * distance2 * unitY, point2[1] - t * distance2 * unitX]
      ];
    }
    return [
      [point2[0] + t * distance1 * unitY, point2[1] - t * distance1 * unitX],
      [point2[0] - t * distance2 * unitY, point2[1] + t * distance2 * unitX]
    ];
  }
  return [
    [point2[0] + t * (point1[0] - point2[0]), point2[1] + t * (point1[1] - point2[1])],
    [point2[0] + t * (point3[0] - point2[0]), point2[1] + t * (point3[1] - point2[1])]
  ];
}

function leftMostControlPoint(controlPoints: readonly Point[], t: number): Point {
  const [point1, point2, point3] = controlPoints;
  const normalRight = bisectorNormals(0, point1, point2, point3)[0];
  const vector = normal(point1, point2, point3);
  const vectorDistance = vectorLength(vector[0], vector[1]);
  if (vectorDistance <= ZERO_TOLERANCE) return [point1[0] + t * (point2[0] - point1[0]), point1[1] + t * (point2[1] - point1[1])];
  const mid = midpoint(point1, point2);
  const px = point1[0] - mid[0];
  const py = point1[1] - mid[1];
  const segmentDistance = distance(point1, point2);
  const factor = 2 / segmentDistance;
  const nx = Number.isFinite(factor) ? -factor * py : -2 * (py / segmentDistance);
  const ny = Number.isFinite(factor) ? factor * px : 2 * (px / segmentDistance);
  const a11 = nx * nx - ny * ny;
  const a12 = 2 * nx * ny;
  const a22 = ny * ny - nx * nx;
  const dx = normalRight[0] - mid[0];
  const dy = normalRight[1] - mid[1];
  return [mid[0] + a11 * dx + a12 * dy, mid[1] + a12 * dx + a22 * dy];
}

function rightMostControlPoint(controlPoints: readonly Point[], t: number): Point {
  const count = controlPoints.length;
  const [point1, point2, point3] = controlPoints.slice(count - 3);
  const normalLeft = bisectorNormals(0, point1, point2, point3)[1];
  const vector = normal(point1, point2, point3);
  const vectorDistance = vectorLength(vector[0], vector[1]);
  if (vectorDistance <= ZERO_TOLERANCE) return [point3[0] + t * (point2[0] - point3[0]), point3[1] + t * (point2[1] - point3[1])];
  const mid = midpoint(point2, point3);
  const px = point3[0] - mid[0];
  const py = point3[1] - mid[1];
  const segmentDistance = distance(point2, point3);
  const factor = 2 / segmentDistance;
  const nx = Number.isFinite(factor) ? -factor * py : -2 * (py / segmentDistance);
  const ny = Number.isFinite(factor) ? factor * px : 2 * (px / segmentDistance);
  const a11 = nx * nx - ny * ny;
  const a12 = 2 * nx * ny;
  const a22 = ny * ny - nx * nx;
  const dx = normalLeft[0] - mid[0];
  const dy = normalLeft[1] - mid[1];
  return [mid[0] + a11 * dx + a12 * dy, mid[1] + a12 * dx + a22 * dy];
}

export function curvePoints(t: number, controlPoints: readonly Point[]): Point[] {
  let normals: Point[] = [leftMostControlPoint(controlPoints, t)];
  for (let index = 0; index < controlPoints.length - 2; index += 1) {
    normals = normals.concat(bisectorNormals(t, controlPoints[index], controlPoints[index + 1], controlPoints[index + 2]));
  }
  normals.push(rightMostControlPoint(controlPoints, t));
  const points: Point[] = [];
  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const point1 = controlPoints[index];
    const point2 = controlPoints[index + 1];
    points.push(point1);
    for (let sample = 0; sample < FITTING_COUNT; sample += 1) {
      points.push(cubicValue(sample / FITTING_COUNT, point1, normals[index * 2], normals[index * 2 + 1], point2));
    }
    points.push(point2);
  }
  return points;
}

function factorial(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

export function bezierPoints(points: readonly Point[]): Point[] {
  if (points.length <= 2) return [...points];
  const result: Point[] = [];
  const degree = points.length - 1;
  for (let t = 0; t <= 1; t += 0.01) {
    let x = 0;
    let y = 0;
    const weights: number[] = [];
    for (let index = 0; index <= degree; index += 1) {
      const factor = factorial(degree) / (factorial(index) * factorial(degree - index));
      const weight = factor * t ** index * (1 - t) ** (degree - index);
      weights.push(weight);
      x += weight * points[index][0];
      y += weight * points[index][1];
    }
    result.push([stableConvexComponent(points, weights, 0, x), stableConvexComponent(points, weights, 1, y)]);
  }
  result.push(points[degree]);
  return result;
}

function quadraticBSplineFactor(index: number, t: number): number {
  if (index === 0) return (t - 1) ** 2 / 2;
  if (index === 1) return (-2 * t ** 2 + 2 * t + 1) / 2;
  return index === 2 ? t ** 2 / 2 : 0;
}

export function quadraticBSplinePoints(points: readonly Point[]): Point[] {
  if (points.length <= 2) return [...points];
  const result: Point[] = [points[0]];
  const segmentCount = points.length - 3;
  for (let segment = 0; segment <= segmentCount; segment += 1) {
    for (let t = 0; t <= 1; t += 0.05) {
      let x = 0;
      let y = 0;
      const weights: number[] = [];
      const segmentPoints = points.slice(segment, segment + 3);
      for (let index = 0; index <= 2; index += 1) {
        const factor = quadraticBSplineFactor(index, t);
        weights.push(factor);
        x += factor * points[segment + index][0];
        y += factor * points[segment + index][1];
      }
      result.push([stableConvexComponent(segmentPoints, weights, 0, x), stableConvexComponent(segmentPoints, weights, 1, y)]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function assertFinitePoints(points: readonly Point[]): void {
  if (points.length === 0 || points.some((point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    throw new InvalidArgumentError('Shape algorithm produced invalid coordinates');
  }
}
