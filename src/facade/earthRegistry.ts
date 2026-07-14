import type Earth from './Earth.js';
import type { EarthOptions } from './Earth.js';

const defaultEarthKey = Symbol('default-earth');
const earthRegistry = new Map<string | symbol, RegisteredEarthEntry>();

type ComparableOption = unknown;
type EarthOptionKey = 'target' | 'view' | 'controls';
type EarthWarningReporter = (message: string) => void;

export interface RegisteredEarthEntry {
  readonly earth: Earth;
  readonly options: Readonly<Record<EarthOptionKey, ComparableOption>>;
}

let warningReporter: EarthWarningReporter = (message) => console.warn(message);

export function lookupRegisteredEarth(id?: string): RegisteredEarthEntry | undefined {
  return earthRegistry.get(registryKey(id));
}

export function registerEarth(earth: Earth, id: string | undefined, options: EarthOptions): void {
  earthRegistry.set(
    registryKey(id),
    Object.freeze({
      earth,
      options: Object.freeze({
        target: captureComparable(options.target),
        view: captureComparable(options.view),
        controls: captureComparable(options.controls)
      })
    })
  );
}

export function unregisterEarth(earth: Earth): void {
  for (const [key, entry] of earthRegistry) {
    if (entry.earth === earth) earthRegistry.delete(key);
  }
}

export function conflictingEarthOptions(entry: RegisteredEarthEntry, requested: EarthOptions, fields: ReadonlySet<EarthOptionKey>): readonly EarthOptionKey[] {
  const conflicts: EarthOptionKey[] = [];
  for (const field of fields) {
    if (!sameComparable(entry.options[field], requested[field])) conflicts.push(field);
  }
  return Object.freeze(conflicts);
}

export function reportEarthWarning(message: string): void {
  if (isProduction()) return;
  try {
    warningReporter(message);
  } catch {
    return;
  }
}

export function setEarthWarningReporterForTests(reporter: EarthWarningReporter): () => void {
  if (typeof reporter !== 'function') throw new TypeError('Earth warning reporter must be a function.');
  const previous = warningReporter;
  warningReporter = reporter;
  return () => {
    if (warningReporter === reporter) warningReporter = previous;
  };
}

export function resetEarthRegistryForTests(): void {
  earthRegistry.clear();
}

function registryKey(id?: string): string | symbol {
  return id ?? defaultEarthKey;
}

function isProduction(): boolean {
  if (typeof process !== 'undefined') return process.env.NODE_ENV === 'production';
  const environment = (import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean; readonly PROD?: boolean } }).env;
  if (environment?.DEV === true) return false;
  return environment?.PROD !== false;
}

function captureComparable(value: unknown, seen = new WeakMap<object, object>()): ComparableOption {
  if (value === null || typeof value !== 'object') return value;
  const cached = seen.get(value);
  if (cached !== undefined) return cached;
  let prototype: object | null;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return value;
  }
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;

  const copy: unknown[] | Record<PropertyKey, unknown> = Array.isArray(value) ? [] : Object.create(null);
  seen.set(value, copy);
  for (const key of keys) {
    if (key === 'length') continue;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return value;
    }
    if (descriptor === undefined || !('value' in descriptor)) return value;
    Object.defineProperty(copy, key, {
      value: captureComparable(descriptor.value, seen),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  if (Array.isArray(copy)) copy.length = (value as unknown[]).length;
  return copy;
}

function sameComparable(left: unknown, right: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const known = seen.get(left);
  if (known?.has(right)) return true;
  if (known === undefined) seen.set(left, new WeakSet([right]));
  else known.add(right);

  let leftPrototype: object | null;
  let rightPrototype: object | null;
  let leftKeys: PropertyKey[];
  let rightKeys: PropertyKey[];
  try {
    leftPrototype = Object.getPrototypeOf(left);
    rightPrototype = Object.getPrototypeOf(right);
    leftKeys = Reflect.ownKeys(left).filter((key) => key !== 'length');
    rightKeys = Reflect.ownKeys(right).filter((key) => key !== 'length');
  } catch {
    return false;
  }
  const leftPlain = Array.isArray(left) || leftPrototype === Object.prototype || leftPrototype === null;
  const rightPlain = Array.isArray(right) || rightPrototype === Object.prototype || rightPrototype === null;
  if (!leftPlain || !rightPlain || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) return false;
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key))) return false;

  for (const key of leftKeys) {
    let leftDescriptor: PropertyDescriptor | undefined;
    let rightDescriptor: PropertyDescriptor | undefined;
    try {
      leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
      rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
    } catch {
      return false;
    }
    if (leftDescriptor === undefined || rightDescriptor === undefined || !('value' in leftDescriptor) || !('value' in rightDescriptor)) return false;
    if (!sameComparable(leftDescriptor.value, rightDescriptor.value, seen)) return false;
  }
  return true;
}
