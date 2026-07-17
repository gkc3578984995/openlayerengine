import type { CenterSpreadAnimationSpec } from '../../core/animation/types.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ShapeRadialFrame } from '../../core/shape/types.js';
import type { AnimationDefinition, AnimationRuntime, AnimationSlotDefinition } from '../../services/animation/types.js';
import {
  continuousSample,
  continuousUntil,
  finishedSample,
  pauseAndSuppressInteractionPolicy,
  radialFrameFor,
  requirements,
  stableSample,
  stableUntil,
  writeDomains
} from './effectRuntime.js';
import { RadialArcSamplingCache } from './radialArcSampling.js';
import { centerSpreadFinishedAt, centerSpreadRingProgressAt } from './timeline.js';
import { animationRecord, boolean, channel, color, integerRange, literal, nonNegative, positive } from './validation.js';

/** 已补齐默认值并通过严格校验的 center-spread 配置。 */
export type NormalizedCenterSpreadAnimationSpec = Readonly<Required<CenterSpreadAnimationSpec>>;

/** 严格校验并补齐 center-spread 配置。 */
export function normalizeCenterSpreadAnimationSpec(input: unknown): NormalizedCenterSpreadAnimationSpec {
  const record = animationRecord(input, 'center-spread', ['type', 'channel', 'periodMs', 'color', 'strokeWidth', 'ringCount', 'repeat']);
  return Object.freeze({
    type: literal(record.type, 'center-spread', 'Center-spread type'),
    channel: channel(record.channel, 'center-spread', 'Center-spread channel'),
    periodMs: positive(record.periodMs, 1600, 'Center-spread periodMs'),
    color: color(record.color, '#00e5ff', 'Center-spread color'),
    strokeWidth: nonNegative(record.strokeWidth, 2, 'Center-spread strokeWidth'),
    ringCount: integerRange(record.ringCount, 3, 1, 5, 'Center-spread ringCount'),
    repeat: boolean(record.repeat, true, 'Center-spread repeat')
  });
}

/** 从径向目标中心绘制固定数量扩散环的内置定义。 */
export const centerSpreadAnimationDefinition = Object.freeze({
  type: 'center-spread',
  writeDomains: writeDomains('overlay'),
  requirements: requirements('structured-presentation', 'radial-frame'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeCenterSpreadAnimationSpec,
  assertCompatible(target) {
    radialFrameFor(target);
  },
  create(target, input) {
    return centerSpreadRuntime(radialFrameFor(target), input as NormalizedCenterSpreadAnimationSpec);
  }
} satisfies AnimationDefinition<CenterSpreadAnimationSpec>);

function centerSpreadRuntime(initialFrame: ShapeRadialFrame, spec: NormalizedCenterSpreadAnimationSpec): AnimationRuntime {
  let radialFrame = initialFrame;
  const completionElapsedMs = spec.periodMs + ((spec.ringCount - 1) * spec.periodMs) / spec.ringCount;
  const runningSample =
    spec.strokeWidth > 0
      ? spec.repeat
        ? continuousSample
        : continuousUntil(completionElapsedMs)
      : spec.repeat
        ? stableSample
        : stableUntil(completionElapsedMs);
  const slotKeys = Object.freeze(Array.from({ length: spec.ringCount }, (_, index) => `center-spread-${index}`));
  const slots: readonly AnimationSlotDefinition[] = Object.freeze(
    slotKeys.map((slotKey) =>
      Object.freeze({
        slotKey,
        style: Object.freeze({ strokes: [Object.freeze({ color: spec.color, width: spec.strokeWidth })] })
      })
    )
  );
  const geometryBuffers = slotKeys.map(() => createSpreadGeometryBuffer());
  const arcSampling = new RadialArcSamplingCache();
  return {
    slots,
    rebind(target) {
      radialFrame = radialFrameFor(target);
    },
    sample(context, output) {
      output.reset();
      if (centerSpreadFinishedAt(context.elapsedMs, spec.periodMs, spec.ringCount, spec.repeat)) return finishedSample;
      const fullCircle = radialFrame.sweepAngleRad >= Math.PI * 2 - Number.EPSILON;
      if (!fullCircle && arcSampling.update(radialFrame.radius, radialFrame.sweepAngleRad, context.resolution, radialFrame.center.length)) {
        for (const geometryBuffer of geometryBuffers) prepareSpreadGeometryBuffer(geometryBuffer, arcSampling.segmentCount, radialFrame.center.length);
      }
      for (let index = 0; index < spec.ringCount; index += 1) {
        const progress = centerSpreadRingProgressAt(context.elapsedMs, spec.periodMs, spec.ringCount, index, spec.repeat);
        if (progress === undefined || progress <= Number.EPSILON || spec.strokeWidth <= 0) continue;
        const slot = output.overlay(slotKeys[index]);
        const geometryBuffer = geometryBuffers[index];
        slot.active = true;
        slot.geometryKind = 'snapshot';
        slot.geometry = writeSpreadGeometry(geometryBuffer, radialFrame, radialFrame.radius * progress, fullCircle, arcSampling.segmentCount);
        slot.opacity = 1 - progress;
      }
      return runningSample;
    },
    destroy() {
      for (const buffer of geometryBuffers) {
        buffer.polyline.coordinates.length = 0;
        buffer.coordinatePool.length = 0;
      }
    }
  };
}

interface MutableCircleGeometry {
  readonly type: 'circle';
  center: Coordinate;
  radius: number;
}

interface MutablePolylineGeometry {
  readonly type: 'polyline';
  readonly coordinates: Coordinate[];
}

interface SpreadGeometryBuffer {
  readonly circle: MutableCircleGeometry;
  readonly polyline: MutablePolylineGeometry;
  readonly coordinatePool: number[][];
}

function createSpreadGeometryBuffer(): SpreadGeometryBuffer {
  return {
    circle: { type: 'circle', center: [0, 0], radius: 0 },
    polyline: { type: 'polyline', coordinates: [] },
    coordinatePool: []
  };
}

function prepareSpreadGeometryBuffer(buffer: SpreadGeometryBuffer, segmentCount: number, dimension: number): void {
  const coordinates = buffer.polyline.coordinates;
  for (let index = 0; index <= segmentCount; index += 1) coordinates[index] = coordinateAt(buffer.coordinatePool, index, dimension) as unknown as Coordinate;
  coordinates.length = segmentCount + 1;
}

function writeSpreadGeometry(
  buffer: SpreadGeometryBuffer,
  frame: ShapeRadialFrame,
  radius: number,
  fullCircle: boolean,
  segmentCount: number
): MutableCircleGeometry | MutablePolylineGeometry {
  if (fullCircle) {
    buffer.circle.center = writeCoordinate(buffer.coordinatePool, 0, frame.center);
    buffer.circle.radius = radius;
    return buffer.circle;
  }
  const coordinates = buffer.polyline.coordinates;
  for (let index = 0; index <= segmentCount; index += 1) {
    writeRadialCoordinate(coordinates[index] as unknown as number[], frame.center, radius, frame.startAngleRad + (frame.sweepAngleRad * index) / segmentCount);
  }
  return buffer.polyline;
}

function writeCoordinate(pool: number[][], index: number, source: Coordinate): Coordinate {
  const coordinate = coordinateAt(pool, index, source.length);
  coordinate[0] = source[0];
  coordinate[1] = source[1];
  if (coordinate.length === 3) coordinate[2] = source[2] ?? 0;
  return coordinate as unknown as Coordinate;
}

function writeRadialCoordinate(coordinate: number[], center: Coordinate, radius: number, angle: number): void {
  coordinate[0] = center[0] + radius * Math.cos(angle);
  coordinate[1] = center[1] + radius * Math.sin(angle);
  if (coordinate.length === 3) coordinate[2] = center[2] ?? 0;
}

function coordinateAt(pool: number[][], index: number, dimension: number): number[] {
  const current = pool[index];
  if (current !== undefined && current.length === dimension) return current;
  const created = Array.from({ length: dimension }, () => 0);
  pool[index] = created;
  return created;
}
