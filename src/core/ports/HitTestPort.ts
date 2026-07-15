import type { Pixel } from '../common/types.js';

/** 内部接口。约定 HitTestPort 使用的数据和操作。 */
export interface HitTestPort {
  /** 查找指定像素位置的元素。 */
  atPixel(pixel: Pixel):
    | {
        /** 元素 ID。标识命中的元素。 */
        readonly elementId: string;
        /** 图层 ID。标识元素所在图层。 */
        readonly layerId: string;
      }
    | undefined;
  /** 读取元素在屏幕上的范围。 */
  getScreenExtent(elementId: string): readonly [number, number, number, number] | undefined;
}
