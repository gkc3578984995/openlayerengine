import { cloneCoreState } from '../common/clone.js';
import { InvalidArgumentError } from '../errors.js';
import { isNativeRef } from '../native/types.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import type { ShapeState } from '../shape/types.js';
import { isNativeStyleRef } from '../style/types.js';
import type { ElementState } from './types.js';

/** 元素快照。保存经过校验和冻结的元素状态。 */
export type ElementSnapshot<T = unknown> = Readonly<ElementState<T>>;

/** 校验状态并创建一个新的元素快照。 */
export function createElementSnapshot<T>(shapeRegistry: ShapeRegistry, state: ElementState<T>): ElementSnapshot<T> {
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

/** 复制一个现有元素快照。 */
export function cloneElementSnapshot<T>(shapeRegistry: ShapeRegistry, state: Readonly<ElementState<T>>): ElementSnapshot<T> {
  const definition = shapeRegistry.get(state.type);
  const geometry = definition.clone(state.geometry as never) as ShapeState;
  if (geometry.type !== state.type) throw new InvalidArgumentError('Shape definition returned a mismatched geometry type');
  return freezeElementState(state, geometry);
}

/** 冻结已经整理好的元素状态。 */
function freezeElementState<T>(state: Readonly<ElementState<T>>, geometry: ShapeState): ElementSnapshot<T> {
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
  return deepFreeze(cloneCoreState(projected));
}

/** 元素状态允许出现的字段。 */
const canonicalElementFields: ReadonlySet<string> = new Set(['id', 'type', 'geometry', 'style', 'data', 'module', 'layerId', 'visible']);

/** 检查元素对象只包含允许的字段。 */
function assertCanonicalFields(state: ElementState): void {
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

/** 检查元素样式是否是支持的样式状态。 */
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
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || visited.has(value)) return value;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, visited);
  }
  return Object.freeze(value);
}
