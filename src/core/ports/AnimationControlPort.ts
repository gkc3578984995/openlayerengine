import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../animation/types.js';
import type { ElementSelector, ElementState } from '../element/types.js';
import type { RenderGeometryState } from '../shape/types.js';

/** 内部接口。约定 AnimationControlHandle 使用的数据和操作。 */
export interface AnimationControlHandle {
  /** 状态。保存当前对象的运行状态。 */
  readonly status: AnimationStatus;
  /** 停止当前动画。 */
  stop(): void;
}

/** 内部接口。约定 AnimationControlPort 使用的数据和操作。 */
export interface AnimationControlPort {
  /** 播放元素动画。 */
  play(selector: ElementSelector, animation: AnimationSpec): AnimationControlHandle;
  /** 暂停匹配的动画。 */
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /** 继续播放匹配的动画。 */
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /** 停止当前动画。 */
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
}

/** 内部接口。约定 AnimationPreviewPort 使用的数据和操作。 */
export interface AnimationPreviewPort {
  /** 使用调用方同一帧已生成的渲染几何设置元素动画预览。 */
  setPreview(state: Readonly<ElementState>, geometry: RenderGeometryState): void;
  /** 清除元素动画预览。 */
  clearPreview(elementId: string): void;
}

/** 内部类型。描述 TransformAnimationPort 的可用数据。 */
export type TransformAnimationPort = AnimationControlPort & AnimationPreviewPort;
