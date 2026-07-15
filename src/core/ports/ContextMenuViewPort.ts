import type { Coordinate, Pixel } from '../common/types.js';

/** 内部接口。约定 ContextMenuViewItem 使用的数据和操作。 */
export interface ContextMenuViewItem {
  /** 键。保存项目或按键的标识。 */
  readonly key: string;
  /** 标题。保存界面显示的文字。 */
  readonly label: string;
  /** 是否禁用。控制当前项目能否操作。 */
  readonly disabled: boolean;
  /** 子项。保存下一级菜单项目。 */
  readonly children?: readonly ContextMenuViewItem[];
}

/** 内部接口。约定 ContextMenuViewModel 使用的数据和操作。 */
export interface ContextMenuViewModel {
  /** 坐标。保存当前地图坐标。 */
  readonly coordinate: Coordinate;
  /** 像素。保存当前屏幕像素位置。 */
  readonly pixel: Pixel;
  /** 项目。保存当前界面的项目列表。 */
  readonly items: readonly ContextMenuViewItem[];
}

/** 内部类型。描述 ContextMenuViewEvent 的可用数据。 */
export type ContextMenuViewEvent =
  | {
      /** 类型。表示用户选择了菜单项。 */
      readonly type: 'select';
      /** 项目键。标识被选择的菜单项。 */
      readonly key: string;
    }
  | {
      /** 类型。表示菜单已经关闭。 */
      readonly type: 'close';
    };

/** 内部接口。约定 ContextMenuViewPort 使用的数据和操作。 */
export interface ContextMenuViewPort {
  /** 监听内部事件并返回取消函数。 */
  listen(listener: (event: ContextMenuViewEvent) => void): () => void;
  /** 显示当前界面。 */
  show(model: ContextMenuViewModel): void;
  /** 关闭当前界面。 */
  close(): void;
  /** 切换界面主题。 */
  setTheme(theme: 'light' | 'dark'): void;
  /** 释放当前对象占用的资源。 */
  destroy(): void;
}
