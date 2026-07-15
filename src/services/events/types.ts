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
  /** 事件类型。表示本次路由的指针输入名称。 */
  readonly type: T;
  /** 地图坐标。保存事件发生位置的只读坐标。 */
  readonly coordinate: Coordinate;
  /** 屏幕像素。保存事件相对地图视口的位置。 */
  readonly pixel: Pixel;
  /** 命中元素。保存输入时命中的可选元素状态。 */
  readonly element?: Readonly<ElementState>;
  /** 原生引用。仅允许在同步路由期间解析原始浏览器事件。 */
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
  /** 指针阶段。记录指针进入、移动或离开元素的可选阶段。 */
  readonly phase?: PointerPhase;
}

/** 输入路由器生成的内部键盘事件快照。 */
export type RoutedKeyboardEvent = InputKeyboardEvent;

/** 内部路由事件名称与载荷的映射。 */
export interface RoutedEventMap {
  /** 指针移动事件。映射到内部指针移动载荷。 */
  readonly pointermove: RoutedPointerEvent<'pointermove'>;
  /** 单击事件。映射到内部地图单击载荷。 */
  readonly click: RoutedPointerEvent<'click'>;
  /** 左键按下事件。映射到内部主按钮按下载荷。 */
  readonly leftdown: RoutedPointerEvent<'leftdown'>;
  /** 左键抬起事件。映射到内部主按钮抬起载荷。 */
  readonly leftup: RoutedPointerEvent<'leftup'>;
  /** 双击事件。映射到内部地图双击载荷。 */
  readonly doubleclick: RoutedPointerEvent<'doubleclick'>;
  /** 右键事件。映射到内部地图右键载荷。 */
  readonly rightclick: RoutedPointerEvent<'rightclick'>;
  /** 键盘事件。映射到内部键盘输入载荷。 */
  readonly keydown: RoutedKeyboardEvent;
}

/** 内部路由事件名称。 */
export type RoutedEventType = keyof RoutedEventMap;

/** 内部事件路由使用的过滤条件。 */
export interface EventRouteOptions {
  /** 元素选择器。限制只路由命中匹配元素的事件。 */
  readonly selector?: ElementSelector;
  /** 业务模块。记录订阅所属模块以支持批量清理。 */
  readonly module?: string;
}

/** 交互协调器管理的互斥会话契约。 */
export interface ExclusiveInteractionSession {
  /** 按指定原因取消当前交互会话。 */
  cancel(reason: InteractionCancelReason): void;
  /** 处理右键事件并返回是否消费该事件。 */
  handleContextMenu(event: RoutedPointerEvent<'rightclick'>): ContextMenuDecision;
}
