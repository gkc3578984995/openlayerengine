import type { RenderGeometryState } from '../shape/types.js';
import type { StyleSpec } from '../style/types.js';

/** 内部接口。约定 LayerRenderFrame 使用的数据和操作。 */
export interface LayerRenderFrame {
  /** 图层 ID。标识关联的图层。 */
  readonly layerId: string;
  /** 时间。保存当前帧的时间。 */
  readonly time: number;
  /** 分辨率。保存当前视图分辨率。 */
  readonly resolution: number;
}

/** 内部接口。约定 LayerRenderPrimitive 使用的数据和操作。 */
export interface LayerRenderPrimitive {
  /** 几何。保存本次渲染使用的几何。 */
  readonly geometry: RenderGeometryState;
  /** 样式。保存本次渲染使用的样式。 */
  readonly style: StyleSpec;
}

/** 内部接口。约定 LayerRenderValue 使用的数据和操作。 */
export interface LayerRenderValue {
  /** 是否显示。控制内容是否可见。 */
  readonly visible?: boolean;
  /** 图元。保存需要绘制的内容。 */
  readonly primitives?: readonly LayerRenderPrimitive[];
}

/** 内部接口。约定 LayerRenderContribution 使用的数据和操作。 */
export interface LayerRenderContribution {
  /** 目标 ID。标识渲染目标。 */
  readonly targetId: string;
  /** 通道。区分同一目标的多组内容。 */
  readonly channel: string;
  /** 内容。保存当前渲染结果。 */
  readonly value: LayerRenderValue;
}

/** 内部接口。约定 LayerRenderBatch 使用的数据和操作。 */
export interface LayerRenderBatch {
  /** 贡献项。保存各目标的渲染内容。 */
  readonly contributions: readonly LayerRenderContribution[];
  /** 继续渲染。表示是否需要下一帧。 */
  readonly requestNextFrame: boolean;
}

/** 内部接口。约定 LayerRenderLoopHandle 使用的数据和操作。 */
export interface LayerRenderLoopHandle {
  /** 请求重新渲染一帧。 */
  requestRender(): void;
  /** 释放当前对象占用的资源。 */
  destroy(): void;
}

/** 内部接口。约定 LayerRenderTargetSpec 使用的数据和操作。 */
export interface LayerRenderTargetSpec {
  /** 图层 ID。标识关联的图层。 */
  readonly layerId: string;
  /** 目标 ID。标识渲染目标。 */
  readonly targetId: string;
  /** 应用一份渲染结果。 */
  apply(value: LayerRenderValue, frame: LayerRenderFrame): void;
  /** 清除指定通道的渲染结果。 */
  clear(channel: string): void;
}

/** 内部接口。约定 LayerRenderTargetHandle 使用的数据和操作。 */
export interface LayerRenderTargetHandle {
  /** 释放当前对象占用的资源。 */
  destroy(): void;
}

/** 内部接口。约定 LayerRenderPort 使用的数据和操作。 */
export interface LayerRenderPort {
  /** 打开一个内部交互或视图。 */
  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle;
  /** 注册临时渲染目标。 */
  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle;
  /** 判断渲染目标是否存在。 */
  hasTarget(layerId: string, targetId: string): boolean;
}
