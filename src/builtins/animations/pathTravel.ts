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
import { animationRecord, arrayValues, boolean, channel, color, copyColor, finite, interpolateColor, optionalColor, positive } from './validation.js';

/** 渐变尾迹使用固定槽位，避免采样点越多就创建越多渲染对象。 */
const gradientSlotCount = 24;
const gradientSlotKeys = Object.freeze(Array.from({ length: gradientSlotCount }, (_, index) => `trail-${index}`));
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
      ...(record.gradient === undefined ? {} : { gradient: normalizeGradient(record.gradient) }),
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
      slots.push({ slotKey: gradientSlotKeys[index], style: lineStyle(gradientColor(spec.gradient, index / (gradientSlotCount - 1)), width, zIndex) });
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
  const curvature = spec.curvature ?? 0;
  const smoothness = spec.smoothness ?? 180;
  const path = travelPath(coordinates, curvature, smoothness);
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    totalLength += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
    cumulativeLengths.push(totalLength);
  }
  return { sourceCoordinates: coordinates, curvature, smoothness, path, cumulativeLengths, totalLength };
}

function travelPath(coordinates: readonly Coordinate[], curvature: number, smoothness: number): readonly Coordinate[] {
  if (coordinates.length !== 2 || curvature === 0) return coordinates.map(cloneCoordinate);
  const start = coordinates[0];
  const end = coordinates[1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const control: Coordinate = [(start[0] + end[0]) / 2 - dy * curvature * 0.5, (start[1] + end[1]) / 2 + dx * curvature * 0.5];
  const points: Coordinate[] = [];
  for (let index = 0; index <= smoothness; index += 1) {
    const ratio = index / smoothness;
    const inverse = 1 - ratio;
    const x = inverse * inverse * start[0] + 2 * inverse * ratio * control[0] + ratio * ratio * end[0];
    const y = inverse * inverse * start[1] + 2 * inverse * ratio * control[1] + ratio * ratio * end[1];
    points.push(start.length === 3 || end.length === 3 ? [x, y, (start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * ratio] : [x, y]);
  }
  return points;
}

function writePointAt(metrics: TravelPathMetrics, progress: number, output: number[]): void {
  const { cumulativeLengths, path, totalLength } = metrics;
  if (totalLength <= Number.EPSILON) {
    copyCoordinateValues(output, path[0]);
    return;
  }
  const targetLength = Math.min(1, Math.max(0, progress)) * totalLength;
  let low = 1;
  let high = cumulativeLengths.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulativeLengths[middle] < targetLength) low = middle + 1;
    else high = middle;
  }
  const startIndex = low - 1;
  const segmentLength = cumulativeLengths[low] - cumulativeLengths[startIndex];
  const segmentProgress = segmentLength <= Number.EPSILON ? 0 : (targetLength - cumulativeLengths[startIndex]) / segmentLength;
  const start = path[startIndex];
  const end = path[low];
  output[0] = start[0] + (end[0] - start[0]) * segmentProgress;
  output[1] = start[1] + (end[1] - start[1]) * segmentProgress;
  if (output.length === 3) output[2] = (start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * segmentProgress;
}

function normalizeGradient(value: unknown): readonly (readonly [number, Color])[] {
  const stops = arrayValues(value, 'Path-travel gradient');
  if (stops.length < 2) throw new InvalidArgumentError('Path-travel gradient must contain at least two stops');
  let previous = -1;
  const result = stops.map((candidate, index) => {
    const stop = arrayValues(candidate, `Path-travel gradient stop ${index}`);
    if (stop.length !== 2) throw new InvalidArgumentError(`Path-travel gradient stop ${index} must contain offset and color`);
    const offset = stop[0];
    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0 || offset > 1 || offset <= previous) {
      throw new InvalidArgumentError('Path-travel gradient offsets must increase within zero and one');
    }
    previous = offset;
    return Object.freeze([offset, color(stop[1], '#000000', `Path-travel gradient stop ${index}`)] as const);
  });
  return Object.freeze(result);
}

function gradientColor(stops: readonly (readonly [number, Color])[], progress: number): Color {
  if (progress <= stops[0][0]) return copyColor(stops[0][1]);
  for (let index = 1; index < stops.length; index += 1) {
    const left = stops[index - 1];
    const right = stops[index];
    if (progress > right[0]) continue;
    const width = right[0] - left[0];
    return interpolateColor(left[1], right[1], width <= Number.EPSILON ? 1 : (progress - left[0]) / width);
  }
  return copyColor(stops[stops.length - 1][1]);
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
