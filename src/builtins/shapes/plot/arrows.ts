import { InvalidArgumentError } from '../../../core/errors.js';
import type { Coordinate } from '../../../core/common/types.js';
import type { ShapeCapability, ShapeDefinition } from '../../../core/shape/types.js';
import { cloneCoordinate, closeRing, createControlPointDefinition, editableCapabilities, requireSeparated } from '../definition.js';
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
  requireNonCollinear,
  thirdPoint,
  wholeDistance
} from './math.js';

const plotAreaCapabilities: ReadonlySet<ShapeCapability> = editableCapabilities;

interface ArrowFactors {
  readonly headHeight: number;
  readonly headWidth: number;
  readonly neckHeight: number;
  readonly neckWidth: number;
  readonly headTail?: number;
}

const attackFactors: ArrowFactors = { headHeight: 0.18, headWidth: 0.3, neckHeight: 0.85, neckWidth: 0.15, headTail: 0.8 };
const doubleFactors: ArrowFactors = { headHeight: 0.25, headWidth: 0.3, neckHeight: 0.85, neckWidth: 0.15 };

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
  return [
    thirdPoint(headPoint, neckEnd, HALF_PI, neckWidth, false),
    thirdPoint(headPoint, headEnd, HALF_PI, headWidth, false),
    cloneCoordinate(headPoint),
    thirdPoint(headPoint, headEnd, HALF_PI, headWidth, true),
    thirdPoint(headPoint, neckEnd, HALF_PI, neckWidth, true)
  ];
}

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

interface FineArrowFactors {
  readonly tailWidth: number;
  readonly neckWidth: number;
  readonly headWidth: number;
  readonly headAngle: number;
  readonly neckAngle: number;
}

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

function tailedSquadCombatArrow(points: readonly Coordinate[]): Coordinate[] {
  const totalLength = baseLength(points);
  const tailWidth = totalLength * 0.1;
  const tailLeft = thirdPoint(points[1], points[0], HALF_PI, tailWidth, false);
  const tailRight = thirdPoint(points[1], points[0], HALF_PI, tailWidth, true);
  const swallowTail = thirdPoint(points[1], points[0], 0, tailWidth, true);
  const headPoints = arrowHeadPoints(points, attackFactors, tailLeft, tailRight);
  const [neckLeft, neckRight] = [headPoints[0], headPoints[4]];
  const bodyPoints = arrowBodyPoints(points, neckLeft, neckRight, 0.1);
  const half = bodyPoints.length / 2;
  const left = quadraticBSplinePoints([tailLeft, ...bodyPoints.slice(0, half), neckLeft]);
  const right = quadraticBSplinePoints([tailRight, ...bodyPoints.slice(half), neckRight]);
  return left.concat(headPoints, right.reverse(), [swallowTail, left[0]]);
}

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

function validateSegments(points: readonly Coordinate[]): void {
  if (points.some((point) => point.length !== 2)) throw new InvalidArgumentError('Plot shapes require two-dimensional control points');
  for (let index = 1; index < points.length; index += 1) requireSeparated(points, [index - 1, index]);
}

function validateGenerated(points: readonly Coordinate[], generator: (points: readonly Coordinate[]) => Coordinate[]): void {
  validateSegments(points);
  const generated = generator(points);
  assertFinitePoints(generated);
  if (points.length >= 3) {
    let doubledArea = 0;
    for (let index = 0; index < generated.length; index += 1) {
      const next = generated[(index + 1) % generated.length];
      doubledArea += generated[index][0] * next[1] - next[0] * generated[index][1];
    }
    if (Math.abs(doubledArea) <= Number.EPSILON) throw new InvalidArgumentError('Arrow control points must produce a non-zero area');
  }
}

function polygonRender(generator: (points: readonly Coordinate[]) => Coordinate[]) {
  return (points: readonly Coordinate[]) => {
    const ring = generator(points);
    assertFinitePoints(ring);
    return { type: 'polygon' as const, coordinates: [closeRing(ring)] };
  };
}

const attackArrowDefinition = createControlPointDefinition({
  type: 'attack-arrow',
  previewMin: 2,
  completeMin: 3,
  capabilities: plotAreaCapabilities,
  validate: (points) => validateGenerated(points, attackArrow),
  render: polygonRender(attackArrow)
});

const tailedAttackArrowDefinition = createControlPointDefinition({
  type: 'tailed-attack-arrow',
  previewMin: 2,
  completeMin: 3,
  capabilities: plotAreaCapabilities,
  validate: (points) => validateGenerated(points, tailedAttackArrow),
  render: polygonRender(tailedAttackArrow)
});

const fineArrowDefinition = createControlPointDefinition({
  type: 'fine-arrow',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  capabilities: plotAreaCapabilities,
  validate: (points) =>
    validateGenerated(points, (value) =>
      fineArrow(value, { tailWidth: 0.1, neckWidth: 0.2, headWidth: 0.25, headAngle: Math.PI / 8.5, neckAngle: Math.PI / 13 })
    ),
  render: polygonRender((points) => fineArrow(points, { tailWidth: 0.1, neckWidth: 0.2, headWidth: 0.25, headAngle: Math.PI / 8.5, neckAngle: Math.PI / 13 }))
});

const tailedSquadCombatArrowDefinition = createControlPointDefinition({
  type: 'tailed-squad-combat-arrow',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  capabilities: plotAreaCapabilities,
  validate: (points) => validateGenerated(points, tailedSquadCombatArrow),
  render: polygonRender(tailedSquadCombatArrow)
});

const assaultDirectionArrowDefinition = createControlPointDefinition({
  type: 'assault-direction-arrow',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  capabilities: plotAreaCapabilities,
  validate: (points) =>
    validateGenerated(points, (value) =>
      fineArrow(value, { tailWidth: 0.03, neckWidth: 0.1, headWidth: 0.15, headAngle: Math.PI / 5.5, neckAngle: Math.PI / 12 })
    ),
  render: polygonRender((points) => fineArrow(points, { tailWidth: 0.03, neckWidth: 0.1, headWidth: 0.15, headAngle: Math.PI / 5.5, neckAngle: Math.PI / 12 }))
});

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
    validateGenerated(points, doubleArrow);
  },
  render: polygonRender(doubleArrow),
  finalize: (state) => {
    if (state.controlPoints.length !== 3 && state.controlPoints.length !== 4) return state;
    const points = state.controlPoints.map(cloneCoordinate);
    if (points.length === 3) points.push(temporaryFourthPoint(points[0], points[1], points[2]));
    return {
      type: 'double-arrow',
      controlPoints: [...points, midpoint(points[0], points[1])]
    };
  }
});

export const arrowShapeDefinitions = Object.freeze([
  attackArrowDefinition,
  tailedAttackArrowDefinition,
  fineArrowDefinition,
  tailedSquadCombatArrowDefinition,
  assaultDirectionArrowDefinition,
  doubleArrowDefinition
] as const satisfies readonly ShapeDefinition[]);
