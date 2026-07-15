import type { Coordinate, Pixel } from '../common/types.js';
import type { TransientNativeRef } from '../native/types.js';

/** 内部类型。描述 PointerInputType 的可用数据。 */
export type PointerInputType = 'pointermove' | 'click' | 'leftdown' | 'leftup' | 'doubleclick' | 'rightclick';
/** 内部类型。描述 InputType 的可用数据。 */
export type InputType = PointerInputType | 'keydown';

/** 内部接口。约定 InputPointerEvent 使用的数据和操作。 */
export interface InputPointerEvent<T extends PointerInputType = PointerInputType> {
  /** 类型。标识当前数据或事件的类型。 */
  readonly type: T;
  /** 坐标。保存当前地图坐标。 */
  readonly coordinate: Coordinate;
  /** 像素。保存当前屏幕像素位置。 */
  readonly pixel: Pixel;
  /** 元素 ID。标识关联的元素。 */
  readonly elementId?: string;
  /** 原生事件引用。用于同步读取底层事件。 */
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
}

/** 内部接口。约定 InputKeyboardEvent 使用的数据和操作。 */
export interface InputKeyboardEvent {
  /** 类型。标识当前数据或事件的类型。 */
  readonly type: 'keydown';
  /** 键。保存项目或按键的标识。 */
  readonly key: string;
  /** 按键代码。保存物理按键代码。 */
  readonly code: string;
  /** Alt 状态。表示是否按下 Alt 键。 */
  readonly altKey: boolean;
  /** Ctrl 状态。表示是否按下 Ctrl 键。 */
  readonly ctrlKey: boolean;
  /** Meta 状态。表示是否按下 Meta 键。 */
  readonly metaKey: boolean;
  /** Shift 状态。表示是否按下 Shift 键。 */
  readonly shiftKey: boolean;
  /** 原生事件引用。用于同步读取底层事件。 */
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
}

/** 内部接口。约定 InputEventMap 使用的数据和操作。 */
export interface InputEventMap {
  /** 内部字段。保存 pointermove 相关数据。 */
  readonly pointermove: InputPointerEvent<'pointermove'>;
  /** 内部字段。保存 click 相关数据。 */
  readonly click: InputPointerEvent<'click'>;
  /** 内部字段。保存 leftdown 相关数据。 */
  readonly leftdown: InputPointerEvent<'leftdown'>;
  /** 内部字段。保存 leftup 相关数据。 */
  readonly leftup: InputPointerEvent<'leftup'>;
  /** 内部字段。保存 doubleclick 相关数据。 */
  readonly doubleclick: InputPointerEvent<'doubleclick'>;
  /** 内部字段。保存 rightclick 相关数据。 */
  readonly rightclick: InputPointerEvent<'rightclick'>;
  /** 内部字段。保存 keydown 相关数据。 */
  readonly keydown: InputKeyboardEvent;
}

/** 内部接口。约定 InputPort 使用的数据和操作。 */
export interface InputPort {
  /** 监听内部事件并返回取消函数。 */
  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void;
}
