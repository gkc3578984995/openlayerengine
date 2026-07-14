import type { CoreLayerSpec, CoreLayerState, LayerPresentation } from '../layer/types.js';

export interface LayerPort {
  attach(spec: Readonly<CoreLayerSpec>): LayerPresentation;
  update(before: Readonly<CoreLayerState>, after: Readonly<CoreLayerState>): void;
  detach(id: string): void;
}
