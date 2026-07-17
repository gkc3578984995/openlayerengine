/** 为同一 Earth 内的全部动画提供统一时间源。 */
export interface AnimationClockPort {
  /** 返回与渲染帧时间相同域的当前时间戳，单位为毫秒。 */
  now(): number;
}
