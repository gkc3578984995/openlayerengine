import type { Coordinate, Pixel } from '../common/types.js';
import type { TransientNativeRef } from '../native/types.js';

export type PointerInputType = 'pointermove' | 'click' | 'leftdown' | 'leftup' | 'doubleclick' | 'rightclick';
export type InputType = PointerInputType | 'keydown';

export interface InputPointerEvent<T extends PointerInputType = PointerInputType> {
  readonly type: T;
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly elementId?: string;
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
}

export interface InputKeyboardEvent {
  readonly type: 'keydown';
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
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
  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void;
}
