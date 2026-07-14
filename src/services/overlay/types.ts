import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { NativeRef } from '../../core/native/types.js';
import type { CoreOverlayOwnership, CoreOverlayPositioning, CorePanIntoViewSpec } from '../../core/ports/OverlayPort.js';

export interface InternalOverlaySpec<T = unknown> {
  readonly id?: string;
  readonly elementRef: NativeRef<'element'>;
  readonly position?: Coordinate;
  readonly offset?: Pixel;
  readonly positioning?: CoreOverlayPositioning;
  readonly stopEvent?: boolean;
  readonly insertFirst?: boolean;
  readonly autoPan?: boolean | CorePanIntoViewSpec;
  readonly className?: string;
  readonly module?: string;
  readonly data?: T;
  readonly ownership?: CoreOverlayOwnership;
}

export interface InternalOverlayPatch<T = unknown> {
  readonly elementRef?: NativeRef<'element'>;
  readonly position?: Coordinate | undefined;
  readonly offset?: Pixel;
  readonly positioning?: CoreOverlayPositioning;
  readonly visible?: boolean;
  readonly data?: T | undefined;
  readonly ownership?: CoreOverlayOwnership;
}

export interface InternalOverlaySelector<T = unknown> {
  readonly id?: string;
  readonly ids?: readonly string[];
  readonly module?: string;
  readonly visible?: boolean;
  readonly predicate?: (data: Readonly<T> | undefined, handle: import('./OverlayHandle.js').OverlayHandle<T>) => boolean;
}

export interface InternalOverlayState<T = unknown> {
  readonly id: string;
  readonly elementRef: NativeRef<'element'>;
  readonly position: Coordinate | undefined;
  readonly offset: Pixel;
  readonly positioning: CoreOverlayPositioning;
  readonly stopEvent: boolean;
  readonly insertFirst: boolean;
  readonly autoPan: false | CorePanIntoViewSpec;
  readonly className: string | undefined;
  readonly module: string | undefined;
  readonly data: Readonly<T> | undefined;
  readonly ownership: CoreOverlayOwnership;
  readonly visible: boolean;
  readonly kind: 'overlay' | 'descriptor';
}

export interface InternalDescriptorItem<Value = string | number> {
  readonly label: string;
  readonly value: Value;
  readonly color?: string;
  readonly className?: string;
}

export type InternalDescriptorType = 'list' | 'custom';
export type InternalDescriptorCloseAction = 'hide' | 'destroy';
export type InternalDescriptorFixedMode = 'position' | 'pixel';

export interface InternalDescriptorSpec<T = unknown> {
  readonly id?: string;
  readonly elementRef: NativeRef<'element'>;
  readonly type: InternalDescriptorType;
  readonly items?: readonly InternalDescriptorItem[];
  readonly position: Coordinate;
  readonly offset?: Pixel;
  readonly close?: boolean;
  readonly closeAction?: InternalDescriptorCloseAction;
  readonly onClose?: (event: InternalDescriptorEvent<T>) => void;
  readonly onItemClick?: (event: InternalDescriptorEvent<T>) => void;
  readonly draggable?: boolean;
  readonly fixedLine?: boolean;
  readonly fixedLineColor?: string;
  readonly fixedMode?: InternalDescriptorFixedMode;
  readonly data?: T;
}

export interface InternalDescriptorPatch<T = unknown> {
  readonly elementRef?: NativeRef<'element'>;
  readonly type?: InternalDescriptorType;
  readonly items?: readonly InternalDescriptorItem[];
  readonly position?: Coordinate;
  readonly offset?: Pixel;
  /** Internal bridge used by the descriptor-owned OverlayHandle. */
  readonly visible?: boolean;
  readonly close?: boolean;
  readonly closeAction?: InternalDescriptorCloseAction;
  readonly onClose?: ((event: InternalDescriptorEvent<T>) => void) | undefined;
  readonly onItemClick?: ((event: InternalDescriptorEvent<T>) => void) | undefined;
  readonly draggable?: boolean;
  readonly fixedLine?: boolean;
  readonly fixedLineColor?: string;
  readonly fixedMode?: InternalDescriptorFixedMode;
  readonly data?: T | undefined;
}

export interface InternalDescriptorState<T = unknown> {
  readonly id: string;
  readonly elementRef: NativeRef<'element'>;
  readonly type: InternalDescriptorType;
  readonly items: readonly Readonly<InternalDescriptorItem>[];
  readonly position: Coordinate;
  readonly offset: Pixel;
  readonly close: boolean;
  readonly closeAction: InternalDescriptorCloseAction;
  readonly draggable: boolean;
  readonly fixedLine: boolean;
  readonly fixedLineColor: string;
  readonly fixedMode: InternalDescriptorFixedMode;
  readonly data: Readonly<T> | undefined;
  readonly visible: boolean;
}

export interface InternalDescriptorEvent<T = unknown> {
  readonly type: 'click' | 'close';
  readonly descriptor: import('./DescriptorHandle.js').DescriptorHandle<T>;
  readonly data: Readonly<T> | undefined;
  readonly item?: Readonly<InternalDescriptorItem>;
  readonly index?: number;
}

export type { Coordinate, Pixel };
