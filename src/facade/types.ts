import type BaseLayer from 'ol/layer/Base.js';
import type TileSource from 'ol/source/Tile.js';
import type { Pixel } from '../core/common/types.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector } from '../core/element/types.js';
import type { LayerKind, LayerOwnership, LayerPatch } from '../core/layer/types.js';
import type { ShapeState } from '../core/shape/types.js';
import type { Element } from './Element.js';
import type { Layer } from './Layer.js';
import type { StyleInput } from './styleTypes.js';

export type TileUrlFunction = (coordinate: [z: number, x: number, y: number]) => string;
export type ScreenExtent = readonly [minX: number, minY: number, maxX: number, maxY: number];
export type ElementHit<T = unknown> = { readonly element: Element<T>; readonly layer: Layer };

export interface VectorLayerSpec {
  kind: 'vector';
  id?: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  wrapX?: boolean;
  declutter?: boolean;
}

export interface TileLayerCommonSpec {
  kind: 'tile';
  id?: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}

export type TileLayerSpec = TileLayerCommonSpec &
  (
    | { preset: 'osm'; url?: never; tileUrlFunction?: never; baseUrl?: never; source?: never; ownership?: never; attributions?: never }
    | {
        preset: 'xyz';
        url: string;
        tileUrlFunction?: never;
        baseUrl?: never;
        source?: never;
        ownership?: never;
        attributions?: string | readonly string[];
      }
    | {
        preset: 'xyz';
        url?: never;
        tileUrlFunction: TileUrlFunction;
        baseUrl?: never;
        source?: never;
        ownership?: never;
        attributions?: string | readonly string[];
      }
    | { preset: 'compact-xyz'; baseUrl: string; url?: never; tileUrlFunction?: never; source?: never; ownership?: never; attributions?: never }
    | { preset?: never; source: TileSource; ownership?: LayerOwnership; url?: never; tileUrlFunction?: never; baseUrl?: never; attributions?: never }
  );

export interface NativeLayerSpec {
  kind: 'native';
  id?: string;
  layer: BaseLayer;
  ownership?: LayerOwnership;
}

export type PublicLayerSpec = VectorLayerSpec | TileLayerSpec | NativeLayerSpec;

export interface ElementCreateInput<T = unknown> {
  geometry: ShapeState;
  id?: string;
  style?: StyleInput;
  data?: T;
  module?: string;
  layerId?: string;
  visible?: boolean;
}

export type LayerState =
  | {
      readonly kind: 'vector';
      readonly id: string;
      readonly visible: boolean;
      readonly opacity: number;
      readonly zIndex?: number;
      readonly wrapX: boolean;
      readonly declutter: boolean;
    }
  | { readonly kind: 'tile' | 'native'; readonly id: string; readonly visible: boolean; readonly opacity: number; readonly zIndex?: number };

export interface ElementService {
  add<T>(input: ElementCreateInput<T>): Element<T>;
  get<T>(id: string): Element<T> | undefined;
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Element<T>[];
  remove(selector: ElementSelector): number;
  hide(selector: ElementSelector): readonly Element[];
  show(selector: ElementSelector): readonly Element[];
  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Element<T>;
  clear(): void;
  atPixel<T = unknown>(pixel: Pixel): ElementHit<T> | undefined;
  getScreenExtent(target: string | Element): ScreenExtent | undefined;
}

export interface LayerService {
  add(spec: PublicLayerSpec): Layer;
  get(id: string): Layer | undefined;
  query(kind?: LayerKind): readonly Layer[];
  remove(id: string): boolean;
  clear(): void;
}

export type { LayerKind, LayerOwnership, LayerPatch };
