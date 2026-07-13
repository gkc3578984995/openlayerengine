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
    let handleX = normalized.center[0] + normalized.radius;
    if (!Number.isFinite(handleX)) handleX = normalized.center[0] - normalized.radius;
    if (!Number.isFinite(handleX)) throw new InvalidArgumentError('Circle radius handle exceeds the finite numeric range');
    const radiusHandle: Coordinate = normalized.center.length === 3 ? [handleX, normalized.center[1], normalized.center[2]] : [handleX, normalized.center[1]];
    return [cloneCoordinate(normalized.center), radiusHandle];
  },
  updateControlPoint: (state, index, coordinate) => {
    const normalized = normalizeCircle(state);
    const replacement = normalizeCoordinate(coordinate);
    if (replacement.length !== normalized.center.length) throw new InvalidArgumentError('Circle control points must preserve the center dimension');
    if (index === 0) return { type: 'circle', center: replacement, radius: normalized.radius };
    if (index === 1) {
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

const ellipseDefinition = createControlPointDefinition({
  type: 'ellipse',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  coordinateDimension: 2,
  capabilities: nonRotatingEditableCapabilities,
  validate: (points) => {
    requireSeparated(points, [0, 1]);
    if (points[0][0] === points[1][0] || points[0][1] === points[1][1]) throw new InvalidArgumentError('Ellipse width and height must be non-zero');
  },
  render: (points) => {
    const center: Coordinate = [points[0][0] / 2 + points[1][0] / 2, points[0][1] / 2 + points[1][1] / 2];
    const xRadius = Math.abs(points[0][0] / 2 - points[1][0] / 2);
    const yRadius = Math.abs(points[0][1] / 2 - points[1][1] / 2);
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
