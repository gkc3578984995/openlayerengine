import type { AnimationChannel, AnimationStatus } from '../animation/types.js';

/** 内部接口。约定 BlinkAnimationSpec 使用的数据和操作。 */
export interface BlinkAnimationSpec {
  /** 类型。标识当前数据或事件的类型。 */
  readonly type: 'blink';
  /** 周期。保存一次闪烁持续的毫秒数。 */
  readonly periodMs: number;
}

/** 内部接口。约定 TransientAnimationSpec 使用的数据和操作。 */
export interface TransientAnimationSpec {
  /** 拥有者 ID。标识资源所属会话。 */
  readonly ownerId: string;
  /** 渲染图层 ID。标识临时内容所在图层。 */
  readonly renderLayerId: string;
  /** 渲染目标 ID。标识临时渲染目标。 */
  readonly renderTargetId: string;
  /** 通道。区分同一目标的多组内容。 */
  readonly channel: AnimationChannel;
  /** 动画。保存临时动画配置。 */
  readonly animation: BlinkAnimationSpec;
}

/** 内部接口。约定 TransientAnimationHandle 使用的数据和操作。 */
export interface TransientAnimationHandle {
  /** 状态。保存当前对象的运行状态。 */
  readonly status: AnimationStatus;
  /** 停止当前动画。 */
  stop(): void;
}

/** 内部接口。约定 TransientAnimationPort 使用的数据和操作。 */
export interface TransientAnimationPort {
  /** 播放一次临时动画。 */
  playTransient(spec: TransientAnimationSpec): TransientAnimationHandle;
  /** 停止指定拥有者的临时动画。 */
  stopTransient(ownerId: string): number;
}
