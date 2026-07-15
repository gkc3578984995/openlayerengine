import type { PathTravelAnimationSpec } from '../../core/animation/types.js';
import type { Color, Coordinate } from '../../core/common/types.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type { LayerRenderPrimitive } from '../../core/ports/LayerRenderPort.js';
import type { StyleSpec } from '../../core/style/types.js';
import type { AnimationDefinition, AnimationFrameResult } from '../../services/animation/types.js';
import { animationRecord, arrayValues, boolean, channel, color, copyColor, finite, interpolateColor, optionalColor, positive } from './validation.js';

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
    const path = travelPath(context.geometry.coordinates, spec.curvature ?? 0, spec.smoothness ?? 180);
    const length = pathLength(path);
    const rawProgress =
      spec.durationMs === undefined ? (context.elapsedMs / 1000) * ((spec.speed ?? 1) / Math.max(length, Number.EPSILON)) : context.elapsedMs / spec.durationMs;
    const finished = spec.repeat !== true && rawProgress >= 1;
    if (finished && spec.finishBehavior !== 'retain') {
      return Object.freeze({ value: Object.freeze({ primitives: Object.freeze([]) }), finished: true });
    }
    const progress = finished ? 1 : spec.repeat === true ? positiveModulo(rawProgress, 1) : Math.min(1, rawProgress);
    const startProgress = finished ? 0 : Math.max(0, progress - (spec.trailLength ?? 0.25));
    const trail = slicePath(path, startProgress, progress, spec.smoothness ?? 180);
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
function slicePath(path: readonly Coordinate[], from: number, to: number, smoothness: number): readonly Coordinate[] {
  if (to <= from) {
    const point = pointAt(path, to);
    return [point, cloneCoordinate(point)];
  }
  const count = Math.max(2, Math.min(256, Math.ceil((to - from) * smoothness)));
  const result: Coordinate[] = [];
  for (let index = 0; index <= count; index += 1) result.push(pointAt(path, from + ((to - from) * index) / count));
  return result;
}

/** 内部方法。处理 pointAt 相关数据。 */
function pointAt(path: readonly Coordinate[], progress: number): Coordinate {
  const lengths = segmentLengths(path);
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total <= Number.EPSILON) return cloneCoordinate(path[0]);
  let remaining = Math.min(1, Math.max(0, progress)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1)
      return interpolate(path[index], path[index + 1], length <= Number.EPSILON ? 0 : remaining / length);
    remaining -= length;
  }
  return cloneCoordinate(path[path.length - 1]);
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

/** 内部方法。处理 pathLength 相关数据。 */
function pathLength(path: readonly Coordinate[]): number {
  return segmentLengths(path).reduce((sum, value) => sum + value, 0);
}

/** 内部方法。处理 segmentLengths 相关数据。 */
function segmentLengths(path: readonly Coordinate[]): number[] {
  const result: number[] = [];
  for (let index = 0; index < path.length - 1; index += 1) result.push(Math.hypot(path[index + 1][0] - path[index][0], path[index + 1][1] - path[index][1]));
  return result;
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
