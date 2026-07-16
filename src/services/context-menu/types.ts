import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { ElementState } from '../../core/element/types.js';

/** 描述右键菜单注册所属的地图、模块或元素。 */
export type InternalContextMenuTarget =
  { readonly kind: 'map' } | { readonly kind: 'module'; readonly module: string } | { readonly kind: 'element'; readonly elementId: string };

/** 描述可保存菜单状态的地图或元素目标。 */
export type InternalContextMenuStateTarget = { readonly kind: 'map' } | { readonly kind: 'element'; readonly elementId: string };

/** 右键菜单项目的内部配置。 */
export interface InternalContextMenuItemSpec {
  /** 项目唯一标识。 */
  readonly key: string;
  /** 项目显示文本。 */
  readonly label: string;
  /** 项目初始是否可见。 */
  readonly visible?: boolean;
  /** 项目初始是否禁用。 */
  readonly disabled?: boolean;
  /** 项目所属的互斥分组。 */
  readonly mutexKey?: string;
  /** 子菜单项目。 */
  readonly children?: readonly InternalContextMenuItemSpec[];
}

/** 菜单回调收到的命中信息与作用范围。 */
export interface InternalContextMenuItemContext {
  /** 当前菜单项目。 */
  readonly item: InternalContextMenuItemSpec;
  /** 当前菜单的作用范围。 */
  readonly scope: 'map' | 'module' | 'element';
  /** 触发菜单的地图坐标。 */
  readonly coordinate: Coordinate;
  /** 触发菜单的屏幕像素。 */
  readonly pixel: Pixel;
  /** 命中的元素状态。 */
  readonly element?: Readonly<ElementState>;
  /** 命中的业务模块。 */
  readonly module?: string;
  /** 命中的图层 ID。 */
  readonly layerId?: string;
}

/** 一次右键菜单注册的内部配置。 */
export interface InternalContextMenuSpec {
  /** 要显示的菜单项目。 */
  readonly items: readonly InternalContextMenuItemSpec[];
  /** 菜单显示前的判定回调。 */
  readonly before?: (context: InternalContextMenuItemContext) => boolean;
  /** 菜单项目被选择时的回调。 */
  readonly onSelect?: (context: InternalContextMenuItemContext) => void;
}

/** 菜单项目当前的可见与禁用状态。 */
export interface InternalContextMenuItemState {
  /** 项目是否可见。 */
  readonly visible: boolean;
  /** 项目是否禁用。 */
  readonly disabled: boolean;
}

/** 一次右键菜单注册的幂等注销句柄。 */
export interface ContextMenuRegistrationHandle {
  /** 销毁注册并释放状态。 */
  destroy(): void;
}
