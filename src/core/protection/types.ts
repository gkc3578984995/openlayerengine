/** 更新 Element 协同保护运行态的输入。 */
export type ElementProtectionUpdate =
  | {
      /** 建立或更新保护。 */
      readonly protected: true;
      /** 协作者的稳定业务标识。 */
      readonly operatorId?: string;
      /** 展示在保护标签中的协作者名称。 */
      readonly operatorName?: string;
      /** 调用方提供的单调版本，用于丢弃乱序消息。 */
      readonly revision?: number;
      /** 自动解除保护的毫秒时间戳。 */
      readonly expiresAt?: number;
    }
  | {
      /** 解除保护。 */
      readonly protected: false;
      /** 解锁消息参与同一单调版本序列。 */
      readonly revision?: number;
    };

/** 当前 Earth 实例内某个 Element 的协同保护运行态。 */
export interface ElementProtectionState {
  /** 被保护的 Element ID。 */
  readonly elementId: string;
  /** 已建立的状态固定为 `true`。 */
  readonly protected: true;
  /** 协作者的稳定业务标识。 */
  readonly operatorId?: string;
  /** 展示在保护标签中的协作者名称。 */
  readonly operatorName?: string;
  /** 最近接受的调用方版本。 */
  readonly revision?: number;
  /** 自动解除保护的毫秒时间戳。 */
  readonly expiresAt?: number;
}
