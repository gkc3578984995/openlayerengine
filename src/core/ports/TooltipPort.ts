import type { Coordinate } from '../common/types.js';

/** 内部交互提示框的视觉变体。 */
export type TooltipVariant = 'draw' | 'edit' | 'transform';

/** 内部交互提示框的可变视图状态。 */
export interface TooltipViewState {
  /** 提示框当前所在的地图坐标。 */
  readonly position: Coordinate;
  /** 需要显示的多行提示文字。 */
  readonly lines: readonly string[];
  /** 相对地图坐标的像素偏移。 */
  readonly offset: readonly [number, number];
  /** 是否显示提示框。 */
  readonly visible: boolean;
}

/** 打开一个交互提示框所需的完整配置。 */
export interface TooltipViewSpec extends TooltipViewState {
  /** 标识提示框所属的会话。 */
  readonly ownerId: string;
  /** 选择与交互类型对应的 DOM 样式；省略时兼容 Transform 提示框。 */
  readonly variant?: TooltipVariant;
}

/** 已挂载交互提示框的所有权句柄。 */
export interface TooltipViewHandle {
  /** 更新已经挂载的提示框。 */
  update(patch: Partial<TooltipViewState>): void;
  /** 显示提示框。 */
  show(): void;
  /** 隐藏提示框。 */
  hide(): void;
  /** 释放提示框占用的 DOM 与 Overlay 资源。 */
  destroy(): void;
}

/** 会话层用于创建交互提示框的内部端口。 */
export interface TooltipPort {
  /** 打开一个提示框并返回完整所有权句柄。 */
  open(spec: TooltipViewSpec): TooltipViewHandle;
}
