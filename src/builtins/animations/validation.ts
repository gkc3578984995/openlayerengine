import type { Color } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';

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
    if ((parts.length === 3 || parts.length === 4) && parts.every((part) => typeof part === 'number' && Number.isFinite(part))) {
      return [...parts] as Color;
    }
  }
  throw new InvalidArgumentError(`${label} must be a non-empty color string or numeric color tuple`);
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
  const components = colorComponents(value);
  if (components === undefined) return copyColor(value);
  return [components[0], components[1], components[2], components[3] * clamp(opacity, 0, 1)];
}

export function interpolateColor(left: Color, right: Color, ratio: number): Color {
  const start = colorComponents(left);
  const end = colorComponents(right);
  if (start === undefined || end === undefined) return copyColor(ratio < 0.5 ? left : right);
  const progress = clamp(ratio, 0, 1);
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
    start[2] + (end[2] - start[2]) * progress,
    start[3] + (end[3] - start[3]) * progress
  ];
}

function colorComponents(value: Color): readonly [number, number, number, number] | undefined {
  if (Array.isArray(value)) {
    const parts = arrayValues(value, 'Color');
    return [parts[0] as number, parts[1] as number, parts[2] as number, parts.length === 4 ? (parts[3] as number) : 1];
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') return [0, 0, 0, 0];
  if (normalized.startsWith('#')) return hexComponents(normalized);
  const match = /^rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)(?:,\s*([^)]+))?\s*\)$/.exec(normalized);
  if (match === null) return undefined;
  const red = colorPart(match[1]);
  const green = colorPart(match[2]);
  const blue = colorPart(match[3]);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (![red, green, blue, alpha].every(Number.isFinite)) return undefined;
  return [red, green, blue, alpha];
}

function hexComponents(value: string): readonly [number, number, number, number] | undefined {
  const hex = value.slice(1);
  if (!/^[0-9a-f]+$/.test(hex) || (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8)) return undefined;
  const expanded = hex.length <= 4 ? [...hex].map((part) => part + part).join('') : hex;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
    expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
  ];
}

function colorPart(value: string): number {
  const part = value.trim();
  return part.endsWith('%') ? (Number(part.slice(0, -1)) / 100) * 255 : Number(part);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
