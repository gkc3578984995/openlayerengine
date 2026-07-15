import type { NativeRef } from '../native/types.js';

/** 图层类型。用于区分矢量、瓦片和原生图层。 */
export type LayerKind = 'vector' | 'tile' | 'native';

/** 资源所有权。`external` 只解绑资源，`earth` 还会负责释放资源。 */
export type LayerOwnership = 'external' | 'earth';

/** 瓦片源预设。保存内置瓦片源所需的参数。 */
export type TileSourcePresetState =
  | { readonly preset: 'osm' }
  | { readonly preset: 'xyz'; readonly url: string; readonly attributions?: string | readonly string[] }
  | { readonly preset: 'compact-xyz'; readonly baseUrl: string };

/** 核心图层配置。供引擎内部统一保存不同图层。 */
export type CoreLayerSpec =
  | {
      /** 类型。固定为矢量图层。 */
      readonly kind: 'vector';
      /** 图层 ID。当前 Earth 中唯一的图层标识。 */
      readonly id: string;
      /** 是否显示。控制图层是否可见。 */
      readonly visible: boolean;
      /** 透明度。取值范围为 `0` 到 `1`。 */
      readonly opacity: number;
      /** 层级。数值越大越靠上显示。 */
      readonly zIndex?: number;
      /** 是否横向重复。控制跨世界范围时是否重复显示。 */
      readonly wrapX: boolean;
      /** 是否避让。控制重叠内容是否自动避让。 */
      readonly declutter: boolean;
    }
  | {
      /** 类型。固定为瓦片图层。 */
      readonly kind: 'tile';
      /** 图层 ID。当前 Earth 中唯一的图层标识。 */
      readonly id: string;
      /** 瓦片源。可以使用预设或原生源引用。 */
      readonly source: TileSourcePresetState | NativeRef<'source'>;
      /** 瓦片源归属。决定销毁时是否清理原生源。 */
      readonly sourceOwnership: LayerOwnership;
      /** 是否显示。控制图层是否可见。 */
      readonly visible: boolean;
      /** 透明度。取值范围为 `0` 到 `1`。 */
      readonly opacity: number;
      /** 层级。数值越大越靠上显示。 */
      readonly zIndex?: number;
    }
  | {
      /** 类型。固定为原生图层。 */
      readonly kind: 'native';
      /** 图层 ID。当前 Earth 中唯一的图层标识。 */
      readonly id: string;
      /** 原生引用。指向传入的 OpenLayers 图层。 */
      readonly ref: NativeRef<'layer'>;
      /** 图层归属。决定销毁时是否清理原生图层。 */
      readonly ownership: LayerOwnership;
    };

/** 图层显示状态。保存所有图层共有的显示参数。 */
export interface LayerPresentation {
  /** 是否显示。控制图层是否可见。 */
  readonly visible: boolean;
  /** 透明度。取值范围为 `0` 到 `1`。 */
  readonly opacity: number;
  /** 层级。数值越大越靠上显示。 */
  readonly zIndex?: number;
}

/** 核心图层状态。供引擎内部读取完整图层信息。 */
export type CoreLayerState = Extract<CoreLayerSpec, { kind: 'vector' | 'tile' }> | (Extract<CoreLayerSpec, { kind: 'native' }> & LayerPresentation);

/** 图层更新参数。只填写需要修改的显示字段。 */
export interface LayerPatch {
  /** 是否显示。控制图层是否可见。 */
  visible?: boolean;
  /** 透明度。取值范围为 `0` 到 `1`。 */
  opacity?: number;
  /** 层级。传入 `undefined` 可清除已有层级。 */
  zIndex?: number | undefined;
}
