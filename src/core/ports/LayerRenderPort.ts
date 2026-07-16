import type { RenderGeometryState } from '../shape/types.js';
import type { StyleSpec } from '../style/types.js';

export interface LayerRenderFrame {
  /** 当前渲染图层 ID。 */
  readonly layerId: string;
  /** 当前帧时间。 */
  readonly time: number;
  /** 当前 View 分辨率。 */
  readonly resolution: number;
}

export interface LayerRenderPrimitive {
  /** 本次渲染的几何快照。 */
  readonly geometry: RenderGeometryState;
  /** 本次渲染的结构化样式。 */
  readonly style: StyleSpec;
}

export interface LayerRenderValue {
  /** 此渲染值是否可见。 */
  readonly visible?: boolean;
  /** 需要绘制的图元。 */
  readonly primitives?: readonly LayerRenderPrimitive[];
}

export interface LayerRenderContribution {
  /** 渲染目标 ID。 */
  readonly targetId: string;
  /** 同一目标内的渲染通道。 */
  readonly channel: string;
  /** 当前通道的渲染结果。 */
  readonly value: LayerRenderValue;
}

export interface LayerRenderBatch {
  /** 本帧各目标的渲染贡献。 */
  readonly contributions: readonly LayerRenderContribution[];
  /** 是否继续请求下一帧。 */
  readonly requestNextFrame: boolean;
}

export interface LayerRenderLoopHandle {
  /** 请求重新渲染一帧。 */
  requestRender(): void;
  /** 停止循环并释放渲染资源。 */
  destroy(): void;
}

export interface LayerRenderTargetSpec {
  /** 临时目标所在的图层 ID。 */
  readonly layerId: string;
  /** 临时渲染目标 ID。 */
  readonly targetId: string;
  /** 应用一份渲染结果。 */
  apply(value: LayerRenderValue, frame: LayerRenderFrame): void;
  /** 清除指定通道的渲染结果。 */
  clear(channel: string): void;
}

export interface LayerRenderTargetHandle {
  /** 注销临时渲染目标。 */
  destroy(): void;
}

export interface LayerRenderPort {
  /** 为图层打开共享渲染循环。 */
  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle;
  /** 注册临时渲染目标。 */
  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle;
  /** 判断渲染目标是否存在。 */
  hasTarget(layerId: string, targetId: string): boolean;
}
