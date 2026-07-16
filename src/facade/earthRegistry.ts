import type Earth from './Earth.js';
import type { EarthOptions } from './Earth.js';

/** 默认 Earth 在注册表中的内部键。 */
const defaultEarthKey = Symbol('default-earth');
/** 保存默认实例和命名实例。 */
const earthRegistry = new Map<string | symbol, RegisteredEarthEntry>();

/** 可用于冲突比较的配置快照。 */
type ComparableOption = unknown;
/** 仅在首次创建时生效的配置字段。 */
type EarthOptionKey = 'target' | 'view' | 'controls';
/** 开发环境警告的输出函数。 */
type EarthWarningReporter = (message: string) => void;

/** 已注册的 Earth 及其首次创建配置快照。 */
export interface RegisteredEarthEntry {
  /** 当前注册的 Earth。 */
  readonly earth: Earth;
  /** 首次创建时保存的配置快照。 */
  readonly options: Readonly<Record<EarthOptionKey, ComparableOption>>;
}

/** 可由测试替换的开发环境警告出口。 */
let warningReporter: EarthWarningReporter = (message) => console.warn(message);

/** 按 ID 查找 Earth；省略 ID 时查找默认实例。 */
export function lookupRegisteredEarth(id?: string): RegisteredEarthEntry | undefined {
  return earthRegistry.get(registryKey(id));
}

/** 注册 Earth，并冻结一份可用于后续冲突检查的创建配置。 */
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

/** 移除指定 Earth 占用的全部注册键。 */
export function unregisterEarth(earth: Earth): void {
  for (const [key, entry] of earthRegistry) {
    if (entry.earth === earth) earthRegistry.delete(key);
  }
}

/** 找出重复获取实例时与首次创建不一致的显式配置。 */
export function conflictingEarthOptions(entry: RegisteredEarthEntry, requested: EarthOptions, fields: ReadonlySet<EarthOptionKey>): readonly EarthOptionKey[] {
  const conflicts: EarthOptionKey[] = [];
  for (const field of fields) {
    if (!sameComparable(entry.options[field], requested[field])) conflicts.push(field);
  }
  return Object.freeze(conflicts);
}

/** 只在开发环境报告 Earth 使用警告。 */
export function reportEarthWarning(message: string): void {
  if (isProduction()) return;
  try {
    warningReporter(message);
  } catch {
    return;
  }
}

/** 为测试临时替换警告出口，并返回恢复函数。 */
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

/** 将可选实例 ID 归一为注册表键。 */
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

/** 复制普通对象和数组，避免后续比较受外部修改影响。 */
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

/** 递归比较两个配置快照，循环引用按已比较处理。 */
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
