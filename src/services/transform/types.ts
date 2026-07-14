import type { Coordinate } from '../../core/common/types.js';
import type { ElementCopyOptions, ElementSelector, ElementState } from '../../core/element/types.js';
import type { TransformDelta, TransformInteractionOptions, TransformOperation } from '../../core/ports/TransformInteractionPort.js';
import type { TransformToolbarViewHandle } from '../../core/ports/TransformToolbarPort.js';
import type { InteractionCancelReason, InteractionPolicy, InteractionStatus } from '../events/types.js';

export type TransformTranslateMode = 'none' | 'center' | 'feature';

export interface InternalTransformOptions {
  readonly selector?: ElementSelector;
  readonly layerIds?: readonly string[];
  readonly hitTolerance?: number;
  readonly translate?: TransformTranslateMode;
  readonly scale?: boolean;
  readonly stretch?: boolean;
  readonly rotate?: boolean;
  readonly translateBBox?: boolean;
  readonly noFlip?: boolean;
  readonly keepRectangle?: boolean;
  readonly buffer?: number;
  readonly pointRadius?: number;
  readonly handleStyle?: TransformInteractionOptions['handleStyle'];
  readonly handleCenter?: Coordinate;
  readonly historyLimit?: number;
  readonly toolbar?: false | InternalTransformToolbarOptions;
  readonly policy?: InteractionPolicy;
}

export interface InternalTransformToolbarItemSpec {
  readonly key: string;
  readonly title: string;
  readonly icon?: string;
  readonly iconClass?: string;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly active?: boolean;
}

export interface InternalTransformToolbarOptions {
  readonly items?: readonly InternalTransformToolbarItemSpec[];
  readonly offset?: readonly [number, number];
  readonly className?: string;
  readonly visible?: boolean;
}

export interface NormalizedTransformOptions extends Omit<
  Required<InternalTransformOptions>,
  'selector' | 'layerIds' | 'handleStyle' | 'handleCenter' | 'toolbar'
> {
  readonly selector?: ElementSelector;
  readonly layerIds?: readonly string[];
  readonly handleStyle?: TransformInteractionOptions['handleStyle'];
  readonly handleCenter?: Coordinate;
  readonly toolbar: false | InternalTransformToolbarOptions;
}

export interface TransformCommandMetadata {
  readonly operation: TransformOperation | 'select' | 'replace';
  readonly timestamp: number;
}

export interface InternalTransformEventMap<T = unknown> {
  readonly select: Readonly<{ type: 'select'; state: Readonly<ElementState<T>> }>;
  readonly selectEnd: Readonly<{ type: 'selectEnd'; state: Readonly<ElementState<T>> }>;
  readonly enterHandle: Readonly<{ type: 'enterHandle'; state: Readonly<ElementState<T>>; key: string; cursor?: string }>;
  readonly leaveHandle: Readonly<{ type: 'leaveHandle'; state: Readonly<ElementState<T>>; key: string; cursor?: string }>;
  readonly translateStart: Readonly<{ type: 'translateStart'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly translating: Readonly<{ type: 'translating'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly translateEnd: Readonly<{ type: 'translateEnd'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly rotateStart: Readonly<{ type: 'rotateStart'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly rotating: Readonly<{ type: 'rotating'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly rotateEnd: Readonly<{ type: 'rotateEnd'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly scaleStart: Readonly<{ type: 'scaleStart'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly scaling: Readonly<{ type: 'scaling'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly scaleEnd: Readonly<{ type: 'scaleEnd'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  readonly edit: Readonly<{ type: 'edit'; state: Readonly<ElementState<T>>; operation: TransformOperation }>;
  readonly copyPreviewConfirm: Readonly<{ type: 'copyPreviewConfirm'; state: Readonly<ElementState<T>> }>;
  readonly copyPreviewCancel: Readonly<{ type: 'copyPreviewCancel' }>;
  readonly remove: Readonly<{ type: 'remove'; state: Readonly<ElementState<T>> }>;
  readonly error: Readonly<{ type: 'error'; error: unknown }>;
}

export interface InternalTransformReplaceOptions {
  readonly retainHistory?: boolean;
}

export interface InternalTransformSession<T = unknown> {
  readonly id: string;
  readonly selectedId: string | undefined;
  readonly status: InteractionStatus;
  readonly toolbar: TransformToolbarViewHandle | undefined;
  select(elementId: string): void;
  finish(): void;
  cancel(reason?: InteractionCancelReason): void;
  destroy(): void;
  undo(): boolean;
  redo(): boolean;
  copy(options?: ElementCopyOptions<T>): Readonly<ElementState<T>>;
  replaceSelected(elementId: string, options?: InternalTransformReplaceOptions): void;
  remove(): void;
  on<K extends keyof InternalTransformEventMap<T>>(type: K, listener: (event: InternalTransformEventMap<T>[K]) => void): () => void;
}

export interface InternalTransformService {
  start(options?: InternalTransformOptions): InternalTransformSession;
  select<T>(elementId: string, options?: InternalTransformOptions): InternalTransformSession<T>;
}
