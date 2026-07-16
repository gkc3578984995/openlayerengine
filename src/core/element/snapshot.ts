import { cloneCoreState } from '../common/clone.js';
import { InvalidArgumentError } from '../errors.js';
import { isNativeRef } from '../native/types.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import type { ShapeState } from '../shape/types.js';
import { isNativeStyleRef } from '../style/types.js';
import type { ElementState, ElementStateInput } from './types.js';

/** 经过校验并递归冻结的 Element 状态。 */
export type ElementSnapshot<T = unknown> = Readonly<ElementState<T>>;

/** 记录由本模块创建、可供内部热路径按身份信任的快照。 */
const elementSnapshots = new WeakSet<object>();

/** 判断值是否为本模块创建并递归冻结的 ElementSnapshot。 @internal */
export function isElementSnapshot(value: unknown): value is ElementSnapshot {
  return value !== null && typeof value === 'object' && elementSnapshots.has(value);
}

/** 校验输入并创建新的 Element 快照。 */
export function createElementSnapshot<T>(shapeRegistry: ShapeRegistry, state: ElementStateInput<T>): ElementSnapshot<T> {
  const cloned = cloneCoreState(state);
  assertCanonicalFields(cloned);
  assertNonEmptyString(cloned.id, 'Element id');
  assertNonEmptyString(cloned.layerId, 'Element layerId');
  if (typeof cloned.visible !== 'boolean') throw new InvalidArgumentError('Element visible must be a boolean');
  assertElementStyle(cloned.style);
  if (cloned.module !== undefined) assertNonEmptyString(cloned.module, 'Element module');
  if (cloned.geometry === null || typeof cloned.geometry !== 'object' || cloned.geometry.type !== cloned.type) {
    throw new InvalidArgumentError('Element type must match geometry type');
  }

  const definition = shapeRegistry.get(cloned.type);
  const normalized = definition.normalize(cloned.geometry);
  const completion = definition.tryComplete(normalized);
  if (completion.status !== 'complete') throw new InvalidArgumentError(`Element geometry is incomplete: ${cloned.type}`);
  const canonical = definition.normalize(completion.state);
  const geometry = definition.clone(canonical) as ShapeState;
  if (geometry.type !== cloned.type) throw new InvalidArgumentError('Shape definition returned a mismatched geometry type');
  if (!definition.isComplete(geometry)) throw new InvalidArgumentError(`Element geometry is incomplete after completion: ${cloned.type}`);

  return freezeElementState(cloned, geometry);
}

/** 复制现有 Element 快照。 */
export function cloneElementSnapshot<T>(shapeRegistry: ShapeRegistry, state: Readonly<ElementState<T>>): ElementSnapshot<T> {
  const definition = shapeRegistry.get(state.type);
  const geometry = definition.clone(state.geometry as never) as ShapeState;
  if (geometry.type !== state.type) throw new InvalidArgumentError('Shape definition returned a mismatched geometry type');
  return freezeElementState(state, geometry);
}

/**
 * 从已有快照派生仅替换几何或样式的新快照。
 *
 * 仅供已完成输入校验、且自行创建替换值的内部热路径使用。来源快照中已经隔离并冻结的数据会直接复用，避免再次复制整个 Element 状态。
 * @internal
 */
export function deriveElementSnapshot<T>(source: ElementSnapshot<T>, geometry: ShapeState, style: ElementState<T>['style'] = source.style): ElementSnapshot<T> {
  if (!isElementSnapshot(source)) throw new InvalidArgumentError('Derived Element snapshot source must be a trusted snapshot');
  if (geometry === null || typeof geometry !== 'object' || geometry.type !== source.type) {
    throw new InvalidArgumentError('Element type must match derived geometry type');
  }

  const snapshot = Object.freeze({
    id: source.id,
    type: source.type,
    geometry: deepFreeze(geometry),
    style: style === source.style ? source.style : deepFreeze(style),
    ...(source.data === undefined ? {} : { data: source.data }),
    ...(source.module === undefined ? {} : { module: source.module }),
    layerId: source.layerId,
    visible: source.visible
  }) as ElementSnapshot<T>;
  elementSnapshots.add(snapshot);
  return snapshot;
}

/** 冻结已经整理好的 Element 状态。 */
function freezeElementState<T>(state: Readonly<ElementStateInput<T>>, geometry: ShapeState): ElementSnapshot<T> {
  const projected: ElementState<T> = {
    id: state.id,
    type: state.type,
    geometry,
    style: state.style,
    ...(state.data === undefined ? {} : { data: state.data }),
    ...(state.module === undefined ? {} : { module: state.module }),
    layerId: state.layerId,
    visible: state.visible
  };
  const snapshot = deepFreeze(cloneCoreState(projected));
  elementSnapshots.add(snapshot);
  return snapshot;
}

/** Element 状态允许出现的字段。 */
const canonicalElementFields: ReadonlySet<string> = new Set(['id', 'type', 'geometry', 'style', 'data', 'module', 'layerId', 'visible']);

/** 检查 Element 对象只包含允许的字段。 */
function assertCanonicalFields(state: object): void {
  if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Element state must be a plain object');
  for (const key of Reflect.ownKeys(state)) {
    if (typeof key !== 'string' || !canonicalElementFields.has(key)) throw new InvalidArgumentError(`Unknown element field: ${String(key)}`);
  }
  for (const required of ['id', 'type', 'geometry', 'style', 'layerId', 'visible']) {
    if (!Object.prototype.hasOwnProperty.call(state, required)) throw new InvalidArgumentError(`Element state requires ${required}`);
  }
}

/** 检查字符串字段不为空。 */
function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
}

/** 检查 Element 样式是否属于支持的状态。 */
function assertElementStyle(value: unknown): void {
  if (isNativeStyleRef(value)) return;
  if (value === null || typeof value !== 'object' || Array.isArray(value) || isNativeRef(value)) {
    throw new InvalidArgumentError('Element style must be plain style data or an issued native style reference');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InvalidArgumentError('Element style must be plain style data or an issued native style reference');
  }
}

/** 递归冻结普通对象和数组。 */
function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || visited.has(value)) return value;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, visited);
  }
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
