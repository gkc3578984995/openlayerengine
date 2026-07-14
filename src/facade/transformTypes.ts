import type { Coordinate } from '../core/common/types.js';
import type { ElementCopyOptions, ElementSelector } from '../core/element/types.js';
import type { StyleSpec } from '../core/style/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';
import type { Element } from './Element.js';

export type TransformTranslateMode = 'none' | 'center' | 'feature';

export interface TransformToolbarItemSpec {
  key: string;
  title: string;
  icon?: string;
  iconClass?: string;
  visible?: boolean;
  disabled?: boolean;
  active?: boolean;
}

export interface TransformToolbarItemPatch {
  title?: string;
  icon?: string;
  iconClass?: string;
  visible?: boolean;
  disabled?: boolean;
  active?: boolean;
}

export interface TransformToolbarOptions {
  items?: readonly TransformToolbarItemSpec[];
  offset?: readonly [number, number];
  className?: string;
  visible?: boolean;
}

export interface TransformToolbarOptionsPatch {
  position?: Coordinate;
  offset?: readonly [number, number];
  className?: string;
  visible?: boolean;
}

export interface TransformOptions {
  selector?: ElementSelector;
  predicate?: (element: Element) => boolean;
  layerIds?: readonly string[];
  hitTolerance?: number;
  translate?: TransformTranslateMode;
  scale?: boolean;
  stretch?: boolean;
  rotate?: boolean;
  translateBBox?: boolean;
  noFlip?: boolean;
  keepRectangle?: boolean;
  buffer?: number;
  pointRadius?: number;
  handleStyle?: StyleSpec;
  handleCenter?: Coordinate;
  historyLimit?: number;
  toolbar?: boolean | TransformToolbarOptions;
  policy?: InteractionPolicy;
}

export interface TransformReplaceOptions {
  retainHistory?: boolean;
}

export interface TransformEventMap<T = unknown> {
  select: Readonly<{ type: 'select'; element: Element<T> }>;
  selectEnd: Readonly<{ type: 'selectEnd'; element: Element<T> }>;
  enterHandle: Readonly<{ type: 'enterHandle'; element: Element<T>; key: string; cursor?: string }>;
  leaveHandle: Readonly<{ type: 'leaveHandle'; element: Element<T>; key: string; cursor?: string }>;
  translateStart: Readonly<{ type: 'translateStart'; element: Element<T> }>;
  translating: Readonly<{ type: 'translating'; element: Element<T> }>;
  translateEnd: Readonly<{ type: 'translateEnd'; element: Element<T> }>;
  rotateStart: Readonly<{ type: 'rotateStart'; element: Element<T> }>;
  rotating: Readonly<{ type: 'rotating'; element: Element<T> }>;
  rotateEnd: Readonly<{ type: 'rotateEnd'; element: Element<T> }>;
  scaleStart: Readonly<{ type: 'scaleStart'; element: Element<T> }>;
  scaling: Readonly<{ type: 'scaling'; element: Element<T> }>;
  scaleEnd: Readonly<{ type: 'scaleEnd'; element: Element<T> }>;
  edit: Readonly<{ type: 'edit'; element: Element<T> }>;
  copyPreviewConfirm: Readonly<{ type: 'copyPreviewConfirm'; element: Element<T> }>;
  copyPreviewCancel: Readonly<{ type: 'copyPreviewCancel' }>;
  remove: Readonly<{ type: 'remove'; element: Element<T> }>;
  error: Readonly<{ type: 'error'; error: unknown }>;
}

export interface TransformToolbarHandle {
  setActive(key: string): void;
  updateItem(key: string, patch: TransformToolbarItemPatch): void;
  updateOptions(patch: TransformToolbarOptionsPatch): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface TransformSession<T = unknown> {
  readonly selected: Element<T> | undefined;
  readonly status: InteractionStatus;
  readonly toolbar: TransformToolbarHandle | undefined;
  select(element: Element<T>): void;
  finish(): void;
  cancel(): void;
  undo(): boolean;
  redo(): boolean;
  copy(options?: ElementCopyOptions<T>): Element<T>;
  replaceSelected(element: Element<T>, options?: TransformReplaceOptions): void;
  remove(): void;
  on<K extends keyof TransformEventMap<T>>(type: K, listener: (event: TransformEventMap<T>[K]) => void): () => void;
}

export interface TransformService {
  start(options?: TransformOptions): TransformSession;
  select<T>(element: Element<T>, options?: TransformOptions): TransformSession<T>;
}
