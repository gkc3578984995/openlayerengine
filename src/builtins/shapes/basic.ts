import { InvalidArgumentError } from '../../core/errors.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import {
  cloneCoordinate,
  closeRing,
  createControlPointDefinition,
  nonRotatingEditableCapabilities,
  normalizeCoordinate,
  pathCapabilities,
  pointCapabilities,
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
    if (points.length < 3) return;
    let doubledArea = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      doubledArea += points[index][0] * next[1] - next[0] * points[index][1];
    }
    if (Math.abs(doubledArea) <= Number.EPSILON) throw new InvalidArgumentError('Polygon control points must enclose a non-zero area');
  },
  render: (points) => ({ type: 'polygon', coordinates: [closeRing(points)] })
});

const circleDefinition = Object.freeze<ShapeDefinition<ShapeState<'circle'>>>({
  type: 'circle',
  capabilities: nonRotatingEditableCapabilities,
  normalize(input: unknown): ShapeState<'circle'> {
    if (input === null || typeof input !== 'object') throw new InvalidArgumentError('Circle state must be an object');
    const record = input as Record<PropertyKey, unknown>;
    if (record.type !== 'circle') throw new InvalidArgumentError('Expected shape type circle');
    const center = normalizeCoordinate(record.center, 'center');
    if (typeof record.radius !== 'number' || !Number.isFinite(record.radius) || record.radius < 0) {
      throw new InvalidArgumentError('Circle radius must be a non-negative finite number');
    }
    return { type: 'circle', center, radius: record.radius };
  },
  clone(state) {
    return this.normalize(state);
  },
  isComplete(state) {
    this.normalize(state);
    return true;
  },
  finalize(state) {
    return this.normalize(state);
  },
  toRenderGeometry(state) {
    const normalized = this.normalize(state);
    return { type: 'circle', center: cloneCoordinate(normalized.center), radius: normalized.radius };
  },
  getControlPoints(state) {
    const normalized = this.normalize(state);
    return [cloneCoordinate(normalized.center), [normalized.center[0] + normalized.radius, normalized.center[1]]];
  },
  updateControlPoint(state, index, coordinate) {
    const normalized = this.normalize(state);
    const replacement = normalizeCoordinate(coordinate);
    if (index === 0) return { type: 'circle', center: replacement, radius: normalized.radius };
    if (index === 1) {
      return {
        type: 'circle',
        center: cloneCoordinate(normalized.center),
        radius: Math.hypot(replacement[0] - normalized.center[0], replacement[1] - normalized.center[1])
      };
    }
    throw new InvalidArgumentError(`Control-point index is out of range: ${index}`);
  }
});

const ellipseDefinition = createControlPointDefinition({
  type: 'ellipse',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  capabilities: nonRotatingEditableCapabilities,
  validate: (points) => {
    requireSeparated(points, [0, 1]);
    if (points[0][0] === points[1][0] || points[0][1] === points[1][1]) throw new InvalidArgumentError('Ellipse width and height must be non-zero');
  },
  render: (points) => {
    const center: Coordinate = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
    const xRadius = Math.abs(points[0][0] - points[1][0]) / 2;
    const yRadius = Math.abs(points[0][1] - points[1][1]) / 2;
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
