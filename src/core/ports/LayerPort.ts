import type { CoreLayerSpec, CoreLayerState, LayerPresentation } from '../layer/types.js';

/** 内部接口。约定 LayerPort 使用的数据和操作。 */
export interface LayerPort {
  /** 挂载一个底层对象。 */
  attach(spec: Readonly<CoreLayerSpec>): LayerPresentation;
  /** 更新已经挂载的对象。 */
  update(before: Readonly<CoreLayerState>, after: Readonly<CoreLayerState>): void;
  /** 卸载指定对象。 */
  detach(id: string): void;
}
