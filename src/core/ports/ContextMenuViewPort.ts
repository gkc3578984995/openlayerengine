import type { Coordinate, Pixel } from '../common/types.js';

export interface ContextMenuViewItem {
  /** 菜单项的稳定键。 */
  readonly key: string;
  /** 菜单项文案。 */
  readonly label: string;
  /** 是否禁止选择。 */
  readonly disabled: boolean;
  /** 级联子菜单。 */
  readonly children?: readonly ContextMenuViewItem[];
}

export interface ContextMenuViewModel {
  /** 菜单对应的地图坐标。 */
  readonly coordinate: Coordinate;
  /** 菜单锚定的屏幕像素。 */
  readonly pixel: Pixel;
  /** 当前可见的菜单项。 */
  readonly items: readonly ContextMenuViewItem[];
}

export type ContextMenuViewEvent =
  | {
      /** 用户选择菜单项。 */
      readonly type: 'select';
      /** 被选择菜单项的键。 */
      readonly key: string;
    }
  | {
      /** 菜单已关闭。 */
      readonly type: 'close';
    };

export interface ContextMenuViewPort {
  /** 订阅菜单事件并返回取消函数。 */
  listen(listener: (event: ContextMenuViewEvent) => void): () => void;
  /** 显示菜单。 */
  show(model: ContextMenuViewModel): void;
  /** 关闭菜单。 */
  close(): void;
  /** 切换界面主题。 */
  setTheme(theme: 'light' | 'dark'): void;
  /** 释放菜单视图资源。 */
  destroy(): void;
}
