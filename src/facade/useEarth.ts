import Earth, { normalizeEarthOptions, type EarthOptions } from './Earth.js';
import { conflictingEarthOptions, lookupRegisteredEarth, registerEarth, reportEarthWarning, unregisterEarth } from './earthRegistry.js';

const DEFAULT_TARGET = 'olContainer';

/** 只在 Earth 首次创建时生效的选项。 */
type ConfigurableEarthOption = 'target' | 'view' | 'controls';

/** `useEarth` 的实例选择与创建配置。 */
export interface UseEarthOptions extends EarthOptions {
  /** 命名实例的 ID；省略时选择默认实例。 */
  readonly id?: string;
}

/** 归一化后的 Earth 获取请求。 */
interface EarthRequest {
  /** 命名实例 ID；省略时使用默认实例。 */
  readonly id?: string;
  /** 只在实例首次创建时使用的配置。 */
  readonly options: EarthOptions;
  /** 调用方显式传入、需要参与重复调用冲突检查的配置项。 */
  readonly explicitOptions: ReadonlySet<ConfigurableEarthOption>;
}

/**
 * 获取或创建默认 Earth 实例。
 *
 * @returns 默认 Earth；尚未创建或已销毁时返回新实例。
 *
 * @example
 * ```ts
 * import { useEarth } from '@vrsim/earth-engine-ol';
 *
 * const earth = useEarth();
 * ```
 */
export function useEarth(): Earth;
/**
 * 获取或创建指定 ID 的 Earth 实例。
 *
 * @param id 实例 ID；首次创建时也作为默认挂载目标。
 * @returns 对应的命名 Earth；同一 ID 始终返回当前活动实例。
 *
 * @example
 * ```ts
 * import { useEarth } from '@vrsim/earth-engine-ol';
 *
 * const planning = useEarth('planning');
 * ```
 */
export function useEarth(id: string): Earth;
/**
 * 获取或创建带配置的 Earth 实例。
 *
 * 配置只在对应实例首次创建时生效。
 *
 * @param options 实例 ID、挂载目标、View 和控件配置。
 * @returns 默认或命名 Earth 实例。
 *
 * @example
 * ```ts
 * import { useEarth } from '@vrsim/earth-engine-ol';
 *
 * const earth = useEarth({
 *   id: 'overview',
 *   target: 'overview-map',
 *   view: { zoom: 5 }
 * });
 * ```
 */
export function useEarth(options: UseEarthOptions): Earth;
/** 解析重载参数后获取或创建默认/命名 Earth。 */
export function useEarth(input?: string | UseEarthOptions): Earth {
  const request = inspectRequest(input);
  const registered = lookupRegisteredEarth(request.id);
  if (registered?.earth.lifecycle === 'ready') {
    const conflicts = conflictingEarthOptions(registered, request.options, request.explicitOptions);
    if (conflicts.length > 0) {
      reportEarthWarning(
        `useEarth(${request.id === undefined ? 'default' : JSON.stringify(request.id)}) ignored conflicting options for the existing Earth: ${conflicts.join(', ')}.`
      );
    }
    return registered.earth;
  }
  if (registered !== undefined) unregisterEarth(registered.earth);

  const earth = new Earth(request.options);
  try {
    registerEarth(earth, request.id, request.options);
  } catch (error) {
    earth.destroy();
    throw error;
  }
  return earth;
}

/** 将 `useEarth` 的三种入参形式归一为内部请求。 */
function inspectRequest(input?: string | UseEarthOptions): EarthRequest {
  if (typeof input === 'string') {
    const id = validId(input);
    return { id, options: Object.freeze({ target: id }), explicitOptions: new Set() };
  }
  if (input === undefined) return { options: Object.freeze({ target: DEFAULT_TARGET }), explicitOptions: new Set() };

  const record = inspectOptionsRecord(input);
  const id = record.id === undefined ? undefined : validId(record.id);
  const explicitOptions = new Set<ConfigurableEarthOption>();
  if (record.target !== undefined) explicitOptions.add('target');
  if (record.view !== undefined) explicitOptions.add('view');
  if (record.controls !== undefined) explicitOptions.add('controls');
  return {
    ...(id === undefined ? {} : { id }),
    options: normalizeEarthOptions({
      target: record.target === undefined ? (id ?? DEFAULT_TARGET) : (record.target as EarthOptions['target']),
      ...(record.view === undefined ? {} : { view: record.view as EarthOptions['view'] }),
      ...(record.controls === undefined ? {} : { controls: record.controls as EarthOptions['controls'] })
    }),
    explicitOptions
  };
}

/** 校验并返回非空实例 ID。 */
function validId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError('Earth instance ID must be a non-empty string.');
  return value;
}

/** 从普通对象中安全读取 `useEarth` 允许的配置字段。 */
function inspectOptionsRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('useEarth options must be a plain object.');
  let prototype: object | null;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
  } catch {
    throw new TypeError('useEarth options must be inspectable.');
  }
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('useEarth options must be a plain object.');
  const allowed = new Set(['id', 'target', 'view', 'controls']);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(`Unknown useEarth options field: ${String(key)}.`);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      throw new TypeError('useEarth options must be inspectable.');
    }
    if (descriptor === undefined || !('value' in descriptor)) throw new TypeError('useEarth options cannot contain accessor properties.');
    record[key] = descriptor.value;
  }
  return record;
}
