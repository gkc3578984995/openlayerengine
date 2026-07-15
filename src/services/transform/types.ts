import type { Coordinate } from '../../core/common/types.js';
import type { ElementCopyOptions, ElementSelector, ElementState } from '../../core/element/types.js';
import type { TransformDelta, TransformInteractionMode, TransformInteractionOptions, TransformOperation } from '../../core/ports/TransformInteractionPort.js';
import type { TransformToolbarViewHandle } from '../../core/ports/TransformToolbarPort.js';
import type { InteractionCancelReason, InteractionPolicy, InteractionStatus } from '../events/types.js';

/** Transform 平移能力的内部模式。 */
export type TransformTranslateMode = 'none' | 'center' | 'feature';
/** Transform 会话当前的交互模式。 */
export type TransformMode = TransformInteractionMode;

/** 启动 Transform 会话时使用的内部配置。 */
export interface InternalTransformOptions {
  /** 可选的元素选择范围。 */
  readonly selector?: ElementSelector;
  /** 可参与变换的图层 ID。 */
  readonly layerIds?: readonly string[];
  /** 元素命中的像素容差。 */
  readonly hitTolerance?: number;
  /** 平移能力模式。 */
  readonly translate?: TransformTranslateMode;
  /** 是否允许等比缩放。 */
  readonly scale?: boolean;
  /** 是否允许非等比拉伸。 */
  readonly stretch?: boolean;
  /** 是否允许旋转。 */
  readonly rotate?: boolean;
  /** 是否允许拖动包围框平移。 */
  readonly translateBBox?: boolean;
  /** 是否禁止翻转图形。 */
  readonly noFlip?: boolean;
  /** 是否保持矩形形状。 */
  readonly keepRectangle?: boolean;
  /** 控制区域外扩像素。 */
  readonly buffer?: number;
  /** 点元素控制区域半径。 */
  readonly pointRadius?: number;
  /** 控制手柄样式。 */
  readonly handleStyle?: TransformInteractionOptions['handleStyle'];
  /** 控制手柄中心偏移。 */
  readonly handleCenter?: Coordinate;
  /** 撤销历史容量。 */
  readonly historyLimit?: number;
  /** 工具栏配置或禁用标记。 */
  readonly toolbar?: false | InternalTransformToolbarOptions;
  /** 与其他交互冲突时采用的策略。 */
  readonly policy?: InteractionPolicy;
}

/** Transform 工具栏项目的内部配置。 */
export interface InternalTransformToolbarItemSpec {
  /** 项目唯一标识。 */
  readonly key: string;
  /** 项目提示文本。 */
  readonly title: string;
  /** 项目图片地址。 */
  readonly icon?: string;
  /** 项目图标类名。 */
  readonly iconClass?: string;
  /** 项目是否可见。 */
  readonly visible?: boolean;
  /** 项目是否禁用。 */
  readonly disabled?: boolean;
  /** 项目是否处于激活状态。 */
  readonly active?: boolean;
}

/** Transform 工具栏的内部配置。 */
export interface InternalTransformToolbarOptions {
  /** 工具栏项目。 */
  readonly items?: readonly InternalTransformToolbarItemSpec[];
  /** 工具栏相对元素的像素偏移。 */
  readonly offset?: readonly [number, number];
  /** 工具栏附加类名。 */
  readonly className?: string;
  /** 工具栏初始是否可见。 */
  readonly visible?: boolean;
}

/** 补齐默认值后的 Transform 配置。 */
export interface NormalizedTransformOptions extends Omit<
  Required<InternalTransformOptions>,
  'selector' | 'layerIds' | 'handleStyle' | 'handleCenter' | 'toolbar'
> {
  /** 规范化后的元素选择范围。 */
  readonly selector?: ElementSelector;
  /** 规范化后的图层 ID。 */
  readonly layerIds?: readonly string[];
  /** 规范化后的控制手柄样式。 */
  readonly handleStyle?: TransformInteractionOptions['handleStyle'];
  /** 规范化后的控制手柄中心。 */
  readonly handleCenter?: Coordinate;
  /** 规范化后的工具栏配置。 */
  readonly toolbar: false | InternalTransformToolbarOptions;
}

/** 记录历史快照对应的变换命令。 */
export interface TransformCommandMetadata {
  /** 产生快照的操作类型。 */
  readonly operation: TransformOperation | 'select' | 'replace';
  /** 命令创建时间戳。 */
  readonly timestamp: number;
}

/** Transform 会话可发出的内部事件。 */
export interface InternalTransformEventMap<T = unknown> {
  /** 元素选中事件。 */
  readonly select: Readonly<{ type: 'select'; state: Readonly<ElementState<T>> }>;
  /** 元素选中流程结束事件。 */
  readonly selectEnd: Readonly<{ type: 'selectEnd'; state: Readonly<ElementState<T>> }>;
  /** 指针进入控制手柄事件。 */
  readonly enterHandle: Readonly<{ type: 'enterHandle'; state: Readonly<ElementState<T>>; key: string; cursor?: string }>;
  /** 指针离开控制手柄事件。 */
  readonly leaveHandle: Readonly<{ type: 'leaveHandle'; state: Readonly<ElementState<T>>; key: string; cursor?: string }>;
  /** 平移开始事件。 */
  readonly translateStart: Readonly<{ type: 'translateStart'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 平移过程事件。 */
  readonly translating: Readonly<{ type: 'translating'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 平移结束事件。 */
  readonly translateEnd: Readonly<{ type: 'translateEnd'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 旋转开始事件。 */
  readonly rotateStart: Readonly<{ type: 'rotateStart'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 旋转过程事件。 */
  readonly rotating: Readonly<{ type: 'rotating'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 旋转结束事件。 */
  readonly rotateEnd: Readonly<{ type: 'rotateEnd'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 缩放开始事件。 */
  readonly scaleStart: Readonly<{ type: 'scaleStart'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 缩放过程事件。 */
  readonly scaling: Readonly<{ type: 'scaling'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 缩放结束事件。 */
  readonly scaleEnd: Readonly<{ type: 'scaleEnd'; state: Readonly<ElementState<T>>; delta: TransformDelta }>;
  /** 变换结果编辑事件。 */
  readonly edit: Readonly<{ type: 'edit'; state: Readonly<ElementState<T>>; operation: TransformOperation }>;
  /** 复制预览确认事件。 */
  readonly copyPreviewConfirm: Readonly<{ type: 'copyPreviewConfirm'; state: Readonly<ElementState<T>> }>;
  /** 复制预览取消事件。 */
  readonly copyPreviewCancel: Readonly<{ type: 'copyPreviewCancel' }>;
  /** 元素移除事件。 */
  readonly remove: Readonly<{ type: 'remove'; state: Readonly<ElementState<T>> }>;
  /** 会话错误事件。 */
  readonly error: Readonly<{ type: 'error'; error: unknown }>;
}

/** 替换选中元素时使用的内部配置。 */
export interface InternalTransformReplaceOptions {
  /** 是否保留当前历史记录。 */
  readonly retainHistory?: boolean;
}

/** Facade 与实现之间使用的 Transform 会话契约。 */
export interface InternalTransformSession<T = unknown> {
  /** 会话 ID。 */
  readonly id: string;
  /** 当前选中元素 ID。 */
  readonly selectedId: string | undefined;
  /** 会话当前状态。 */
  readonly status: InteractionStatus;
  /** 会话当前操作模式。 */
  readonly mode: TransformMode;
  /** 当前工具栏句柄。 */
  readonly toolbar: TransformToolbarViewHandle | undefined;
  /** 选择指定元素。 */
  select(elementId: string): void;
  /** 切换当前操作模式。 */
  setMode(mode: TransformMode): void;
  /** 提交并结束会话。 */
  finish(): void;
  /** 取消并结束会话。 */
  cancel(reason?: InteractionCancelReason): void;
  /** 销毁会话。 */
  destroy(): void;
  /** 撤销最近一次变换。 */
  undo(): boolean;
  /** 重做最近一次撤销。 */
  redo(): boolean;
  /** 复制当前选中元素。 */
  copy(options?: ElementCopyOptions<T>): Readonly<ElementState<T>>;
  /** 用指定元素替换当前选择。 */
  replaceSelected(elementId: string, options?: InternalTransformReplaceOptions): void;
  /** 移除当前选中元素。 */
  remove(): void;
  /** 订阅 Transform 会话事件。 */
  on<K extends keyof InternalTransformEventMap<T>>(type: K, listener: (event: InternalTransformEventMap<T>[K]) => void): () => void;
}

/** Transform 服务的内部契约。 */
export interface InternalTransformService {
  /** 启动空的 Transform 会话。 */
  start(options?: InternalTransformOptions): InternalTransformSession;
  /** 启动会话并选择指定元素。 */
  select<T>(elementId: string, options?: InternalTransformOptions): InternalTransformSession<T>;
}
