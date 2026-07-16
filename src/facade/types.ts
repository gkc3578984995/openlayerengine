import type BaseLayer from 'ol/layer/Base.js';
import type TileSource from 'ol/source/Tile.js';
import type { Pixel } from '../core/common/types.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector } from '../core/element/types.js';
import type { LayerKind, LayerOwnership, LayerPatch } from '../core/layer/types.js';
import type { ShapeInput } from '../core/shape/types.js';
import type { Element } from './Element.js';
import type { Layer } from './Layer.js';
import type { StyleInput } from './styleTypes.js';

/**
 * 根据瓦片坐标生成请求地址。
 *
 * @param coordinate 瓦片坐标。按缩放级别、横向索引和纵向索引排列。
 * @returns 瓦片地址。
 *
 * @example
 * ```ts
 * const tileUrl: TileUrlFunction = ([z, x, y]) => `/tiles/${z}/${x}/${y}.png`;
 * ```
 */
export type TileUrlFunction = (coordinate: [z: number, x: number, y: number]) => string;

/** 屏幕范围。依次表示最小 X、最小 Y、最大 X 和最大 Y。 */
export type ScreenExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];

/**
 * 元素命中结果。
 *
 * @typeParam T 业务数据。表示命中元素保存的数据类型。
 */
export type ElementHit<T = unknown> = {
  /** 元素。表示像素位置命中的业务元素。 */
  readonly element: Element<T>;
  /** 图层。表示命中元素所属的渲染图层。 */
  readonly layer: Layer;
};

/** 矢量图层创建配置。 */
export interface VectorLayerSpec {
  /** 图层类型。固定为 `vector`。 */
  kind: 'vector';
  /** 图层 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 可见状态。用于设置图层创建后是否显示。 */
  visible?: boolean;
  /** 透明度。取值范围为 0 到 1。 */
  opacity?: number;
  /** 层级。数值越大越靠上。 */
  zIndex?: number;
  /** 世界环绕。用于控制矢量要素是否跨世界重复显示。 */
  wrapX?: boolean;
  /** 避让。用于控制文字和图标是否自动避让。 */
  declutter?: boolean;
}

/** 瓦片图层通用配置。 */
export interface TileLayerCommonSpec {
  /** 图层类型。固定为 `tile`。 */
  kind: 'tile';
  /** 图层 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 可见状态。用于设置图层创建后是否显示。 */
  visible?: boolean;
  /** 透明度。取值范围为 0 到 1。 */
  opacity?: number;
  /** 层级。数值越大越靠上。 */
  zIndex?: number;
}

/** 瓦片图层创建配置。不同预设只接受对应的数据源参数。 */
export type TileLayerSpec = TileLayerCommonSpec &
  (
    | {
        /** 预设。使用 OpenStreetMap 默认数据源。 */
        preset: 'osm';
        /** 请求地址。OSM 预设不接受该参数。 */
        url?: never;
        /** 地址函数。OSM 预设不接受该参数。 */
        tileUrlFunction?: never;
        /** 根地址。OSM 预设不接受该参数。 */
        baseUrl?: never;
        /** 原生数据源。OSM 预设不接受该参数。 */
        source?: never;
        /** 所有权。OSM 预设不接受该参数。 */
        ownership?: never;
        /** 版权信息。OSM 预设使用内置版权信息。 */
        attributions?: never;
      }
    | {
        /** 预设。使用标准 XYZ 地址模板。 */
        preset: 'xyz';
        /** 请求地址。支持 `{z}`、`{x}` 和 `{y}` 占位符。 */
        url: string;
        /** 地址函数。传入固定 URL 时不能同时设置。 */
        tileUrlFunction?: never;
        /** 根地址。XYZ 预设不接受该参数。 */
        baseUrl?: never;
        /** 原生数据源。使用预设时不能同时设置。 */
        source?: never;
        /** 所有权。由引擎创建数据源时不需要设置。 */
        ownership?: never;
        /** 版权信息。用于显示一个或多个数据来源。 */
        attributions?: string | readonly string[];
      }
    | {
        /** 预设。使用自定义 XYZ 地址函数。 */
        preset: 'xyz';
        /** 请求地址。传入地址函数时不能同时设置。 */
        url?: never;
        /** 地址函数。用于按瓦片坐标生成请求地址。 */
        tileUrlFunction: TileUrlFunction;
        /** 根地址。XYZ 预设不接受该参数。 */
        baseUrl?: never;
        /** 原生数据源。使用预设时不能同时设置。 */
        source?: never;
        /** 所有权。由引擎创建数据源时不需要设置。 */
        ownership?: never;
        /** 版权信息。用于显示一个或多个数据来源。 */
        attributions?: string | readonly string[];
      }
    | {
        /** 预设。使用紧凑目录结构的本地 XYZ 瓦片。 */
        preset: 'compact-xyz';
        /** 根地址。用于定位本地瓦片目录。 */
        baseUrl: string;
        /** 请求地址。紧凑目录预设不接受该参数。 */
        url?: never;
        /** 地址函数。紧凑目录预设不接受该参数。 */
        tileUrlFunction?: never;
        /** 原生数据源。使用预设时不能同时设置。 */
        source?: never;
        /** 所有权。由引擎创建数据源时不需要设置。 */
        ownership?: never;
        /** 版权信息。紧凑目录预设不接受该参数。 */
        attributions?: never;
      }
    | {
        /** 预设。传入原生数据源时不要设置。 */
        preset?: never;
        /** 原生数据源。用于接入调用方创建的 OpenLayers TileSource。 */
        source: TileSource;
        /** 所有权。决定 Earth 是否负责释放原生数据源。 */
        ownership?: LayerOwnership;
        /** 请求地址。原生数据源模式不接受该参数。 */
        url?: never;
        /** 地址函数。原生数据源模式不接受该参数。 */
        tileUrlFunction?: never;
        /** 根地址。原生数据源模式不接受该参数。 */
        baseUrl?: never;
        /** 版权信息。请直接配置到原生数据源。 */
        attributions?: never;
      }
  );

/** 原生 OpenLayers 图层创建配置。 */
export interface NativeLayerSpec {
  /** 图层类型。固定为 `native`。 */
  kind: 'native';
  /** 图层 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 原生图层。传入调用方创建的 OpenLayers BaseLayer。 */
  layer: BaseLayer;
  /** 所有权。决定 Earth 是否负责释放原生图层。 */
  ownership?: LayerOwnership;
}

/** 公开图层创建配置。支持矢量、瓦片和原生图层。 */
export type PublicLayerSpec = VectorLayerSpec | TileLayerSpec | NativeLayerSpec;

/**
 * 元素创建配置。
 *
 * @typeParam T 业务数据。表示新元素保存的数据类型。
 */
export interface ElementCreateInput<T = unknown> {
  /** 几何。控制点可使用扁平坐标或嵌套坐标。 */
  geometry: ShapeInput;
  /** 元素 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 样式。支持结构化样式或原生 OpenLayers 样式。 */
  style?: StyleInput;
  /** 业务数据。用于保存调用方自己的数据。 */
  data?: T;
  /** 业务模块。用于按模块查询和批量操作。 */
  module?: string;
  /** 图层 ID。用于指定元素所在的矢量图层。 */
  layerId?: string;
  /** 可见状态。用于设置元素创建后是否显示。 */
  visible?: boolean;
}

/** 图层状态。根据图层类型返回对应字段。 */
export type LayerState =
  | {
      /** 图层类型。固定为 `vector`。 */
      readonly kind: 'vector';
      /** 图层 ID。用于唯一标识图层。 */
      readonly id: string;
      /** 可见状态。表示图层当前是否显示。 */
      readonly visible: boolean;
      /** 透明度。取值范围为 0 到 1。 */
      readonly opacity: number;
      /** 层级。数值越大越靠上。 */
      readonly zIndex?: number;
      /** 世界环绕。表示要素是否跨世界重复显示。 */
      readonly wrapX: boolean;
      /** 避让。表示文字和图标是否自动避让。 */
      readonly declutter: boolean;
    }
  | {
      /** 图层类型。表示瓦片或原生图层。 */
      readonly kind: 'tile' | 'native';
      /** 图层 ID。用于唯一标识图层。 */
      readonly id: string;
      /** 可见状态。表示图层当前是否显示。 */
      readonly visible: boolean;
      /** 透明度。取值范围为 0 到 1。 */
      readonly opacity: number;
      /** 层级。数值越大越靠上。 */
      readonly zIndex?: number;
    };

/** 元素服务。用于创建、查询和批量操作当前 Earth 的元素。 */
export interface ElementService {
  /**
   * 创建元素。
   *
   * @typeParam T 业务数据。表示元素保存的数据类型。
   * @param input 创建配置。用于设置几何、样式、分组和业务数据。
   * @returns 新创建的元素句柄。
   *
   * @example
   * ```ts
   * const element = earth.elements.add({
   *   geometry: { type: 'point', controlPoints: [[0, 0]] }
   * });
   * ```
   */
  add<T>(input: ElementCreateInput<T>): Element<T>;
  /**
   * 按 ID 获取元素。
   *
   * @typeParam T 业务数据。表示元素保存的数据类型。
   * @param id 元素 ID。用于查找唯一元素。
   * @returns 找到时返回元素句柄，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const element = earth.elements.get('vehicle-1');
   * ```
   */
  get<T>(id: string): Element<T> | undefined;
  /**
   * 查询元素。
   *
   * @typeParam T 业务数据。表示元素保存的数据类型。
   * @param selector 选择器。省略时返回全部元素。
   * @returns 符合条件的元素列表。
   *
   * @example
   * ```ts
   * const vehicles = earth.elements.query({ module: 'vehicles' });
   * ```
   */
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  /**
   * 批量更新元素。
   *
   * @typeParam T 业务数据。表示元素保存的数据类型。
   * @param selector 选择器。用于确定需要更新的元素。
   * @param patch 更新内容。只写入需要修改的字段。
   * @returns 实际更新的元素列表。
   *
   * @example
   * ```ts
   * const updated = earth.elements.update({ module: 'vehicles' }, { visible: false });
   * ```
   */
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Element<T>[];
  /**
   * 批量移除元素。
   *
   * @param selector 选择器。用于确定需要移除的元素。
   * @returns 实际移除的元素数量。
   *
   * @example
   * ```ts
   * const count = earth.elements.remove({ module: 'vehicles' });
   * ```
   */
  remove(selector: ElementSelector): number;
  /**
   * 批量隐藏元素。
   *
   * @param selector 选择器。用于确定需要隐藏的元素。
   * @returns 实际隐藏的元素列表。
   *
   * @example
   * ```ts
   * earth.elements.hide({ layerId: 'business' });
   * ```
   */
  hide(selector: ElementSelector): readonly Element[];
  /**
   * 批量显示元素。
   *
   * @param selector 选择器。用于确定需要显示的元素。
   * @returns 实际显示的元素列表。
   *
   * @example
   * ```ts
   * earth.elements.show({ module: 'vehicles' });
   * ```
   */
  show(selector: ElementSelector): readonly Element[];
  /**
   * 复制元素。
   *
   * @typeParam T 业务数据。表示元素保存的数据类型。
   * @param id 元素 ID。用于指定需要复制的元素。
   * @param overrides 覆盖内容。用于修改副本的几何、分组、样式或数据。
   * @returns 新创建的元素副本。
   *
   * @example
   * ```ts
   * const copy = earth.elements.copy('vehicle-1', { module: 'vehicle-copies' });
   * ```
   */
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Element<T>;
  /**
   * 清空全部元素。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * earth.elements.clear();
   * ```
   */
  clear(): void;
  /**
   * 获取屏幕像素位置上的元素。
   *
   * @typeParam T 业务数据。表示命中元素保存的数据类型。
   * @param pixel 屏幕坐标。以地图视口左上角为原点。
   * @returns 命中时返回元素和图层，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const hit = earth.elements.atPixel([120, 80]);
   * ```
   */
  atPixel<T = unknown>(pixel: Pixel): ElementHit<T> | undefined;
  /**
   * 获取元素或图层的屏幕范围。
   *
   * @param target 目标。传元素 ID 或元素句柄。
   * @returns 可见目标的屏幕范围，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const extent = earth.elements.getScreenExtent('vehicle-1');
   * ```
   */
  getScreenExtent(target: string | Element): ScreenExtent | undefined;
}

/** 图层服务。用于创建、查询和管理当前 Earth 的图层。 */
export interface LayerService {
  /**
   * 创建图层。
   *
   * @param spec 创建配置。用于选择图层类型和数据源。
   * @returns 新创建的图层句柄。
   *
   * @example
   * ```ts
   * const layer = earth.layers.add({ kind: 'vector', id: 'business' });
   * ```
   */
  add(spec: PublicLayerSpec): Layer;
  /**
   * 按 ID 获取图层。
   *
   * @param id 图层 ID。用于查找唯一图层。
   * @returns 找到时返回图层句柄，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const layer = earth.layers.get('business');
   * ```
   */
  get(id: string): Layer | undefined;
  /**
   * 查询图层。
   *
   * @param kind 图层类型。省略时返回全部图层。
   * @returns 符合条件的图层列表。
   *
   * @example
   * ```ts
   * const vectorLayers = earth.layers.query('vector');
   * ```
   */
  query(kind?: LayerKind): readonly Layer[];
  /**
   * 按 ID 移除图层。
   *
   * @param id 图层 ID。用于指定需要移除的图层。
   * @returns 成功移除时返回 `true`，未找到时返回 `false`。
   *
   * @example
   * ```ts
   * earth.layers.remove('business');
   * ```
   */
  remove(id: string): boolean;
  /**
   * 清空全部图层。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * earth.layers.clear();
   * ```
   */
  clear(): void;
}

export type { LayerKind, LayerOwnership, LayerPatch };
