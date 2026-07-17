import type { GrowAnimationSpec } from '../../core/animation/types.js';
import type { Coordinate } from '../../core/common/types.js';
import { ObjectDisposedError } from '../../core/errors.js';
import type { RenderGeometryState, ShapeRevealSession } from '../../core/shape/types.js';
import type { AnimationDefinition, AnimationRuntime, AnimationTargetProfile } from '../../services/animation/types.js';
import {
  assertRevealGeometry,
  continuousSample,
  continuousUntil,
  finishedSample,
  pauseAndSuppressInteractionPolicy,
  requirements,
  writeDomains
} from './effectRuntime.js';
import { animationFinishedAt, growProgressAt } from './timeline.js';
import { animationRecord, boolean, channel, choice, literal, positive } from './validation.js';

/** 已补齐默认值并通过严格校验的 grow 配置。 */
export type NormalizedGrowAnimationSpec = Readonly<Required<GrowAnimationSpec>>;

/** 严格校验并补齐 grow 配置。 */
export function normalizeGrowAnimationSpec(input: unknown): NormalizedGrowAnimationSpec {
  const record = animationRecord(input, 'grow', ['type', 'channel', 'durationMs', 'direction', 'easing', 'repeat']);
  return Object.freeze({
    type: literal(record.type, 'grow', 'Grow type'),
    channel: channel(record.channel, 'grow', 'Grow channel'),
    durationMs: positive(record.durationMs, 1200, 'Grow durationMs'),
    direction: choice(record.direction, 'forward', ['forward', 'reverse'], 'Grow direction'),
    easing: choice(record.easing, 'linear', ['linear', 'ease-in', 'ease-out', 'ease-in-out'], 'Grow easing'),
    repeat: boolean(record.repeat, false, 'Grow repeat')
  });
}

/** 通过目标中间几何揭示路径或箭头的内置 grow 定义。 */
export const growAnimationDefinition = Object.freeze({
  type: 'grow',
  writeDomains: writeDomains('target-geometry'),
  requirements: requirements('structured-presentation', 'reveal-geometry'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeGrowAnimationSpec,
  assertCompatible: assertRevealGeometry,
  create(target, input) {
    assertRevealGeometry(target);
    return growRuntime(target, input as NormalizedGrowAnimationSpec);
  }
} satisfies AnimationDefinition<GrowAnimationSpec>);

interface RevealPathMetrics {
  readonly source: readonly Coordinate[];
  readonly cumulativeLengths: readonly number[];
  readonly totalLength: number;
}

interface MutablePolylineGeometry {
  readonly type: 'polyline';
  readonly coordinates: Coordinate[];
}

function growRuntime(initialTarget: AnimationTargetProfile, spec: NormalizedGrowAnimationSpec): AnimationRuntime {
  let target: AnimationTargetProfile | undefined = initialTarget;
  const runningSample = spec.repeat ? continuousSample : continuousUntil(spec.durationMs);
  let metrics = initialTarget.geometry.type === 'polyline' ? createPathMetrics(initialTarget.geometry.coordinates) : undefined;
  let revealSession = initialTarget.geometry.type === 'polyline' ? undefined : createRevealSession(initialTarget);
  const polylineGeometry: MutablePolylineGeometry = { type: 'polyline', coordinates: [] };
  const coordinatePool: number[][] = [];
  return {
    slots: Object.freeze([]),
    disableViewportCulling: initialTarget.geometry.type !== 'polyline',
    rebind(nextTarget) {
      if (target === undefined) throw new ObjectDisposedError('Grow animation runtime has been destroyed');
      assertRevealGeometry(nextTarget);
      if (nextTarget.geometry.type !== 'polyline') {
        metrics = undefined;
        const factory = nextTarget.shape.animation?.createRevealSession;
        if (factory === undefined) {
          revealSession?.destroy();
          revealSession = undefined;
        } else if (revealSession !== undefined && factory === target.shape.animation?.createRevealSession) {
          revealSession.rebind(nextTarget.viewShape);
        } else {
          const replacement = factory(nextTarget.viewShape);
          revealSession?.destroy();
          revealSession = replacement;
        }
      } else {
        revealSession?.destroy();
        revealSession = undefined;
        if (metrics?.source !== nextTarget.geometry.coordinates) metrics = createPathMetrics(nextTarget.geometry.coordinates);
      }
      target = nextTarget;
    },
    sample(context, output) {
      output.reset();
      if (target === undefined) throw new ObjectDisposedError('Grow animation runtime has been destroyed');
      if (animationFinishedAt(context.elapsedMs, spec.durationMs, spec.repeat)) return finishedSample;
      const progress = growProgressAt(context.elapsedMs, spec.durationMs, spec.repeat, spec.easing);
      if (progress <= 0) {
        output.targetGeometry = undefined;
        return runningSample;
      }
      if (target.geometry.type === 'polyline') {
        metrics ??= createPathMetrics(target.geometry.coordinates);
        output.targetGeometry = revealPolyline(metrics, progress, spec.direction, polylineGeometry, coordinatePool);
      } else {
        output.targetGeometry =
          revealSession === undefined
            ? target.shape.animation?.revealGeometry?.(target.viewShape, progress, spec.direction)
            : revealSession.reveal(progress, spec.direction);
      }
      return runningSample;
    },
    destroy() {
      metrics = undefined;
      revealSession?.destroy();
      revealSession = undefined;
      target = undefined;
      coordinatePool.length = 0;
      polylineGeometry.coordinates.length = 0;
    }
  };
}

/** 优先建立 Shape 拥有的可复用 reveal 会话；旧 provider 继续作为兼容回退。 */
function createRevealSession(target: AnimationTargetProfile): ShapeRevealSession | undefined {
  return target.shape.animation?.createRevealSession?.(target.viewShape);
}

function createPathMetrics(coordinates: readonly Coordinate[]): RevealPathMetrics {
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    totalLength += Math.hypot(coordinates[index][0] - coordinates[index - 1][0], coordinates[index][1] - coordinates[index - 1][1]);
    cumulativeLengths.push(totalLength);
  }
  return { source: coordinates, cumulativeLengths, totalLength };
}

function revealPolyline(
  metrics: RevealPathMetrics,
  progress: number,
  direction: 'forward' | 'reverse',
  geometry: MutablePolylineGeometry,
  coordinatePool: number[][]
): RenderGeometryState | undefined {
  const targetLength = metrics.totalLength * progress;
  if (targetLength <= Number.EPSILON) return undefined;
  const coordinates = geometry.coordinates;
  if (direction === 'forward') {
    const endIndex = locateLengthIndex(metrics, targetLength);
    for (let index = 0; index < endIndex; index += 1) writeCoordinate(coordinates, coordinatePool, index, metrics.source[index]);
    writeInterpolatedCoordinate(coordinates, coordinatePool, endIndex, metrics, endIndex, targetLength);
    coordinates.length = endIndex + 1;
    return coordinates.length >= 2 ? geometry : undefined;
  }
  const startLength = metrics.totalLength - targetLength;
  const startIndex = locateLengthIndex(metrics, startLength);
  writeInterpolatedCoordinate(coordinates, coordinatePool, 0, metrics, startIndex, startLength);
  const segmentLength = metrics.cumulativeLengths[startIndex] - metrics.cumulativeLengths[startIndex - 1];
  const ratio = segmentLength <= Number.EPSILON ? 0 : (startLength - metrics.cumulativeLengths[startIndex - 1]) / segmentLength;
  let outputIndex = 1;
  for (let index = ratio >= 1 ? startIndex + 1 : startIndex; index < metrics.source.length; index += 1) {
    writeCoordinate(coordinates, coordinatePool, outputIndex, metrics.source[index]);
    outputIndex += 1;
  }
  coordinates.length = outputIndex;
  return coordinates.length >= 2 ? geometry : undefined;
}

function locateLengthIndex(metrics: RevealPathMetrics, targetLength: number): number {
  const clamped = Math.max(0, Math.min(metrics.totalLength, targetLength));
  let low = 1;
  let high = metrics.cumulativeLengths.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (metrics.cumulativeLengths[middle] < clamped) low = middle + 1;
    else high = middle;
  }
  return low;
}

function writeInterpolatedCoordinate(
  output: Coordinate[],
  pool: number[][],
  outputIndex: number,
  metrics: RevealPathMetrics,
  segmentEndIndex: number,
  targetLength: number
): void {
  const startIndex = Math.max(0, segmentEndIndex - 1);
  const start = metrics.source[startIndex];
  const end = metrics.source[segmentEndIndex];
  const segmentLength = metrics.cumulativeLengths[segmentEndIndex] - metrics.cumulativeLengths[startIndex];
  const ratio = segmentLength <= Number.EPSILON ? 0 : (targetLength - metrics.cumulativeLengths[startIndex]) / segmentLength;
  const coordinate = coordinateAt(pool, outputIndex, start.length === 3 || end.length === 3 ? 3 : 2);
  coordinate[0] = start[0] + (end[0] - start[0]) * ratio;
  coordinate[1] = start[1] + (end[1] - start[1]) * ratio;
  if (coordinate.length === 3) coordinate[2] = (start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * ratio;
  output[outputIndex] = coordinate as unknown as Coordinate;
}

function writeCoordinate(output: Coordinate[], pool: number[][], index: number, source: Coordinate): void {
  const coordinate = coordinateAt(pool, index, source.length);
  coordinate[0] = source[0];
  coordinate[1] = source[1];
  if (coordinate.length === 3) coordinate[2] = source[2] ?? 0;
  output[index] = coordinate as unknown as Coordinate;
}

function coordinateAt(pool: number[][], index: number, dimension: number): number[] {
  const current = pool[index];
  if (current !== undefined && current.length === dimension) return current;
  const created = Array.from({ length: dimension }, () => 0);
  pool[index] = created;
  return created;
}
