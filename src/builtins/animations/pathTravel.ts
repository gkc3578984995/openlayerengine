import type { PathTravelAnimationSpec } from '../../core/animation/types.js';
import type { Color, Coordinate } from '../../core/common/types.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type { LayerRenderPrimitive } from '../../core/ports/LayerRenderPort.js';
import type { StyleSpec } from '../../core/style/types.js';
import type { AnimationDefinition, AnimationFrameResult } from '../../services/animation/types.js';
import { animationRecord, arrayValues, boolean, channel, color, copyColor, finite, interpolateColor, optionalColor, positive } from './validation.js';

/** 路径采样与累计长度缓存。 */
interface TravelPathMetrics {
  /** 用于检测几何版本变化的源坐标身份。 */
  readonly sourceCoordinates: readonly Coordinate[];
  /** 生成缓存时使用的曲率。 */
  readonly curvature: number;
  /** 生成缓存时使用的平滑度。 */
  readonly smoothness: number;
  /** 实际参与动画采样的路径。 */
  readonly path: readonly Coordinate[];
  /** 每个路径点对应的累计二维长度。 */
  readonly cumulativeLengths: readonly number[];
  /** 路径二维总长度。 */
  readonly totalLength: number;
}

/** 按动画记录实例保存路径指标，记录释放后缓存不会阻止垃圾回收。 */
const travelPathCache = new WeakMap<object, TravelPathMetrics>();

/** 内部常量。保存 pathTravelAnimationDefinition 使用的数据。 */
export const pathTravelAnimationDefinition = Object.freeze({
  type: 'path-travel',
  /** 校验并整理输入数据。 */
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
      'arrow',
      'arrowColor',
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
      arrow: boolean(record.arrow, true, 'Path-travel arrow'),
      ...(record.arrowColor === undefined ? {} : { arrowColor: optionalColor(record.arrowColor, 'Path-travel arrowColor') }),
      showStart: boolean(record.showStart, true, 'Path-travel showStart'),
      showEnd: boolean(record.showEnd, true, 'Path-travel showEnd'),
      ...(record.endLineColor === undefined ? {} : { endLineColor: optionalColor(record.endLineColor, 'Path-travel endLineColor') }),
      finishBehavior
    };
    return Object.freeze(spec);
  },
  /** 检查动画和图形是否兼容。 */
  assertCompatible(_state, geometry) {
    if (geometry.type !== 'polyline' || geometry.coordinates.length < 2) {
      throw new CapabilityError('Path-travel animation requires polyline render geometry with at least two points');
    }
  },
  /** 计算当前动画帧。 */
  frame(context, input): AnimationFrameResult {
    if (context.geometry.type !== 'polyline') throw new CapabilityError('Path-travel animation requires polyline render geometry');
    const spec = input as PathTravelAnimationSpec;
    const metrics = cachedTravelPath(context.instance, context.geometry.coordinates, spec);
    const path = metrics.path;
    const rawProgress =
      spec.durationMs === undefined
        ? (context.elapsedMs / 1000) * ((spec.speed ?? 1) / Math.max(metrics.totalLength, Number.EPSILON))
        : context.elapsedMs / spec.durationMs;
    const finished = spec.repeat !== true && rawProgress >= 1;
    if (finished && spec.finishBehavior !== 'retain') {
      travelPathCache.delete(context.instance);
      return Object.freeze({ value: Object.freeze({ primitives: Object.freeze([]) }), finished: true });
    }
    const progress = finished ? 1 : spec.repeat === true ? positiveModulo(rawProgress, 1) : Math.min(1, rawProgress);
    const startProgress = finished ? 0 : Math.max(0, progress - (spec.trailLength ?? 0.25));
    const trail = slicePath(metrics, startProgress, progress, spec.smoothness ?? 180);
    const inheritedColor = context.style.strokes?.[context.style.strokes.length - 1]?.color ?? '#00d8ff';
    const baseColor = spec.color ?? inheritedColor;
    const retainedColor = finished && spec.endLineColor !== undefined ? spec.endLineColor : baseColor;
    const primitives = linePrimitives(
      trail,
      finished && spec.endLineColor !== undefined ? undefined : spec.gradient,
      retainedColor,
      spec.width ?? 2,
      spec.arrow === true,
      spec.arrowColor,
      context.style.zIndex
    );
    if (spec.showStart === true) primitives.unshift(anchorPrimitive(path[0], retainedColor, context.style.zIndex));
    if (spec.showEnd === true) primitives.push(anchorPrimitive(path[path.length - 1], retainedColor, context.style.zIndex));
    return Object.freeze({
      value: Object.freeze({ primitives: Object.freeze(primitives) }),
      finished,
      ...(finished && spec.finishBehavior === 'retain' ? { retain: true } : {})
    });
  }
} satisfies AnimationDefinition);

/** 返回当前动画记录实例与几何对应的缓存路径及累计长度。 */
function cachedTravelPath(instance: object, coordinates: readonly Coordinate[], spec: PathTravelAnimationSpec): TravelPathMetrics {
  const curvature = spec.curvature ?? 0;
  const smoothness = spec.smoothness ?? 180;
  const cached = travelPathCache.get(instance);
  if (cached !== undefined && cached.curvature === curvature && cached.smoothness === smoothness && cached.sourceCoordinates === coordinates) {
    return cached;
  }
  const path = travelPath(coordinates, curvature, smoothness);
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    totalLength += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
    cumulativeLengths.push(totalLength);
  }
  const metrics: TravelPathMetrics = {
    sourceCoordinates: coordinates,
    curvature,
    smoothness,
    path,
    cumulativeLengths,
    totalLength
  };
  travelPathCache.set(instance, metrics);
  return metrics;
}

/** 内部方法。处理 travelPath 相关数据。 */
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

/** 内部方法。处理 slicePath 相关数据。 */
function slicePath(metrics: TravelPathMetrics, from: number, to: number, smoothness: number): readonly Coordinate[] {
  if (to <= from) {
    const point = pointAt(metrics, to);
    return [point, cloneCoordinate(point)];
  }
  const count = Math.max(2, Math.min(256, Math.ceil((to - from) * smoothness)));
  const result: Coordinate[] = [];
  for (let index = 0; index <= count; index += 1) result.push(pointAt(metrics, from + ((to - from) * index) / count));
  return result;
}

/** 内部方法。处理 pointAt 相关数据。 */
function pointAt(metrics: TravelPathMetrics, progress: number): Coordinate {
  const { cumulativeLengths, path, totalLength } = metrics;
  if (totalLength <= Number.EPSILON) return cloneCoordinate(path[0]);
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
  return interpolate(path[startIndex], path[low], segmentProgress);
}

/** 内部方法。处理 linePrimitives 相关数据。 */
function linePrimitives(
  trail: readonly Coordinate[],
  gradient: PathTravelAnimationSpec['gradient'],
  fallbackColor: Color,
  width: number,
  arrow: boolean,
  arrowColor: Color | undefined,
  zIndex: number | undefined
): LayerRenderPrimitive[] {
  if (gradient === undefined || gradient.length === 0) {
    return [linePrimitive(trail, fallbackColor, width, arrow, arrowColor, zIndex)];
  }
  const result: LayerRenderPrimitive[] = [];
  for (let index = 0; index < trail.length - 1; index += 1) {
    const ratio = trail.length <= 2 ? 1 : index / (trail.length - 2);
    result.push(
      linePrimitive([trail[index], trail[index + 1]], gradientColor(gradient, ratio), width, arrow && index === trail.length - 2, arrowColor, zIndex)
    );
  }
  return result;
}

/** 内部方法。处理 linePrimitive 相关数据。 */
function linePrimitive(
  coordinates: readonly Coordinate[],
  strokeColor: Color,
  width: number,
  arrow: boolean,
  arrowColor: Color | undefined,
  zIndex: number | undefined
): LayerRenderPrimitive {
  const style: StyleSpec = {
    strokes: [{ color: copyColor(strokeColor), width }],
    ...(arrow
      ? {
          decorations: [
            {
              type: 'arrow',
              placement: 'end',
              ...(arrowColor === undefined ? {} : { symbol: { type: 'icon', src: arrowDataUrl, color: copyColor(arrowColor), size: [16, 16] } })
            }
          ]
        }
      : {}),
    ...(zIndex === undefined ? {} : { zIndex })
  };
  return Object.freeze({ geometry: Object.freeze({ type: 'polyline', coordinates: Object.freeze(coordinates.map(cloneCoordinate)) }), style });
}

/** 内部方法。处理 anchorPrimitive 相关数据。 */
function anchorPrimitive(coordinate: Coordinate, anchorColor: Color, zIndex: number | undefined): LayerRenderPrimitive {
  const style: StyleSpec = {
    symbol: { type: 'circle', radius: 4, fill: { type: 'solid', color: copyColor(anchorColor) } },
    ...(zIndex === undefined ? {} : { zIndex })
  };
  return Object.freeze({
    geometry: Object.freeze({ type: 'point', coordinates: cloneCoordinate(coordinate) }),
    style
  });
}

/** 内部方法。处理 normalizeGradient 相关数据。 */
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

/** 内部方法。处理 gradientColor 相关数据。 */
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

/** 内部方法。处理 interpolate 相关数据。 */
function interpolate(start: Coordinate, end: Coordinate, ratio: number): Coordinate {
  const x = start[0] + (end[0] - start[0]) * ratio;
  const y = start[1] + (end[1] - start[1]) * ratio;
  return start.length === 3 || end.length === 3 ? [x, y, (start[2] ?? 0) + ((end[2] ?? 0) - (start[2] ?? 0)) * ratio] : [x, y];
}

/** 内部方法。处理 cloneCoordinate 相关数据。 */
function cloneCoordinate(value: Coordinate): Coordinate {
  return value.length === 3 ? [value[0], value[1], value[2]] : [value[0], value[1]];
}

/** 内部方法。处理 positiveInteger 相关数据。 */
function positiveInteger(value: unknown, fallback: number, label: string): number {
  const result = positive(value, fallback, label);
  if (!Number.isSafeInteger(result)) throw new InvalidArgumentError(`${label} must be a positive safe integer`);
  return result;
}

/** 内部方法。处理 positiveModulo 相关数据。 */
function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** 内部常量。保存 arrowDataUrl 使用的数据。 */
const arrowDataUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"%3E%3Cpath d="M1 8 15 1l-4 7 4 7z" fill="white"/%3E%3C/svg%3E';
