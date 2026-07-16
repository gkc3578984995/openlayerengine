import type { Coordinate } from '../common/types.js';

export interface TransformToolbarItemState {
  /** 工具栏项目的稳定键。 */
  readonly key: string;
  /** 按钮提示文案。 */
  readonly title: string;
  /** 按钮图标内容。 */
  readonly icon?: string;
  /** 按钮图标的 CSS 类名。 */
  readonly iconClass?: string;
  /** 项目是否可见。 */
  readonly visible: boolean;
  /** 项目是否禁用。 */
  readonly disabled: boolean;
  /** 项目是否处于激活状态。 */
  readonly active: boolean;
}

export interface TransformToolbarViewOptions {
  /** 工具栏锚定的地图坐标。 */
  readonly position: Coordinate;
  /** 相对锚点的像素偏移。 */
  readonly offset: readonly [number, number];
  /** 工具栏附加 CSS 类名。 */
  readonly className?: string;
  /** 工具栏是否可见。 */
  readonly visible: boolean;
}

export interface TransformToolbarViewSpec {
  /** 持有工具栏的 Session ID。 */
  readonly ownerId: string;
  /** 工具栏项目快照。 */
  readonly items: readonly TransformToolbarItemState[];
  /** 工具栏显示配置。 */
  readonly options: TransformToolbarViewOptions;
}

export type TransformToolbarViewEvent =
  Readonly<{ type: 'command'; key: string }> | Readonly<{ type: 'enter'; key: string }> | Readonly<{ type: 'leave'; key: string }>;

export interface TransformToolbarViewHandle {
  /** 设置工具栏激活项目。 */
  setActive(key: string): void;
  /** 更新工具栏项目。 */
  updateItem(key: string, patch: Partial<Omit<TransformToolbarItemState, 'key'>>): void;
  /** 更新工具栏显示配置。 */
  updateOptions(patch: Partial<TransformToolbarViewOptions>): void;
  /** 显示工具栏。 */
  show(): void;
  /** 隐藏工具栏。 */
  hide(): void;
  /** 释放工具栏 DOM 与 Overlay 资源。 */
  destroy(): void;
}

export interface TransformToolbarPort {
  /** 打开由 Session 独占的工具栏视图。 */
  open(spec: TransformToolbarViewSpec, listener: (event: TransformToolbarViewEvent) => void): TransformToolbarViewHandle;
}
