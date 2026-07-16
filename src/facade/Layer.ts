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

/** 防止调用方绕过 LayerService 构造句柄的内部令牌。 */
const layerToken = Symbol('ol-engine.facade.Layer.internal');
/** Layer 句柄与内部状态的关联表。 */
const layerStates = new WeakMap<Layer, LayerHandleState>();

/**
 * 地图 Layer 的实时句柄，可读取状态、提交更新或移除图层。
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

  /** 当前 Layer 的唯一 ID。 */
  get id(): string {
    return stateOf(this).id;
  }

  /** 当前不可变状态快照。 */
  get state(): Readonly<LayerState> {
    const state = currentStateOf(this);
    return state.getState();
  }

  /** 图层类型：矢量、瓦片或原生图层。 */
  get kind(): LayerKind {
    return this.state.kind;
  }

  /** 当前图层是否可见。 */
  get visible(): boolean {
    return this.state.visible;
  }

  /** 图层透明度，取值范围为 0 到 1。 */
  get opacity(): number {
    return this.state.opacity;
  }

  /** 图层层级；数值越大越靠上。 */
  get zIndex(): number | undefined {
    return this.state.zIndex;
  }

  /** 供高级 OpenLayers 互操作使用的原生图层。 */
  get olLayer(): BaseLayer {
    return currentStateOf(this).nativeLayer;
  }

  /**
   * 更新图层状态。
   *
   * @param patch 需要修改的状态字段。
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

/** 由内部状态构造公共 Layer 句柄。 */
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

/** 读取 Layer 的内部状态，并拒绝已失效的句柄。 */
function currentStateOf(handle: Layer): LayerHandleState {
  const state = stateOf(handle);
  if (!state.isCurrent()) throw new ObjectDisposedError(`Layer handle is stale: ${state.id}`);
  return state;
}

/** 检查未知值是否具备 Layer 句柄所需的内部结构。 */
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
