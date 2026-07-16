import type { Coordinate } from '../common/types.js';

/** 交互 Tooltip 的视觉变体。 */
export type TooltipVariant = 'draw' | 'edit' | 'transform';

/** Tooltip 文本片段的语义色调。 */
export type TooltipSegmentTone = 'shortcut' | 'undo' | 'redo' | 'danger' | 'exit' | 'muted';

/** 由 Session 显式标注语义的 Tooltip 文本片段。 */
export interface TooltipSegment {
  /** 安全写入 DOM textContent 的纯文本。 */
  readonly text: string;
  /** 可选的快捷键或状态色调。 */
  readonly tone?: TooltipSegmentTone;
}

/** Tooltip 行可以是普通文本，也可以是已经分段的语义富文本。 */
export type TooltipLine = string | readonly TooltipSegment[];

/** 交互 Tooltip 的可变视图状态。 */
export interface TooltipViewState {
  /** Tooltip 当前所在的地图坐标。 */
  readonly position: Coordinate;
  /** 需要显示的多行提示文字。 */
  readonly lines: readonly TooltipLine[];
  /** 相对地图坐标的像素偏移。 */
  readonly offset: readonly [number, number];
  /** Tooltip 是否可见。 */
  readonly visible: boolean;
}

/** 打开交互 Tooltip 所需的完整配置。 */
export interface TooltipViewSpec extends TooltipViewState {
  /** 持有 Tooltip 的 Session ID。 */
  readonly ownerId: string;
  /** 选择与交互类型对应的 DOM 样式；省略时兼容 Transform Tooltip。 */
  readonly variant?: TooltipVariant;
}

/** 已挂载 Tooltip 的所有权句柄。 */
export interface TooltipViewHandle {
  /** 更新已挂载的 Tooltip。 */
  update(patch: Partial<TooltipViewState>): void;
  /** 显示 Tooltip。 */
  show(): void;
  /** 隐藏 Tooltip。 */
  hide(): void;
  /** 释放 Tooltip 占用的 DOM 与 Overlay 资源。 */
  destroy(): void;
}

/** Session 创建交互 Tooltip 的内部端口。 */
export interface TooltipPort {
  /** 打开 Tooltip 并返回完整所有权句柄。 */
  open(spec: TooltipViewSpec): TooltipViewHandle;
}
