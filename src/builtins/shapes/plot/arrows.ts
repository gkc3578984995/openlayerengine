import { InvalidArgumentError } from '../../../core/errors.js';
import type { Coordinate } from '../../../core/common/types.js';
import type { ShapeCapability, ShapeDefinition } from '../../../core/shape/types.js';
import {
  arePlanarCoordinatesCoincident,
  arePlanarCollinear,
  cloneCoordinate,
  closeRing,
  coordinatesEqual,
  createControlPointDefinition,
  editableCapabilities,
  haveSamePlanarDirection,
  requireNonCollinear,
  requireNonZeroPlanarArea,
  requireSeparated,
  structuralEditableCapabilities
} from '../definition.js';
import {
  HALF_PI,
  angleOfThreePoints,
  assertFinitePoints,
  baseLength,
  bezierPoints,
  distance,
  isClockWise,
  midpoint,
  quadraticBSplinePoints,
  thirdPoint,
  wholeDistance
} from './math.js';

/** 内部常量。保存 plotAreaCapabilities 使用的数据。 */
const plotAreaCapabilities: ReadonlySet<ShapeCapability> = editableCapabilities;
/** 内部常量。保存 plotStructuralAreaCapabilities 使用的数据。 */
const plotStructuralAreaCapabilities: ReadonlySet<ShapeCapability> = structuralEditableCapabilities;

/** 内部接口。约定 ArrowFactors 的数据结构。 */
interface ArrowFactors {
  /** 内部字段。保存 headHeight 相关状态。 */
  readonly headHeight: number;
  /** 内部字段。保存 headWidth 相关状态。 */
  readonly headWidth: number;
  /** 内部字段。保存 neckHeight 相关状态。 */
  readonly neckHeight: number;
  /** 内部字段。保存 neckWidth 相关状态。 */
  readonly neckWidth: number;
  /** 内部字段。保存 headTail 相关状态。 */
  readonly headTail?: number;
}

/** 内部常量。保存 attackFactors 使用的数据。 */
const attackFactors: ArrowFactors = { headHeight: 0.18, headWidth: 0.3, neckHeight: 0.85, neckWidth: 0.15, headTail: 0.8 };
/** 内部常量。保存 doubleFactors 使用的数据。 */
const doubleFactors: ArrowFactors = { headHeight: 0.25, headWidth: 0.3, neckHeight: 0.85, neckWidth: 0.15 };

/** 内部方法。处理 arrowHeadPoints 相关数据。 */
function arrowHeadPoints(points: readonly Coordinate[], factors: ArrowFactors, tailLeft?: Coordinate, tailRight?: Coordinate): Coordinate[] {
  let length = baseLength(points);
  let headHeight = length * factors.headHeight;
  const headPoint = points[points.length - 1];
  length = distance(headPoint, points[points.length - 2]);
  if (tailLeft !== undefined && tailRight !== undefined && factors.headTail !== undefined) {
    const tailWidth = distance(tailLeft, tailRight);
    if (headHeight > tailWidth * factors.headTail) headHeight = tailWidth * factors.headTail;
  }
  const headWidth = headHeight * factors.headWidth;
  const neckWidth = headHeight * factors.neckWidth;
  headHeight = headHeight > length ? length : headHeight;
  const neckHeight = headHeight * factors.neckHeight;
  const headEnd = thirdPoint(points[points.length - 2], headPoint, 0, headHeight, true);
  const neckEnd = thirdPoint(points[points.length - 2], headPoint, 0, neckHeight, true);
  if (coordinatesEqual(headPoint, headEnd) || coordinatesEqual(headPoint, neckEnd)) {
    throw new InvalidArgumentError('Arrow head direction cannot be represented on the coordinate grid');
  }
  return [
    thirdPoint(headPoint, neckEnd, HALF_PI, neckWidth, false),
    thirdPoint(headPoint, headEnd, HALF_PI, headWidth, false),
    cloneCoordinate(headPoint),
    thirdPoint(headPoint, headEnd, HALF_PI, headWidth, true),
    thirdPoint(headPoint, neckEnd, HALF_PI, neckWidth, true)
  ];
}

/** 内部方法。处理 arrowBodyPoints 相关数据。 */
function arrowBodyPoints(points: readonly Coordinate[], neckLeft: Coordinate, neckRight: Coordinate, tailWidthFactor: number): Coordinate[] {
  const totalLength = wholeDistance(points);
  const length = baseLength(points);
  const tailWidth = length * tailWidthFactor;
  const neckWidth = distance(neckLeft, neckRight);
  const widthDifference = (tailWidth - neckWidth) / 2;
  let traversedLength = 0;
  const left: Coordinate[] = [];
  const right: Coordinate[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const angle = angleOfThreePoints(points[index - 1], points[index], points[index + 1]) / 2;
    traversedLength += distance(points[index - 1], points[index]);
    const width = (tailWidth / 2 - (traversedLength / totalLength) * widthDifference) / Math.sin(angle);
    left.push(thirdPoint(points[index - 1], points[index], Math.PI - angle, width, true));
    right.push(thirdPoint(points[index - 1], points[index], angle, width, false));
  }
  return left.concat(right);
}

/** 内部方法。处理 attackArrow 相关数据。 */
function attackArrow(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  let tailLeft = points[0];
  let tailRight = points[1];
  if (isClockWise(points[0], points[1], points[2])) [tailLeft, tailRight] = [tailRight, tailLeft];
  const bonePoints = [midpoint(tailLeft, tailRight), ...points.slice(2)];
  const headPoints = arrowHeadPoints(bonePoints, attackFactors, tailLeft, tailRight);
  const [neckLeft, neckRight] = [headPoints[0], headPoints[4]];
  const tailWidthFactor = distance(tailLeft, tailRight) / baseLength(bonePoints);
  const bodyPoints = arrowBodyPoints(bonePoints, neckLeft, neckRight, tailWidthFactor);
  const half = bodyPoints.length / 2;
  const left = quadraticBSplinePoints([tailLeft, ...bodyPoints.slice(0, half), neckLeft]);
  const right = quadraticBSplinePoints([tailRight, ...bodyPoints.slice(half), neckRight]);
  return left.concat(headPoints, right.reverse());
}

/** 内部方法。处理 tailedAttackArrow 相关数据。 */
function tailedAttackArrow(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  let tailLeft = points[0];
  let tailRight = points[1];
  if (isClockWise(points[0], points[1], points[2])) [tailLeft, tailRight] = [tailRight, tailLeft];
  const bonePoints = [midpoint(tailLeft, tailRight), ...points.slice(2)];
  const headPoints = arrowHeadPoints(bonePoints, attackFactors, tailLeft, tailRight);
  const [neckLeft, neckRight] = [headPoints[0], headPoints[4]];
  const totalLength = baseLength(bonePoints);
  const swallowTail = thirdPoint(bonePoints[1], bonePoints[0], 0, totalLength * 0.1, true);
  const bodyPoints = arrowBodyPoints(bonePoints, neckLeft, neckRight, distance(tailLeft, tailRight) / totalLength);
  const half = bodyPoints.length / 2;
  const left = quadraticBSplinePoints([tailLeft, ...bodyPoints.slice(0, half), neckLeft]);
  const right = quadraticBSplinePoints([tailRight, ...bodyPoints.slice(half), neckRight]);
  return left.concat(headPoints, right.reverse(), [swallowTail, left[0]]);
}

/** 内部接口。约定 FineArrowFactors 的数据结构。 */
interface FineArrowFactors {
  /** 内部字段。保存 tailWidth 相关状态。 */
  readonly tailWidth: number;
  /** 内部字段。保存 neckWidth 相关状态。 */
  readonly neckWidth: number;
  /** 内部字段。保存 headWidth 相关状态。 */
  readonly headWidth: number;
  /** 内部字段。保存 headAngle 相关状态。 */
  readonly headAngle: number;
  /** 内部字段。保存 neckAngle 相关状态。 */
  readonly neckAngle: number;
}

/** 内部常量。保存 fineArrowFactors 使用的数据。 */
const fineArrowFactors: FineArrowFactors = { tailWidth: 0.1, neckWidth: 0.2, headWidth: 0.25, headAngle: Math.PI / 8.5, neckAngle: Math.PI / 13 };
/** 内部常量。保存 assaultDirectionArrowFactors 使用的数据。 */
const assaultDirectionArrowFactors: FineArrowFactors = {
  tailWidth: 0.03,
  neckWidth: 0.1,
  headWidth: 0.15,
  headAngle: Math.PI / 5.5,
  neckAngle: Math.PI / 12
};

/** 内部方法。处理 fineArrow 相关数据。 */
function fineArrow(points: readonly Coordinate[], factors: FineArrowFactors): Coordinate[] {
  const [start, end] = points;
  const length = baseLength(points);
  const tailLeft = thirdPoint(end, start, HALF_PI, length * factors.tailWidth, true);
  const tailRight = thirdPoint(end, start, HALF_PI, length * factors.tailWidth, false);
  const headLeft = thirdPoint(start, end, factors.headAngle, length * factors.headWidth, false);
  const headRight = thirdPoint(start, end, factors.headAngle, length * factors.headWidth, true);
  const neckLeft = thirdPoint(start, end, factors.neckAngle, length * factors.neckWidth, false);
  const neckRight = thirdPoint(start, end, factors.neckAngle, length * factors.neckWidth, true);
  return [tailLeft, neckLeft, headLeft, cloneCoordinate(end), headRight, neckRight, tailRight];
}

/** 内部接口。约定 TailedSquadCombatArrowLayout 的数据结构。 */
interface TailedSquadCombatArrowLayout {
  /** 内部字段。保存 tailLeft 相关状态。 */
  readonly tailLeft: Coordinate;
  /** 内部字段。保存 tailRight 相关状态。 */
  readonly tailRight: Coordinate;
  /** 内部字段。保存 swallowTail 相关状态。 */
  readonly swallowTail: Coordinate;
  /** 内部字段。保存 headPoints 相关状态。 */
  readonly headPoints: Coordinate[];
}

/** 内部方法。处理 tailedSquadCombatArrowLayout 相关数据。 */
function tailedSquadCombatArrowLayout(points: readonly Coordinate[]): TailedSquadCombatArrowLayout {
  const totalLength = baseLength(points);
  const tailWidth = totalLength * 0.1;
  const tailLeft = thirdPoint(points[1], points[0], HALF_PI, tailWidth, false);
  const tailRight = thirdPoint(points[1], points[0], HALF_PI, tailWidth, true);
  const swallowTail = thirdPoint(points[1], points[0], 0, tailWidth, true);
  return { tailLeft, tailRight, swallowTail, headPoints: arrowHeadPoints(points, attackFactors, tailLeft, tailRight) };
}

/** 内部方法。处理 tailedSquadCombatArrow 相关数据。 */
function tailedSquadCombatArrow(points: readonly Coordinate[]): Coordinate[] {
  const { tailLeft, tailRight, swallowTail, headPoints } = tailedSquadCombatArrowLayout(points);
  const [neckLeft, neckRight] = [headPoints[0], headPoints[4]];
  const bodyPoints = arrowBodyPoints(points, neckLeft, neckRight, 0.1);
  const half = bodyPoints.length / 2;
  const left = quadraticBSplinePoints([tailLeft, ...bodyPoints.slice(0, half), neckLeft]);
  const right = quadraticBSplinePoints([tailRight, ...bodyPoints.slice(half), neckRight]);
  return left.concat(headPoints, right.reverse(), [swallowTail, left[0]]);
}

/** 内部方法。处理 temporaryFourthPoint 相关数据。 */
function temporaryFourthPoint(linePoint1: Coordinate, linePoint2: Coordinate, point: Coordinate): Coordinate {
  const mid = midpoint(linePoint1, linePoint2);
  const length = distance(mid, point);
  const angle = angleOfThreePoints(linePoint1, mid, point);
  let distance1: number;
  let distance2: number;
  let intermediate: Coordinate;
  if (angle < HALF_PI) {
    distance1 = length * Math.sin(angle);
    distance2 = length * Math.cos(angle);
    intermediate = thirdPoint(linePoint1, mid, HALF_PI, distance1, false);
    return thirdPoint(mid, intermediate, HALF_PI, distance2, true);
  }
  if (angle < Math.PI) {
    distance1 = length * Math.sin(Math.PI - angle);
    distance2 = length * Math.cos(Math.PI - angle);
    intermediate = thirdPoint(linePoint1, mid, HALF_PI, distance1, false);
    return thirdPoint(mid, intermediate, HALF_PI, distance2, false);
  }
  if (angle < Math.PI * 1.5) {
    distance1 = length * Math.sin(angle - Math.PI);
    distance2 = length * Math.cos(angle - Math.PI);
    intermediate = thirdPoint(linePoint1, mid, HALF_PI, distance1, true);
    return thirdPoint(mid, intermediate, HALF_PI, distance2, true);
  }
  distance1 = length * Math.sin(Math.PI * 2 - angle);
  distance2 = length * Math.cos(Math.PI * 2 - angle);
  intermediate = thirdPoint(linePoint1, mid, HALF_PI, distance1, true);
  return thirdPoint(mid, intermediate, HALF_PI, distance2, false);
}

/** 内部方法。处理 doubleArrowPoints 相关数据。 */
function doubleArrowPoints(point1: Coordinate, point2: Coordinate, point3: Coordinate, clockWise: boolean): Coordinate[] {
  const mid = midpoint(point1, point2);
  const length = distance(mid, point3);
  let mid1 = thirdPoint(point3, mid, 0, length * 0.3, true);
  let mid2 = thirdPoint(point3, mid, 0, length * 0.5, true);
  mid1 = thirdPoint(mid, mid1, HALF_PI, length / 5, clockWise);
  mid2 = thirdPoint(mid, mid2, HALF_PI, length / 4, clockWise);
  const bonePoints = [mid, mid1, mid2, point3];
  const headPoints = arrowHeadPoints(bonePoints, doubleFactors);
  const [neckLeft, neckRight] = [headPoints[0], headPoints[4]];
  const bodyPoints = arrowBodyPoints(bonePoints, neckLeft, neckRight, distance(point1, point2) / baseLength(bonePoints) / 2);
  const half = bodyPoints.length / 2;
  let left = bodyPoints.slice(0, half);
  let right = bodyPoints.slice(half);
  left.push(neckLeft);
  right.push(neckRight);
  left = left.reverse();
  left.push(point2);
  right = right.reverse();
  right.push(point1);
  return left.reverse().concat(headPoints, right);
}

/** 内部方法。处理 doubleArrow 相关数据。 */
function doubleArrow(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  const [point1, point2, point3] = points;
  const point4 = points.length === 3 ? temporaryFourthPoint(point1, point2, point3) : points[3];
  const connectionPoint = points.length < 5 ? midpoint(point1, point2) : points[4];
  let leftArrow: Coordinate[];
  let rightArrow: Coordinate[];
  if (isClockWise(point1, point2, point3)) {
    leftArrow = doubleArrowPoints(point1, connectionPoint, point4, false);
    rightArrow = doubleArrowPoints(connectionPoint, point2, point3, true);
  } else {
    leftArrow = doubleArrowPoints(point2, connectionPoint, point3, false);
    rightArrow = doubleArrowPoints(connectionPoint, point1, point4, true);
  }
  const count = leftArrow.length;
  const bodyCount = (count - 5) / 2;
  const leftLeftBody = leftArrow.slice(0, bodyCount);
  const leftHead = leftArrow.slice(bodyCount, bodyCount + 5);
  const leftRightBody = bezierPoints(leftArrow.slice(bodyCount + 5));
  const rightLeftBody = bezierPoints(rightArrow.slice(0, bodyCount));
  const rightHead = rightArrow.slice(bodyCount, bodyCount + 5);
  const rightRightBody = rightArrow.slice(bodyCount + 5);
  const body = bezierPoints(rightRightBody.concat(leftLeftBody.slice(1)));
  return rightLeftBody.concat(rightHead, body, leftHead, leftRightBody);
}

/** 内部方法。处理 validateSegments 相关数据。 */
function validateSegments(points: readonly Coordinate[]): void {
  if (points.some((point) => point.length !== 2)) throw new InvalidArgumentError('Plot shapes require two-dimensional control points');
  for (let index = 1; index < points.length; index += 1) requireSeparated(points, [index - 1, index]);
}

/** 内部方法。处理 validateFixedAreaArrow 相关数据。 */
function validateFixedAreaArrow(points: readonly Coordinate[], outline: (points: readonly Coordinate[]) => Coordinate[]): void {
  validateSegments(points);
  const keyPoints = outline(points);
  assertFinitePoints(keyPoints);
  requireNonZeroPlanarArea(keyPoints, 'Arrow width offsets must remain distinct on the coordinate grid');
}

/** 内部方法。处理 validateGeneratedArrow 相关数据。 */
function validateGeneratedArrow(points: readonly Coordinate[], generator: (points: readonly Coordinate[]) => Coordinate[]): void {
  assertFinitePoints(generator(points));
}

/** 内部方法。处理 validateBonePath 相关数据。 */
function validateBonePath(points: readonly Coordinate[]): void {
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (arePlanarCoordinatesCoincident(points[index - 1], points[index])) {
      throw new InvalidArgumentError('Arrow bone segments must have a numerically stable non-zero length');
    }
    totalLength += distance(points[index - 1], points[index]);
    if (!Number.isFinite(totalLength)) throw new InvalidArgumentError('Arrow bone total length exceeds the finite numeric range');
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    if (haveSamePlanarDirection(points[index], points[index - 1], points[index + 1])) {
      throw new InvalidArgumentError('Arrow bone must not contain an exact foldback');
    }
  }
}

/** 内部方法。处理 validateArrowPath 相关数据。 */
function validateArrowPath(points: readonly Coordinate[]): void {
  validateSegments(points);
  if (points.length < 3) return;
  if (points.slice(2).every((point) => arePlanarCollinear(points[0], points[1], point))) {
    throw new InvalidArgumentError('Arrow control points must produce a non-zero area');
  }
  validateBonePath([midpoint(points[0], points[1]), ...points.slice(2)]);
}

/** 内部方法。处理 validateDoubleArrowBones 相关数据。 */
function validateDoubleArrowBones(points: readonly Coordinate[]): void {
  if (points.length < 3) return;
  const [point1, point2, point3] = points;
  const point4 = points.length === 3 ? temporaryFourthPoint(point1, point2, point3) : points[3];
  const connectionPoint = points.length < 5 ? midpoint(point1, point2) : points[4];
  const branches = isClockWise(point1, point2, point3)
    ? [
        [point1, connectionPoint, point4],
        [connectionPoint, point2, point3]
      ]
    : [
        [point2, connectionPoint, point3],
        [connectionPoint, point1, point4]
      ];
  for (const [tail1, tail2, head] of branches) {
    requireSeparated([tail1, tail2], [0, 1]);
    const tailDistance = distance(tail1, tail2);
    if (!Number.isFinite(tailDistance) || tailDistance === 0) {
      throw new InvalidArgumentError('Double-arrow branch tail width must remain within the finite numeric range');
    }
    const branchMidpoint = midpoint(tail1, tail2);
    if (arePlanarCoordinatesCoincident(branchMidpoint, head)) {
      throw new InvalidArgumentError('Double-arrow branch head must be separated from its tail midpoint');
    }
    const branchLength = distance(branchMidpoint, head);
    if (!Number.isFinite(branchLength)) throw new InvalidArgumentError('Double-arrow branch length exceeds the finite numeric range');
    if (branchLength / 5 === 0) throw new InvalidArgumentError('Double-arrow branch offsets are below the finite numeric range');
  }
}

/** 内部方法。处理 polygonRender 相关数据。 */
function polygonRender(generator: (points: readonly Coordinate[]) => Coordinate[]) {
  return (points: readonly Coordinate[]) => {
    const ring = generator(points);
    assertFinitePoints(ring);
    return { type: 'polygon' as const, coordinates: [closeRing(ring)] };
  };
}

/** 内部常量。保存 attackArrowDefinition 使用的数据。 */
const attackArrowDefinition = createControlPointDefinition({
  type: 'attack-arrow',
  previewMin: 2,
  completeMin: 3,
  capabilities: plotStructuralAreaCapabilities,
  topology: 'arrow',
  validate: (points) => {
    validateArrowPath(points);
    if (points.length >= 3) validateGeneratedArrow(points, attackArrow);
  },
  render: polygonRender(attackArrow)
});

/** 内部常量。保存 tailedAttackArrowDefinition 使用的数据。 */
const tailedAttackArrowDefinition = createControlPointDefinition({
  type: 'tailed-attack-arrow',
  previewMin: 2,
  completeMin: 3,
  capabilities: plotStructuralAreaCapabilities,
  topology: 'arrow',
  validate: (points) => {
    validateArrowPath(points);
    if (points.length >= 3) validateGeneratedArrow(points, tailedAttackArrow);
  },
  render: polygonRender(tailedAttackArrow)
});

/** 内部常量。保存 fineArrowDefinition 使用的数据。 */
const fineArrowDefinition = createControlPointDefinition({
  type: 'fine-arrow',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  capabilities: plotAreaCapabilities,
  validate: (points) => validateFixedAreaArrow(points, (controlPoints) => fineArrow(controlPoints, fineArrowFactors)),
  render: polygonRender((points) => fineArrow(points, fineArrowFactors))
});

/** 内部常量。保存 tailedSquadCombatArrowDefinition 使用的数据。 */
const tailedSquadCombatArrowDefinition = createControlPointDefinition({
  type: 'tailed-squad-combat-arrow',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  capabilities: plotAreaCapabilities,
  validate: (points) =>
    validateFixedAreaArrow(points, (controlPoints) => {
      const { tailLeft, tailRight, swallowTail, headPoints } = tailedSquadCombatArrowLayout(controlPoints);
      return [tailLeft, ...headPoints, tailRight, swallowTail];
    }),
  render: polygonRender(tailedSquadCombatArrow)
});

/** 内部常量。保存 assaultDirectionArrowDefinition 使用的数据。 */
const assaultDirectionArrowDefinition = createControlPointDefinition({
  type: 'assault-direction-arrow',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  capabilities: plotAreaCapabilities,
  validate: (points) => validateFixedAreaArrow(points, (controlPoints) => fineArrow(controlPoints, assaultDirectionArrowFactors)),
  render: polygonRender((points) => fineArrow(points, assaultDirectionArrowFactors))
});

/** 内部常量。保存 doubleArrowDefinition 使用的数据。 */
const doubleArrowDefinition = createControlPointDefinition({
  type: 'double-arrow',
  previewMin: 2,
  completeMin: 5,
  completeMax: 5,
  autoFinish: 4,
  capabilities: plotAreaCapabilities,
  validate: (points) => {
    if (points.length >= 3) requireNonCollinear(points[0], points[1], points[2]);
    if (points.length >= 4) requireNonCollinear(points[0], points[1], points[3]);
    validateSegments(points);
    validateDoubleArrowBones(points);
    if (points.length >= 3) validateGeneratedArrow(points, doubleArrow);
  },
  render: polygonRender(doubleArrow),
  complete: (state) => {
    if (state.controlPoints.length < 3) return { status: 'incomplete' };
    if (state.controlPoints.length !== 3 && state.controlPoints.length !== 4) return { status: 'complete', state };
    const points = state.controlPoints.map(cloneCoordinate);
    if (points.length === 3) points.push(temporaryFourthPoint(points[0], points[1], points[2]));
    return {
      status: 'complete',
      state: {
        type: 'double-arrow',
        controlPoints: [...points, midpoint(points[0], points[1])]
      }
    };
  }
});

/** 内部常量。保存 arrowShapeDefinitions 使用的数据。 */
export const arrowShapeDefinitions = Object.freeze([
  attackArrowDefinition,
  tailedAttackArrowDefinition,
  fineArrowDefinition,
  tailedSquadCombatArrowDefinition,
  assaultDirectionArrowDefinition,
  doubleArrowDefinition
] as const satisfies readonly ShapeDefinition[]);
