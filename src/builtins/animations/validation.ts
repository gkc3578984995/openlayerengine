import type { Color } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import { absoluteColorComponents, numericColorComponents } from './cssColor.js';

export function animationRecord(input: unknown, type: string, fields: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError(`${type} animation must be a plain object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${type} animation must be a plain object`);
  const allowed = new Set(fields);
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new InvalidArgumentError(`${type} animation cannot contain symbol properties`);
    if (!allowed.has(key)) throw new InvalidArgumentError(`Unknown ${type} animation field: ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${type} animation cannot contain accessor properties`);
    result[key] = descriptor.value;
  }
  return result;
}

export function positive(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new InvalidArgumentError(`${label} must be a finite positive number`);
  return value;
}

export function finite(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be finite`);
  return value;
}

export function nonNegative(value: unknown, fallback: number, label: string): number {
  const result = finite(value, fallback, label);
  if (result < 0) throw new InvalidArgumentError(`${label} must be a finite non-negative number`);
  return result;
}

export function unitInterval(value: unknown, fallback: number, label: string): number {
  const result = finite(value, fallback, label);
  if (result < 0 || result > 1) throw new InvalidArgumentError(`${label} must be between zero and one`);
  return result;
}

export function exclusiveUnitInterval(value: unknown, fallback: number, label: string): number {
  const result = finite(value, fallback, label);
  if (result <= 0 || result >= 1) throw new InvalidArgumentError(`${label} must be greater than zero and less than one`);
  return result;
}

export function integerRange(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const result = finite(value, fallback, label);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new InvalidArgumentError(`${label} must be a safe integer between ${min} and ${max}`);
  }
  return result;
}

export function choice<const T extends string>(value: unknown, fallback: T, choices: readonly T[], label: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`${label} must be one of ${choices.join(', ')}`);
  }
  return value as T;
}

export function requiredChoice<const T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`${label} must be one of ${choices.join(', ')}`);
  }
  return value as T;
}

export function literal<const T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new InvalidArgumentError(`${label} must be ${expected}`);
  return expected;
}

export function boolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

export function channel(value: unknown, fallback: string, label: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

export function color(value: unknown, fallback: Color, label: string): Color {
  if (value === undefined) return copyColor(fallback);
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (Array.isArray(value)) {
    const parts = arrayValues(value, label);
    if (numericColorComponents(parts) !== undefined) return [...parts] as Color;
  }
  throw new InvalidArgumentError(`${label} must be a non-empty color string or an RGB/RGBA tuple with RGB in 0..255 and alpha in 0..1`);
}

export function optionalColor(value: unknown, label: string): Color | undefined {
  return value === undefined ? undefined : color(value, '#000000', label);
}

export function copyColor(value: Color): Color {
  return typeof value === 'string' ? value : ([...arrayValues(value, 'Color')] as Color);
}

export function arrayValues(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain holes or accessor properties`);
    result.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length' || (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)) continue;
    throw new InvalidArgumentError(`${label} cannot contain extra properties`);
  }
  return Object.freeze(result);
}

export function colorWithOpacity(value: Color, opacity: number): Color {
  const components = absoluteColorComponents(value);
  if (components === undefined) return copyColor(value);
  return [components[0], components[1], components[2], components[3] * clamp(opacity, 0, 1)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
