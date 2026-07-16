import type { CoreLayerSpec, CoreLayerState, LayerPresentation } from '../layer/types.js';

export interface LayerPort {
  /** 将 Core 图层挂载到 Adapter。 */
  attach(spec: Readonly<CoreLayerSpec>): LayerPresentation;
  /** 把显示状态更新投影到已挂载图层。 */
  update(before: Readonly<CoreLayerState>, after: Readonly<CoreLayerState>): void;
  /** 解绑指定图层。 */
  detach(id: string): void;
}
