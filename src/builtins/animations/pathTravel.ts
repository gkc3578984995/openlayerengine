import type { PathTravelAnimationSpec } from '../../core/animation/types.js';
import type { Color, Coordinate } from '../../core/common/types.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type { RenderGeometryState } from '../../core/shape/types.js';
import type { StyleSpec } from '../../core/style/types.js';
import type {
  AnimationDefinition,
  AnimationFrameBuffer,
  AnimationFrameContext,
  AnimationRuntime,
  AnimationSample,
  AnimationSlotDefinition,
  AnimationTargetProfile
} from '../../services/animation/types.js';
import { normalizeColorGradient, sampleColorGradient } from './colorGradient.js';
import { animationRecord, boolean, channel, copyColor, finite, optionalColor, positive } from './validation.js';

/** 渐变尾迹使用固定槽位，避免采样点越多就创建越多渲染对象。 */
const gradientSlotCount = 24;
const gradientSlotKeys = Object.freeze(Array.from({ length: gradientSlotCount }, (_, index) => `trail-${index}`));
const splineLengthProbeCount = 8;
const minimumCurvedSamplesPerSegment = 2;
const continuousSample = Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }) });
const removedSample = Object.freeze({ finished: true, schedule: Object.freeze({ kind: 'stable' as const }) });
const retainedSample = Object.freeze({ finished: true, retain: true, schedule: Object.freeze({ kind: 'stable' as const }) });

interface TravelPathMetrics {
  readonly sourceCoordinates: readonly Coordinate[];
  readonly curvature: number;
  readonly smoothness: number;
  readonly path: readonly Coordinate[];
  readonly cumulativeLengths: readonly number[];
  readonly totalLength: number;
}

interface MutablePolylineGeometry {
  readonly type: 'polyline';
  readonly coordinates: Coordinate[];
}

interface MutablePointGeometry {
  readonly type: 'point';
  coordinates: Coordinate;
}

interface CentripetalSplineSegment {
  readonly start: Coordinate;
  readonly end: Coordinate;
  readonly startTangent: readonly [number, number];
  readonly endTangent: readonly [number, number];
  readonly dimension: 2 | 3;
}

export const pathTravelAnimationDefinition = Object.freeze({
  type: 'path-travel',
  writeDomains: new Set(['overlay'] as const),
  requirements: new Set(['structured-presentation'] as const),
  interactionPolicy: Object.freeze({ edit: 'pause-and-suppress', transform: 'follow-preview' }),
  normalize(input) {
    const record = animationRecord(input, 'path-travel', [
      'type',
      'channel',
      'speed',
      'durationMs',
      'repeat',
      'trailLength',
      'color',
      'gradient',
      'width',
      'curvature',
      'smoothness',
      'showStart',
      'showEnd',
      'endLineColor',
      'finishBehavior'
    ]);
    if (record.type !== 'path-travel') throw new CapabilityError('Path-travel animation type must be path-travel');
    if (record.speed !== undefined && record.durationMs !== undefined) {
      throw new InvalidArgumentError('Path-travel speed and durationMs are mutually exclusive');
    }
    const trailLength = positive(record.trailLength, 0.25, 'Path-travel trailLength');
    if (trailLength > 1) throw new InvalidArgumentError('Path-travel trailLength must not exceed one');
    const smoothness = positiveInteger(record.smoothness, 180, 'Path-travel smoothness');
    if (smoothness > 2048) throw new InvalidArgumentError('Path-travel smoothness must not exceed 2048');
    const finishBehavior = record.finishBehavior ?? 'remove';
    if (finishBehavior !== 'remove' && finishBehavior !== 'retain') {
      throw new InvalidArgumentError('Path-travel finishBehavior must be remove or retain');
    }
    const spec: PathTravelAnimationSpec = {
      type: 'path-travel',
      channel: channel(record.channel, 'path-travel', 'Path-travel channel'),
      ...(record.speed === undefined
        ? { durationMs: positive(record.durationMs, 2000, 'Path-travel durationMs') }
        : { speed: positive(record.speed, 1, 'Path-travel speed') }),
      repeat: boolean(record.repeat, true, 'Path-travel repeat'),
      trailLength,
      ...(record.color === undefined ? {} : { color: optionalColor(record.color, 'Path-travel color') }),
      ...(record.gradient === undefined ? {} : { gradient: normalizeColorGradient(record.gradient, 'Path-travel gradient') }),
      width: positive(record.width, 2, 'Path-travel width'),
      curvature: finite(record.curvature, 0, 'Path-travel curvature'),
      smoothness,
      showStart: boolean(record.showStart, true, 'Path-travel showStart'),
      showEnd: boolean(record.showEnd, true, 'Path-travel showEnd'),
      ...(record.endLineColor === undefined ? {} : { endLineColor: optionalColor(record.endLineColor, 'Path-travel endLineColor') }),
      finishBehavior
    };
    return Object.freeze(spec);
  },
  assertCompatible(target) {
    assertPolyline(target);
  },
  create(target, spec) {
    assertPolyline(target);
    return createPathTravelRuntime(target, spec);
  }
} satisfies AnimationDefinition<PathTravelAnimationSpec>);

function createPathTravelRuntime(initialTarget: AnimationTargetProfile, spec: Readonly<PathTravelAnimationSpec>): AnimationRuntime {
  assertPolyline(initialTarget);
  let metrics = createTravelPathMetrics(initialTarget.geometry.coordinates, spec);
  let runningSample = createRunningSample(metrics, spec);
  let slots = createSlots(initialTarget, spec);
  const geometries = new Map<string, MutablePolylineGeometry | MutablePointGeometry>();

  const polyline = (key: string): MutablePolylineGeometry => {
    const current = geometries.get(key);
    if (current?.type === 'polyline') return current;
    const created: MutablePolylineGeometry = { type: 'polyline', coordinates: [] };
    geometries.set(key, created);
    return created;
  };
  const point = (key: string): MutablePointGeometry => {
    const current = geometries.get(key);
    if (current?.type === 'point') return current;
    const created: MutablePointGeometry = { type: 'point', coordinates: [0, 0] };
    geometries.set(key, created);
    return created;
  };

  return {
    get slots() {
      return slots;
    },
    disableViewportCulling: spec.curvature !== undefined && spec.curvature !== 0,
    rebind(next) {
      assertPolyline(next);
      metrics = createTravelPathMetrics(next.geometry.coordinates, spec);
      runningSample = createRunningSample(metrics, spec);
      slots = createSlots(next, spec);
    },
    sample(context: AnimationFrameContext, output: AnimationFrameBuffer): AnimationSample {
      output.reset();
      const rawProgress =
        spec.durationMs === undefined
          ? (context.elapsedMs / 1000) * ((spec.speed ?? 1) / Math.max(metrics.totalLength, Number.EPSILON))
          : context.elapsedMs / spec.durationMs;
      const finished = spec.repeat !== true && rawProgress >= 1;
      if (finished && spec.finishBehavior !== 'retain') return removedSample;

      const progress = finished ? 1 : spec.repeat === true ? positiveModulo(rawProgress, 1) : Math.min(1, rawProgress);
      const from = finished ? 0 : Math.max(0, progress - (spec.trailLength ?? 0.25));
      if (finished) {
        if (spec.gradient !== undefined && spec.endLineColor === undefined) {
          writeRetainedGradient(output, geometries, metrics);
        } else {
          const retained = polyline('retained-line');
          writeWholePath(retained, metrics.path);
          activateSnapshot(output, 'retained-line', retained);
        }
      } else if (spec.gradient === undefined) {
        const trail = polyline('trail-0');
        writeSampledTrail(trail, metrics, from, progress, spec.smoothness ?? 180);
        activateSnapshot(output, 'trail-0', trail);
      } else {
        writeGradientTrail(output, geometries, metrics, from, progress, spec.smoothness ?? 180);
      }

      if (spec.showStart === true) {
        const key = finished && spec.endLineColor !== undefined ? 'retained-start' : 'start';
        const start = point(key);
        start.coordinates = copyCoordinate(start.coordinates, metrics.path[0]);
        activateSnapshot(output, key, start);
      }
      if (spec.showEnd === true) {
        const key = finished && spec.endLineColor !== undefined ? 'retained-end' : 'end';
        const end = point(key);
        end.coordinates = copyCoordinate(end.coordinates, metrics.path[metrics.path.length - 1]);
        activateSnapshot(output, key, end);
      }
      return finished ? retainedSample : runningSample;
    },
    destroy() {
      geometries.clear();
    }
  };
}

function createRunningSample(metrics: TravelPathMetrics, spec: Readonly<PathTravelAnimationSpec>): AnimationSample {
  if (spec.repeat === true) return continuousSample;
  const wakeAtElapsedMs = spec.durationMs ?? (metrics.totalLength / Math.max(spec.speed ?? 1, Number.EPSILON)) * 1000;
  return Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }), wakeAtElapsedMs });
}

function createSlots(target: AnimationTargetProfile, spec: Readonly<PathTravelAnimationSpec>): readonly AnimationSlotDefinition[] {
  const inheritedColor = target.style.strokes?.[target.style.strokes.length - 1]?.color ?? '#00d8ff';
  const baseColor = spec.color ?? inheritedColor;
  const width = spec.width ?? 2;
  const zIndex = target.style.zIndex;
  const slots: AnimationSlotDefinition[] = [];
  if (spec.gradient === undefined) {
    slots.push({ slotKey: 'trail-0', style: lineStyle(baseColor, width, zIndex) });
  } else {
    for (let index = 0; index < gradientSlotCount; index += 1) {
      slots.push({ slotKey: gradientSlotKeys[index], style: lineStyle(sampleColorGradient(spec.gradient, index / (gradientSlotCount - 1)), width, zIndex) });
    }
  }
  if (spec.showStart === true) slots.push({ slotKey: 'start', style: anchorStyle(baseColor, zIndex) });
  if (spec.showEnd === true) slots.push({ slotKey: 'end', style: anchorStyle(baseColor, zIndex) });
  if (spec.gradient === undefined || spec.endLineColor !== undefined) {
    slots.push({ slotKey: 'retained-line', style: lineStyle(spec.endLineColor ?? baseColor, width, zIndex) });
  }
  if (spec.showStart === true && spec.endLineColor !== undefined) {
    slots.push({ slotKey: 'retained-start', style: anchorStyle(spec.endLineColor, zIndex) });
  }
  if (spec.showEnd === true && spec.endLineColor !== undefined) {
    slots.push({ slotKey: 'retained-end', style: anchorStyle(spec.endLineColor, zIndex) });
  }
  return Object.freeze(slots.map((slot) => Object.freeze(slot)));
}

function lineStyle(strokeColor: Color, width: number, zIndex: number | undefined): StyleSpec {
  return {
    strokes: [{ color: copyColor(strokeColor), width }],
    ...(zIndex === undefined ? {} : { zIndex })
  };
}

function anchorStyle(anchorColor: Color, zIndex: number | undefined): StyleSpec {
  return {
    symbol: { type: 'circle', radius: 4, fill: { type: 'solid', color: copyColor(anchorColor) } },
    ...(zIndex === undefined ? {} : { zIndex })
  };
}

function writeGradientTrail(
  output: AnimationFrameBuffer,
  geometries: Map<string, MutablePolylineGeometry | MutablePointGeometry>,
  metrics: TravelPathMetrics,
  from: number,
  to: number,
  smoothness: number
): void {
  const count = to <= from ? 1 : Math.max(2, Math.min(gradientSlotCount, Math.ceil((to - from) * smoothness)));
  for (let index = 0; index < count; index += 1) {
    const slotIndex = count === 1 ? gradientSlotCount - 1 : Math.round((index * (gradientSlotCount - 1)) / (count - 1));
    const key = gradientSlotKeys[slotIndex];
    const existing = geometries.get(key);
    const geometry: MutablePolylineGeometry = existing?.type === 'polyline' ? existing : { type: 'polyline', coordinates: [] };
    if (existing === undefined) geometries.set(key, geometry);
    const left = from + ((to - from) * index) / count;
    const right = from + ((to - from) * (index + 1)) / count;
    writePathRangeAtProgress(geometry, metrics, left, right);
    activateSnapshot(output, key, geometry);
  }
}

/** 用全部固定渐变槽覆盖完整路径，retain 后仍保持原渐变而不创建新图元。 */
function writeRetainedGradient(
  output: AnimationFrameBuffer,
  geometries: Map<string, MutablePolylineGeometry | MutablePointGeometry>,
  metrics: TravelPathMetrics
): void {
  for (let index = 0; index < gradientSlotCount; index += 1) {
    const key = gradientSlotKeys[index];
    const existing = geometries.get(key);
    const geometry: MutablePolylineGeometry = existing?.type === 'polyline' ? existing : { type: 'polyline', coordinates: [] };
    if (existing === undefined) geometries.set(key, geometry);
    writePathRangeAtProgress(geometry, metrics, index / gradientSlotCount, (index + 1) / gradientSlotCount);
    activateSnapshot(output, key, geometry);
  }
}

function writeSampledTrail(geometry: MutablePolylineGeometry, metrics: TravelPathMetrics, from: number, to: number, smoothness: number): void {
  const count = to <= from ? 1 : Math.max(2, Math.min(256, Math.ceil((to - from) * smoothness)));
  const coordinates = geometry.coordinates;
  for (let index = 0; index <= count; index += 1) {
    const progress = from + ((to - from) * index) / count;
    const coordinate = mutableCoordinate(coordinates[index], metrics.path[0].length);
    writePointAt(metrics, progress, coordinate);
    coordinates[index] = coordinate as unknown as Coordinate;
  }
  coordinates.length = count + 1;
}

function writePathRangeAtProgress(geometry: MutablePolylineGeometry, metrics: TravelPathMetrics, startProgress: number, endProgress: number): void {
  const { cumulativeLengths, path, totalLength } = metrics;
  const dimension = path[0].length;
  const startLength = Math.min(1, Math.max(0, startProgress)) * totalLength;
  const endLength = Math.min(1, Math.max(0, endProgress)) * totalLength;
  const coordinates = geometry.coordinates;
  let outputIndex = 0;

  const start = mutableCoordinate(coordinates[outputIndex], dimension);
  writePointAt(metrics, startProgress, start);
  coordinates[outputIndex] = start as unknown as Coordinate;
  outputIndex += 1;

  for (let pathIndex = 1; pathIndex < path.length - 1; pathIndex += 1) {
    const distance = cumulativeLengths[pathIndex];
    if (distance <= startLength || distance >= endLength) continue;
    const coordinate = mutableCoordinate(coordinates[outputIndex], dimension);
    copyCoordinateValues(coordinate, path[pathIndex]);
    coordinates[outputIndex] = coordinate as unknown as Coordinate;
    outputIndex += 1;
  }

  const end = mutableCoordinate(coordinates[outputIndex], dimension);
  writePointAt(metrics, endProgress, end);
  coordinates[outputIndex] = end as unknown as Coordinate;
  geometry.coordinates.length = outputIndex + 1;
}

function writeWholePath(geometry: MutablePolylineGeometry, path: readonly Coordinate[]): void {
  geometry.coordinates.length = path.length;
  for (let index = 0; index < path.length; index += 1) geometry.coordinates[index] = path[index];
}

function activateSnapshot(output: AnimationFrameBuffer, key: string, geometry: RenderGeometryState): void {
  const slot = output.overlay(key);
  slot.active = true;
  slot.geometryKind = 'snapshot';
  slot.geometry = geometry;
}

function createTravelPathMetrics(coordinates: readonly Coordinate[], spec: Readonly<PathTravelAnimationSpec>): TravelPathMetrics {
  assertFiniteTravelCoordinates(coordinates);
  const curvature = spec.curvature ?? 0;
  const smoothness = spec.smoothness ?? 180;
  const path = travelPath(coordinates, curvature, smoothness);
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    const segmentLength = finiteDistance(path[index - 1], path[index]);
    totalLength += segmentLength;
    if (!Number.isFinite(totalLength)) throw invalidCurvedPath();
    cumulativeLengths.push(totalLength);
  }
  return { sourceCoordinates: coordinates, curvature, smoothness, path, cumulativeLengths, totalLength };
}

function travelPath(coordinates: readonly Coordinate[], curvature: number, smoothness: number): readonly Coordinate[] {
  if (coordinates.length < 2) return coordinates.map(cloneCoordinate);
  if (curvature === 0) return coordinates.map(cloneCoordinate);
  if (coordinates.length > 2) return createCentripetalTravelPath(coordinates, curvature, smoothness);
  return createQuadraticTravelPath(coordinates[0], coordinates[1], curvature, smoothness);
}

function createQuadraticTravelPath(start: Coordinate, end: Coordinate, curvature: number, smoothness: number): readonly Coordinate[] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const control: Coordinate = [start[0] / 2 + end[0] / 2 - dy * curvature * 0.5, start[1] / 2 + end[1] / 2 + dx * curvature * 0.5];
  assertFiniteTravelCoordinate(control);
  const points: Coordinate[] = [];
  for (let index = 0; index <= smoothness; index += 1) {
    const ratio = index / smoothness;
    const inverse = 1 - ratio;
    const x = inverse * inverse * start[0] + 2 * inverse * ratio * control[0] + ratio * ratio * end[0];
    const y = inverse * inverse * start[1] + 2 * inverse * ratio * control[1] + ratio * ratio * end[1];
    const point: Coordinate = start.length === 3 || end.length === 3 ? [x, y, interpolateFinite(start[2] ?? 0, end[2] ?? 0, ratio)] : [x, y];
    assertFiniteTravelCoordinate(point);
    points.push(point);
  }
  return points;
}

/**
 * 多点路径使用 centripetal knot 与 waypoint 共享切线；curvature 的符号控制切线偏向入段或出段，绝对值控制切线强度。
 * 曲线与弧长表只在 Runtime 建立或 rebind 时生成，sample 阶段只在稳定数组中二分定位。
 */
function createCentripetalTravelPath(coordinates: readonly Coordinate[], curvature: number, smoothness: number): readonly Coordinate[] {
  const controls = normalizeSplineControls(coordinates);
  if (controls.length < 3) {
    if (controls.length === 1) return [cloneCoordinate(controls[0]), cloneCoordinate(controls[0])];
    return createQuadraticTravelPath(controls[0], controls[1], curvature, Math.max(minimumCurvedSamplesPerSegment, smoothness));
  }

  const dimension = controls[0].length as 2 | 3;
  const spans = Array.from({ length: controls.length - 1 }, (_, index) => centripetalStep(controls[index], controls[index + 1]));
  const tangents = createSharedTangents(controls, spans, curvature);
  const segments: CentripetalSplineSegment[] = [];
  for (let index = 0; index < controls.length - 1; index += 1) {
    const span = spans[index];
    const startTangent: [number, number] = [tangents[index][0] * span, tangents[index][1] * span];
    const endTangent: [number, number] = [tangents[index + 1][0] * span, tangents[index + 1][1] * span];
    assertFiniteVector(startTangent);
    assertFiniteVector(endTangent);
    segments.push({ start: controls[index], end: controls[index + 1], startTangent, endTangent, dimension });
  }

  const estimatedLengths = estimateSplineSegmentLengths(segments);
  const segmentSamples = allocateSegmentSamples(estimatedLengths, Math.max(smoothness, segments.length * minimumCurvedSamplesPerSegment));
  const path: Coordinate[] = [cloneCoordinate(controls[0])];
  const probeLengths: number[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    appendArcLengthSamples(path, segments[index], segmentSamples[index], probeLengths);
  }
  return path;
}

function normalizeSplineControls(coordinates: readonly Coordinate[]): Coordinate[] {
  const dimension: 2 | 3 = coordinates.some((coordinate) => coordinate.length === 3) ? 3 : 2;
  const controls: Coordinate[] = [];
  for (const coordinate of coordinates) {
    const normalized: Coordinate = dimension === 3 ? [coordinate[0], coordinate[1], coordinate[2] ?? 0] : [coordinate[0], coordinate[1]];
    const previous = controls[controls.length - 1];
    if (previous !== undefined && coordinatesEqual(previous, normalized)) continue;
    controls.push(normalized);
  }
  return controls;
}

function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function centripetalStep(start: Coordinate, end: Coordinate): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0) throw invalidCurvedPath();
  return Math.sqrt(distance);
}

function createSharedTangents(controls: readonly Coordinate[], spans: readonly number[], curvature: number): readonly (readonly [number, number])[] {
  const strength = Math.abs(curvature);
  const bias = curvature / (1 + strength);
  const tangents: [number, number][] = [];
  for (let index = 0; index < controls.length; index += 1) {
    if (index === 0) {
      tangents.push(scaledSlope(controls[0], controls[1], spans[0], strength));
      continue;
    }
    if (index === controls.length - 1) {
      tangents.push(scaledSlope(controls[index - 1], controls[index], spans[index - 1], strength));
      continue;
    }

    const previousSpan = spans[index - 1];
    const nextSpan = spans[index];
    const previousSlope = slope(controls[index - 1], controls[index], previousSpan);
    const nextSlope = slope(controls[index], controls[index + 1], nextSpan);
    const spanTotal = previousSpan + nextSpan;
    const previousWeight = (nextSpan / spanTotal) * (1 + bias);
    const nextWeight = (previousSpan / spanTotal) * (1 - bias);
    const weightTotal = previousWeight + nextWeight;
    const tangent: [number, number] = [
      ((previousSlope[0] * previousWeight + nextSlope[0] * nextWeight) / weightTotal) * strength,
      ((previousSlope[1] * previousWeight + nextSlope[1] * nextWeight) / weightTotal) * strength
    ];
    assertFiniteVector(tangent);
    tangents.push(tangent);
  }
  limitSharedTangents(controls, spans, tangents);
  return tangents;
}

/** 充分但偏保守的 Hermite 单调约束，避免切线在尖角或折返路径上造成局部回折。 */
function limitSharedTangents(controls: readonly Coordinate[], spans: readonly number[], tangents: [number, number][]): void {
  const maximumProjection = 1.5;
  for (let index = 0; index < tangents.length; index += 1) {
    let scale = 1;
    const firstSegment = Math.max(0, index - 1);
    const lastSegment = Math.min(spans.length - 1, index);
    for (let segmentIndex = firstSegment; segmentIndex <= lastSegment; segmentIndex += 1) {
      const start = controls[segmentIndex];
      const end = controls[segmentIndex + 1];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length <= 0) throw invalidCurvedPath();
      const projection = ((tangents[index][0] * (dx / length) + tangents[index][1] * (dy / length)) * spans[segmentIndex]) / length;
      if (!Number.isFinite(projection)) throw invalidCurvedPath();
      if (projection < 0) {
        scale = 0;
        break;
      }
      if (projection > maximumProjection) scale = Math.min(scale, maximumProjection / projection);
    }
    tangents[index][0] *= scale;
    tangents[index][1] *= scale;
  }
}

function slope(start: Coordinate, end: Coordinate, span: number): [number, number] {
  const result: [number, number] = [(end[0] - start[0]) / span, (end[1] - start[1]) / span];
  assertFiniteVector(result);
  return result;
}

function scaledSlope(start: Coordinate, end: Coordinate, span: number, scale: number): [number, number] {
  const result = slope(start, end, span);
  result[0] *= scale;
  result[1] *= scale;
  assertFiniteVector(result);
  return result;
}

function estimateSplineSegmentLengths(segments: readonly CentripetalSplineSegment[]): number[] {
  const lengths: number[] = [];
  const probeDistances = Array.from({ length: splineLengthProbeCount }, () => 0);
  const previous = [0, 0, 0];
  const current = [0, 0, 0];
  for (const segment of segments) {
    evaluateCentripetalSegment(segment, 0, previous);
    let maximumStep = 0;
    for (let index = 1; index <= splineLengthProbeCount; index += 1) {
      evaluateCentripetalSegment(segment, index / splineLengthProbeCount, current);
      const distance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
      if (!Number.isFinite(distance)) throw invalidCurvedPath();
      probeDistances[index - 1] = distance;
      maximumStep = Math.max(maximumStep, distance);
      copyCoordinateValues(previous, current as unknown as Coordinate);
    }
    let normalizedLength = 0;
    for (const distance of probeDistances) normalizedLength += maximumStep <= Number.EPSILON ? 0 : distance / maximumStep;
    lengths.push(Math.min(Number.MAX_VALUE, maximumStep * normalizedLength));
  }
  return lengths;
}

function allocateSegmentSamples(estimatedLengths: readonly number[], totalSamples: number): number[] {
  const samples = Array.from({ length: estimatedLengths.length }, () => minimumCurvedSamplesPerSegment);
  const remaining = totalSamples - estimatedLengths.length * minimumCurvedSamplesPerSegment;
  if (remaining <= 0) return samples;

  let maximumLength = 0;
  for (const length of estimatedLengths) maximumLength = Math.max(maximumLength, length);
  const normalizedLengths = estimatedLengths.map((length) => (maximumLength <= Number.EPSILON ? 1 : length / maximumLength));
  const totalLength = normalizedLengths.reduce((sum, length) => sum + length, 0);
  let cumulativeLength = 0;
  let assigned = 0;
  for (let index = 0; index < normalizedLengths.length; index += 1) {
    cumulativeLength += normalizedLengths[index];
    const denominator = totalLength <= Number.EPSILON ? normalizedLengths.length : totalLength;
    const cumulativeExtra = Math.round((remaining * cumulativeLength) / denominator);
    samples[index] += cumulativeExtra - assigned;
    assigned = cumulativeExtra;
  }
  return samples;
}

function appendArcLengthSamples(path: Coordinate[], segment: CentripetalSplineSegment, sampleCount: number, probeLengths: number[]): void {
  const probeCount = Math.max(splineLengthProbeCount, sampleCount * 2);
  probeLengths.length = probeCount + 1;
  probeLengths[0] = 0;
  const previous = [0, 0, 0];
  const current = [0, 0, 0];
  evaluateCentripetalSegment(segment, 0, previous);
  let maximumStep = 0;
  for (let index = 1; index <= probeCount; index += 1) {
    evaluateCentripetalSegment(segment, index / probeCount, current);
    const distance = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (!Number.isFinite(distance)) throw invalidCurvedPath();
    probeLengths[index] = distance;
    maximumStep = Math.max(maximumStep, distance);
    copyCoordinateValues(previous, current as unknown as Coordinate);
  }
  for (let index = 1; index <= probeCount; index += 1) {
    probeLengths[index] = probeLengths[index - 1] + (maximumStep <= Number.EPSILON ? 0 : probeLengths[index] / maximumStep);
  }

  const segmentLength = probeLengths[probeCount];
  for (let index = 1; index <= sampleCount; index += 1) {
    if (index === sampleCount) {
      path.push(cloneCoordinate(segment.end));
      continue;
    }
    const targetLength = (segmentLength * index) / sampleCount;
    const probeIndex = locateCumulativeLength(probeLengths, targetLength);
    const beforeLength = probeLengths[probeIndex - 1];
    const probeLength = probeLengths[probeIndex] - beforeLength;
    const ratio = probeLength <= Number.EPSILON ? 0 : (targetLength - beforeLength) / probeLength;
    const parameter = (probeIndex - 1 + ratio) / probeCount;
    const output = Array.from({ length: segment.dimension }, () => 0);
    evaluateCentripetalSegment(segment, parameter, output);
    path.push(output as unknown as Coordinate);
  }
}

function locateCumulativeLength(cumulativeLengths: readonly number[], targetLength: number): number {
  let low = 1;
  let high = cumulativeLengths.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulativeLengths[middle] < targetLength) low = middle + 1;
    else high = middle;
  }
  return low;
}

function evaluateCentripetalSegment(segment: CentripetalSplineSegment, ratio: number, output: number[]): void {
  const { start, end, startTangent, endTangent, dimension } = segment;
  const squaredRatio = ratio * ratio;
  const cubedRatio = squaredRatio * ratio;
  const startWeight = 2 * cubedRatio - 3 * squaredRatio + 1;
  const startTangentWeight = cubedRatio - 2 * squaredRatio + ratio;
  const endWeight = -2 * cubedRatio + 3 * squaredRatio;
  const endTangentWeight = cubedRatio - squaredRatio;
  output[0] = startWeight * start[0] + startTangentWeight * startTangent[0] + endWeight * end[0] + endTangentWeight * endTangent[0];
  output[1] = startWeight * start[1] + startTangentWeight * startTangent[1] + endWeight * end[1] + endTangentWeight * endTangent[1];
  if (dimension === 3) output[2] = interpolateFinite(start[2] ?? 0, end[2] ?? 0, ratio);
  assertFiniteVector(output);
}

function writePointAt(metrics: TravelPathMetrics, progress: number, output: number[]): void {
  const { cumulativeLengths, path, totalLength } = metrics;
  if (totalLength <= Number.EPSILON) {
    copyCoordinateValues(output, path[0]);
    return;
  }
  const targetLength = Math.min(1, Math.max(0, progress)) * totalLength;
  const low = locateCumulativeLength(cumulativeLengths, targetLength);
  const startIndex = low - 1;
  const segmentLength = cumulativeLengths[low] - cumulativeLengths[startIndex];
  const segmentProgress = segmentLength <= Number.EPSILON ? 0 : (targetLength - cumulativeLengths[startIndex]) / segmentLength;
  const start = path[startIndex];
  const end = path[low];
  output[0] = start[0] + (end[0] - start[0]) * segmentProgress;
  output[1] = start[1] + (end[1] - start[1]) * segmentProgress;
  if (output.length === 3) output[2] = (start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * segmentProgress;
}

function cloneCoordinate(value: Coordinate): Coordinate {
  return value.length === 3 ? [value[0], value[1], value[2]] : [value[0], value[1]];
}

function copyCoordinate(current: Coordinate, source: Coordinate): Coordinate {
  const output = mutableCoordinate(current, source.length);
  copyCoordinateValues(output, source);
  return output as unknown as Coordinate;
}

function copyCoordinateValues(output: number[], source: Coordinate): void {
  output[0] = source[0];
  output[1] = source[1];
  if (output.length === 3) output[2] = source[2] ?? 0;
}

function mutableCoordinate(current: Coordinate | undefined, dimension: number): number[] {
  return current !== undefined && current.length === dimension ? (current as unknown as number[]) : Array.from({ length: dimension }, () => 0);
}

function assertFiniteTravelCoordinates(coordinates: readonly Coordinate[]): void {
  for (const coordinate of coordinates) assertFiniteTravelCoordinate(coordinate);
}

function assertFiniteTravelCoordinate(coordinate: readonly number[]): void {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || !coordinate.every(Number.isFinite)) {
    throw new InvalidArgumentError('Path-travel coordinates must contain two or three finite numbers');
  }
}

function assertFiniteVector(values: readonly number[]): void {
  if (!values.every(Number.isFinite)) throw invalidCurvedPath();
}

function finiteDistance(start: Coordinate, end: Coordinate): number {
  const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (!Number.isFinite(distance)) throw invalidCurvedPath();
  return distance;
}

function interpolateFinite(start: number, end: number, ratio: number): number {
  const direct = start + (end - start) * ratio;
  const result = Number.isFinite(direct) ? direct : start * (1 - ratio) + end * ratio;
  if (!Number.isFinite(result)) throw invalidCurvedPath();
  return result;
}

function invalidCurvedPath(): InvalidArgumentError {
  return new InvalidArgumentError('Path-travel curvature exceeds the finite numeric range for the target geometry');
}

function assertPolyline(
  target: AnimationTargetProfile
): asserts target is AnimationTargetProfile & { geometry: { type: 'polyline'; coordinates: readonly Coordinate[] } } {
  if (target.geometry.type !== 'polyline' || target.geometry.coordinates.length < 2) {
    throw new CapabilityError('Path-travel animation requires polyline render geometry with at least two points');
  }
}

function positiveInteger(value: unknown, fallback: number, label: string): number {
  const result = positive(value, fallback, label);
  if (!Number.isSafeInteger(result)) throw new InvalidArgumentError(`${label} must be a positive safe integer`);
  return result;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
