import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import type { LayerRenderValue } from '../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../../core/shape/types.js';
import type { StyleSpec } from '../../core/style/types.js';

/** 控制一组由同次播放请求启动的动画。 */
export interface AnimationHandle {
  /** 本次播放请求的唯一 ID。 */
  readonly id: string;
  /** 这组动画的整体运行状态。 */
  readonly status: AnimationStatus;
  /** 所有动画自然结束或被停止后兑现。 */
  readonly finished: Promise<void>;
  /**
   * 暂停当前动画。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.pause();
   * ```
   */
  pause(): void;
  /**
   * 继续播放已暂停的动画。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.pause();
   * handle.resume();
   * ```
   */
  resume(): void;
  /**
   * 停止当前动画。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.stop();
   * ```
   */
  stop(): void;
}

/** 统一播放和控制当前 Earth 的 Element 动画。 */
export interface AnimationManager {
  /**
   * 为匹配的元素播放动画。
   *
   * @param selector 需要播放动画的 Element。
   * @param spec 动画类型及效果配置。
   * @returns 本次播放请求的控制句柄。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * ```
   */
  play(selector: ElementSelector, spec: AnimationSpec): AnimationHandle;
  /**
   * 暂停匹配元素上的动画。
   *
   * @param selector 需要暂停动画的 Element。
   * @param channels 需要暂停的通道；省略时暂停匹配 Element 的全部动画。
   * @returns 本次增加暂停层级的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.pause({ module: 'vehicles' }, ['movement']);
   * ```
   */
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 恢复匹配 Element 上已暂停的动画。
   *
   * @param selector 需要恢复动画的 Element。
   * @param channels 需要恢复的通道；省略时恢复匹配 Element 的全部动画。
   * @returns 本次减少暂停层级的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.resume({ module: 'vehicles' }, ['movement']);
   * ```
   */
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 停止匹配元素上的动画。
   *
   * @param selector 需要停止动画的 Element。
   * @param channels 需要停止的通道；省略时停止匹配 Element 的全部动画。
   * @returns 此次真正停止的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.stop({ module: 'vehicles' }, ['movement']);
   * ```
   */
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 停止当前 Earth 中的全部动画。
   *
   * @example
   * ```ts
   * earth.animations.stopAll();
   * ```
   */
  stopAll(): void;
}

/** 动画定义计算单帧结果时读取的上下文。 */
export interface AnimationFrameContext {
  /** 动画记录在整个生命周期内保持不变的身份对象。 */
  readonly instance: object;
  /** 当前 Element 的只读规范状态。 */
  readonly state: Readonly<ElementState>;
  /** 由规范状态投影得到的渲染几何。 */
  readonly geometry: RenderGeometryState;
  /** 当前 Element 的结构化样式。 */
  readonly style: StyleSpec;
  /** 动画累计推进的时间，单位为毫秒。 */
  readonly elapsedMs: number;
  /** 当前 View 的地图分辨率。 */
  readonly resolution: number;
}

/** 动画定义为当前帧计算出的临时渲染结果。 */
export interface AnimationFrameResult {
  /** 本帧提交给 LayerRenderPort 的临时值。 */
  readonly value: LayerRenderValue;
  /** 本帧结束后是否进入自然完成状态。 */
  readonly finished: boolean;
  /** 完成后是否继续保留最后一帧的临时渲染值。 */
  readonly retain?: boolean;
}

/** 一类结构化动画的内部定义。 */
export interface AnimationDefinition {
  /** 此定义对应的动画类型。 */
  readonly type: AnimationSpec['type'];
  /** 校验并补齐动画配置。 */
  normalize(spec: AnimationSpec): AnimationSpec;
  /** 检查元素和几何是否支持当前动画。 */
  assertCompatible(state: Readonly<ElementState>, geometry: RenderGeometryState): void;
  /** 计算当前动画帧的渲染结果。 */
  frame(context: AnimationFrameContext, spec: AnimationSpec): AnimationFrameResult;
}
