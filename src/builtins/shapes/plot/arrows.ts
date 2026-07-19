import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import type { Coordinate } from '../../../core/common/types.js';
import type {
  RenderGeometryState,
  ShapeAnimationDirection,
  ShapeCapability,
  ShapeDefinition,
  ShapeRevealSession,
  ShapeState
} from '../../../core/shape/types.js';
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
  azimuth,
  baseLength,
  bezierPoints,
  distance,
  isClockWise,
  midpoint,
  quadraticBSplinePoints,
  thirdPoint,
  wholeDistance,
  writeWeightedCoordinate
} from './math.js';

const plotAreaCapabilities: ReadonlySet<ShapeCapability> = editableCapabilities;
const plotStructuralAreaCapabilities: ReadonlySet<ShapeCapability> = structuralEditableCapabilities;

interface ArrowFactors {
  readonly headHeight: number;
  readonly headWidth: number;
  readonly neckHeight: number;
  readonly neckWidth: number;
  readonly headTail?: number;
}

const attackFactors: ArrowFactors = { headHeight: 0.18, headWidth: 0.3, neckHeight: 0.85, neckWidth: 0.15, headTail: 0.8 };
const doubleFactors: ArrowFactors = { headHeight: 0.25, headWidth: 0.3, neckHeight: 0.85, neckWidth: 0.15 };

type ArrowGenerator = (points: readonly Coordinate[]) => Coordinate[];

function boundedRevealProgress(progress: number, direction: ShapeAnimationDirection): number {
  if (direction !== 'forward' && direction !== 'reverse') throw new InvalidArgumentError(`Unknown arrow reveal direction: ${String(direction)}`);
  if (!Number.isFinite(progress)) throw new InvalidArgumentError('Arrow reveal progress must be finite');
  return Math.max(0, Math.min(1, progress));
}

function interpolateComponent(start: number, end: number, progress: number): number {
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  const direct = start + (end - start) * progress;
  if (Number.isFinite(direct)) return direct;
  const weighted = start * (1 - progress) + end * progress;
  if (!Number.isFinite(weighted)) throw new InvalidArgumentError('Arrow reveal interpolation exceeds the finite numeric range');
  return weighted;
}

function interpolateCoordinate(start: Coordinate, end: Coordinate, progress: number): Coordinate {
  return [interpolateComponent(start[0], end[0], progress), interpolateComponent(start[1], end[1], progress)];
}

function safeRevealPolygon(createRing: () => Coordinate[]): RenderGeometryState | undefined {
  try {
    const ring = createRing();
    assertFinitePoints(ring);
    if (ring.length < 3) return undefined;
    requireNonZeroPlanarArea(ring, 'Arrow reveal geometry must remain non-degenerate');
    return { type: 'polygon', coordinates: [closeRing(ring)] };
  } catch (error) {
    if (error instanceof InvalidArgumentError) return undefined;
    throw error;
  }
}

function revealPolygon(generator: ArrowGenerator, points: readonly Coordinate[]): RenderGeometryState | undefined {
  return safeRevealPolygon(() => generator(points));
}

function fixedArrowReveal(
  generator: ArrowGenerator,
  viewState: Readonly<ShapeState<'fine-arrow' | 'tailed-squad-combat-arrow' | 'assault-direction-arrow'>>,
  progress: number,
  direction: ShapeAnimationDirection
): RenderGeometryState | undefined {
  const boundedProgress = boundedRevealProgress(progress, direction);
  if (boundedProgress === 0 || viewState.controlPoints.length < 2) return undefined;
  if (boundedProgress === 1) return revealPolygon(generator, viewState.controlPoints);
  const [tail, head] = viewState.controlPoints;
  const points =
    direction === 'forward'
      ? [cloneCoordinate(tail), interpolateCoordinate(tail, head, boundedProgress)]
      : [interpolateCoordinate(head, tail, boundedProgress), cloneCoordinate(head)];
  return revealPolygon(generator, points);
}

function pathSlice(points: readonly Coordinate[], progress: number, direction: ShapeAnimationDirection): Coordinate[] {
  const totalLength = wholeDistance(points);
  if (!Number.isFinite(totalLength) || totalLength <= 0) return [];
  const startDistance = direction === 'forward' ? 0 : totalLength * (1 - progress);
  const endDistance = direction === 'forward' ? totalLength * progress : totalLength;
  let traversed = 0;
  const result: Coordinate[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const segmentStart = points[index - 1];
    const segmentEnd = points[index];
    const segmentLength = distance(segmentStart, segmentEnd);
    const segmentEndDistance = traversed + segmentLength;
    if (segmentEndDistance < startDistance) {
      traversed = segmentEndDistance;
      continue;
    }
    if (traversed > endDistance) break;
    const localStart = Math.max(0, (startDistance - traversed) / segmentLength);
    const localEnd = Math.min(1, (endDistance - traversed) / segmentLength);
    if (localEnd >= localStart) {
      const start = interpolateCoordinate(segmentStart, segmentEnd, localStart);
      const end = interpolateCoordinate(segmentStart, segmentEnd, localEnd);
      if (result.length === 0 || !coordinatesEqual(result[result.length - 1], start)) result.push(start);
      if (!coordinatesEqual(result[result.length - 1], end)) result.push(end);
    }
    if (segmentEndDistance >= endDistance) break;
    traversed = segmentEndDistance;
  }
  return result;
}

function scaledTailPoint(currentCenter: Coordinate, originalCenter: Coordinate, originalPoint: Coordinate, progress: number): Coordinate {
  const x = currentCenter[0] + (originalPoint[0] - originalCenter[0]) * progress;
  const y = currentCenter[1] + (originalPoint[1] - originalCenter[1]) * progress;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InvalidArgumentError('Arrow reveal tail exceeds the finite numeric range');
  return [x, y];
}

function attackArrowReveal(
  generator: ArrowGenerator,
  viewState: Readonly<ShapeState<'attack-arrow' | 'tailed-attack-arrow'>>,
  progress: number,
  direction: ShapeAnimationDirection
): RenderGeometryState | undefined {
  const boundedProgress = boundedRevealProgress(progress, direction);
  const points = viewState.controlPoints;
  if (boundedProgress === 0 || points.length < 3) return undefined;
  if (boundedProgress === 1) return revealPolygon(generator, points);
  const tailCenter = midpoint(points[0], points[1]);
  const bonePoints = [tailCenter, ...points.slice(2)];
  const revealedBone = pathSlice(bonePoints, boundedProgress, direction);
  if (revealedBone.length < 2) return undefined;
  if (direction === 'forward') return revealPolygon(generator, [points[0], points[1], ...revealedBone.slice(1)]);
  const currentTailCenter = revealedBone[0];
  try {
    const tailLeft = scaledTailPoint(currentTailCenter, tailCenter, points[0], boundedProgress);
    const tailRight = scaledTailPoint(currentTailCenter, tailCenter, points[1], boundedProgress);
    return revealPolygon(generator, [tailLeft, tailRight, ...revealedBone.slice(1)]);
  } catch (error) {
    if (error instanceof InvalidArgumentError) return undefined;
    throw error;
  }
}

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

const fineArrowFactors: FineArrowFactors = { tailWidth: 0.1, neckWidth: 0.2, headWidth: 0.25, headAngle: Math.PI / 8.5, neckAngle: Math.PI / 13 };
const assaultDirectionArrowFactors: FineArrowFactors = {
  tailWidth: 0.03,
  neckWidth: 0.1,
  headWidth: 0.15,
  headAngle: Math.PI / 5.5,
  neckAngle: Math.PI / 12
};

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

interface TailedSquadCombatArrowLayout {
  readonly tailLeft: Coordinate;
  readonly tailRight: Coordinate;
  readonly swallowTail: Coordinate;
  readonly headPoints: Coordinate[];
}

function tailedSquadCombatArrowLayout(points: readonly Coordinate[]): TailedSquadCombatArrowLayout {
  const totalLength = baseLength(points);
  const tailWidth = totalLength * 0.1;
  const tailLeft = thirdPoint(points[1], points[0], HALF_PI, tailWidth, false);
  const tailRight = thirdPoint(points[1], points[0], HALF_PI, tailWidth, true);
  const swallowTail = thirdPoint(points[1], points[0], 0, tailWidth, true);
  return { tailLeft, tailRight, swallowTail, headPoints: arrowHeadPoints(points, attackFactors, tailLeft, tailRight) };
}

function tailedSquadCombatArrow(points: readonly Coordinate[]): Coordinate[] {
  const { tailLeft, tailRight, swallowTail, headPoints } = tailedSquadCombatArrowLayout(points);
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

function completeDoubleArrowControlPoints(points: readonly Coordinate[]): Coordinate[] {
  const completed = points.map(cloneCoordinate);
  if (completed.length === 3) completed.push(temporaryFourthPoint(completed[0], completed[1], completed[2]));
  if (completed.length === 4) completed.push(midpoint(completed[0], completed[1]));
  return completed;
}

interface DoubleArrowBranch {
  readonly tail1: Coordinate;
  readonly tail2: Coordinate;
  readonly head: Coordinate;
  readonly clockWise: boolean;
}

function doubleArrowBranches(points: readonly Coordinate[]): readonly [DoubleArrowBranch, DoubleArrowBranch] {
  const [point1, point2, point3, point4, connectionPoint] = completeDoubleArrowControlPoints(points);
  return isClockWise(point1, point2, point3)
    ? [
        { tail1: point1, tail2: connectionPoint, head: point4, clockWise: false },
        { tail1: connectionPoint, tail2: point2, head: point3, clockWise: true }
      ]
    : [
        { tail1: point2, tail2: connectionPoint, head: point3, clockWise: false },
        { tail1: connectionPoint, tail2: point1, head: point4, clockWise: true }
      ];
}

function renderDoubleArrowBranches(branches: readonly [DoubleArrowBranch, DoubleArrowBranch]): Coordinate[] {
  const leftArrow = doubleArrowPoints(branches[0].tail1, branches[0].tail2, branches[0].head, branches[0].clockWise);
  const rightArrow = doubleArrowPoints(branches[1].tail1, branches[1].tail2, branches[1].head, branches[1].clockWise);
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

function doubleArrow(points: readonly Coordinate[]): Coordinate[] {
  if (points.length === 2) return points.map(cloneCoordinate);
  return renderDoubleArrowBranches(doubleArrowBranches(points));
}

function doubleArrowReveal(
  viewState: Readonly<ShapeState<'double-arrow'>>,
  progress: number,
  direction: ShapeAnimationDirection
): RenderGeometryState | undefined {
  const boundedProgress = boundedRevealProgress(progress, direction);
  if (boundedProgress === 0 || viewState.controlPoints.length < 3) return undefined;
  const points = completeDoubleArrowControlPoints(viewState.controlPoints);
  if (points.length !== 5) return undefined;
  if (boundedProgress === 1) return revealPolygon(doubleArrow, points);
  const branches = doubleArrowBranches(points);
  const revealBranch = (branch: DoubleArrowBranch): DoubleArrowBranch =>
    direction === 'forward'
      ? {
          ...branch,
          head: interpolateCoordinate(midpoint(branch.tail1, branch.tail2), branch.head, boundedProgress)
        }
      : {
          ...branch,
          tail1: interpolateCoordinate(branch.head, branch.tail1, boundedProgress),
          tail2: interpolateCoordinate(branch.head, branch.tail2, boundedProgress)
        };
  return safeRevealPolygon(() => renderDoubleArrowBranches([revealBranch(branches[0]), revealBranch(branches[1])]));
}

type FixedArrowState = ShapeState<'fine-arrow' | 'tailed-squad-combat-arrow' | 'assault-direction-arrow'>;
type AttackArrowState = ShapeState<'attack-arrow' | 'tailed-attack-arrow'>;

function samePlanarCoordinate(left: Coordinate, right: Coordinate): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

/** 固定复用坐标身份的纯数据工作区。 */
class MutableCoordinateList {
  readonly values: Coordinate[] = [];
  readonly #pool: number[][] = [];

  get length(): number {
    return this.values.length;
  }

  coordinate(index: number): number[] {
    let coordinate = this.#pool[index];
    if (coordinate === undefined) {
      coordinate = [0, 0];
      this.#pool[index] = coordinate;
    }
    this.values[index] = coordinate as unknown as Coordinate;
    return coordinate;
  }

  set(index: number, x: number, y: number): Coordinate {
    const coordinate = this.coordinate(index);
    coordinate[0] = x;
    coordinate[1] = y;
    return coordinate as unknown as Coordinate;
  }

  copy(index: number, source: Coordinate): Coordinate {
    return this.set(index, source[0], source[1]);
  }

  copyAll(source: readonly Coordinate[]): void {
    for (let index = 0; index < source.length; index += 1) this.copy(index, source[index]);
    this.values.length = source.length;
  }

  interpolate(index: number, start: Coordinate, end: Coordinate, progress: number): Coordinate {
    return this.set(index, interpolateComponent(start[0], end[0], progress), interpolateComponent(start[1], end[1], progress));
  }

  weighted(index: number, points: readonly Coordinate[], weights: readonly number[]): Coordinate {
    return writeWeightedCoordinate(this.coordinate(index), points, weights);
  }

  truncate(length: number): void {
    this.values.length = length;
  }

  destroy(): void {
    this.values.length = 0;
    this.#pool.length = 0;
  }
}

/** reveal 输出始终复用同一 Polygon、ring 和已预热的坐标槽。 */
class MutableRevealPolygon {
  readonly ring = new MutableCoordinateList();
  readonly geometry: Extract<RenderGeometryState, { type: 'polygon' }> = { type: 'polygon', coordinates: [this.ring.values] };

  clear(): undefined {
    this.ring.truncate(0);
    return undefined;
  }

  copy(source: readonly Coordinate[]): RenderGeometryState | undefined {
    this.ring.copyAll(source);
    return this.finish(source.length);
  }

  finish(length: number): RenderGeometryState | undefined {
    if (length < 3) return this.clear();
    const values = this.ring.values;
    this.ring.truncate(length);
    for (let index = 0; index < length; index += 1) {
      if (!Number.isFinite(values[index][0]) || !Number.isFinite(values[index][1])) throw new InvalidArgumentError('Arrow reveal geometry must remain finite');
    }
    requireNonZeroMutableArea(values, length);
    if (!samePlanarCoordinate(values[0], values[length - 1])) {
      this.ring.copy(length, values[0]);
      this.ring.truncate(length + 1);
    }
    return this.geometry;
  }

  destroy(): void {
    this.ring.destroy();
  }
}

function requireNonZeroMutableArea(points: readonly Coordinate[], length: number): void {
  const origin = points[0];
  let scale = 0;
  for (let index = 0; index < length; index += 1) {
    const x = points[index][0] - origin[0];
    const y = points[index][1] - origin[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InvalidArgumentError('Arrow reveal coordinate differences exceed the finite numeric range');
    scale = Math.max(scale, Math.abs(x), Math.abs(y));
  }
  if (scale === 0) throw new InvalidArgumentError('Arrow reveal geometry must remain non-degenerate');
  let doubledArea = 0;
  let magnitude = 0;
  for (let index = 1; index < length - 1; index += 1) {
    const currentX = (points[index][0] - origin[0]) / scale;
    const currentY = (points[index][1] - origin[1]) / scale;
    const nextX = (points[index + 1][0] - origin[0]) / scale;
    const nextY = (points[index + 1][1] - origin[1]) / scale;
    const positive = currentX * nextY;
    const negative = currentY * nextX;
    doubledArea += positive - negative;
    magnitude += Math.abs(positive) + Math.abs(negative);
  }
  if (!Number.isFinite(doubledArea) || Math.abs(doubledArea) <= Number.EPSILON * 8 * length * magnitude) {
    throw new InvalidArgumentError('Arrow reveal geometry must remain non-degenerate');
  }
}

function writeMidpoint(output: MutableCoordinateList, index: number, left: Coordinate, right: Coordinate): Coordinate {
  return output.set(index, interpolateComponent(left[0], right[0], 0.5), interpolateComponent(left[1], right[1], 0.5));
}

function writeThirdPoint(
  output: MutableCoordinateList,
  index: number,
  start: Coordinate,
  end: Coordinate,
  angle: number,
  targetDistance: number,
  clockWise = false
): Coordinate {
  const alpha = azimuth(start, end) + (clockWise ? angle : -angle);
  return output.set(index, end[0] + targetDistance * Math.cos(alpha), end[1] + targetDistance * Math.sin(alpha));
}

function pathLength(points: readonly Coordinate[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

function pathBaseLength(points: readonly Coordinate[]): number {
  return pathLength(points) ** 0.99;
}

function quadraticWeightRows(): readonly (readonly number[])[] {
  const rows: number[][] = [];
  for (let t = 0; t <= 1; t += 0.05) rows.push([(t - 1) ** 2 / 2, (-2 * t ** 2 + 2 * t + 1) / 2, t ** 2 / 2]);
  return rows;
}

function factorialValue(value: number): number {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function bezierWeightRows(controlCount: number): readonly (readonly number[])[] {
  const rows: number[][] = [];
  const degree = controlCount - 1;
  for (let t = 0; t <= 1; t += 0.01) {
    const weights: number[] = [];
    for (let index = 0; index <= degree; index += 1) {
      weights.push((factorialValue(degree) / (factorialValue(index) * factorialValue(degree - index))) * t ** index * (1 - t) ** (degree - index));
    }
    rows.push(weights);
  }
  return rows;
}

const quadraticRows = quadraticWeightRows();
const cubicBezierRows = bezierWeightRows(4);
const sixthDegreeBezierRows = bezierWeightRows(7);

function writeQuadraticBSpline(points: readonly Coordinate[], output: MutableCoordinateList, controls: MutableCoordinateList): void {
  if (points.length <= 2) {
    output.copyAll(points);
    return;
  }
  let outputIndex = 0;
  output.copy(outputIndex++, points[0]);
  for (let segment = 0; segment <= points.length - 3; segment += 1) {
    controls.copy(0, points[segment]);
    controls.copy(1, points[segment + 1]);
    controls.copy(2, points[segment + 2]);
    controls.truncate(3);
    for (let rowIndex = 0; rowIndex < quadraticRows.length; rowIndex += 1) {
      output.weighted(outputIndex++, controls.values, quadraticRows[rowIndex]);
    }
  }
  output.copy(outputIndex++, points[points.length - 1]);
  output.truncate(outputIndex);
}

function writeBezier(points: readonly Coordinate[], output: MutableCoordinateList): void {
  if (points.length <= 2) {
    output.copyAll(points);
    return;
  }
  const rows = points.length === 4 ? cubicBezierRows : points.length === 7 ? sixthDegreeBezierRows : undefined;
  if (rows === undefined) throw new InvalidArgumentError('Double-arrow reveal uses an unsupported Bezier topology');
  let outputIndex = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) output.weighted(outputIndex++, points, rows[rowIndex]);
  output.copy(outputIndex++, points[points.length - 1]);
  output.truncate(outputIndex);
}

class ArrowCurveWorkspace {
  readonly bone = new MutableCoordinateList();
  readonly head = new MutableCoordinateList();
  readonly body = new MutableCoordinateList();
  readonly leftControls = new MutableCoordinateList();
  readonly rightControls = new MutableCoordinateList();
  readonly quadraticControls = new MutableCoordinateList();
  readonly leftCurve = new MutableCoordinateList();
  readonly rightCurve = new MutableCoordinateList();
  readonly temporary = new MutableCoordinateList();

  destroy(): void {
    this.bone.destroy();
    this.head.destroy();
    this.body.destroy();
    this.leftControls.destroy();
    this.rightControls.destroy();
    this.quadraticControls.destroy();
    this.leftCurve.destroy();
    this.rightCurve.destroy();
    this.temporary.destroy();
  }
}

function writeArrowHeadPoints(
  points: readonly Coordinate[],
  factors: ArrowFactors,
  output: MutableCoordinateList,
  tailLeft?: Coordinate,
  tailRight?: Coordinate
): void {
  let length = pathBaseLength(points);
  let headHeight = length * factors.headHeight;
  const headPoint = points[points.length - 1];
  const previous = points[points.length - 2];
  length = distance(headPoint, previous);
  if (tailLeft !== undefined && tailRight !== undefined && factors.headTail !== undefined) {
    const tailWidth = distance(tailLeft, tailRight);
    if (headHeight > tailWidth * factors.headTail) headHeight = tailWidth * factors.headTail;
  }
  const headWidth = headHeight * factors.headWidth;
  const neckWidth = headHeight * factors.neckWidth;
  headHeight = headHeight > length ? length : headHeight;
  const neckHeight = headHeight * factors.neckHeight;
  const headEnd = writeThirdPoint(output, 5, previous, headPoint, 0, headHeight, true);
  const neckEnd = writeThirdPoint(output, 6, previous, headPoint, 0, neckHeight, true);
  if (samePlanarCoordinate(headPoint, headEnd) || samePlanarCoordinate(headPoint, neckEnd)) {
    throw new InvalidArgumentError('Arrow head direction cannot be represented on the coordinate grid');
  }
  writeThirdPoint(output, 0, headPoint, neckEnd, HALF_PI, neckWidth, false);
  writeThirdPoint(output, 1, headPoint, headEnd, HALF_PI, headWidth, false);
  output.copy(2, headPoint);
  writeThirdPoint(output, 3, headPoint, headEnd, HALF_PI, headWidth, true);
  writeThirdPoint(output, 4, headPoint, neckEnd, HALF_PI, neckWidth, true);
  output.truncate(5);
}

function writeArrowBodyPoints(
  points: readonly Coordinate[],
  neckLeft: Coordinate,
  neckRight: Coordinate,
  tailWidthFactor: number,
  output: MutableCoordinateList
): void {
  const totalLength = pathLength(points);
  const length = pathBaseLength(points);
  const tailWidth = length * tailWidthFactor;
  const neckWidth = distance(neckLeft, neckRight);
  const widthDifference = (tailWidth - neckWidth) / 2;
  const sideCount = Math.max(0, points.length - 2);
  let traversedLength = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const angle = angleOfThreePoints(points[index - 1], points[index], points[index + 1]) / 2;
    traversedLength += distance(points[index - 1], points[index]);
    const width = (tailWidth / 2 - (traversedLength / totalLength) * widthDifference) / Math.sin(angle);
    writeThirdPoint(output, index - 1, points[index - 1], points[index], Math.PI - angle, width, true);
    writeThirdPoint(output, sideCount + index - 1, points[index - 1], points[index], angle, width, false);
  }
  output.truncate(sideCount * 2);
}

function writeFineArrowOutline(start: Coordinate, end: Coordinate, factors: FineArrowFactors, output: MutableCoordinateList): number {
  const length = distance(start, end) ** 0.99;
  writeThirdPoint(output, 0, end, start, HALF_PI, length * factors.tailWidth, true);
  writeThirdPoint(output, 1, start, end, factors.neckAngle, length * factors.neckWidth, false);
  writeThirdPoint(output, 2, start, end, factors.headAngle, length * factors.headWidth, false);
  output.copy(3, end);
  writeThirdPoint(output, 4, start, end, factors.headAngle, length * factors.headWidth, true);
  writeThirdPoint(output, 5, start, end, factors.neckAngle, length * factors.neckWidth, true);
  writeThirdPoint(output, 6, end, start, HALF_PI, length * factors.tailWidth, false);
  output.truncate(7);
  return 7;
}

function writeTailedSquadCombatOutline(segment: readonly Coordinate[], output: MutableCoordinateList, workspace: ArrowCurveWorkspace): number {
  const [start, end] = segment;
  const tailWidth = pathBaseLength(segment) * 0.1;
  const tailLeft = writeThirdPoint(workspace.temporary, 0, end, start, HALF_PI, tailWidth, false);
  const tailRight = writeThirdPoint(workspace.temporary, 1, end, start, HALF_PI, tailWidth, true);
  const swallowTail = writeThirdPoint(workspace.temporary, 2, end, start, 0, tailWidth, true);
  writeArrowHeadPoints(segment, attackFactors, workspace.head, tailLeft, tailRight);
  let index = 0;
  output.copy(index++, tailLeft);
  output.copy(index++, workspace.head.values[0]);
  for (let headIndex = 0; headIndex < workspace.head.length; headIndex += 1) output.copy(index++, workspace.head.values[headIndex]);
  output.copy(index++, workspace.head.values[4]);
  output.copy(index++, tailRight);
  output.copy(index++, swallowTail);
  output.copy(index++, tailLeft);
  output.truncate(index);
  return index;
}

function writeAttackArrowOutline(points: readonly Coordinate[], tailed: boolean, output: MutableCoordinateList, workspace: ArrowCurveWorkspace): number {
  let tailLeft = points[0];
  let tailRight = points[1];
  if (isClockWise(points[0], points[1], points[2])) {
    const swapped = tailLeft;
    tailLeft = tailRight;
    tailRight = swapped;
  }
  writeMidpoint(workspace.bone, 0, tailLeft, tailRight);
  for (let index = 2; index < points.length; index += 1) workspace.bone.copy(index - 1, points[index]);
  workspace.bone.truncate(points.length - 1);
  writeArrowHeadPoints(workspace.bone.values, attackFactors, workspace.head, tailLeft, tailRight);
  const neckLeft = workspace.head.values[0];
  const neckRight = workspace.head.values[4];
  const totalLength = pathBaseLength(workspace.bone.values);
  writeArrowBodyPoints(workspace.bone.values, neckLeft, neckRight, distance(tailLeft, tailRight) / totalLength, workspace.body);
  const half = workspace.body.length / 2;
  workspace.leftControls.copy(0, tailLeft);
  workspace.rightControls.copy(0, tailRight);
  for (let index = 0; index < half; index += 1) {
    workspace.leftControls.copy(index + 1, workspace.body.values[index]);
    workspace.rightControls.copy(index + 1, workspace.body.values[half + index]);
  }
  workspace.leftControls.copy(half + 1, neckLeft);
  workspace.rightControls.copy(half + 1, neckRight);
  workspace.leftControls.truncate(half + 2);
  workspace.rightControls.truncate(half + 2);
  writeQuadraticBSpline(workspace.leftControls.values, workspace.leftCurve, workspace.quadraticControls);
  writeQuadraticBSpline(workspace.rightControls.values, workspace.rightCurve, workspace.quadraticControls);
  let outputIndex = 0;
  for (let index = 0; index < workspace.leftCurve.length; index += 1) output.copy(outputIndex++, workspace.leftCurve.values[index]);
  for (let index = 0; index < workspace.head.length; index += 1) output.copy(outputIndex++, workspace.head.values[index]);
  for (let index = workspace.rightCurve.length - 1; index >= 0; index -= 1) output.copy(outputIndex++, workspace.rightCurve.values[index]);
  if (tailed) {
    const swallowTail = writeThirdPoint(workspace.temporary, 0, workspace.bone.values[1], workspace.bone.values[0], 0, totalLength * 0.1, true);
    output.copy(outputIndex++, swallowTail);
    output.copy(outputIndex++, workspace.leftCurve.values[0]);
  }
  output.truncate(outputIndex);
  return outputIndex;
}

class FixedArrowRevealSession implements ShapeRevealSession<FixedArrowState> {
  readonly #generator: ArrowGenerator;
  readonly #factors: FineArrowFactors | undefined;
  readonly #controls = new MutableCoordinateList();
  readonly #segment = new MutableCoordinateList();
  readonly #polygon = new MutableRevealPolygon();
  readonly #workspace = new ArrowCurveWorkspace();
  #fullRing: readonly Coordinate[] | undefined;
  #destroyed = false;

  constructor(viewState: Readonly<FixedArrowState>, generator: ArrowGenerator, factors?: FineArrowFactors) {
    this.#generator = generator;
    this.#factors = factors;
    this.rebind(viewState);
  }

  rebind(viewState: Readonly<FixedArrowState>): void {
    this.#assertActive();
    this.#controls.copyAll(viewState.controlPoints);
    this.#fullRing = closeRing(this.#generator(this.#controls.values));
    this.#prewarm();
  }

  reveal(progress: number, direction: ShapeAnimationDirection): RenderGeometryState | undefined {
    this.#assertActive();
    const boundedProgress = boundedRevealProgress(progress, direction);
    if (boundedProgress === 0 || this.#controls.length < 2) return this.#polygon.clear();
    if (boundedProgress === 1) return this.#polygon.copy(this.#fullRing ?? []);
    const tail = this.#controls.values[0];
    const head = this.#controls.values[1];
    if (direction === 'forward') {
      this.#segment.copy(0, tail);
      this.#segment.interpolate(1, tail, head, boundedProgress);
    } else {
      this.#segment.interpolate(0, head, tail, boundedProgress);
      this.#segment.copy(1, head);
    }
    this.#segment.truncate(2);
    try {
      const length =
        this.#factors === undefined
          ? writeTailedSquadCombatOutline(this.#segment.values, this.#polygon.ring, this.#workspace)
          : writeFineArrowOutline(this.#segment.values[0], this.#segment.values[1], this.#factors, this.#polygon.ring);
      return this.#polygon.finish(length);
    } catch (error) {
      if (error instanceof InvalidArgumentError) return this.#polygon.clear();
      throw error;
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#fullRing = undefined;
    this.#controls.destroy();
    this.#segment.destroy();
    this.#workspace.destroy();
    this.#polygon.destroy();
  }

  #assertActive(): void {
    if (this.#destroyed) throw new ObjectDisposedError('Arrow reveal session has been destroyed');
  }

  #prewarm(): void {
    if (this.#fullRing === undefined || this.#controls.length < 2) return;
    this.#polygon.copy(this.#fullRing);
    this.reveal(1 - Number.EPSILON, 'forward');
    this.reveal(1 - Number.EPSILON, 'reverse');
    this.#polygon.clear();
  }
}

function locatePathDistance(cumulativeLengths: readonly number[], targetLength: number): number {
  let low = 1;
  let high = cumulativeLengths.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulativeLengths[middle] < targetLength) low = middle + 1;
    else high = middle;
  }
  return low;
}

function appendUnique(output: MutableCoordinateList, index: number, source: Coordinate): number {
  if (index > 0 && samePlanarCoordinate(output.values[index - 1], source)) return index;
  output.copy(index, source);
  return index + 1;
}

function writePathReveal(
  source: readonly Coordinate[],
  cumulativeLengths: readonly number[],
  totalLength: number,
  progress: number,
  direction: ShapeAnimationDirection,
  output: MutableCoordinateList
): void {
  const targetLength = totalLength * progress;
  let outputIndex = 0;
  if (direction === 'forward') {
    const endIndex = locatePathDistance(cumulativeLengths, targetLength);
    for (let index = 0; index < endIndex; index += 1) outputIndex = appendUnique(output, outputIndex, source[index]);
    const start = source[endIndex - 1];
    const end = source[endIndex];
    const segmentLength = cumulativeLengths[endIndex] - cumulativeLengths[endIndex - 1];
    const ratio = segmentLength <= Number.EPSILON ? 0 : (targetLength - cumulativeLengths[endIndex - 1]) / segmentLength;
    const interpolated = output.interpolate(outputIndex, start, end, ratio);
    if (outputIndex === 0 || !samePlanarCoordinate(output.values[outputIndex - 1], interpolated)) outputIndex += 1;
  } else {
    const startLength = totalLength - targetLength;
    const startIndex = locatePathDistance(cumulativeLengths, startLength);
    const segmentStart = source[startIndex - 1];
    const segmentEnd = source[startIndex];
    const segmentLength = cumulativeLengths[startIndex] - cumulativeLengths[startIndex - 1];
    const ratio = segmentLength <= Number.EPSILON ? 0 : (startLength - cumulativeLengths[startIndex - 1]) / segmentLength;
    output.interpolate(outputIndex++, segmentStart, segmentEnd, ratio);
    for (let index = startIndex; index < source.length; index += 1) outputIndex = appendUnique(output, outputIndex, source[index]);
  }
  output.truncate(outputIndex);
}

class AttackArrowRevealSession implements ShapeRevealSession<AttackArrowState> {
  readonly #generator: ArrowGenerator;
  readonly #tailed: boolean;
  readonly #controls = new MutableCoordinateList();
  readonly #bone = new MutableCoordinateList();
  readonly #revealedBone = new MutableCoordinateList();
  readonly #revealedControls = new MutableCoordinateList();
  readonly #polygon = new MutableRevealPolygon();
  readonly #workspace = new ArrowCurveWorkspace();
  readonly #cumulativeLengths: number[] = [];
  #totalLength = 0;
  #fullRing: readonly Coordinate[] | undefined;
  #destroyed = false;

  constructor(viewState: Readonly<AttackArrowState>, generator: ArrowGenerator, tailed: boolean) {
    this.#generator = generator;
    this.#tailed = tailed;
    this.rebind(viewState);
  }

  rebind(viewState: Readonly<AttackArrowState>): void {
    this.#assertActive();
    this.#controls.copyAll(viewState.controlPoints);
    if (this.#controls.length < 3) {
      this.#bone.truncate(0);
      this.#cumulativeLengths.length = 0;
      this.#totalLength = 0;
      this.#fullRing = undefined;
      return;
    }
    writeMidpoint(this.#bone, 0, this.#controls.values[0], this.#controls.values[1]);
    for (let index = 2; index < this.#controls.length; index += 1) this.#bone.copy(index - 1, this.#controls.values[index]);
    this.#bone.truncate(this.#controls.length - 1);
    this.#cumulativeLengths.length = this.#bone.length;
    this.#cumulativeLengths[0] = 0;
    this.#totalLength = 0;
    for (let index = 1; index < this.#bone.length; index += 1) {
      this.#totalLength += distance(this.#bone.values[index - 1], this.#bone.values[index]);
      this.#cumulativeLengths[index] = this.#totalLength;
    }
    this.#fullRing = closeRing(this.#generator(this.#controls.values));
    this.#prewarm();
  }

  reveal(progress: number, direction: ShapeAnimationDirection): RenderGeometryState | undefined {
    this.#assertActive();
    const boundedProgress = boundedRevealProgress(progress, direction);
    if (boundedProgress === 0 || this.#controls.length < 3 || this.#totalLength <= 0) return this.#polygon.clear();
    if (boundedProgress === 1) return this.#polygon.copy(this.#fullRing ?? []);
    writePathReveal(this.#bone.values, this.#cumulativeLengths, this.#totalLength, boundedProgress, direction, this.#revealedBone);
    if (this.#revealedBone.length < 2) return this.#polygon.clear();
    if (direction === 'forward') {
      this.#revealedControls.copy(0, this.#controls.values[0]);
      this.#revealedControls.copy(1, this.#controls.values[1]);
    } else {
      const currentCenter = this.#revealedBone.values[0];
      const originalCenter = this.#bone.values[0];
      const left = this.#controls.values[0];
      const right = this.#controls.values[1];
      this.#revealedControls.set(
        0,
        currentCenter[0] + (left[0] - originalCenter[0]) * boundedProgress,
        currentCenter[1] + (left[1] - originalCenter[1]) * boundedProgress
      );
      this.#revealedControls.set(
        1,
        currentCenter[0] + (right[0] - originalCenter[0]) * boundedProgress,
        currentCenter[1] + (right[1] - originalCenter[1]) * boundedProgress
      );
    }
    for (let index = 1; index < this.#revealedBone.length; index += 1) this.#revealedControls.copy(index + 1, this.#revealedBone.values[index]);
    this.#revealedControls.truncate(this.#revealedBone.length + 1);
    try {
      const length = writeAttackArrowOutline(this.#revealedControls.values, this.#tailed, this.#polygon.ring, this.#workspace);
      return this.#polygon.finish(length);
    } catch (error) {
      if (error instanceof InvalidArgumentError) return this.#polygon.clear();
      throw error;
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#fullRing = undefined;
    this.#totalLength = 0;
    this.#cumulativeLengths.length = 0;
    this.#controls.destroy();
    this.#bone.destroy();
    this.#revealedBone.destroy();
    this.#revealedControls.destroy();
    this.#workspace.destroy();
    this.#polygon.destroy();
  }

  #assertActive(): void {
    if (this.#destroyed) throw new ObjectDisposedError('Arrow reveal session has been destroyed');
  }

  #prewarm(): void {
    if (this.#fullRing === undefined || this.#totalLength <= 0) return;
    this.#polygon.copy(this.#fullRing);
    this.reveal(1 - Number.EPSILON, 'forward');
    this.reveal(1 - Number.EPSILON, 'reverse');
    this.#polygon.clear();
  }
}

class DoubleArrowWorkspace {
  readonly arrow = new ArrowCurveWorkspace();
  readonly leftArrow = new MutableCoordinateList();
  readonly rightArrow = new MutableCoordinateList();
  readonly bezierControls = new MutableCoordinateList();
  readonly rightLeftCurve = new MutableCoordinateList();
  readonly bodyCurve = new MutableCoordinateList();
  readonly leftRightCurve = new MutableCoordinateList();

  destroy(): void {
    this.arrow.destroy();
    this.leftArrow.destroy();
    this.rightArrow.destroy();
    this.bezierControls.destroy();
    this.rightLeftCurve.destroy();
    this.bodyCurve.destroy();
    this.leftRightCurve.destroy();
  }
}

function writeDoubleArrowBranch(branch: readonly Coordinate[], clockWise: boolean, output: MutableCoordinateList, workspace: ArrowCurveWorkspace): void {
  const tail1 = branch[0];
  const tail2 = branch[1];
  const head = branch[2];
  const mid = writeMidpoint(workspace.bone, 0, tail1, tail2);
  const length = distance(mid, head);
  const mid1 = writeThirdPoint(workspace.bone, 1, head, mid, 0, length * 0.3, true);
  const mid2 = writeThirdPoint(workspace.bone, 2, head, mid, 0, length * 0.5, true);
  writeThirdPoint(workspace.bone, 1, mid, mid1, HALF_PI, length / 5, clockWise);
  writeThirdPoint(workspace.bone, 2, mid, mid2, HALF_PI, length / 4, clockWise);
  workspace.bone.copy(3, head);
  workspace.bone.truncate(4);
  writeArrowHeadPoints(workspace.bone.values, doubleFactors, workspace.head);
  const neckLeft = workspace.head.values[0];
  const neckRight = workspace.head.values[4];
  writeArrowBodyPoints(workspace.bone.values, neckLeft, neckRight, distance(tail1, tail2) / pathBaseLength(workspace.bone.values) / 2, workspace.body);
  const half = workspace.body.length / 2;
  let outputIndex = 0;
  output.copy(outputIndex++, tail2);
  for (let index = 0; index < half; index += 1) output.copy(outputIndex++, workspace.body.values[index]);
  output.copy(outputIndex++, neckLeft);
  for (let index = 0; index < workspace.head.length; index += 1) output.copy(outputIndex++, workspace.head.values[index]);
  output.copy(outputIndex++, neckRight);
  for (let index = half - 1; index >= 0; index -= 1) output.copy(outputIndex++, workspace.body.values[half + index]);
  output.copy(outputIndex++, tail1);
  output.truncate(outputIndex);
}

function copyRange(source: readonly Coordinate[], start: number, count: number, output: MutableCoordinateList, outputStart = 0): number {
  for (let index = 0; index < count; index += 1) output.copy(outputStart + index, source[start + index]);
  return outputStart + count;
}

function writeDoubleArrowOutline(
  leftBranch: readonly Coordinate[],
  leftClockWise: boolean,
  rightBranch: readonly Coordinate[],
  rightClockWise: boolean,
  output: MutableCoordinateList,
  workspace: DoubleArrowWorkspace
): number {
  writeDoubleArrowBranch(leftBranch, leftClockWise, workspace.leftArrow, workspace.arrow);
  writeDoubleArrowBranch(rightBranch, rightClockWise, workspace.rightArrow, workspace.arrow);
  const count = workspace.leftArrow.length;
  const bodyCount = (count - 5) / 2;

  copyRange(workspace.rightArrow.values, 0, bodyCount, workspace.bezierControls);
  workspace.bezierControls.truncate(bodyCount);
  writeBezier(workspace.bezierControls.values, workspace.rightLeftCurve);

  let controlCount = copyRange(workspace.rightArrow.values, bodyCount + 5, bodyCount, workspace.bezierControls);
  controlCount = copyRange(workspace.leftArrow.values, 1, bodyCount - 1, workspace.bezierControls, controlCount);
  workspace.bezierControls.truncate(controlCount);
  writeBezier(workspace.bezierControls.values, workspace.bodyCurve);

  copyRange(workspace.leftArrow.values, bodyCount + 5, bodyCount, workspace.bezierControls);
  workspace.bezierControls.truncate(bodyCount);
  writeBezier(workspace.bezierControls.values, workspace.leftRightCurve);

  let outputIndex = 0;
  for (let index = 0; index < workspace.rightLeftCurve.length; index += 1) output.copy(outputIndex++, workspace.rightLeftCurve.values[index]);
  outputIndex = copyRange(workspace.rightArrow.values, bodyCount, 5, output, outputIndex);
  for (let index = 0; index < workspace.bodyCurve.length; index += 1) output.copy(outputIndex++, workspace.bodyCurve.values[index]);
  outputIndex = copyRange(workspace.leftArrow.values, bodyCount, 5, output, outputIndex);
  for (let index = 0; index < workspace.leftRightCurve.length; index += 1) output.copy(outputIndex++, workspace.leftRightCurve.values[index]);
  output.truncate(outputIndex);
  return outputIndex;
}

class DoubleArrowRevealSession implements ShapeRevealSession<ShapeState<'double-arrow'>> {
  readonly #leftTemplate = new MutableCoordinateList();
  readonly #rightTemplate = new MutableCoordinateList();
  readonly #centers = new MutableCoordinateList();
  readonly #leftBranch = new MutableCoordinateList();
  readonly #rightBranch = new MutableCoordinateList();
  readonly #polygon = new MutableRevealPolygon();
  readonly #workspace = new DoubleArrowWorkspace();
  #leftClockWise = false;
  #rightClockWise = false;
  #fullRing: readonly Coordinate[] | undefined;
  #destroyed = false;

  constructor(viewState: Readonly<ShapeState<'double-arrow'>>) {
    this.rebind(viewState);
  }

  rebind(viewState: Readonly<ShapeState<'double-arrow'>>): void {
    this.#assertActive();
    if (viewState.controlPoints.length < 3) {
      this.#fullRing = undefined;
      this.#leftTemplate.truncate(0);
      this.#rightTemplate.truncate(0);
      return;
    }
    const points = completeDoubleArrowControlPoints(viewState.controlPoints);
    if (points.length !== 5) {
      this.#fullRing = undefined;
      this.#leftTemplate.truncate(0);
      this.#rightTemplate.truncate(0);
      return;
    }
    const branches = doubleArrowBranches(points);
    this.#leftTemplate.copy(0, branches[0].tail1);
    this.#leftTemplate.copy(1, branches[0].tail2);
    this.#leftTemplate.copy(2, branches[0].head);
    this.#leftTemplate.truncate(3);
    this.#rightTemplate.copy(0, branches[1].tail1);
    this.#rightTemplate.copy(1, branches[1].tail2);
    this.#rightTemplate.copy(2, branches[1].head);
    this.#rightTemplate.truncate(3);
    writeMidpoint(this.#centers, 0, branches[0].tail1, branches[0].tail2);
    writeMidpoint(this.#centers, 1, branches[1].tail1, branches[1].tail2);
    this.#centers.truncate(2);
    this.#leftClockWise = branches[0].clockWise;
    this.#rightClockWise = branches[1].clockWise;
    this.#fullRing = closeRing(doubleArrow(points));
    this.#prewarm();
  }

  reveal(progress: number, direction: ShapeAnimationDirection): RenderGeometryState | undefined {
    this.#assertActive();
    const boundedProgress = boundedRevealProgress(progress, direction);
    if (boundedProgress === 0 || this.#leftTemplate.length !== 3 || this.#rightTemplate.length !== 3) return this.#polygon.clear();
    if (boundedProgress === 1) return this.#polygon.copy(this.#fullRing ?? []);
    this.#writeBranch(this.#leftTemplate.values, this.#centers.values[0], boundedProgress, direction, this.#leftBranch);
    this.#writeBranch(this.#rightTemplate.values, this.#centers.values[1], boundedProgress, direction, this.#rightBranch);
    try {
      const length = writeDoubleArrowOutline(
        this.#leftBranch.values,
        this.#leftClockWise,
        this.#rightBranch.values,
        this.#rightClockWise,
        this.#polygon.ring,
        this.#workspace
      );
      return this.#polygon.finish(length);
    } catch (error) {
      if (error instanceof InvalidArgumentError) return this.#polygon.clear();
      throw error;
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#fullRing = undefined;
    this.#leftTemplate.destroy();
    this.#rightTemplate.destroy();
    this.#centers.destroy();
    this.#leftBranch.destroy();
    this.#rightBranch.destroy();
    this.#workspace.destroy();
    this.#polygon.destroy();
  }

  #writeBranch(template: readonly Coordinate[], center: Coordinate, progress: number, direction: ShapeAnimationDirection, output: MutableCoordinateList): void {
    if (direction === 'forward') {
      output.copy(0, template[0]);
      output.copy(1, template[1]);
      output.interpolate(2, center, template[2], progress);
    } else {
      output.interpolate(0, template[2], template[0], progress);
      output.interpolate(1, template[2], template[1], progress);
      output.copy(2, template[2]);
    }
    output.truncate(3);
  }

  #assertActive(): void {
    if (this.#destroyed) throw new ObjectDisposedError('Arrow reveal session has been destroyed');
  }

  #prewarm(): void {
    if (this.#fullRing === undefined) return;
    this.#polygon.copy(this.#fullRing);
    this.reveal(1 - Number.EPSILON, 'forward');
    this.reveal(1 - Number.EPSILON, 'reverse');
    this.#polygon.clear();
  }
}

function validateSegments(points: readonly Coordinate[]): void {
  if (points.some((point) => point.length !== 2)) throw new InvalidArgumentError('Plot shapes require two-dimensional control points');
  for (let index = 1; index < points.length; index += 1) requireSeparated(points, [index - 1, index]);
}

function validateFixedAreaArrow(points: readonly Coordinate[], outline: (points: readonly Coordinate[]) => Coordinate[]): void {
  validateSegments(points);
  const keyPoints = outline(points);
  assertFinitePoints(keyPoints);
  requireNonZeroPlanarArea(keyPoints, 'Arrow width offsets must remain distinct on the coordinate grid');
}

function validateGeneratedArrow(points: readonly Coordinate[], generator: (points: readonly Coordinate[]) => Coordinate[]): void {
  assertFinitePoints(generator(points));
}

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

function validateArrowPath(points: readonly Coordinate[]): void {
  validateSegments(points);
  if (points.length < 3) return;
  if (points.slice(2).every((point) => arePlanarCollinear(points[0], points[1], point))) {
    throw new InvalidArgumentError('Arrow control points must produce a non-zero area');
  }
  validateBonePath([midpoint(points[0], points[1]), ...points.slice(2)]);
}

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

function polygonRender(generator: (points: readonly Coordinate[]) => Coordinate[]) {
  return (points: readonly Coordinate[]) => {
    const ring = generator(points);
    assertFinitePoints(ring);
    return { type: 'polygon' as const, coordinates: [closeRing(ring)] };
  };
}

const attackArrowDefinition = createControlPointDefinition({
  type: 'attack-arrow',
  pathContour: 'closed',
  previewMin: 2,
  completeMin: 3,
  capabilities: plotStructuralAreaCapabilities,
  animation: {
    revealGeometry: (viewState, progress, direction) => attackArrowReveal(attackArrow, viewState, progress, direction),
    createRevealSession: (viewState) => new AttackArrowRevealSession(viewState, attackArrow, false)
  },
  topology: 'arrow',
  validate: (points) => {
    validateArrowPath(points);
    if (points.length >= 3) validateGeneratedArrow(points, attackArrow);
  },
  render: polygonRender(attackArrow)
});

const tailedAttackArrowDefinition = createControlPointDefinition({
  type: 'tailed-attack-arrow',
  pathContour: 'closed',
  previewMin: 2,
  completeMin: 3,
  capabilities: plotStructuralAreaCapabilities,
  animation: {
    revealGeometry: (viewState, progress, direction) => attackArrowReveal(tailedAttackArrow, viewState, progress, direction),
    createRevealSession: (viewState) => new AttackArrowRevealSession(viewState, tailedAttackArrow, true)
  },
  topology: 'arrow',
  validate: (points) => {
    validateArrowPath(points);
    if (points.length >= 3) validateGeneratedArrow(points, tailedAttackArrow);
  },
  render: polygonRender(tailedAttackArrow)
});

const fineArrowDefinition = createControlPointDefinition({
  type: 'fine-arrow',
  pathContour: 'closed',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  capabilities: plotAreaCapabilities,
  animation: {
    revealGeometry: (viewState, progress, direction) => fixedArrowReveal((points) => fineArrow(points, fineArrowFactors), viewState, progress, direction),
    createRevealSession: (viewState) => new FixedArrowRevealSession(viewState, (points) => fineArrow(points, fineArrowFactors), fineArrowFactors)
  },
  validate: (points) => validateFixedAreaArrow(points, (controlPoints) => fineArrow(controlPoints, fineArrowFactors)),
  render: polygonRender((points) => fineArrow(points, fineArrowFactors))
});

const tailedSquadCombatArrowDefinition = createControlPointDefinition({
  type: 'tailed-squad-combat-arrow',
  pathContour: 'closed',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  capabilities: plotAreaCapabilities,
  animation: {
    revealGeometry: (viewState, progress, direction) => fixedArrowReveal(tailedSquadCombatArrow, viewState, progress, direction),
    createRevealSession: (viewState) => new FixedArrowRevealSession(viewState, tailedSquadCombatArrow)
  },
  validate: (points) =>
    validateFixedAreaArrow(points, (controlPoints) => {
      const { tailLeft, tailRight, swallowTail, headPoints } = tailedSquadCombatArrowLayout(controlPoints);
      return [tailLeft, ...headPoints, tailRight, swallowTail];
    }),
  render: polygonRender(tailedSquadCombatArrow)
});

const assaultDirectionArrowDefinition = createControlPointDefinition({
  type: 'assault-direction-arrow',
  pathContour: 'closed',
  previewMin: 2,
  completeMin: 2,
  completeMax: 2,
  autoFinish: 2,
  capabilities: plotAreaCapabilities,
  animation: {
    revealGeometry: (viewState, progress, direction) =>
      fixedArrowReveal((points) => fineArrow(points, assaultDirectionArrowFactors), viewState, progress, direction),
    createRevealSession: (viewState) =>
      new FixedArrowRevealSession(viewState, (points) => fineArrow(points, assaultDirectionArrowFactors), assaultDirectionArrowFactors)
  },
  validate: (points) => validateFixedAreaArrow(points, (controlPoints) => fineArrow(controlPoints, assaultDirectionArrowFactors)),
  render: polygonRender((points) => fineArrow(points, assaultDirectionArrowFactors))
});

const doubleArrowDefinition = createControlPointDefinition({
  type: 'double-arrow',
  pathContour: 'closed',
  previewMin: 2,
  completeMin: 5,
  completeMax: 5,
  autoFinish: 4,
  capabilities: plotAreaCapabilities,
  animation: {
    revealGeometry: doubleArrowReveal,
    createRevealSession: (viewState) => new DoubleArrowRevealSession(viewState)
  },
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
    const points = completeDoubleArrowControlPoints(state.controlPoints);
    return {
      status: 'complete',
      state: {
        type: 'double-arrow',
        controlPoints: points
      }
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
