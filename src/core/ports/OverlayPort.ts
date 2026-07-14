import type { Coordinate, Pixel } from '../common/types.js';
import type { NativeRef } from '../native/types.js';

export type CoreOverlayOwnership = 'external' | 'earth';
export type CoreOverlayPositioning =
  'bottom-left' | 'bottom-center' | 'bottom-right' | 'center-left' | 'center-center' | 'center-right' | 'top-left' | 'top-center' | 'top-right';

export interface CorePanIntoViewSpec {
  readonly margin?: number;
  readonly duration?: number;
  readonly easing?: (progress: number) => number;
}

export interface OverlayRenderState {
  readonly id: string;
  readonly elementRef: NativeRef<'element'>;
  readonly position: Coordinate | undefined;
  readonly offset: Pixel;
  readonly positioning: CoreOverlayPositioning;
  readonly stopEvent: boolean;
  readonly insertFirst: boolean;
  readonly autoPan: false | CorePanIntoViewSpec;
  readonly className: string | undefined;
  readonly visible: boolean;
  readonly ownership: CoreOverlayOwnership;
}

export interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type DescriptorPortAction = { readonly type: 'close' } | { readonly type: 'item'; readonly index: number };

export interface OverlayDragEvent {
  readonly type: 'start' | 'move' | 'end' | 'cancel';
  readonly pointerId: number;
  readonly pixel: Pixel;
}

export interface OverlayPort {
  attach(state: Readonly<OverlayRenderState>): void;
  update(before: Readonly<OverlayRenderState>, after: Readonly<OverlayRenderState>): void;
  detach(id: string): void;
  panIntoView(id: string, options?: CorePanIntoViewSpec): void;
  releaseElement(ref: NativeRef<'element'>, ownership: CoreOverlayOwnership): void;
  coordinateToPixel(coordinate: Coordinate): Pixel | undefined;
  pixelToCoordinate(pixel: Pixel): Coordinate | undefined;
  getBounds(id: string): PixelBounds | undefined;
  subscribeLayout(listener: () => void): () => void;
  subscribeDescriptorActions(id: string, listener: (action: DescriptorPortAction) => void): () => void;
  bindDrag(id: string, listener: (event: OverlayDragEvent) => void): () => void;
}
