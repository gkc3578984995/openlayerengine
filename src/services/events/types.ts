import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { ElementState, ElementSelector } from '../../core/element/types.js';
import type { TransientNativeRef } from '../../core/native/types.js';
import type { InputKeyboardEvent, PointerInputType } from '../../core/ports/InputPort.js';

export type InteractionPolicy = 'replace' | 'reject';
export type InteractionStatus = 'active' | 'finished' | 'cancelled';
export type InteractionCancelReason = 'replaced' | 'destroyed' | 'cancelled';
export type ContextMenuDecision = 'consume' | 'pass';
export type PointerPhase = 'enter' | 'move' | 'leave';

export interface RoutedPointerEvent<T extends PointerInputType = PointerInputType> {
  readonly type: T;
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly element?: Readonly<ElementState>;
  readonly nativeEventRef: TransientNativeRef<'input-event'>;
  readonly phase?: PointerPhase;
}

export type RoutedKeyboardEvent = InputKeyboardEvent;

export interface RoutedEventMap {
  readonly pointermove: RoutedPointerEvent<'pointermove'>;
  readonly click: RoutedPointerEvent<'click'>;
  readonly leftdown: RoutedPointerEvent<'leftdown'>;
  readonly leftup: RoutedPointerEvent<'leftup'>;
  readonly doubleclick: RoutedPointerEvent<'doubleclick'>;
  readonly rightclick: RoutedPointerEvent<'rightclick'>;
  readonly keydown: RoutedKeyboardEvent;
}

export type RoutedEventType = keyof RoutedEventMap;

export interface EventRouteOptions {
  readonly selector?: ElementSelector;
  readonly module?: string;
}

export interface ExclusiveInteractionSession {
  cancel(reason: InteractionCancelReason): void;
  handleContextMenu(event: RoutedPointerEvent<'rightclick'>): ContextMenuDecision;
}
