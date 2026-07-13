import { InvalidArgumentError } from '../../core/errors.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import {
  assertFiniteRenderGeometry,
  cloneCoordinate,
  closeRing,
  createControlPointDefinition,
  getOwnDataValue,
  getPlainDataRecord,
  nonRotatingEditableCapabilities,
  normalizeCoordinate,
  pathCapabilities,
  pointCapabilities,
  requireNonZeroPlanarArea,
  requireSeparated
} from './definition.js';

const pointDefinition = createControlPointDefinition({
  type: 'point',
  previewMin: 1,
  completeMin: 1,
  completeMax: 1,
  capabilities: pointCapabilities,
  render: (points) => ({ type: 'point', coordinates: cloneCoordinate(points[0]) })
});

const polylineDefinition = createControlPointDefinition({
  type: 'polyline',
  previewMin: 2,
  completeMin: 2,
  capabilities: pathCapabilities,
  render: (points) => ({ type: 'polyline', coordinates: points.map(cloneCoordinate) })
});

const polygonDefinition = createControlPointDefinition({
  type: 'polygon',
  previewMin: 2,
  completeMin: 3,
  validate: (points) => {
    requireNonZeroPlanarArea(points, 'Polygon control points must enclose a non-zero area');
  },
  render: (points) => ({ type: 'polygon', coordinates: [closeRing(points)] })
});

function normalizeCircle(input: unknown): ShapeState<'circle'> {
  const record = getPlainDataRecord(input, 'Circle state');
  if (getOwnDataValue(record, 'type', 'type') !== 'circle') throw new InvalidArgumentError('Expected shape type circle');
  const center = normalizeCoordinate(getOwnDataValue(record, 'center', 'center'), 'center');
  const radius = getOwnDataValue(record, 'radius', 'radius');
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0) {
    throw new InvalidArgumentError('Circle radius must be a non-negative finite number');
  }
  return { type: 'circle', center, radius };
}

function createCircleRadiusHandle(center: Coordinate, radius: number): Coordinate {
  if (radius === 0) return cloneCoordinate(center);

  const candidates = [
    [center[0] + radius, center[1]],
    [center[0] - radius, center[1]],
    [center[0], center[1] + radius],
    [center[0], center[1] - radius]
  ] as const;
  let best: readonly [number, number] | undefined;
  let bestRelativeError = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!candidate.every(Number.isFinite)) continue;
    const deltaX = candidate[0] - center[0];
    const deltaY = candidate[1] - center[1];
    const representedRadius = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(representedRadius) || representedRadius === 0) continue;

    const relativeError = Math.abs(representedRadius - radius) / Math.max(representedRadius, radius);
    if (relativeError < bestRelativeError) {
      best = candidate;
      bestRelativeError = relativeError;
    }
  }

  if (best === undefined || bestRelativeError > Number.EPSILON * 8) {
    throw new InvalidArgumentError('Circle radius handle cannot represent the requested radius at this center');
  }
  return center.length === 3 ? [best[0], best[1], center[2]] : [best[0], best[1]];
}

const circleDefinition = Object.freeze<ShapeDefinition<ShapeState<'circle'>>>({
  type: 'circle',
  capabilities: nonRotatingEditableCapabilities,
  controlPointPolicy: Object.freeze({ previewMin: 2, completeMin: 2, completeMax: 2 }),
  normalize: normalizeCircle,
  clone: (state) => normalizeCircle(state),
  isComplete: (state) => {
    normalizeCircle(state);
    return true;
  },
  finalize: (state) => normalizeCircle(state),
  toRenderGeometry: (state) => {
    const normalized = normalizeCircle(state);
    const geometry = { type: 'circle' as const, center: cloneCoordinate(normalized.center), radius: normalized.radius };
    assertFiniteRenderGeometry(geometry);
    return geometry;
  },
  getControlPoints: (state) => {
    const normalized = normalizeCircle(state);
    return [cloneCoordinate(normalized.center), createCircleRadiusHandle(normalized.center, normalized.radius)];
  },
  updateControlPoint: (state, index, coordinate) => {
    const normalized = normalizeCircle(state);
    const replacement = normalizeCoordinate(coordinate);
    if (replacement.length !== normalized.center.length) throw new InvalidArgumentError('Circle control points must preserve the center dimension');
    if (index === 0) return { type: 'circle', center: replacement, radius: normalized.radius };
    if (index === 1) {
      if (normalized.center.length === 3 && replacement[2] !== normalized.center[2]) {
        throw new InvalidArgumentError('Circle radius control point must remain on the center Z plane');
      }
      const deltaX = replacement[0] - normalized.center[0];
      const deltaY = replacement[1] - normalized.center[1];
      const radius = Math.hypot(deltaX, deltaY);
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(radius)) {
        throw new InvalidArgumentError('Circle radius exceeds the finite numeric range');
      }
      return normalizeCircle({
        type: 'circle',
        center: cloneCoordinate(normalized.center),
        radius
      });
    }
    throw new InvalidArgumentError(`Control-point index is out of range: ${index}`);
  }
});

function getEllipseAxisBounds(first: number, second: number, label: string): readonly [center: number, radius: number] {
  const difference = second - first;
  const center = Number.isFinite(difference) ? first + difference / 2 : first / 2 + second / 2;
  const radius = Number.isFinite(difference) ? Math.abs(difference) / 2 : Math.abs(first / 2 - second / 2);
  if (!Number.isFinite(center) || !Number.isFinite(radius) || radius === 0) {
    throw new InvalidArgumentError(`${label} cannot be represented as a non-zero finite half-span`);
  }
  return [center, radius];
}

const ellipseDefinition = createControlPointDefinition({
  type: 'ellipse',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  coordinateDimension: 2,
  capabilities: nonRotatingEditableCapabilities,
  validate: (points) => {
    requireSeparated(points, [0, 1]);
    getEllipseAxisBounds(points[0][0], points[1][0], 'Ellipse width');
    getEllipseAxisBounds(points[0][1], points[1][1], 'Ellipse height');
  },
  render: (points) => {
    const [centerX, xRadius] = getEllipseAxisBounds(points[0][0], points[1][0], 'Ellipse width');
    const [centerY, yRadius] = getEllipseAxisBounds(points[0][1], points[1][1], 'Ellipse height');
    const center: Coordinate = [centerX, centerY];
    const ring: Coordinate[] = [];
    for (let index = 0; index < 100; index += 1) {
      const angle = (Math.PI * 2 * index) / 100;
      ring.push([center[0] + xRadius * Math.cos(angle), center[1] + yRadius * Math.sin(angle)]);
    }
    return { type: 'polygon', coordinates: [closeRing(ring)] };
  }
});

export const basicShapeDefinitions = Object.freeze([
  pointDefinition,
  polylineDefinition,
  polygonDefinition,
  circleDefinition,
  ellipseDefinition
] as const satisfies readonly ShapeDefinition[]);
