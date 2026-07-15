import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import type { LayerRenderValue } from '../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../../core/shape/types.js';
import type { StyleSpec } from '../../core/style/types.js';

/** 动画句柄。用于查看和控制一次动画。 */
export interface AnimationHandle {
  /** 动画 ID。当前动画的唯一标识。 */
  readonly id: string;
  /** 状态。当前动画的运行状态。 */
  readonly status: AnimationStatus;
  /** 完成结果。动画停止或自然结束后完成。 */
  readonly finished: Promise<void>;
  /**
   * 暂停当前动画。
   *
   * @returns 无返回值。
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
   * @returns 无返回值。
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
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * const handle = earth.animations.play({ id: 'marker' }, { type: 'pulse' });
   * handle.stop();
   * ```
   */
  stop(): void;
}

/** 动画管理器。统一播放和控制元素动画。 */
export interface AnimationManager {
  /**
   * 为匹配的元素播放动画。
   *
   * @param selector 元素选择器。指定要播放动画的元素。
   * @param spec 动画配置。指定动画类型和效果。
   * @returns 新动画的控制句柄。
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
   * @param selector 元素选择器。指定要暂停动画的元素。
   * @param channels 动画通道。省略时暂停元素上的全部动画。
   * @returns 实际暂停的动画数量。
   *
   * @example
   * ```ts
   * const count = earth.animations.pause({ module: 'vehicles' }, ['movement']);
   * ```
   */
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /**
   * 继续播放匹配元素上已暂停的动画。
   *
   * @param selector 元素选择器。指定要继续动画的元素。
   * @param channels 动画通道。省略时继续元素上的全部动画。
   * @returns 实际继续的动画数量。
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
   * @param selector 元素选择器。指定要停止动画的元素。
   * @param channels 动画通道。省略时停止元素上的全部动画。
   * @returns 实际停止的动画数量。
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
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * earth.animations.stopAll();
   * ```
   */
  stopAll(): void;
}

/** 动画帧上下文。向内部动画定义提供当前元素和时间。 */
export interface AnimationFrameContext {
  /** 动画实例。当前动画记录在完整生命周期内保持稳定的内部身份。 */
  readonly instance: object;
  /** 元素状态。当前元素的只读状态。 */
  readonly state: Readonly<ElementState>;
  /** 几何。当前元素用于渲染的几何。 */
  readonly geometry: RenderGeometryState;
  /** 样式。当前元素的结构化样式。 */
  readonly style: StyleSpec;
  /** 已运行时间。动画已经运行的毫秒数。 */
  readonly elapsedMs: number;
  /** 分辨率。当前视图的地图分辨率。 */
  readonly resolution: number;
}

/** 动画帧结果。保存本帧的渲染内容和完成状态。 */
export interface AnimationFrameResult {
  /** 渲染内容。本帧要绘制的内容。 */
  readonly value: LayerRenderValue;
  /** 是否完成。表示动画是否已经到达终点。 */
  readonly finished: boolean;
  /** 是否保留。控制完成后是否保留最后一帧。 */
  readonly retain?: boolean;
}

/** 动画定义。供内部注册一种完整动画。 */
export interface AnimationDefinition {
  /** 类型。当前定义处理的动画类型。 */
  readonly type: AnimationSpec['type'];
  /** 校验并补齐动画配置。 */
  normalize(spec: AnimationSpec): AnimationSpec;
  /** 检查元素和几何是否支持当前动画。 */
  assertCompatible(state: Readonly<ElementState>, geometry: RenderGeometryState): void;
  /** 计算当前动画帧的渲染结果。 */
  frame(context: AnimationFrameContext, spec: AnimationSpec): AnimationFrameResult;
}
