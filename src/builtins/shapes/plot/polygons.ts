import { InvalidArgumentError } from '../../../core/errors.js';
import type { Coordinate } from '../../../core/common/types.js';
import type { ShapeDefinition } from '../../../core/shape/types.js';
import {
  cloneCoordinate,
  closeRing,
  createControlPointDefinition,
  editableCapabilities,
  haveSamePlanarDirection,
  nonRotatingEditableCapabilities,
  requireNonCollinear,
  requireNonZeroPlanarArea,
  requireSeparated
} from '../definition.js';
import {
  FITTING_COUNT,
  HALF_PI,
  arcPoints,
  assertFinitePoints,
  azimuth,
  bisectorNormals,
  circleCenter,
  cubicValue,
  distance,
  isClockWise,
  midpoint,
  thirdPoint
} from './math.js';

function requireTwoDimensional(points: readonly Coordinate[]): void {
  if (points.some((point) => point.length !== 2)) throw new InvalidArgumentError('Plot shapes require two-dimensional control points');
}

function requireArea(points: readonly Coordinate[]): void {
  requireNonZeroPlanarArea(points, 'Polygon control points must enclose a non-zero area');
}

function validateSegments(points: readonly Coordinate[]): void {
  requireTwoDimensional(points);
  for (let index = 1; index < points.length; index += 1) requireSeparated(points, [index - 1, index]);
}

function polygonRender(generator: (points: readonly Coordinate[]) => Coordinate[]) {
  return (points: readonly Coordinate[]) => {
    const ring = generator(points);
    assertFinitePoints(ring);
    return { type: 'polygon' as const, coordinates: [closeRing(ring)] };
  };
}

function rectangle(points: readonly Coordinate[]): Coordinate[] {
  const minX = Math.min(points[0][0], points[1][0]);
  const minY = Math.min(points[0][1], points[1][1]);
  const maxX = Math.max(points[0][0], points[1][0]);
  const maxY = Math.max(points[0][1], points[1][1]);
  return [
    [minX, minY],
    [minX, maxY],
    [maxX, maxY],
    [maxX, minY],
    [minX, minY]
  ];
}

function triangle(points: readonly Coordinate[]): Coordinate[] {
  return points.map(cloneCoordinate);
}

function equilateralTriangle(points: readonly Coordinate[]): Coordinate[] {
  const [point1, point2] = points;
  const vectorX = point2[0] - point1[0];
  const vectorY = point2[1] - point1[1];
  const length = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
  const normalX = -vectorY / length;
  const normalY = vectorX / length;
  const height = (Math.sqrt(3) / 2) * length;
  const point3: Coordinate = [(point1[0] + point2[0]) / 2 + normalX * height, (point1[1] + point2[1]) / 2 + normalY * height];
  return [cloneCoordinate(point1), cloneCoordinate(point2), cloneCoordinate(point3)];
}

function assemblePolygon(points: readonly Coordinate[]): Coordinate[] {
  let working = points.map(cloneCoordinate);
  if (working.length === 2) {
    const mid = midpoint(working[0], working[1]);
    const generated = thirdPoint(working[0], mid, HALF_PI, distance(working[0], mid) / 0.9, true);
    working = [working[0], generated, working[1]];
  }
  const mid = midpoint(working[0], working[2]);
  working.push(mid, working[0], working[1]);
  let normals: Coordinate[] = [];
  for (let index = 0; index < working.length - 2; index += 1) {
    normals = normals.concat(bisectorNormals(0.4, working[index], working[index + 1], working[index + 2]));
  }
  normals = [normals[normals.length - 1], ...normals.slice(0, -1)];
  const result: Coordinate[] = [];
  for (let index = 0; index < working.length - 2; index += 1) {
    const point1 = working[index];
    const point2 = working[index + 1];
    result.push(point1);
    for (let sample = 0; sample <= FITTING_COUNT; sample += 1) {
      result.push(cubicValue(sample / FITTING_COUNT, point1, normals[index * 2], normals[index * 2 + 1], point2));
    }
    result.push(point2);
  }
  return result;
}

function closedCurvePolygon(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  const working = [...points.map(cloneCoordinate), cloneCoordinate(points[0]), cloneCoordinate(points[1])];
  let normals: Coordinate[] = [];
  for (let index = 0; index < working.length - 2; index += 1) {
    normals = normals.concat(bisectorNormals(0.3, working[index], working[index + 1], working[index + 2]));
  }
  normals = [normals[normals.length - 1], ...normals.slice(0, -1)];
  const result: Coordinate[] = [];
  for (let index = 0; index < working.length - 2; index += 1) {
    const point1 = working[index];
    const point2 = working[index + 1];
    result.push(point1);
    for (let sample = 0; sample <= FITTING_COUNT; sample += 1) {
      result.push(cubicValue(sample / FITTING_COUNT, point1, normals[index * 2], normals[index * 2 + 1], point2));
    }
    result.push(point2);
  }
  return result;
}

function sector(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  const [center, point2, point3] = points;
  const radius = distance(point2, center);
  const result = arcPoints(center, radius, azimuth(point2, center), azimuth(point3, center));
  result.push(cloneCoordinate(center), cloneCoordinate(result[0]));
  return result;
}

function lunePolygon(points: readonly Coordinate[]): Coordinate[] {
  const working = points.map(cloneCoordinate);
  if (working.length === 2) {
    const mid = midpoint(working[0], working[1]);
    working.push(thirdPoint(working[0], mid, HALF_PI, distance(working[0], mid)));
  }
  const [point1, point2, point3] = working;
  const center = circleCenter(point1, point2, point3);
  const radius = distance(point1, center);
  const angle1 = azimuth(point1, center);
  const angle2 = azimuth(point2, center);
  const result = isClockWise(point1, point2, point3) ? arcPoints(center, radius, angle2, angle1) : arcPoints(center, radius, angle1, angle2);
  result.push(cloneCoordinate(result[0]));
  return result;
}

const rectangleDefinition = createControlPointDefinition({
  type: 'rectangle',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  capabilities: nonRotatingEditableCapabilities,
  validate: (points) => {
    requireTwoDimensional(points);
    if (points[0][0] === points[1][0] || points[0][1] === points[1][1]) {
      throw new InvalidArgumentError('Rectangle width and height must be non-zero');
    }
  },
  render: polygonRender(rectangle)
});

const triangleDefinition = createControlPointDefinition({
  type: 'triangle',
  previewMin: 2,
  completeMin: 3,
  completeMax: 3,
  capabilities: editableCapabilities,
  validate: (points) => {
    validateSegments(points);
    requireArea(points);
  },
  render: polygonRender(triangle)
});

const equilateralTriangleDefinition = createControlPointDefinition({
  type: 'equilateral-triangle',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  capabilities: editableCapabilities,
  validate: (points) => {
    requireTwoDimensional(points);
    requireSeparated(points, [0, 1]);
  },
  render: polygonRender(equilateralTriangle)
});

const assemblePolygonDefinition = createControlPointDefinition({
  type: 'assemble-polygon',
  previewMin: 2,
  completeMin: 3,
  completeMax: 3,
  capabilities: editableCapabilities,
  validate: (points) => {
    validateSegments(points);
    requireArea(points);
  },
  render: polygonRender(assemblePolygon)
});

const closedCurvePolygonDefinition = createControlPointDefinition({
  type: 'closed-curve-polygon',
  previewMin: 2,
  completeMin: 3,
  capabilities: editableCapabilities,
  validate: (points) => {
    validateSegments(points);
    requireArea(points);
  },
  render: polygonRender(closedCurvePolygon)
});

const sectorDefinition = createControlPointDefinition({
  type: 'sector',
  previewMin: 2,
  completeMin: 3,
  completeMax: 3,
  capabilities: editableCapabilities,
  validate: (points) => {
    requireTwoDimensional(points);
    requireSeparated(points, [0, 1]);
    if (points.length === 3) {
      requireSeparated(points, [0, 2]);
      if (haveSamePlanarDirection(points[0], points[1], points[2])) {
        throw new InvalidArgumentError('Sector rays must have a non-zero angle');
      }
    }
  },
  render: polygonRender(sector)
});

const lunePolygonDefinition = createControlPointDefinition({
  type: 'lune-polygon',
  previewMin: 2,
  completeMin: 3,
  completeMax: 3,
  capabilities: editableCapabilities,
  validate: (points) => {
    validateSegments(points);
    if (points.length === 3) {
      requireSeparated(points, [0, 2]);
      requireNonCollinear(points[0], points[1], points[2]);
    }
  },
  render: polygonRender(lunePolygon)
});

export const polygonShapeDefinitions = Object.freeze([
  rectangleDefinition,
  triangleDefinition,
  equilateralTriangleDefinition,
  assemblePolygonDefinition,
  closedCurvePolygonDefinition,
  sectorDefinition,
  lunePolygonDefinition
] as const satisfies readonly ShapeDefinition[]);
