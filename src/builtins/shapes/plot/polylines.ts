import { InvalidArgumentError } from '../../../core/errors.js';
import type { Coordinate } from '../../../core/common/types.js';
import type { ShapeDefinition } from '../../../core/shape/types.js';
import {
  cloneCoordinate,
  coordinatesEqual,
  createControlPointDefinition,
  pathCapabilities,
  requireNonCollinear,
  requireSeparated,
  structuralPathCapabilities
} from '../definition.js';
import { arcPoints, assertFinitePoints, azimuth, circleCenter, curvePoints, distance, isClockWise } from './math.js';

function validatePlotPoints(points: readonly Coordinate[]): void {
  if (points.some((point) => point.length !== 2)) throw new InvalidArgumentError('Plot shapes require two-dimensional control points');
  for (let index = 1; index < points.length; index += 1) requireSeparated(points, [index - 1, index]);
}

function lunePolyline(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  const [point1, point2, point3] = points;
  const center = circleCenter(point1, point2, point3);
  const radius = distance(point1, center);
  const angle1 = azimuth(point1, center);
  const angle2 = azimuth(point2, center);
  return isClockWise(point1, point2, point3) ? arcPoints(center, radius, angle2, angle1) : arcPoints(center, radius, angle1, angle2);
}

function curvePolyline(points: readonly Coordinate[]): Coordinate[] {
  return points.length === 2 ? points.map(cloneCoordinate) : curvePoints(0.3, points);
}

function validateGeneratedPath(points: readonly Coordinate[], generator: (points: readonly Coordinate[]) => Coordinate[]): void {
  const coordinates = generator(points);
  assertFinitePoints(coordinates);
  if (!coordinates.slice(1).some((coordinate) => !coordinatesEqual(coordinates[0], coordinate))) {
    throw new InvalidArgumentError('Plot path must remain distinct on the coordinate grid');
  }
}

function polylineRender(generator: (points: readonly Coordinate[]) => Coordinate[]) {
  return (points: readonly Coordinate[]) => {
    const coordinates = generator(points);
    assertFinitePoints(coordinates);
    return { type: 'polyline' as const, coordinates: coordinates.map(cloneCoordinate) };
  };
}

const lunePolylineDefinition = createControlPointDefinition({
  type: 'lune-polyline',
  previewMin: 2,
  completeMin: 3,
  completeMax: 3,
  autoFinish: 3,
  capabilities: pathCapabilities,
  validate: (points) => {
    validatePlotPoints(points);
    if (points.length === 3) {
      requireSeparated(points, [0, 2]);
      requireNonCollinear(points[0], points[1], points[2]);
      validateGeneratedPath(points, lunePolyline);
    }
  },
  render: polylineRender(lunePolyline)
});

const curvePolylineDefinition = createControlPointDefinition({
  type: 'curve-polyline',
  previewMin: 2,
  completeMin: 2,
  capabilities: structuralPathCapabilities,
  topology: 'open',
  validate: (points) => {
    validatePlotPoints(points);
    validateGeneratedPath(points, curvePolyline);
  },
  render: polylineRender(curvePolyline)
});

export const polylineShapeDefinitions = Object.freeze([lunePolylineDefinition, curvePolylineDefinition] as const satisfies readonly ShapeDefinition[]);
