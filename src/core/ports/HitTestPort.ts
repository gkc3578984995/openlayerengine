import type { Pixel } from '../common/types.js';

export interface HitTestPort {
  /** 命中指定屏幕像素处的 Element。 */
  atPixel(pixel: Pixel):
    | {
        /** 命中的 Element ID。 */
        readonly elementId: string;
        /** Element 所在的渲染图层 ID。 */
        readonly layerId: string;
      }
    | undefined;
  /** 读取 Element 的屏幕像素范围。 */
  getScreenExtent(elementId: string): readonly [number, number, number, number] | undefined;
}
