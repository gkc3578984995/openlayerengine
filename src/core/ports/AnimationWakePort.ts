/** 持有一次动画截止时间唤醒；重复取消不得产生额外副作用。 */
export interface AnimationWakeHandle {
  /** 取消尚未触发的单次唤醒；该操作必须幂等。 */
  cancel(): void;
}

/** 隔离动画截止时间调度所需的平台定时能力。 */
export interface AnimationWakePort {
  /**
   * 在指定的绝对时间戳触发一次回调。
   *
   * 返回句柄的 `cancel()` 必须幂等；取消或已经触发后不得再次调用回调。
   */
  scheduleAt(timestamp: number, callback: () => void): AnimationWakeHandle;
}
