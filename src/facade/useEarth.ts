import Earth, { normalizeEarthOptions, type EarthOptions } from './Earth.js';
import { conflictingEarthOptions, lookupRegisteredEarth, registerEarth, reportEarthWarning, unregisterEarth } from './earthRegistry.js';

const DEFAULT_TARGET = 'olContainer';

/** 可以在首次创建时配置的 Earth 选项。 */
type ConfigurableEarthOption = 'target' | 'view' | 'controls';

/** `useEarth` 创建配置。 */
export interface UseEarthOptions extends EarthOptions {
  /** 实例 ID。用于区分默认实例和命名实例。 */
  readonly id?: string;
}

/** 解析后的 Earth 获取请求。 */
interface EarthRequest {
  /** 实例 ID。省略时使用默认实例。 */
  readonly id?: string;
  /** 创建配置。只在实例首次创建时使用。 */
  readonly options: EarthOptions;
  /** 显式传入的配置项。用于发现重复调用中的配置冲突。 */
  readonly explicitOptions: ReadonlySet<ConfigurableEarthOption>;
}

/**
 * 获取或创建默认 Earth 实例。
 *
 * @returns 默认 Earth 实例。没有实例时会自动创建。
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
 * @param id 实例 ID。首次创建时也会作为默认挂载目标。
 * @returns 命名 Earth 实例。同一 ID 会返回同一个活动实例。
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
 * @param options 配置。用于指定实例 ID、挂载目标、视图和控件。
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
/** 获取或创建默认或命名 Earth 实例。 */
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

/** 将 `useEarth` 入参整理为统一请求。 */
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

/** 检查并返回非空实例 ID。 */
function validId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError('Earth instance ID must be a non-empty string.');
  return value;
}

/** 检查 `useEarth` 配置，只读取允许的数据属性。 */
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
