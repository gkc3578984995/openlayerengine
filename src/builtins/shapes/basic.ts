import { InvalidArgumentError } from '../../core/errors.js';
import type { Coordinate } from '../../core/common/types.js';
import { registerTrustedTransformDefinition } from '../../core/shape/trustedRender.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import {
  assertFiniteRenderGeometry,
  cloneCoordinate,
  closeRing,
  createControlPointDefinition,
  freehandPolygonCapabilities,
  freehandPolylineCapabilities,
  getOwnDataValue,
  getPlainDataRecord,
  nonRotatingEditableCapabilities,
  normalizeCoordinate,
  normalizeCoordinateArray,
  pointCapabilities,
  requireNonZeroPlanarArea,
  requireSeparated
} from './definition.js';

/** 内部常量。保存 pointDefinition 使用的数据。 */
const pointDefinition = createControlPointDefinition({
  type: 'point',
  previewMin: 1,
  completeMin: 1,
  completeMax: 1,
  autoFinish: 1,
  capabilities: pointCapabilities,
  render: (points) => ({ type: 'point', coordinates: cloneCoordinate(points[0]) })
});

/** 内部常量。保存 polylineDefinition 使用的数据。 */
const polylineDefinition = createControlPointDefinition({
  type: 'polyline',
  previewMin: 2,
  completeMin: 2,
  capabilities: freehandPolylineCapabilities,
  topology: 'open',
  freehand: true,
  render: (points) => ({ type: 'polyline', coordinates: points.map(cloneCoordinate) }),
  renderTrusted: (points) => Object.freeze({ type: 'polyline', coordinates: points })
});

/** 内部常量。保存 polygonDefinition 使用的数据。 */
const polygonDefinition = createControlPointDefinition({
  type: 'polygon',
  previewMin: 2,
  completeMin: 3,
  capabilities: freehandPolygonCapabilities,
  topology: 'closed',
  freehand: true,
  validate: (points) => {
    requireNonZeroPlanarArea(points, 'Polygon control points must enclose a non-zero area');
  },
  render: (points) => ({ type: 'polygon', coordinates: [closeRing(points)] })
});

/** 内部方法。处理 normalizeCircle 相关数据。 */
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

/** 内部常量。保存 circleHandleFloatBuffer 使用的数据。 */
const circleHandleFloatBuffer = new ArrayBuffer(8);
/** 内部常量。保存 circleHandleFloatView 使用的数据。 */
const circleHandleFloatView = new DataView(circleHandleFloatBuffer);
/** 内部常量。保存 CIRCLE_HANDLE_GRID_STEPS 使用的数据。 */
const CIRCLE_HANDLE_GRID_STEPS = 64;

/** 内部方法。处理 nextRepresentable 相关数据。 */
function nextRepresentable(value: number, direction: -1 | 1): number {
  if (value === 0) return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  circleHandleFloatView.setFloat64(0, value);
  let bits = circleHandleFloatView.getBigUint64(0);
  const towardLargerBits = direction > 0 === value > 0;
  bits = towardLargerBits ? bits + 1n : bits - 1n;
  circleHandleFloatView.setBigUint64(0, bits);
  return circleHandleFloatView.getFloat64(0);
}

/** 内部方法。处理 createCircleRadiusHandle 相关数据。 */
function createCircleRadiusHandle(center: Coordinate, radius: number): Coordinate {
  if (radius === 0) return cloneCoordinate(center);

  const considerCandidate = (candidate: readonly [number, number]): Coordinate | undefined => {
    if (!candidate.every(Number.isFinite)) return undefined;
    const deltaX = candidate[0] - center[0];
    const deltaY = candidate[1] - center[1];
    const representedRadius = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(representedRadius) || representedRadius === 0) return undefined;
    const relativeError = Math.abs(representedRadius - radius) / Math.max(representedRadius, radius);
    if (relativeError > Number.EPSILON * 8) return undefined;
    return center.length === 3 ? [candidate[0], candidate[1], center[2]] : [candidate[0], candidate[1]];
  };

  const diagonalOffset = radius / Math.SQRT2;
  const baseCandidates = [
    [center[0] + radius, center[1]],
    [center[0] - radius, center[1]],
    [center[0], center[1] + radius],
    [center[0], center[1] - radius],
    [center[0] + diagonalOffset, center[1] + diagonalOffset],
    [center[0] + diagonalOffset, center[1] - diagonalOffset],
    [center[0] - diagonalOffset, center[1] + diagonalOffset],
    [center[0] - diagonalOffset, center[1] - diagonalOffset]
  ] as const;
  for (const candidate of baseCandidates) {
    const accepted = considerCandidate(candidate);
    if (accepted !== undefined) return accepted;
  }

  for (const primaryAxis of [0, 1] as const) {
    const secondaryAxis = primaryAxis === 0 ? 1 : 0;
    for (const sign of [-1, 1] as const) {
      let primary = center[primaryAxis] + sign * radius;
      if (!Number.isFinite(primary)) continue;
      for (let step = 0; step < CIRCLE_HANDLE_GRID_STEPS; step += 1) {
        const primaryDelta = Math.abs(primary - center[primaryAxis]);
        if (Number.isFinite(primaryDelta) && primaryDelta <= radius) {
          const ratio = primaryDelta / radius;
          const secondaryDelta = radius * Math.sqrt(Math.max(0, (1 - ratio) * (1 + ratio)));
          for (const secondarySign of [-1, 1] as const) {
            const candidate: [number, number] = [center[0], center[1]];
            candidate[primaryAxis] = primary;
            candidate[secondaryAxis] += secondarySign * secondaryDelta;
            const accepted = considerCandidate(candidate);
            if (accepted !== undefined) return accepted;
          }
        }

        const direction = primary > center[primaryAxis] ? -1 : 1;
        const next = nextRepresentable(primary, direction);
        if (next === primary || (sign > 0 ? next <= center[primaryAxis] : next >= center[primaryAxis])) break;
        primary = next;
      }
    }
  }
  throw new InvalidArgumentError('Circle has no stable canonical radius handle at this center');
}

/** 内部方法。处理 createCircleDraft 相关数据。 */
function createCircleDraft(controlPoints: readonly Coordinate[]): ShapeState<'circle'> | undefined {
  const points = normalizeCoordinateArray(controlPoints, 'circle control points');
  if (points.length < 2) return undefined;
  if (points.length > 2) throw new InvalidArgumentError('Circle accepts exactly two control points');
  const [center, radiusPoint] = points;
  if (center.length !== radiusPoint.length) throw new InvalidArgumentError('Circle control points must use a uniform dimension');
  if (center.length === 3 && radiusPoint[2] !== center[2]) {
    throw new InvalidArgumentError('Circle radius control point must remain on the center Z plane');
  }
  const deltaX = radiusPoint[0] - center[0];
  const deltaY = radiusPoint[1] - center[1];
  const radius = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(radius)) {
    throw new InvalidArgumentError('Circle radius exceeds the finite numeric range');
  }
  return normalizeCircle({ type: 'circle', center, radius });
}

/** 内部方法。处理 moveCircleControlPoint 相关数据。 */
function moveCircleControlPoint(state: ShapeState<'circle'>, index: number, coordinate: Coordinate): ShapeState<'circle'> {
  const normalized = normalizeCircle(state);
  const replacement = normalizeCoordinate(coordinate);
  if (replacement.length !== normalized.center.length) throw new InvalidArgumentError('Circle control points must preserve the center dimension');
  if (index === 0) {
    createCircleRadiusHandle(replacement, normalized.radius);
    return { type: 'circle', center: replacement, radius: normalized.radius };
  }
  if (index === 1) {
    if (normalized.center.length === 3 && replacement[2] !== normalized.center[2]) {
      throw new InvalidArgumentError('Circle radius control point must remain on the center Z plane');
    }
    try {
      const currentHandle = createCircleRadiusHandle(normalized.center, normalized.radius);
      if (currentHandle[0] === replacement[0] && currentHandle[1] === replacement[1]) return normalized;
    } catch (error) {
      if (!(error instanceof InvalidArgumentError)) throw error;
    }
    const deltaX = replacement[0] - normalized.center[0];
    const deltaY = replacement[1] - normalized.center[1];
    const radius = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(radius)) {
      throw new InvalidArgumentError('Circle radius exceeds the finite numeric range');
    }
    createCircleRadiusHandle(normalized.center, radius);
    return normalizeCircle({
      type: 'circle',
      center: cloneCoordinate(normalized.center),
      radius
    });
  }
  throw new InvalidArgumentError(`Control-point index is out of range: ${index}`);
}

/** 内部常量。保存 circleDefinition 使用的数据。 */
const circleDefinition = Object.freeze<ShapeDefinition<ShapeState<'circle'>>>({
  type: 'circle',
  capabilities: nonRotatingEditableCapabilities,
  controlPointPolicy: Object.freeze({ previewMin: 2, completeMin: 2, completeMax: 2, autoFinish: 2 }),
  editTopology: Object.freeze({
    describe: (state: ShapeState<'circle'>) => {
      const normalized = normalizeCircle(state);
      return {
        handles: [
          { index: 0, coordinate: cloneCoordinate(normalized.center), role: 'center', removable: false },
          { index: 1, coordinate: createCircleRadiusHandle(normalized.center, normalized.radius), role: 'radius', removable: false }
        ],
        insertions: []
      };
    },
    move: moveCircleControlPoint
  }),
  createDraft: createCircleDraft,
  normalize: normalizeCircle,
  clone: (state) => normalizeCircle(state),
  isComplete: (state) => {
    normalizeCircle(state);
    return true;
  },
  tryComplete: (state) => ({ status: 'complete', state: normalizeCircle(state) }),
  toRenderGeometry: (state) => {
    const normalized = normalizeCircle(state);
    const geometry = { type: 'circle' as const, center: cloneCoordinate(normalized.center), radius: normalized.radius };
    assertFiniteRenderGeometry(geometry);
    return geometry;
  }
});

/** 内部方法。处理 getEllipseAxisBounds 相关数据。 */
function getEllipseAxisBounds(first: number, second: number, label: string): readonly [lower: number, upper: number] {
  const lower = Math.min(first, second);
  const upper = Math.max(first, second);
  if (lower === upper) throw new InvalidArgumentError(`${label} bounds must be distinct`);
  return [lower, upper];
}

/** 内部方法。处理 interpolateEllipseAxis 相关数据。 */
function interpolateEllipseAxis(lower: number, upper: number, weight: number): number {
  if (weight <= 0) return lower;
  if (weight >= 1) return upper;
  const difference = upper - lower;
  const interpolated = Number.isFinite(difference) ? lower + difference * weight : lower * (1 - weight) + upper * weight;
  return Number.isFinite(interpolated) ? interpolated : lower * (1 - weight) + upper * weight;
}

/** 内部常量。保存 ellipseDefinition 使用的数据。 */
const ellipseDefinition = createControlPointDefinition({
  type: 'ellipse',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  coordinateDimension: 2,
  capabilities: nonRotatingEditableCapabilities,
  validate: (points) => {
    requireSeparated(points, [0, 1]);
    getEllipseAxisBounds(points[0][0], points[1][0], 'Ellipse width');
    getEllipseAxisBounds(points[0][1], points[1][1], 'Ellipse height');
  },
  render: (points) => {
    const [minX, maxX] = getEllipseAxisBounds(points[0][0], points[1][0], 'Ellipse width');
    const [minY, maxY] = getEllipseAxisBounds(points[0][1], points[1][1], 'Ellipse height');
    const ring: Coordinate[] = [];
    for (let index = 0; index < 100; index += 1) {
      const angle = (Math.PI * 2 * index) / 100;
      let xWeight = (Math.cos(angle) + 1) / 2;
      let yWeight = (Math.sin(angle) + 1) / 2;
      if (index === 0) xWeight = 1;
      else if (index === 25) yWeight = 1;
      else if (index === 50) xWeight = 0;
      else if (index === 75) yWeight = 0;
      ring.push([interpolateEllipseAxis(minX, maxX, xWeight), interpolateEllipseAxis(minY, maxY, yWeight)]);
    }
    return { type: 'polygon', coordinates: [closeRing(ring)] };
  }
});

registerTrustedTransformDefinition(pointDefinition);
registerTrustedTransformDefinition(polylineDefinition);
registerTrustedTransformDefinition(circleDefinition);

/** 内部常量。保存 basicShapeDefinitions 使用的数据。 */
export const basicShapeDefinitions = Object.freeze([
  pointDefinition,
  polylineDefinition,
  polygonDefinition,
  circleDefinition,
  ellipseDefinition
] as const satisfies readonly ShapeDefinition[]);
