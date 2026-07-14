import type { NativeRef } from '../native/types.js';

export type LayerKind = 'vector' | 'tile' | 'native';
export type LayerOwnership = 'external' | 'earth';

export type TileSourcePresetState =
  | { readonly preset: 'osm' }
  | { readonly preset: 'xyz'; readonly url: string; readonly attributions?: string | readonly string[] }
  | { readonly preset: 'compact-xyz'; readonly baseUrl: string };

export type CoreLayerSpec =
  | {
      readonly kind: 'vector';
      readonly id: string;
      readonly visible: boolean;
      readonly opacity: number;
      readonly zIndex?: number;
      readonly wrapX: boolean;
      readonly declutter: boolean;
    }
  | {
      readonly kind: 'tile';
      readonly id: string;
      readonly source: TileSourcePresetState | NativeRef<'source'>;
      readonly sourceOwnership: LayerOwnership;
      readonly visible: boolean;
      readonly opacity: number;
      readonly zIndex?: number;
    }
  | { readonly kind: 'native'; readonly id: string; readonly ref: NativeRef<'layer'>; readonly ownership: LayerOwnership };

export interface LayerPresentation {
  readonly visible: boolean;
  readonly opacity: number;
  readonly zIndex?: number;
}

export type CoreLayerState = Extract<CoreLayerSpec, { kind: 'vector' | 'tile' }> | (Extract<CoreLayerSpec, { kind: 'native' }> & LayerPresentation);

export interface LayerPatch {
  visible?: boolean;
  opacity?: number;
  zIndex?: number | undefined;
}
