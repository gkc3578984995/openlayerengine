import type { Coordinate } from '../../core/common/types.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import type { InputEventMap } from '../../core/ports/InputPort.js';
import type { ShapeState, ShapeType } from '../../core/shape/types.js';
import type { ElementStyleState } from '../../core/style/types.js';
import type { InteractionCancelReason, InteractionPolicy, InteractionStatus } from '../events/types.js';

/**
 * 绘制与编辑会话使用的键盘输入子集。
 *
 * @internal
 */
export interface SessionKeyboardInput {
  on(type: 'keydown', listener: (event: InputEventMap['keydown']) => void): () => void;
}

/**
 * 经过 Facade 处理后传入内部绘制服务的配置。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalDrawOptions<T = unknown> {
  readonly type: ShapeType;
  readonly layerId: string;
  readonly module?: string;
  readonly style?: ElementStyleState;
  readonly data?: T;
  readonly limit?: number;
  readonly keepGraphics?: boolean;
  readonly policy?: InteractionPolicy;
}

/**
 * 传入内部编辑服务的配置。
 *
 * @internal
 */
export interface InternalEditOptions {
  readonly underlay?: boolean;
  readonly policy?: InteractionPolicy;
}

/**
 * 内部绘制会话的完整取消原因。
 *
 * @internal
 */
export type DrawCancelReason = InteractionCancelReason | 'incomplete' | 'native' | 'error';
/**
 * 内部编辑会话的完整取消原因。
 *
 * @internal
 */
export type EditCancelReason = InteractionCancelReason | 'external-change' | 'external-remove' | 'error';

/**
 * 内部绘制会话的元素状态事件映射。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalDrawSessionEventMap<T = unknown> {
  readonly start: Readonly<{ type: 'start'; coordinate: Coordinate }>;
  readonly change: Readonly<{ type: 'change'; geometry: ShapeState; coordinate?: Coordinate }>;
  readonly click: Readonly<{ type: 'click'; coordinate: Coordinate; controlPointCount: number }>;
  readonly complete: Readonly<{ type: 'complete'; state: Readonly<ElementState<T>> }>;
  readonly cancel: Readonly<{ type: 'cancel'; reason: DrawCancelReason }>;
}

/**
 * 内部编辑会话的元素状态事件映射。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalEditSessionEventMap<T = unknown> {
  readonly modifying: Readonly<{
    type: 'modifying';
    state: ShapeState;
    operation: 'move' | 'insert' | 'remove' | 'undo' | 'redo';
    coordinate?: Coordinate;
  }>;
  readonly complete: Readonly<{ type: 'complete'; state: Readonly<ElementState<T>> }>;
  readonly cancel: Readonly<{ type: 'cancel'; reason: EditCancelReason }>;
}

/**
 * 仅在服务与 Facade 之间传递元素状态的绘制会话契约。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalDrawSession<T = unknown> {
  readonly status: InteractionStatus;
  readonly results: readonly Readonly<ElementState<T>>[];
  readonly finished: Promise<readonly Readonly<ElementState<T>>[]>;
  finish(): void;
  cancel(): void;
  destroy(): void;
  undo(): boolean;
  redo(): boolean;
  on<K extends keyof InternalDrawSessionEventMap<T>>(type: K, listener: (event: InternalDrawSessionEventMap<T>[K]) => void): () => void;
}

/**
 * 仅在服务与 Facade 之间传递元素 ID 和状态的编辑会话契约。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalEditSession<T = unknown> {
  readonly elementId: string;
  readonly status: InteractionStatus;
  readonly finished: Promise<Readonly<ElementState<T>> | undefined>;
  finish(): void;
  cancel(): void;
  destroy(): void;
  undo(): boolean;
  redo(): boolean;
  on<K extends keyof InternalEditSessionEventMap<T>>(type: K, listener: (event: InternalEditSessionEventMap<T>[K]) => void): () => void;
}

/**
 * 统一绘制与编辑内部服务契约。
 *
 * @internal
 */
export interface InternalDrawService {
  start<T>(options: InternalDrawOptions<T>): InternalDrawSession<T>;
  edit<T>(elementId: string, options?: InternalEditOptions): InternalEditSession<T>;
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[];
  clear(selector?: ElementSelector): number;
}
