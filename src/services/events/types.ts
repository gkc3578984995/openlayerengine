import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { ElementState, ElementSelector } from '../../core/element/types.js';
import type { TransientNativeRef } from '../../core/native/types.js';
import type { InputKeyboardEvent, PointerInputType } from '../../core/ports/InputPort.js';

/** 互斥交互发生冲突时采用的处理策略。 */
export type InteractionPolicy = 'replace' | 'reject';

/** 互斥交互会话的生命周期状态。 */
export type InteractionStatus = 'active' | 'finished' | 'cancelled';

/** 互斥交互会话的通用取消原因。 */
export type InteractionCancelReason = 'replaced' | 'destroyed' | 'cancelled';

/** 交互会话对右键事件作出的路由决定。 */
export type ContextMenuDecision = 'consume' | 'pass';

/** 指针相对同一元素的进入、移动和离开阶段。 */
export type PointerPhase = 'enter' | 'move' | 'leave';

/**
 * 输入路由器生成的内部指针事件快照。
 *
 * @typeParam T 指针输入事件的类型。
 */
export interface RoutedPointerEvent<T extends PointerInputType = PointerInputType> {
  /** 本次路由的指针输入类型。 */
  readonly type: T;
  /** 事件发生处的只读地图坐标。 */
  readonly coordinate: Coordinate;
  /** 事件相对地图 viewport 的像素位置。 */
  readonly pixel: Pixel;
  /** 输入发生时命中的 Element 状态。 */
  readonly element?: Readonly<ElementState>;
  /** 原始浏览器事件的临时引用，仅可在同步路由期间解析。 */
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
  /** 指针相对命中 Element 的进入、移动或离开阶段。 */
  readonly phase?: PointerPhase;
}

/** 输入路由器生成的内部键盘事件快照。 */
export type RoutedKeyboardEvent = InputKeyboardEvent;

/** 内部路由事件名称与载荷的映射。 */
export interface RoutedEventMap {
  /** 地图指针移动。 */
  readonly pointermove: RoutedPointerEvent<'pointermove'>;
  /** 地图单击。 */
  readonly click: RoutedPointerEvent<'click'>;
  /** 主按钮按下。 */
  readonly leftdown: RoutedPointerEvent<'leftdown'>;
  /** 主按钮抬起。 */
  readonly leftup: RoutedPointerEvent<'leftup'>;
  /** 地图双击。 */
  readonly doubleclick: RoutedPointerEvent<'doubleclick'>;
  /** 地图右键输入。 */
  readonly rightclick: RoutedPointerEvent<'rightclick'>;
  /** 键盘按键输入。 */
  readonly keydown: RoutedKeyboardEvent;
}

/** 内部路由事件名称。 */
export type RoutedEventType = keyof RoutedEventMap;

/** 内部事件路由使用的过滤条件。 */
export interface EventRouteOptions {
  /** 只路由命中匹配 Element 的事件。 */
  readonly selector?: ElementSelector;
  /** 订阅所属的业务模块，也作为批量清理键。 */
  readonly module?: string;
}

/** 交互协调器管理的互斥会话契约。 */
export interface ExclusiveInteractionSession {
  /** 按指定原因取消当前交互会话。 */
  cancel(reason: InteractionCancelReason): void;
  /** 处理右键事件并返回是否消费该事件。 */
  handleContextMenu(event: RoutedPointerEvent<'rightclick'>): ContextMenuDecision;
}
