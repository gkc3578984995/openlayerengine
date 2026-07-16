import type { ShapeInput, ShapeState, ShapeType } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

/**
 * Element 的规范业务状态，包含几何、样式和业务信息。
 *
 * @typeParam T Element 携带的业务数据类型。
 */
export interface ElementState<T = unknown> {
  /** 当前 Earth 内唯一的 Element ID。 */
  readonly id: string;
  /** 图形类型。 */
  readonly type: ShapeType;
  /** 与 OpenLayers 无关的规范几何状态。 */
  readonly geometry: ShapeState;
  /** 结构化样式或受控原生样式引用。 */
  readonly style: ElementStyleState;
  /** 调用方附加的业务数据。 */
  readonly data?: T;
  /** 业务模块分组。 */
  readonly module?: string;
  /** 渲染图层 ID。 */
  readonly layerId: string;
  /** 业务可见状态。 */
  readonly visible: boolean;
}

/** 创建快照前允许使用宽松几何格式的内部写入状态。 */
export type ElementStateInput<T = unknown> = Omit<ElementState<T>, 'geometry'> & {
  readonly geometry: ShapeInput;
};

/**
 * 通过一个或多个条件筛选 Element。
 *
 * `id` 和 `ids` 不能同时设置。更新、删除、显隐等批量写操作必须至少提供一个条件；要清空全部 Element 请使用 `clear()`。
 *
 * @typeParam T Element 携带的业务数据类型。
 */
export interface ElementSelector<T = unknown> {
  /** 匹配单个 Element ID。 */
  id?: string;
  /** 匹配一组 Element ID。 */
  ids?: readonly string[];
  /** 匹配业务模块。 */
  module?: string;
  /** 匹配渲染图层。 */
  layerId?: string;
  /** 匹配图形类型。 */
  type?: ShapeType;
  /** 匹配业务可见状态。 */
  visible?: boolean;
  /** 补充自定义筛选；返回 `true` 时保留当前 Element。 */
  predicate?: (state: Readonly<ElementState<T>>) => boolean;
}

/**
 * Element 更新参数，可修改除 ID 和图形类型外的状态。
 *
 * @typeParam T Element 携带的业务数据类型。
 */
export type ElementPatch<T = unknown> = Partial<
  Omit<ElementState<T>, 'id' | 'type' | 'geometry'> & {
    readonly geometry: ShapeInput;
  }
>;

/**
 * Element 复制参数，可覆盖新副本的几何、样式和业务信息。
 *
 * @typeParam T Element 携带的业务数据类型。
 */
export type ElementCopyOptions<T = unknown> = Partial<
  Omit<ElementState<T>, 'id' | 'type' | 'geometry'> & {
    readonly geometry: ShapeInput;
  }
>;
