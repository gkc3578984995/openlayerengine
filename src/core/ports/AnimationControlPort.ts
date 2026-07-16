import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../animation/types.js';
import type { ElementSelector, ElementState } from '../element/types.js';
import type { RenderGeometryState } from '../shape/types.js';

export interface AnimationControlHandle {
  /** 动画当前的生命周期状态。 */
  readonly status: AnimationStatus;
  /** 停止当前动画。 */
  stop(): void;
}

export interface AnimationControlPort {
  /** 为匹配的 Element 启动动画。 */
  play(selector: ElementSelector, animation: AnimationSpec): AnimationControlHandle;
  /** 暂停匹配的动画。 */
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /** 继续播放匹配的动画。 */
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  /** 停止匹配的动画。 */
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
}

export interface AnimationPreviewPort {
  /** 复用调用方在同一帧生成的渲染几何更新 Element 动画预览。 */
  setPreview(state: Readonly<ElementState>, geometry: RenderGeometryState): void;
  /** 清除指定 Element 的动画预览。 */
  clearPreview(elementId: string): void;
}

export type TransformAnimationPort = AnimationControlPort & AnimationPreviewPort;
