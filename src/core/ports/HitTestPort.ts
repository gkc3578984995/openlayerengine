import type { Pixel } from '../common/types.js';

export interface HitTestPort {
  atPixel(pixel: Pixel): { readonly elementId: string; readonly layerId: string } | undefined;
  getScreenExtent(elementId: string): readonly [number, number, number, number] | undefined;
}
