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
  /** 订阅键盘按下事件。 */
  on(type: 'keydown', listener: (event: InputEventMap['keydown']) => void): () => void;
}

/**
 * Public Facade 校验后交给 DrawService 的内部配置。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalDrawOptions<T = unknown> {
  /** 要绘制的图形类型。 */
  readonly type: ShapeType;
  /** 绘制结果所属图层。 */
  readonly layerId: string;
  /** 绘制结果所属业务模块。 */
  readonly module?: string;
  /** 绘制结果使用的样式。 */
  readonly style?: ElementStyleState;
  /** 写入元素的业务数据。 */
  readonly data?: T;
  /** 本次会话允许保留的结果数量。 */
  readonly limit?: number;
  /** Session 结束时是否保留已经提交的绘制结果。 */
  readonly keepGraphics?: boolean;
  /** 与其他交互冲突时采用的策略。 */
  readonly policy?: InteractionPolicy;
}

/**
 * Public Facade 校验后交给 EditSession 的内部配置。
 *
 * @internal
 */
export interface InternalEditOptions {
  /** 是否显式显示中性的原始几何 underlay；默认不叠加。 */
  readonly underlay?: boolean;
  /** 与其他交互冲突时采用的策略。 */
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
  /** 绘制会话启动事件。 */
  readonly start: Readonly<{ type: 'start'; coordinate: Coordinate }>;
  /** 预览几何变化事件。 */
  readonly change: Readonly<{ type: 'change'; geometry: ShapeState; coordinate?: Coordinate }>;
  /** 控制点点击事件。 */
  readonly click: Readonly<{ type: 'click'; coordinate: Coordinate; controlPointCount: number }>;
  /** 单个绘制结果完成事件。 */
  readonly complete: Readonly<{ type: 'complete'; state: Readonly<ElementState<T>> }>;
  /** 绘制会话取消事件。 */
  readonly cancel: Readonly<{ type: 'cancel'; reason: DrawCancelReason }>;
}

/**
 * 内部编辑会话的元素状态事件映射。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalEditSessionEventMap<T = unknown> {
  /** 编辑过程中的几何变化事件。 */
  readonly modifying: Readonly<{
    type: 'modifying';
    state: ShapeState;
    operation: 'move' | 'insert' | 'remove' | 'undo' | 'redo';
    coordinate?: Coordinate;
  }>;
  /** 编辑提交完成事件。 */
  readonly complete: Readonly<{ type: 'complete'; state: Readonly<ElementState<T>> }>;
  /** 编辑会话取消事件。 */
  readonly cancel: Readonly<{ type: 'cancel'; reason: EditCancelReason }>;
}

/**
 * Public Facade 与 DrawService 之间传递 Element 状态的 Session 契约。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalDrawSession<T = unknown> {
  /** 会话当前状态。 */
  readonly status: InteractionStatus;
  /** 已完成的绘制结果。 */
  readonly results: readonly Readonly<ElementState<T>>[];
  /** 会话结束后解析全部绘制结果。 */
  readonly finished: Promise<readonly Readonly<ElementState<T>>[]>;
  /** 主动完成当前会话。 */
  finish(): void;
  /** 取消当前会话。 */
  cancel(): void;
  /** 销毁当前会话。 */
  destroy(): void;
  /** 撤销最近一次绘制操作。 */
  undo(): boolean;
  /** 重做最近一次撤销操作。 */
  redo(): boolean;
  /** 订阅绘制会话事件。 */
  on<K extends keyof InternalDrawSessionEventMap<T>>(type: K, listener: (event: InternalDrawSessionEventMap<T>[K]) => void): () => void;
}

/**
 * Public Facade 与 DrawService 之间传递 Element ID 和状态的 Edit Session 契约。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface InternalEditSession<T = unknown> {
  /** 正在编辑的元素 ID。 */
  readonly elementId: string;
  /** 会话当前状态。 */
  readonly status: InteractionStatus;
  /** 会话结束后解析最终元素状态。 */
  readonly finished: Promise<Readonly<ElementState<T>> | undefined>;
  /** 提交当前编辑结果。 */
  finish(): void;
  /** 取消当前编辑。 */
  cancel(): void;
  /** 销毁当前会话。 */
  destroy(): void;
  /** 撤销最近一次编辑操作。 */
  undo(): boolean;
  /** 重做最近一次撤销操作。 */
  redo(): boolean;
  /** 订阅编辑会话事件。 */
  on<K extends keyof InternalEditSessionEventMap<T>>(type: K, listener: (event: InternalEditSessionEventMap<T>[K]) => void): () => void;
}

/**
 * 统一绘制与编辑内部服务契约。
 *
 * @internal
 */
export interface InternalDrawService {
  /** 启动绘制会话。 */
  start<T>(options: InternalDrawOptions<T>): InternalDrawSession<T>;
  /** 启动指定元素的编辑会话。 */
  edit<T>(elementId: string, options?: InternalEditOptions): InternalEditSession<T>;
  /** 查询绘制服务拥有的元素。 */
  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[];
  /** 清除匹配的绘制元素。 */
  clear(selector?: ElementSelector): number;
}
