import type { PrintFootprint } from '../print/types.js';

/** 自动图例只通过该纯数据端口判断规范 RenderGeometry 是否命中打印范围。 */
export interface PrintGeometryHitPort {
  candidateElementIds?(footprint: PrintFootprint, resolution: number, visibleLayerIds: readonly string[]): readonly string[] | undefined;
  intersectsFootprint(elementId: string, footprint: PrintFootprint, resolution?: number): boolean;
  isVisibleAt?(elementId: string, resolution: number, footprint?: PrintFootprint): boolean;
  renderOrderOf(elementId: string): number;
}
