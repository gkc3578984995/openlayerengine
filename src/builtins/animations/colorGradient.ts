import type { Color } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import { interpolateColor, normalizeInterpolableColor } from './cssColor.js';
import { arrayValues, color, copyColor } from './validation.js';

/** 严格校验颜色渐变，并复制、冻结调用方提供的色标。 */
export function normalizeColorGradient(value: unknown, label: string): readonly (readonly [offset: number, color: Color])[] {
  const stops = arrayValues(value, label);
  if (stops.length < 2) throw new InvalidArgumentError(`${label} must contain at least two stops`);
  let previous = -1;
  const result = stops.map((candidate, index) => {
    const stop = arrayValues(candidate, `${label} stop ${index}`);
    if (stop.length !== 2) throw new InvalidArgumentError(`${label} stop ${index} must contain offset and color`);
    const offset = stop[0];
    if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0 || offset > 1 || offset <= previous) {
      throw new InvalidArgumentError(`${label} offsets must increase within zero and one`);
    }
    previous = offset;
    const stopColor = color(stop[1], '#000000', `${label} stop ${index} color`);
    const rgba = normalizeInterpolableColor(stopColor, `${label} stop ${index} color`);
    if (Array.isArray(rgba)) Object.freeze(rgba);
    return Object.freeze([offset, rgba] as const);
  });
  return Object.freeze(result);
}

/** 在已规范化的色标中取色；首尾之外固定钳制为端点颜色。 */
export function sampleColorGradient(stops: readonly (readonly [number, Color])[], progress: number): Color {
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
