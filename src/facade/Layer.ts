import BaseLayer from 'ol/layer/Base.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { LayerKind, LayerPatch } from '../core/layer/types.js';
import type { LayerState } from './types.js';

/** Layer 句柄使用的内部状态。 */
interface LayerHandleState {
  readonly id: string;
  readonly nativeLayer: BaseLayer;
  readonly isCurrent: () => boolean;
  readonly getState: () => Readonly<LayerState>;
  readonly update: (patch: LayerPatch) => void;
  readonly remove: () => void;
  removedByHandle: boolean;
}

/** 只允许内部服务创建 Layer 的校验令牌。 */
const layerToken = Symbol('ol-engine.facade.Layer.internal');
/** Layer 句柄与内部状态的关联表。 */
const layerStates = new WeakMap<Layer, LayerHandleState>();

/**
 * 地图图层句柄。用于读取状态、更新图层或将其移除。
 *
 * Layer 由 `earth.layers` 返回，请不要手动创建。
 *
 * @example
 * ```ts
 * const layer = earth.layers.get('business');
 * layer?.hide();
 * ```
 */
export class Layer {
  /**
   * 创建 Layer 句柄。
   *
   * 该构造器只供引擎内部使用，外部应通过 `earth.layers` 获取图层。
   *
   * @example
   * ```ts
   * const layer = earth.layers.add({ kind: 'vector', id: 'business' });
   * ```
   */
  constructor();
  /** 创建并校验内部 Layer 句柄。 */
  constructor(...args: unknown[]) {
    if (args[0] !== layerToken || !isLayerHandleState(args[1])) throw new InvalidArgumentError('Layer handles are created by LayerService');
    layerStates.set(this, args[1]);
  }

  /** 图层 ID。用于唯一标识当前图层。 */
  get id(): string {
    return stateOf(this).id;
  }

  /** 图层状态。返回当前不可变状态快照。 */
  get state(): Readonly<LayerState> {
    const state = currentStateOf(this);
    return state.getState();
  }

  /** 图层类型。表示矢量、瓦片或原生图层。 */
  get kind(): LayerKind {
    return this.state.kind;
  }

  /** 可见状态。表示当前图层是否显示。 */
  get visible(): boolean {
    return this.state.visible;
  }

  /** 透明度。取值范围为 0 到 1。 */
  get opacity(): number {
    return this.state.opacity;
  }

  /** 层级。数值越大越靠上。 */
  get zIndex(): number | undefined {
    return this.state.zIndex;
  }

  /** 原生图层。用于高级 OpenLayers 互操作。 */
  get olLayer(): BaseLayer {
    return currentStateOf(this).nativeLayer;
  }

  /**
   * 更新图层状态。
   *
   * @param patch 更新内容。只写入需要修改的字段。
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * layer.update({ opacity: 0.6, zIndex: 20 });
   * ```
   */
  update(patch: LayerPatch): void {
    currentStateOf(this).update(patch);
  }

  /**
   * 显示图层。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * layer.show();
   * ```
   */
  show(): void {
    this.update({ visible: true });
  }

  /**
   * 隐藏图层。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * layer.hide();
   * ```
   */
  hide(): void {
    this.update({ visible: false });
  }

  /**
   * 从所属 Earth 中移除当前图层。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * layer.remove();
   * ```
   */
  remove(): void {
    const state = stateOf(this);
    if (state.removedByHandle) return;
    if (!state.isCurrent()) throw new ObjectDisposedError(`Layer handle is stale: ${state.id}`);
    state.remove();
    state.removedByHandle = true;
  }
}

/** 使用内部状态创建公开 Layer 句柄。 */
export function constructLayerHandle(internal: unknown): Layer {
  const Constructor = Layer as unknown as new (token: symbol, state: unknown) => Layer;
  return new Constructor(layerToken, internal);
}

/** 读取 Layer 句柄的内部状态。 */
function stateOf(handle: Layer): LayerHandleState {
  const state = layerStates.get(handle);
  if (state === undefined) throw new InvalidArgumentError('Invalid Layer handle');
  return state;
}

/** 读取仍然有效的 Layer 内部状态。 */
function currentStateOf(handle: Layer): LayerHandleState {
  const state = stateOf(handle);
  if (!state.isCurrent()) throw new ObjectDisposedError(`Layer handle is stale: ${state.id}`);
  return state;
}

/** 判断未知值是否满足 Layer 内部状态结构。 */
function isLayerHandleState(value: unknown): value is LayerHandleState {
  if (value === null || typeof value !== 'object') return false;
  const state = value as Partial<LayerHandleState>;
  return (
    typeof state.id === 'string' &&
    state.nativeLayer instanceof BaseLayer &&
    typeof state.isCurrent === 'function' &&
    typeof state.getState === 'function' &&
    typeof state.update === 'function' &&
    typeof state.remove === 'function'
  );
}
