import type { RenderGeometryState } from '../shape/types.js';
import type { StyleSpec } from '../style/types.js';

export interface LayerRenderFrame {
  /** 当前渲染图层 ID。 */
  readonly layerId: string;
  /** 当前帧时间。 */
  readonly time: number;
  /** 当前 View 分辨率。 */
  readonly resolution: number;
  /** 当前 View 可见范围。 */
  readonly extent: readonly [number, number, number, number];
  /** 当前渲染像素比。 */
  readonly pixelRatio: number;
  /** 当前 View 旋转角，单位为弧度。 */
  readonly rotation: number;
  /** View 投影支持横向世界副本时的单世界宽度。 */
  readonly worldWidth?: number;
}

export interface LayerRenderDynamicStyle {
  /** 动态虚线偏移。 */
  readonly lineDashOffset?: number;
  /** 只更新第几个直接描边；缺省时兼容为更新全部直接描边。 */
  readonly lineDashOffsetStrokeIndex?: number;
  /** 动态圆形符号半径。 */
  readonly symbolRadius?: number;
  /** 动态描边宽度。 */
  readonly strokeWidth?: number;
  /** 动态符号旋转角，单位为弧度。 */
  readonly rotation?: number;
}

/** grow 对完整目标路径的真实揭示窗口；避免 Adapter 从中间 Geometry 反推进度。 */
export interface LayerRenderPathReveal {
  readonly progress: number;
  readonly direction: 'forward' | 'reverse';
}

export interface LayerRenderPrimitive {
  /** Runtime 生命周期内稳定的图元位置；旧动画可省略并由 Adapter 生成兼容键。 */
  readonly slotKey?: string;
  /** 本次渲染的几何快照。 */
  readonly geometry: RenderGeometryState;
  /** 本次渲染的结构化样式。 */
  readonly style: StyleSpec;
  /** 作用于完整图元的透明度。 */
  readonly opacity?: number;
  /** 仅通过 OpenLayers 公开 setter 更新的动态样式标量。 */
  readonly dynamicStyle?: LayerRenderDynamicStyle;
  /** target-geometry 来自 grow 时携带的固定目标路径揭示语义。 */
  readonly pathReveal?: LayerRenderPathReveal;
}

export interface LayerRenderValue {
  /** 此渲染值是否可见。 */
  readonly visible?: boolean;
  /** 接管规范 Feature 展示后绘制的合成基础替身。 */
  readonly presentation?: LayerRenderPrimitive;
  /** 需要绘制的图元。 */
  readonly primitives?: readonly LayerRenderPrimitive[];
}

export interface LayerRenderContribution {
  /** 渲染目标 ID。 */
  readonly targetId: string;
  /** 同一目标内的渲染通道。 */
  readonly channel: string;
  /** 目标规范样式的层级；Overlay 自身样式不能改变目标间顺序。 */
  readonly targetZIndex?: number;
  /** 当前通道的渲染结果。 */
  readonly value: LayerRenderValue;
}

/** 声明仍属于当前动画生命周期、但本帧可以不绘制的稳定渲染槽。 */
export type LayerRenderSlotReservation =
  | Readonly<{
      /** 合成基础替身由目标唯一标识。 */
      kind: 'presentation';
      /** 渲染目标 ID。 */
      targetId: string;
    }>
  | Readonly<{
      /** Overlay 槽由目标、通道和槽名共同标识。 */
      kind: 'overlay';
      /** 渲染目标 ID。 */
      targetId: string;
      /** Overlay 所属渲染通道。 */
      channel: string;
      /** Runtime 生命周期内稳定的槽名。 */
      slotKey: string;
    }>;

export interface LayerRenderBatch {
  /** 本帧各目标的渲染贡献。 */
  readonly contributions: readonly LayerRenderContribution[];
  /** 本帧不可见时仍需保留的稳定槽；未声明的已缓存槽会被释放。 */
  readonly slotReservations?: readonly LayerRenderSlotReservation[];
  /** 是否继续请求下一帧。 */
  readonly requestNextFrame: boolean;
}

export interface LayerRenderLoopHandle {
  /** 请求重新渲染一帧。 */
  requestRender(): void;
  /** 停止循环并释放渲染资源；渲染回调内可先消费终态批次再清理。 */
  destroy(options?: Readonly<{ flushCurrentFrame?: boolean }>): void;
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

export interface LayerPresentationLease {
  /** 租约接管的图层 ID。 */
  readonly layerId: string;
  /** 租约接管的 Element ID。 */
  readonly targetId: string;
  /** 当前句柄是否仍持有有效租约。 */
  readonly active: boolean;
  /** 释放展示权；重复调用不产生副作用。 */
  release(): void;
}

export interface LayerRenderPort {
  /** 为图层打开共享渲染循环。 */
  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle;
  /** 注册临时渲染目标。 */
  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle;
  /** 判断渲染目标是否存在。 */
  hasTarget(layerId: string, targetId: string): boolean;
  /** 接管规范 Feature 的展示权，但不改变其 Source 身份或规范 Geometry。 */
  acquirePresentation(layerId: string, targetId: string): LayerPresentationLease;
}
