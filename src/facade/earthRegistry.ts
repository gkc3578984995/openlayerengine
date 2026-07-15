import type Earth from './Earth.js';
import type { EarthOptions } from './Earth.js';

/** 无 ID 实例使用的内部注册键。 */
const defaultEarthKey = Symbol('default-earth');
/** 保存默认实例和命名实例。 */
const earthRegistry = new Map<string | symbol, RegisteredEarthEntry>();

/** 可用于冲突比较的配置快照。 */
type ComparableOption = unknown;
/** 首次创建后不能再次生效的配置字段。 */
type EarthOptionKey = 'target' | 'view' | 'controls';
/** 开发环境警告的输出函数。 */
type EarthWarningReporter = (message: string) => void;

/** 注册表中的 Earth 实例及其首次创建配置。 */
export interface RegisteredEarthEntry {
  /** 已注册的 Earth 实例。 */
  readonly earth: Earth;
  /** 首次创建时保存的配置快照。 */
  readonly options: Readonly<Record<EarthOptionKey, ComparableOption>>;
}

/** 当前使用的开发环境警告输出函数。 */
let warningReporter: EarthWarningReporter = (message) => console.warn(message);

/** 按可选 ID 查找已注册的 Earth。 */
export function lookupRegisteredEarth(id?: string): RegisteredEarthEntry | undefined {
  return earthRegistry.get(registryKey(id));
}

/** 注册 Earth，并保存首次创建配置的可比较快照。 */
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

/** 删除指定 Earth 占用的所有注册键。 */
export function unregisterEarth(earth: Earth): void {
  for (const [key, entry] of earthRegistry) {
    if (entry.earth === earth) earthRegistry.delete(key);
  }
}

/** 找出再次调用时与首次创建不同的配置字段。 */
export function conflictingEarthOptions(entry: RegisteredEarthEntry, requested: EarthOptions, fields: ReadonlySet<EarthOptionKey>): readonly EarthOptionKey[] {
  const conflicts: EarthOptionKey[] = [];
  for (const field of fields) {
    if (!sameComparable(entry.options[field], requested[field])) conflicts.push(field);
  }
  return Object.freeze(conflicts);
}

/** 仅在开发环境输出 Earth 使用警告。 */
export function reportEarthWarning(message: string): void {
  if (isProduction()) return;
  try {
    warningReporter(message);
  } catch {
    return;
  }
}

/** 测试时临时替换警告输出函数，并返回恢复函数。 */
export function setEarthWarningReporterForTests(reporter: EarthWarningReporter): () => void {
  if (typeof reporter !== 'function') throw new TypeError('Earth warning reporter must be a function.');
  const previous = warningReporter;
  warningReporter = reporter;
  return () => {
    if (warningReporter === reporter) warningReporter = previous;
  };
}

/** 测试时清空全部 Earth 注册项。 */
export function resetEarthRegistryForTests(): void {
  earthRegistry.clear();
}

/** 将可选实例 ID 转换为注册表键。 */
function registryKey(id?: string): string | symbol {
  return id ?? defaultEarthKey;
}

/** 判断当前是否处于生产环境。 */
function isProduction(): boolean {
  if (typeof process !== 'undefined') return process.env.NODE_ENV === 'production';
  const environment = (import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean; readonly PROD?: boolean } }).env;
  if (environment?.DEV === true) return false;
  return environment?.PROD !== false;
}

/** 复制普通对象和数组，供后续安全比较。 */
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

/** 递归比较两个配置快照是否相同。 */
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
