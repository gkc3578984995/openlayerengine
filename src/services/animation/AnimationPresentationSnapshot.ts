import type { LayerRenderPrimitive } from '../../core/ports/LayerRenderPort.js';

export interface AnimationPrintFrame {
  readonly resolution: number;
  readonly rotation: number;
  readonly pixelRatio: number;
  readonly extent: readonly [number, number, number, number];
}

export interface AnimationElementPresentationSnapshot {
  readonly elementId: string;
  readonly layerId: string;
  readonly targetZIndex: number;
  /** target modifier 持有基础展示权时为 true；即使当前 geometry 为空也不能回退到规范 Feature。 */
  readonly replacesBase: boolean;
  readonly presentation?: Readonly<LayerRenderPrimitive>;
  readonly primitives: readonly Readonly<LayerRenderPrimitive>[];
}

export interface AnimationPresentationSnapshot {
  readonly revision: number;
  readonly capturedAt: number;
  readonly elements: readonly Readonly<AnimationElementPresentationSnapshot>[];
}
