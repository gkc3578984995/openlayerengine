import type { ShapeState, ShapeType } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

/**
 * 元素状态。保存一个地图元素当前的几何、样式和业务信息。
 *
 * @typeParam T 业务数据。元素携带的数据类型。
 */
export interface ElementState<T = unknown> {
  /** 元素 ID。当前 Earth 中唯一的元素标识。 */
  readonly id: string;
  /** 图形类型。元素使用的图形类型。 */
  readonly type: ShapeType;
  /** 几何。元素当前的几何状态。 */
  readonly geometry: ShapeState;
  /** 样式。元素当前使用的样式。 */
  readonly style: ElementStyleState;
  /** 业务数据。元素携带的自定义数据。 */
  readonly data?: T;
  /** 模块。用于按业务模块分组元素。 */
  readonly module?: string;
  /** 图层 ID。元素所在的图层。 */
  readonly layerId: string;
  /** 是否显示。控制元素是否可见。 */
  readonly visible: boolean;
}

/**
 * 元素选择器。通过一个或多个条件筛选元素。
 *
 * `id` 和 `ids` 不能同时设置。更新、删除、显隐等批量写操作必须至少提供一个条件；要清空全部元素请使用 `clear()`。
 *
 * @typeParam T 业务数据。元素携带的数据类型。
 */
export interface ElementSelector<T = unknown> {
  /** 元素 ID。只匹配这个元素。 */
  id?: string;
  /** 元素 ID 列表。匹配列表中的元素。 */
  ids?: readonly string[];
  /** 模块。只匹配这个业务模块的元素。 */
  module?: string;
  /** 图层 ID。只匹配这个图层中的元素。 */
  layerId?: string;
  /** 图形类型。只匹配这个类型的元素。 */
  type?: ShapeType;
  /** 是否显示。按元素的可见状态筛选。 */
  visible?: boolean;
  /** 自定义判断。返回 `true` 时保留当前元素。 */
  predicate?: (state: Readonly<ElementState<T>>) => boolean;
}

/**
 * 元素更新参数。可以修改除 ID 和图形类型以外的状态。
 *
 * @typeParam T 业务数据。元素携带的数据类型。
 */
export type ElementPatch<T = unknown> = Partial<Omit<ElementState<T>, 'id' | 'type'>>;

/**
 * 元素复制参数。可以覆盖新元素的几何、样式和业务信息。
 *
 * @typeParam T 业务数据。元素携带的数据类型。
 */
export type ElementCopyOptions<T = unknown> = Partial<Omit<ElementState<T>, 'id' | 'type'>>;
