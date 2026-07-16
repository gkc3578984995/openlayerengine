import type { Coordinate, Pixel } from '../common/types.js';
import type { TransientNativeRef } from '../native/types.js';

export type PointerInputType = 'pointermove' | 'click' | 'leftdown' | 'leftup' | 'doubleclick' | 'rightclick';
export type InputType = PointerInputType | 'keydown';

export interface InputPointerEvent<T extends PointerInputType = PointerInputType> {
  /** 指针事件类型。 */
  readonly type: T;
  /** 事件发生处的地图坐标。 */
  readonly coordinate: Coordinate;
  /** 事件发生处的屏幕像素。 */
  readonly pixel: Pixel;
  /** 命中的 Element ID。 */
  readonly elementId?: string;
  /** 仅供本次同步分发读取的底层事件引用。 */
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
}

export interface InputKeyboardEvent {
  /** 键盘事件判别字段。 */
  readonly type: 'keydown';
  /** 按键值。 */
  readonly key: string;
  /** 物理按键代码。 */
  readonly code: string;
  /** Alt 是否按下。 */
  readonly altKey: boolean;
  /** Ctrl 是否按下。 */
  readonly ctrlKey: boolean;
  /** Meta 是否按下。 */
  readonly metaKey: boolean;
  /** Shift 是否按下。 */
  readonly shiftKey: boolean;
  /** 仅供本次同步分发读取的底层事件引用。 */
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
}

export interface InputEventMap {
  readonly pointermove: InputPointerEvent<'pointermove'>;
  readonly click: InputPointerEvent<'click'>;
  readonly leftdown: InputPointerEvent<'leftdown'>;
  readonly leftup: InputPointerEvent<'leftup'>;
  readonly doubleclick: InputPointerEvent<'doubleclick'>;
  readonly rightclick: InputPointerEvent<'rightclick'>;
  readonly keydown: InputKeyboardEvent;
}

export interface InputPort {
  /** 将键盘焦点交给当前地图。 */
  focus?(): void;
  /** 订阅输入事件并返回取消函数。 */
  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void;
}
