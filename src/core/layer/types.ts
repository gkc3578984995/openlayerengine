import type { NativeRef } from '../native/types.js';

/** Core 支持的图层类别。 */
export type LayerKind = 'vector' | 'tile' | 'native';

/** `external` 仅解绑资源；`earth` 由 Earth 接管释放。 */
export type LayerOwnership = 'external' | 'earth';

/** 内置瓦片源的判别式配置。 */
export type TileSourcePresetState =
  | { readonly preset: 'osm' }
  | { readonly preset: 'xyz'; readonly url: string; readonly attributions?: string | readonly string[] }
  | { readonly preset: 'compact-xyz'; readonly baseUrl: string };

/** Core 内统一保存的图层配置。 */
export type CoreLayerSpec =
  | {
      /** 固定为矢量图层。 */
      readonly kind: 'vector';
      /** 当前 Earth 内唯一的图层 ID。 */
      readonly id: string;
      /** 图层可见状态。 */
      readonly visible: boolean;
      /** 取值范围为 `0` 到 `1`。 */
      readonly opacity: number;
      /** 数值越大越靠上显示。 */
      readonly zIndex?: number;
      /** 是否横向重复世界副本。 */
      readonly wrapX: boolean;
      /** 是否启用重叠内容避让。 */
      readonly declutter: boolean;
    }
  | {
      /** 固定为瓦片图层。 */
      readonly kind: 'tile';
      /** 当前 Earth 内唯一的图层 ID。 */
      readonly id: string;
      /** 内置预设或受控原生 Source 引用。 */
      readonly source: TileSourcePresetState | NativeRef<'source'>;
      /** Source 的生命周期所有权。 */
      readonly sourceOwnership: LayerOwnership;
      /** 图层可见状态。 */
      readonly visible: boolean;
      /** 取值范围为 `0` 到 `1`。 */
      readonly opacity: number;
      /** 数值越大越靠上显示。 */
      readonly zIndex?: number;
    }
  | {
      /** 固定为原生图层。 */
      readonly kind: 'native';
      /** 当前 Earth 内唯一的图层 ID。 */
      readonly id: string;
      /** 调用方传入的 OpenLayers Layer 引用。 */
      readonly ref: NativeRef<'layer'>;
      /** 原生 Layer 的生命周期所有权。 */
      readonly ownership: LayerOwnership;
    };

/** 各类图层共用的显示状态。 */
export interface LayerPresentation {
  /** 图层可见状态。 */
  readonly visible: boolean;
  /** 取值范围为 `0` 到 `1`。 */
  readonly opacity: number;
  /** 数值越大越靠上显示。 */
  readonly zIndex?: number;
}

/** LayerManager 持有的完整图层状态。 */
export type CoreLayerState = Extract<CoreLayerSpec, { kind: 'vector' | 'tile' }> | (Extract<CoreLayerSpec, { kind: 'native' }> & LayerPresentation);

/** 图层显示状态的局部更新。 */
export interface LayerPatch {
  /** 图层可见状态。 */
  visible?: boolean;
  /** 取值范围为 `0` 到 `1`。 */
  opacity?: number;
  /** 传入 `undefined` 可清除已有层级。 */
  zIndex?: number | undefined;
}
