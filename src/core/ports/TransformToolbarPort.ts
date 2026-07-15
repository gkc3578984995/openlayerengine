import type { Coordinate } from '../common/types.js';

/** 内部接口。约定 TransformToolbarItemState 使用的数据和操作。 */
export interface TransformToolbarItemState {
  /** 键。保存项目或按键的标识。 */
  readonly key: string;
  /** 提示文字。保存按钮的说明。 */
  readonly title: string;
  /** 图标。保存按钮使用的图标内容。 */
  readonly icon?: string;
  /** 图标类名。保存按钮图标的 CSS 类名。 */
  readonly iconClass?: string;
  /** 是否显示。控制内容是否可见。 */
  readonly visible: boolean;
  /** 是否禁用。控制当前项目能否操作。 */
  readonly disabled: boolean;
  /** 是否激活。控制项目的选中状态。 */
  readonly active: boolean;
}

/** 内部接口。约定 TransformToolbarViewOptions 使用的数据和操作。 */
export interface TransformToolbarViewOptions {
  /** 位置。保存当前地图坐标。 */
  readonly position: Coordinate;
  /** 偏移。保存界面的像素偏移。 */
  readonly offset: readonly [number, number];
  /** 类名。保存界面使用的 CSS 类名。 */
  readonly className?: string;
  /** 是否显示。控制内容是否可见。 */
  readonly visible: boolean;
}

/** 内部接口。约定 TransformToolbarViewSpec 使用的数据和操作。 */
export interface TransformToolbarViewSpec {
  /** 拥有者 ID。标识资源所属会话。 */
  readonly ownerId: string;
  /** 项目。保存当前界面的项目列表。 */
  readonly items: readonly TransformToolbarItemState[];
  /** 配置。保存界面的显示参数。 */
  readonly options: TransformToolbarViewOptions;
}

/** 内部类型。描述 TransformToolbarViewEvent 的可用数据。 */
export type TransformToolbarViewEvent =
  Readonly<{ type: 'command'; key: string }> | Readonly<{ type: 'enter'; key: string }> | Readonly<{ type: 'leave'; key: string }>;

/** 内部接口。约定 TransformToolbarViewHandle 使用的数据和操作。 */
export interface TransformToolbarViewHandle {
  /** 设置工具栏激活项目。 */
  setActive(key: string): void;
  /** 更新工具栏项目。 */
  updateItem(key: string, patch: Partial<Omit<TransformToolbarItemState, 'key'>>): void;
  /** 更新工具栏显示配置。 */
  updateOptions(patch: Partial<TransformToolbarViewOptions>): void;
  /** 显示当前界面。 */
  show(): void;
  /** 隐藏当前界面。 */
  hide(): void;
  /** 释放当前对象占用的资源。 */
  destroy(): void;
}

/** 内部接口。约定 TransformToolbarPort 使用的数据和操作。 */
export interface TransformToolbarPort {
  /** 打开一个内部交互或视图。 */
  open(spec: TransformToolbarViewSpec, listener: (event: TransformToolbarViewEvent) => void): TransformToolbarViewHandle;
}
