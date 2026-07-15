import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type { ElementPatch, ElementState } from '../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';

/** Element 句柄使用的内部状态。 */
interface ElementHandleState<T> {
  readonly id: string;
  readonly feature: Feature<Geometry>;
  readonly isCurrent: () => boolean;
  readonly getState: () => Readonly<ElementState<T>>;
  readonly update: (patch: ElementPatch<T>) => void;
  readonly remove: () => void;
  removedByHandle: boolean;
}

/** 只允许内部服务创建 Element 的校验令牌。 */
const elementToken = Symbol('ol-engine.facade.Element.internal');
/** Element 句柄与内部状态的关联表。 */
const elementStates = new WeakMap<Element, ElementHandleState<unknown>>();

/**
 * 地图元素句柄。用于读取状态、更新元素或将其移除。
 *
 * Element 由 `earth.elements` 等服务返回，请不要手动创建。
 *
 * @typeParam T 业务数据。表示 `state.data` 的类型。
 *
 * @example
 * ```ts
 * const element = earth.elements.get('vehicle-1');
 * element?.update({ visible: false });
 * ```
 */
export class Element<T = unknown> {
  /**
   * 创建 Element 句柄。
   *
   * 该构造器只供引擎内部使用，外部应通过 `earth.elements` 获取元素。
   *
   * @example
   * ```ts
   * const element = earth.elements.add({
   *   geometry: { type: 'point', controlPoints: [[0, 0]] }
   * });
   * ```
   */
  constructor();
  /** 创建并校验内部 Element 句柄。 */
  constructor(...args: unknown[]) {
    if (args[0] !== elementToken || !isElementHandleState(args[1])) throw new InvalidArgumentError('Element handles are created by ElementService');
    elementStates.set(this, args[1]);
  }

  /** 元素 ID。用于唯一标识当前元素。 */
  get id(): string {
    return stateOf(this).id;
  }

  /** 元素状态。返回当前不可变状态快照。 */
  get state(): Readonly<ElementState<T>> {
    return currentStateOf(this).getState() as Readonly<ElementState<T>>;
  }

  /** 原生要素。用于高级 OpenLayers 互操作。 */
  get olFeature(): Feature<Geometry> {
    return currentStateOf(this).feature;
  }

  /**
   * 更新元素状态。
   *
   * @param patch 更新内容。只写入需要修改的字段。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * element.update({ visible: false, module: 'archived' });
   * ```
   */
  update(patch: ElementPatch<T>): void {
    (currentStateOf(this) as ElementHandleState<T>).update(patch);
  }

  /**
   * 从所属 Earth 中移除当前元素。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * element.remove();
   * ```
   */
  remove(): void {
    const state = stateOf(this);
    if (state.removedByHandle) return;
    if (!state.isCurrent()) throw new ObjectDisposedError(`Element handle is stale: ${state.id}`);
    state.remove();
    state.removedByHandle = true;
  }
}

/** 使用内部状态创建公开 Element 句柄。 */
export function constructElementHandle<T>(internal: unknown): Element<T> {
  const Constructor = Element as unknown as new (token: symbol, state: unknown) => Element<T>;
  return new Constructor(elementToken, internal);
}

/** 判断 Element 句柄是否对应指定原生 Feature。 */
export function ownsElementHandle(handle: Element, feature: Feature<Geometry>): boolean {
  return elementStates.get(handle)?.feature === feature;
}

/** 读取 Element 句柄关联的原生 Feature。 */
export function elementHandleFeature(handle: Element): Feature<Geometry> | undefined {
  return elementStates.get(handle)?.feature;
}

/** 读取 Element 句柄的内部状态。 */
function stateOf(handle: Element): ElementHandleState<unknown> {
  const state = elementStates.get(handle);
  if (state === undefined) throw new InvalidArgumentError('Invalid Element handle');
  return state;
}

/** 读取仍然有效的 Element 内部状态。 */
function currentStateOf(handle: Element): ElementHandleState<unknown> {
  const state = stateOf(handle);
  if (!state.isCurrent()) throw new ObjectDisposedError(`Element handle is stale: ${state.id}`);
  return state;
}

/** 判断未知值是否满足 Element 内部状态结构。 */
function isElementHandleState(value: unknown): value is ElementHandleState<unknown> {
  if (value === null || typeof value !== 'object') return false;
  const state = value as Partial<ElementHandleState<unknown>>;
  return (
    typeof state.id === 'string' &&
    state.feature instanceof Feature &&
    typeof state.isCurrent === 'function' &&
    typeof state.getState === 'function' &&
    typeof state.update === 'function' &&
    typeof state.remove === 'function'
  );
}
