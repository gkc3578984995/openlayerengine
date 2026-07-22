import type BaseLayer from 'ol/layer/Base.js';
import type TileSource from 'ol/source/Tile.js';
import type { Pixel } from '../core/common/types.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector } from '../core/element/types.js';
import type { ElementProtectionState, ElementProtectionUpdate } from '../core/protection/types.js';
import type { LayerKind, LayerOwnership, LayerPatch } from '../core/layer/types.js';
import type { ShapeInput } from '../core/shape/types.js';
import type { Element } from './Element.js';
import type { Layer } from './Layer.js';
import type { StyleInput } from './styleTypes.js';

/**
 * 根据瓦片坐标生成请求地址。
 *
 * @param coordinate 依次为缩放级别、横向索引和纵向索引的瓦片坐标。
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
 * Element 命中结果。
 *
 * @typeParam T 命中 Element 携带的业务数据类型。
 */
export type ElementHit<T = unknown> = {
  /** 像素位置命中的 Element。 */
  readonly element: Element<T>;
  /** 命中 Element 所属的渲染图层。 */
  readonly layer: Layer;
};

/** 矢量图层创建配置。 */
export interface VectorLayerSpec {
  /** 固定为 `vector`。 */
  kind: 'vector';
  /** 图层 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 图层创建后是否可见。 */
  visible?: boolean;
  /** 透明度。取值范围为 0 到 1。 */
  opacity?: number;
  /** 图层层级；数值越大越靠上。 */
  zIndex?: number;
  /** 矢量 Feature 是否跨世界重复显示。 */
  wrapX?: boolean;
  /** 文字和图标是否自动避让。 */
  declutter?: boolean;
}

/** 瓦片图层通用配置。 */
export interface TileLayerCommonSpec {
  /** 固定为 `tile`。 */
  kind: 'tile';
  /** 图层 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 图层创建后是否可见。 */
  visible?: boolean;
  /** 透明度。取值范围为 0 到 1。 */
  opacity?: number;
  /** 图层层级；数值越大越靠上。 */
  zIndex?: number;
}

/** 瓦片图层创建配置。不同预设只接受对应的数据源参数。 */
export type TileLayerSpec = TileLayerCommonSpec &
  (
    | {
        /** 使用 OpenStreetMap 默认数据源。 */
        preset: 'osm';
        /** OSM 预设不接受自定义请求地址。 */
        url?: never;
        /** OSM 预设不接受自定义地址函数。 */
        tileUrlFunction?: never;
        /** OSM 预设不接受自定义根地址。 */
        baseUrl?: never;
        /** OSM 预设不接受原生数据源。 */
        source?: never;
        /** OSM 预设的数据源由 Earth 管理，不接受所有权配置。 */
        ownership?: never;
        /** OSM 预设使用内置版权信息。 */
        attributions?: never;
      }
    | {
        /** 使用标准 XYZ 地址模板。 */
        preset: 'xyz';
        /** 支持 `{z}`、`{x}` 和 `{y}` 占位符的请求地址。 */
        url: string;
        /** 固定 URL 模式不接受地址函数。 */
        tileUrlFunction?: never;
        /** XYZ 预设不接受根地址。 */
        baseUrl?: never;
        /** 预设模式不接受原生数据源。 */
        source?: never;
        /** 预设数据源由 Earth 管理，不接受所有权配置。 */
        ownership?: never;
        /** 一个或多个数据来源的版权信息。 */
        attributions?: string | readonly string[];
      }
    | {
        /** 使用自定义 XYZ 地址函数。 */
        preset: 'xyz';
        /** 地址函数模式不接受固定请求地址。 */
        url?: never;
        /** 按瓦片坐标生成请求地址。 */
        tileUrlFunction: TileUrlFunction;
        /** XYZ 预设不接受根地址。 */
        baseUrl?: never;
        /** 预设模式不接受原生数据源。 */
        source?: never;
        /** 预设数据源由 Earth 管理，不接受所有权配置。 */
        ownership?: never;
        /** 一个或多个数据来源的版权信息。 */
        attributions?: string | readonly string[];
      }
    | {
        /** 使用紧凑目录结构的本地 XYZ 瓦片。 */
        preset: 'compact-xyz';
        /** 本地瓦片目录的根地址。 */
        baseUrl: string;
        /** 紧凑目录预设不接受请求地址。 */
        url?: never;
        /** 紧凑目录预设不接受地址函数。 */
        tileUrlFunction?: never;
        /** 预设模式不接受原生数据源。 */
        source?: never;
        /** 预设数据源由 Earth 管理，不接受所有权配置。 */
        ownership?: never;
        /** 紧凑目录预设不接受版权信息。 */
        attributions?: never;
      }
    | {
        /** 原生数据源模式不接受预设。 */
        preset?: never;
        /** 调用方创建的 OpenLayers TileSource。 */
        source: TileSource;
        /** 原生数据源的所有权；默认为 `external`，只有 `earth` 会由 Earth 释放。 */
        ownership?: LayerOwnership;
        /** 原生数据源模式不接受请求地址。 */
        url?: never;
        /** 原生数据源模式不接受地址函数。 */
        tileUrlFunction?: never;
        /** 原生数据源模式不接受根地址。 */
        baseUrl?: never;
        /** 版权信息应直接配置在原生数据源上。 */
        attributions?: never;
      }
  );

/** 原生 OpenLayers 图层创建配置。 */
export interface NativeLayerSpec {
  /** 固定为 `native`。 */
  kind: 'native';
  /** 图层 ID。省略时由引擎自动生成。 */
  id?: string;
  /** 调用方创建的 OpenLayers BaseLayer。 */
  layer: BaseLayer;
  /** 原生图层的所有权；默认为 `external`，只有 `earth` 会由 Earth 释放。 */
  ownership?: LayerOwnership;
}

/** 公开图层创建配置。支持矢量、瓦片和原生图层。 */
export type PublicLayerSpec = VectorLayerSpec | TileLayerSpec | NativeLayerSpec;

/**
 * Element 创建配置。
 *
 * @typeParam T 新 Element 保存的业务数据类型。
 */
export interface ElementCreateInput<T = unknown> {
  /** 几何输入；控制点可使用扁平坐标或嵌套坐标。 */
  geometry: ShapeInput;
  /** Element ID；省略时由引擎自动生成。 */
  id?: string;
  /** 结构化样式或原生 OpenLayers 样式。 */
  style?: StyleInput;
  /** 调用方的业务数据。 */
  data?: T;
  /** 供查询和批量操作使用的业务模块标识。 */
  module?: string;
  /** 承载 Element 的矢量图层 ID。 */
  layerId?: string;
  /** Element 创建后是否可见。 */
  visible?: boolean;
}

/** 图层状态。根据图层类型返回对应字段。 */
export type LayerState =
  | {
      /** 固定为 `vector`。 */
      readonly kind: 'vector';
      /** 图层的唯一 ID。 */
      readonly id: string;
      /** 图层当前是否可见。 */
      readonly visible: boolean;
      /** 透明度。取值范围为 0 到 1。 */
      readonly opacity: number;
      /** 图层层级；数值越大越靠上。 */
      readonly zIndex?: number;
      /** Feature 是否跨世界重复显示。 */
      readonly wrapX: boolean;
      /** 文字和图标是否自动避让。 */
      readonly declutter: boolean;
    }
  | {
      /** 瓦片或原生图层。 */
      readonly kind: 'tile' | 'native';
      /** 图层的唯一 ID。 */
      readonly id: string;
      /** 图层当前是否可见。 */
      readonly visible: boolean;
      /** 透明度。取值范围为 0 到 1。 */
      readonly opacity: number;
      /** 图层层级；数值越大越靠上。 */
      readonly zIndex?: number;
    };

/** 创建、查询和批量操作当前 Earth 中 Element 的公开服务。 */
export interface ElementService {
  /**
   * 创建 Element。
   *
   * @typeParam T Element 保存的业务数据类型。
   * @param input 几何、样式、分组和业务数据。
   * @returns 新创建的 Element 句柄。
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
   * 按 ID 获取 Element。
   *
   * @typeParam T Element 保存的业务数据类型。
   * @param id 要查找的唯一 Element ID。
   * @returns 找到时返回 Element 句柄，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const element = earth.elements.get('vehicle-1');
   * ```
   */
  get<T>(id: string): Element<T> | undefined;
  /**
   * 查询 Element。
   *
   * @typeParam T Element 保存的业务数据类型。
   * @param selector 查询条件；省略时返回全部 Element。
   * @returns 符合条件的 Element 列表。
   *
   * @example
   * ```ts
   * const vehicles = earth.elements.query({ module: 'vehicles' });
   * ```
   */
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  /**
   * 批量更新 Element。
   *
   * @typeParam T Element 保存的业务数据类型。
   * @param selector 待更新 Element 的查询条件。
   * @param patch 需要修改的状态字段。
   * @returns 实际更新的 Element 列表。
   *
   * @example
   * ```ts
   * const updated = earth.elements.update({ module: 'vehicles' }, { visible: false });
   * ```
   */
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Element<T>[];
  /**
   * 批量移除 Element。
   *
   * @param selector 待移除 Element 的查询条件。
   * @returns 实际移除的 Element 数量。
   *
   * @example
   * ```ts
   * const count = earth.elements.remove({ module: 'vehicles' });
   * ```
   */
  remove(selector: ElementSelector): number;
  /**
   * 批量隐藏 Element。
   *
   * @param selector 待隐藏 Element 的查询条件。
   * @returns 实际隐藏的 Element 列表。
   *
   * @example
   * ```ts
   * earth.elements.hide({ layerId: 'business' });
   * ```
   */
  hide(selector: ElementSelector): readonly Element[];
  /**
   * 批量显示 Element。
   *
   * @param selector 待显示 Element 的查询条件。
   * @returns 实际显示的 Element 列表。
   *
   * @example
   * ```ts
   * earth.elements.show({ module: 'vehicles' });
   * ```
   */
  show(selector: ElementSelector): readonly Element[];
  /**
   * 复制 Element。
   *
   * @typeParam T Element 保存的业务数据类型。
   * @param id 待复制的 Element ID。
   * @param overrides 对副本几何、分组、样式或数据的覆盖值。
   * @returns 新创建的 Element 副本。
   *
   * @example
   * ```ts
   * const copy = earth.elements.copy('vehicle-1', { module: 'vehicle-copies' });
   * ```
   */
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Element<T>;
  /**
   * 建立、更新或解除 Element 的协同保护运行态。
   *
   * 保护只拦截当前 Earth 的内置 Edit / Transform 交互；程序化更新仍可用于远端同步。
   *
   * @param elementId 目标 Element ID。
   * @param update 保护开关、协作者信息、版本和可选到期时间。
   * @returns 当前保护状态发生变化时返回 `true`；目标不存在、输入陈旧或幂等时返回 `false`。
   *
   * @example
   * ```ts
   * earth.elements.setProtection('route-1', {
   *   protected: true,
   *   operatorName: '张三',
   *   revision: 18,
   *   expiresAt: Date.now() + 30_000
   * });
   * ```
   */
  setProtection(elementId: string, update: ElementProtectionUpdate): boolean;
  /**
   * 读取 Element 当前的协同保护运行态。
   *
   * @param elementId 目标 Element ID。
   * @returns 当前保护快照；Element 不存在、未保护或保护已到期时返回 `undefined`。
   *
   * @example
   * ```ts
   * const protection = earth.elements.getProtection('route-1');
   * console.log(protection?.operatorName);
   * ```
   */
  getProtection(elementId: string): ElementProtectionState | undefined;
  /**
   * 清空全部 Element。
   *
   *
   * @example
   * ```ts
   * earth.elements.clear();
   * ```
   */
  clear(): void;
  /**
   * 获取屏幕像素位置上的 Element。
   *
   * @typeParam T 命中 Element 保存的业务数据类型。
   * @param pixel 以地图视口左上角为原点的屏幕坐标。
   * @returns 命中时返回 Element 和图层，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const hit = earth.elements.atPixel([120, 80]);
   * ```
   */
  atPixel<T = unknown>(pixel: Pixel): ElementHit<T> | undefined;
  /**
   * 获取 Element 的屏幕范围。
   *
   * @param target Element ID 或句柄。
   * @returns 可见目标的屏幕范围，否则返回 `undefined`。
   *
   * @example
   * ```ts
   * const extent = earth.elements.getScreenExtent('vehicle-1');
   * ```
   */
  getScreenExtent(target: string | Element): ScreenExtent | undefined;
}

/** 创建、查询和管理当前 Earth 图层的公开服务。 */
export interface LayerService {
  /**
   * 创建图层。
   *
   * @param spec 图层类型、数据源和展示配置。
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
   * @param id 要查找的唯一图层 ID。
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
   * @param kind 图层类型；省略时返回全部图层。
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
   * @param id 待移除的图层 ID。
   * @returns 成功移除时返回 `true`，未找到时返回 `false`。
   *
   * @example
   * ```ts
   * earth.layers.remove('business');
   * ```
   */
  remove(id: string): boolean;
  /**
   * 清空全部图层；任一图层仍承载 Element 时整次调用失败，不会部分移除。
   *
   * @example
   * ```ts
   * earth.layers.clear();
   * ```
   */
  clear(): void;
}

export type { LayerKind, LayerOwnership, LayerPatch };
