import type { PrintFootprint } from '../print/types.js';
import type { ShapePresentationFrame } from './ShapePresentationPort.js';

/** 自动图例只通过该纯数据端口判断规范 RenderGeometry 是否命中打印范围。 */
export interface PrintGeometryHitPort {
  candidateElementIds?(
    footprint: PrintFootprint,
    resolution: number,
    visibleLayerIds: readonly string[],
    presentationFrame?: Readonly<ShapePresentationFrame>
  ): readonly string[] | undefined;
  intersectsFootprint(elementId: string, footprint: PrintFootprint, resolution?: number, presentationFrame?: Readonly<ShapePresentationFrame>): boolean;
  isVisibleAt?(elementId: string, resolution: number, footprint?: PrintFootprint, presentationFrame?: Readonly<ShapePresentationFrame>): boolean;
  renderOrderOf(elementId: string): number;
}
