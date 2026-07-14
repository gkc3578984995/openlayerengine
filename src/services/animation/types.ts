import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import type { LayerRenderValue } from '../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../../core/shape/types.js';
import type { StyleSpec } from '../../core/style/types.js';

export interface AnimationHandle {
  readonly id: string;
  readonly status: AnimationStatus;
  readonly finished: Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface AnimationManager {
  play(selector: ElementSelector, spec: AnimationSpec): AnimationHandle;
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  stopAll(): void;
}

export interface AnimationFrameContext {
  readonly state: Readonly<ElementState>;
  readonly geometry: RenderGeometryState;
  readonly style: StyleSpec;
  readonly elapsedMs: number;
  readonly resolution: number;
}

export interface AnimationFrameResult {
  readonly value: LayerRenderValue;
  readonly finished: boolean;
  readonly retain?: boolean;
}

export interface AnimationDefinition {
  readonly type: AnimationSpec['type'];
  normalize(spec: AnimationSpec): AnimationSpec;
  assertCompatible(state: Readonly<ElementState>, geometry: RenderGeometryState): void;
  frame(context: AnimationFrameContext, spec: AnimationSpec): AnimationFrameResult;
}
