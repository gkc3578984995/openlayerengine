import type { AnimationChannel, AnimationStatus } from '../animation/types.js';

export interface TransientBlinkAnimationSpec {
  /** 闪烁动画判别字段。 */
  readonly type: 'blink';
  /** 单次闪烁周期，单位为毫秒。 */
  readonly periodMs: number;
}

export interface TransientAnimationSpec {
  /** 持有临时资源的 Session ID。 */
  readonly ownerId: string;
  /** 临时内容所在的渲染图层 ID。 */
  readonly renderLayerId: string;
  /** 临时渲染目标 ID。 */
  readonly renderTargetId: string;
  /** 同一目标内的动画通道。 */
  readonly channel: AnimationChannel;
  /** 临时动画配置。 */
  readonly animation: TransientBlinkAnimationSpec;
}

export interface TransientAnimationHandle {
  /** 动画当前的生命周期状态。 */
  readonly status: AnimationStatus;
  /** 停止当前动画。 */
  stop(): void;
}

export interface TransientAnimationPort {
  /** 播放一次临时动画。 */
  playTransient(spec: TransientAnimationSpec): TransientAnimationHandle;
  /** 停止指定 Session 持有的全部临时动画。 */
  stopTransient(ownerId: string): number;
}
