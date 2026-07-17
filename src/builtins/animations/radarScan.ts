import type { RadarScanAnimationSpec } from '../../core/animation/types.js';
import type { Color, Coordinate } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
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
import { animationFinishedAt, radarScanProgressAt } from './timeline.js';
import { RadialArcSamplingCache } from './radialArcSampling.js';
import { normalizeColorGradient, sampleColorGradient } from './colorGradient.js';
import { animationRecord, boolean, channel, choice, color, literal, positive, unitInterval } from './validation.js';

/** 已补齐默认值并通过严格校验的 radar-scan 配置。 */
export type NormalizedRadarScanAnimationSpec = Readonly<
  Required<Omit<RadarScanAnimationSpec, 'color' | 'gradient'>> &
    (
      | { readonly color: Color; readonly gradient?: undefined }
      | { readonly color?: undefined; readonly gradient: readonly (readonly [offset: number, color: Color])[] }
    )
>;

/** 严格校验并补齐 radar-scan 配置。 */
export function normalizeRadarScanAnimationSpec(input: unknown): NormalizedRadarScanAnimationSpec {
  const record = animationRecord(input, 'radar-scan', ['type', 'channel', 'periodMs', 'direction', 'color', 'gradient', 'opacity', 'beamWidthDeg', 'repeat']);
  if (record.color !== undefined && record.gradient !== undefined) {
    throw new InvalidArgumentError('Radar-scan color and gradient are mutually exclusive');
  }
  const beamWidthDeg = positive(record.beamWidthDeg, 45, 'Radar-scan beamWidthDeg');
  if (beamWidthDeg > 360) throw new InvalidArgumentError('Radar-scan beamWidthDeg must not exceed 360');
  return Object.freeze({
    type: literal(record.type, 'radar-scan', 'Radar-scan type'),
    channel: channel(record.channel, 'radar-scan', 'Radar-scan channel'),
    periodMs: positive(record.periodMs, 2000, 'Radar-scan periodMs'),
    direction: choice(record.direction, 'clockwise', ['clockwise', 'counterclockwise'], 'Radar-scan direction'),
    ...(record.gradient === undefined
      ? { color: color(record.color, '#00e676', 'Radar-scan color') }
      : { gradient: normalizeColorGradient(record.gradient, 'Radar-scan gradient') }),
    opacity: unitInterval(record.opacity, 0.35, 'Radar-scan opacity'),
    beamWidthDeg,
    repeat: boolean(record.repeat, true, 'Radar-scan repeat')
  });
}

const radarTailSlotCount = 10;
const radarTailSlotKeys = Object.freeze(Array.from({ length: radarTailSlotCount }, (_, index) => `radar-tail-${index}`));

/** 在径向目标内绘制固定槽尾迹的内置 radar-scan 定义。 */
export const radarScanAnimationDefinition = Object.freeze({
  type: 'radar-scan',
  writeDomains: writeDomains('overlay'),
  requirements: requirements('structured-presentation', 'radial-frame'),
  interactionPolicy: pauseAndSuppressInteractionPolicy,
  normalize: normalizeRadarScanAnimationSpec,
  assertCompatible(target) {
    radialFrameFor(target);
  },
  create(target, input) {
    return radarScanRuntime(radialFrameFor(target), input as NormalizedRadarScanAnimationSpec);
  }
} satisfies AnimationDefinition<RadarScanAnimationSpec>);

function radarScanRuntime(initialFrame: ShapeRadialFrame, spec: NormalizedRadarScanAnimationSpec): AnimationRuntime {
  let radialFrame = initialFrame;
  const runningSample =
    spec.opacity > 0 ? (spec.repeat ? continuousSample : continuousUntil(spec.periodMs)) : spec.repeat ? stableSample : stableUntil(spec.periodMs);
  const slots: readonly AnimationSlotDefinition[] = Object.freeze(
    radarTailSlotKeys.map((slotKey, index) => {
      const fillColor = spec.gradient === undefined ? spec.color : sampleColorGradient(spec.gradient, 1 - index / (radarTailSlotCount - 1));
      return Object.freeze({
        slotKey,
        style: Object.freeze({ fill: Object.freeze({ type: 'solid' as const, color: fillColor }) })
      });
    })
  );
  const geometryBuffers = radarTailSlotKeys.map(() => createRadarGeometryBuffer());
  const arcSampling = new RadialArcSamplingCache();
  return {
    slots,
    rebind(target) {
      radialFrame = radialFrameFor(target);
    },
    sample(context, output) {
      output.reset();
      if (animationFinishedAt(context.elapsedMs, spec.periodMs, spec.repeat)) return finishedSample;
      const phase = radarScanProgressAt(context.elapsedMs, spec.periodMs, spec.repeat);
      const beamWidthRad = Math.min((spec.beamWidthDeg * Math.PI) / 180, radialFrame.sweepAngleRad);
      const sliceWidth = beamWidthRad / radarTailSlotCount;
      if (arcSampling.update(radialFrame.radius, sliceWidth, context.resolution, radialFrame.center.length)) {
        for (const geometryBuffer of geometryBuffers) prepareRadarGeometryBuffer(geometryBuffer, arcSampling.segmentCount, radialFrame.center.length);
      }
      const distance = phase * radialFrame.sweepAngleRad;
      const wraps = spec.repeat && radialFrame.sweepAngleRad >= Math.PI * 2 - Number.EPSILON;
      for (let index = 0; index < radarTailSlotCount; index += 1) {
        const slot = output.overlay(radarTailSlotKeys[index]);
        let motionEnd = distance - index * sliceWidth;
        let motionStart = motionEnd - sliceWidth;
        if (!wraps) {
          motionStart = Math.max(0, motionStart);
          motionEnd = Math.min(radialFrame.sweepAngleRad, motionEnd);
        }
        if (motionEnd - motionStart <= Number.EPSILON) continue;
        const geometryBuffer = geometryBuffers[index];
        writeRadarWedge(geometryBuffer, radialFrame, motionStart, motionEnd, spec.direction, arcSampling.segmentCount);
        slot.active = true;
        slot.geometryKind = 'snapshot';
        slot.geometry = geometryBuffer.geometry;
        slot.opacity = spec.opacity * (1 - index / radarTailSlotCount);
      }
      return runningSample;
    },
    destroy() {
      for (const buffer of geometryBuffers) {
        buffer.ring.length = 0;
        buffer.coordinatePool.length = 0;
      }
    }
  };
}

interface RadarGeometryBuffer {
  readonly geometry: { readonly type: 'polygon'; readonly coordinates: readonly Coordinate[][] };
  readonly ring: Coordinate[];
  readonly coordinatePool: number[][];
}

function createRadarGeometryBuffer(): RadarGeometryBuffer {
  const ring: Coordinate[] = [];
  return { geometry: { type: 'polygon', coordinates: [ring] }, ring, coordinatePool: [] };
}

function prepareRadarGeometryBuffer(buffer: RadarGeometryBuffer, segmentCount: number, dimension: number): void {
  const coordinateCount = segmentCount + 3;
  for (let index = 0; index < coordinateCount; index += 1) buffer.ring[index] = coordinateAt(buffer.coordinatePool, index, dimension) as unknown as Coordinate;
  buffer.ring.length = coordinateCount;
}

function writeRadarWedge(
  buffer: RadarGeometryBuffer,
  frame: ShapeRadialFrame,
  motionStart: number,
  motionEnd: number,
  direction: 'clockwise' | 'counterclockwise',
  segmentCount: number
): void {
  const startAngle = direction === 'counterclockwise' ? frame.startAngleRad + motionStart : frame.startAngleRad + frame.sweepAngleRad - motionEnd;
  const endAngle = direction === 'counterclockwise' ? frame.startAngleRad + motionEnd : frame.startAngleRad + frame.sweepAngleRad - motionStart;
  writeCoordinate(buffer.ring[0] as unknown as number[], frame.center);
  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = startAngle + ((endAngle - startAngle) * index) / segmentCount;
    writeRadialCoordinate(buffer.ring[index + 1] as unknown as number[], frame.center, frame.radius, angle);
  }
  writeCoordinate(buffer.ring[segmentCount + 2] as unknown as number[], frame.center);
}

function writeCoordinate(coordinate: number[], source: Coordinate): void {
  coordinate[0] = source[0];
  coordinate[1] = source[1];
  if (coordinate.length === 3) coordinate[2] = source[2] ?? 0;
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
