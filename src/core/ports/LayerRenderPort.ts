import type { RenderGeometryState } from '../shape/types.js';
import type { StyleSpec } from '../style/types.js';

export interface LayerRenderFrame {
  readonly layerId: string;
  readonly time: number;
  readonly resolution: number;
}

export interface LayerRenderPrimitive {
  readonly geometry: RenderGeometryState;
  readonly style: StyleSpec;
}

export interface LayerRenderValue {
  readonly visible?: boolean;
  readonly primitives?: readonly LayerRenderPrimitive[];
}

export interface LayerRenderContribution {
  readonly targetId: string;
  readonly channel: string;
  readonly value: LayerRenderValue;
}

export interface LayerRenderBatch {
  readonly contributions: readonly LayerRenderContribution[];
  readonly requestNextFrame: boolean;
}

export interface LayerRenderLoopHandle {
  requestRender(): void;
  destroy(): void;
}

export interface LayerRenderTargetSpec {
  readonly layerId: string;
  readonly targetId: string;
  apply(value: LayerRenderValue, frame: LayerRenderFrame): void;
  clear(channel: string): void;
}

export interface LayerRenderTargetHandle {
  destroy(): void;
}

export interface LayerRenderPort {
  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle;
  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle;
  hasTarget(layerId: string, targetId: string): boolean;
}
