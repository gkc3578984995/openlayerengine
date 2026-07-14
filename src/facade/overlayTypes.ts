import type { Coordinate, Pixel } from '../core/common/types.js';

export type OverlayOwnership = 'external' | 'earth';
export type OverlayPositioning =
  'bottom-left' | 'bottom-center' | 'bottom-right' | 'center-left' | 'center-center' | 'center-right' | 'top-left' | 'top-center' | 'top-right';

export interface PanIntoViewSpec {
  readonly margin?: number;
  readonly duration?: number;
  readonly easing?: (progress: number) => number;
}

export interface OverlaySpec<T = unknown> {
  readonly id?: string;
  readonly element: HTMLElement;
  readonly position?: Coordinate;
  readonly offset?: Pixel;
  readonly positioning?: OverlayPositioning;
  readonly stopEvent?: boolean;
  readonly insertFirst?: boolean;
  readonly autoPan?: boolean | PanIntoViewSpec;
  readonly className?: string;
  readonly module?: string;
  readonly data?: T;
  readonly ownership?: OverlayOwnership;
}

export interface OverlayPatch<T = unknown> {
  readonly element?: HTMLElement;
  readonly position?: Coordinate | undefined;
  readonly offset?: Pixel;
  readonly positioning?: OverlayPositioning;
  readonly visible?: boolean;
  readonly data?: T | undefined;
  readonly ownership?: OverlayOwnership;
}

export interface OverlaySelector<T = unknown> {
  readonly id?: string;
  readonly ids?: readonly string[];
  readonly module?: string;
  readonly visible?: boolean;
  readonly predicate?: (data: Readonly<T> | undefined, handle: OverlayHandle<T>) => boolean;
}

export interface OverlayHandle<T = unknown> {
  readonly id: string;
  readonly position: Coordinate | undefined;
  readonly visible: boolean;
  update(patch: OverlayPatch<T>): void;
  setPosition(position: Coordinate | undefined): void;
  show(): void;
  hide(): void;
  panIntoView(options?: PanIntoViewSpec): void;
  destroy(): void;
}

export interface DescriptorListItem<Value = string | number> {
  readonly label: string;
  readonly value: Value;
  readonly color?: string;
  readonly className?: string;
}

export type DescriptorContent = readonly DescriptorListItem[] | string | HTMLElement;
export type DescriptorCloseAction = 'hide' | 'destroy';
export type DescriptorFixedMode = 'position' | 'pixel';

export interface DescriptorEvent<T = unknown> {
  readonly type: 'click' | 'close';
  readonly descriptor: DescriptorHandle<T>;
  readonly data: Readonly<T> | undefined;
  readonly item?: Readonly<DescriptorListItem>;
  readonly index?: number;
}

interface DescriptorCommonSpec<T> {
  readonly id?: string;
  readonly position: Coordinate;
  readonly offset?: Pixel;
  readonly header?: string;
  readonly footer?: string;
  readonly close?: boolean;
  readonly closeAction?: DescriptorCloseAction;
  readonly onClose?: (event: DescriptorEvent<T>) => void;
  readonly onItemClick?: (event: DescriptorEvent<T>) => void;
  readonly draggable?: boolean;
  readonly fixedLine?: boolean;
  readonly fixedLineColor?: string;
  readonly fixedMode?: DescriptorFixedMode;
  readonly data?: T;
}

export type DescriptorSpec<T = unknown> = DescriptorCommonSpec<T> &
  ({ readonly type: 'list'; readonly content: readonly DescriptorListItem[] } | { readonly type: 'custom'; readonly content: string | HTMLElement });

export interface DescriptorPatch<T = unknown> {
  readonly content?: DescriptorContent;
  readonly position?: Coordinate;
  readonly offset?: Pixel;
  readonly header?: string | undefined;
  readonly footer?: string | undefined;
  readonly close?: boolean;
  readonly closeAction?: DescriptorCloseAction;
  readonly onClose?: ((event: DescriptorEvent<T>) => void) | undefined;
  readonly onItemClick?: ((event: DescriptorEvent<T>) => void) | undefined;
  readonly draggable?: boolean;
  readonly fixedLine?: boolean;
  readonly fixedLineColor?: string;
  readonly fixedMode?: DescriptorFixedMode;
  readonly data?: T | undefined;
}

export interface DescriptorHandle<T = unknown> {
  readonly id: string;
  readonly visible: boolean;
  update(patch: DescriptorPatch<T>): void;
  setPosition(position: Coordinate): void;
  show(): void;
  hide(): void;
  close(): void;
  on(type: 'click' | 'close', listener: (event: DescriptorEvent<T>) => void): () => void;
  destroy(): void;
}

export interface OverlayService {
  add<T>(spec: OverlaySpec<T>): OverlayHandle<T>;
  get<T>(id: string): OverlayHandle<T> | undefined;
  query<T>(selector?: OverlaySelector<T>): readonly OverlayHandle<T>[];
  remove(selector: OverlaySelector): number;
  clear(): void;
  createDescriptor<T>(spec: DescriptorSpec<T>): DescriptorHandle<T>;
}
