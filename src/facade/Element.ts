import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type { ElementPatch, ElementState } from '../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { ElementGeometryDetails } from './elementGeometryTypes.js';

/** Element 句柄使用的内部状态。 */
interface ElementHandleState<T> {
  readonly id: string;
  readonly feature: Feature<Geometry>;
  readonly isCurrent: () => boolean;
  readonly getState: () => Readonly<ElementState<T>>;
  readonly getGeometryDetails: () => Readonly<ElementGeometryDetails>;
  readonly update: (patch: ElementPatch<T>) => void;
  readonly remove: () => void;
  removedByHandle: boolean;
}

/** 防止调用方绕过 ElementService 构造句柄的内部令牌。 */
const elementToken = Symbol('ol-engine.facade.Element.internal');
/** Element 句柄与内部状态的关联表。 */
const elementStates = new WeakMap<Element, ElementHandleState<unknown>>();

/**
 * 地图 Element 的实时句柄，可读取状态、提交更新或移除对象。
 *
 * Element 由 `earth.elements` 等服务返回，请不要手动创建。
 *
 * @typeParam T `state.data` 中保存的业务数据类型。
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
   * 该构造器只供引擎内部使用，外部应通过 `earth.elements` 获取 Element。
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

  /** 当前 Element 的唯一 ID。 */
  get id(): string {
    return stateOf(this).id;
  }

  /** Element 当前的不可变状态快照。 */
  get state(): Readonly<ElementState<T>> {
    return currentStateOf(this).getState() as Readonly<ElementState<T>>;
  }

  /**
   * 最新已提交 Shape 状态解析出的完整静态渲染几何、地图坐标范围和统一控制参数。
   *
   * 详情同时提供范围角点、最终轮廓点和规范控制点。Circle 通过圆心、米制半径和当前 View 投影半径精确表达，不生成离散圆周点。结果不包含动画帧、交互预览、样式外扩或 world-wrap 展示副本。
   *
   * @throws `ObjectDisposedError` 当前句柄已被移除或已由同 ID 的新代次替代。
   */
  get geometryDetails(): Readonly<ElementGeometryDetails> {
    return currentStateOf(this).getGeometryDetails();
  }

  /** OpenLayers 渲染 Feature。直接修改不会回写 Element 状态，并可能在下次投影时被覆盖。 */
  get olFeature(): Feature<Geometry> {
    return currentStateOf(this).feature;
  }

  /**
   * 更新 Element 状态。
   *
   * @param patch 需要修改的状态字段。
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
   * 从所属 Earth 中移除当前 Element。
   *
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

/** 由内部状态构造公共 Element 句柄。 */
export function constructElementHandle<T>(internal: unknown): Element<T> {
  const Constructor = Element as unknown as new (token: symbol, state: unknown) => Element<T>;
  return new Constructor(elementToken, internal);
}

/** 判断 Element 句柄是否映射到指定 OpenLayers Feature。 */
export function ownsElementHandle(handle: Element, feature: Feature<Geometry>): boolean {
  return elementStates.get(handle)?.feature === feature;
}

/** 读取 Element 句柄映射的 OpenLayers Feature。 */
export function elementHandleFeature(handle: Element): Feature<Geometry> | undefined {
  return elementStates.get(handle)?.feature;
}

/** 读取 Element 句柄的内部状态。 */
function stateOf(handle: Element): ElementHandleState<unknown> {
  const state = elementStates.get(handle);
  if (state === undefined) throw new InvalidArgumentError('Invalid Element handle');
  return state;
}

/** 读取 Element 的内部状态，并拒绝已失效的句柄。 */
function currentStateOf(handle: Element): ElementHandleState<unknown> {
  const state = stateOf(handle);
  if (!state.isCurrent()) throw new ObjectDisposedError(`Element handle is stale: ${state.id}`);
  return state;
}

/** 检查未知值是否具备 Element 句柄所需的内部结构。 */
function isElementHandleState(value: unknown): value is ElementHandleState<unknown> {
  if (value === null || typeof value !== 'object') return false;
  const state = value as Partial<ElementHandleState<unknown>>;
  return (
    typeof state.id === 'string' &&
    state.feature instanceof Feature &&
    typeof state.isCurrent === 'function' &&
    typeof state.getState === 'function' &&
    typeof state.getGeometryDetails === 'function' &&
    typeof state.update === 'function' &&
    typeof state.remove === 'function'
  );
}
