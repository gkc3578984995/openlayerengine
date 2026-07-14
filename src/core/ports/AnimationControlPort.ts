import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../animation/types.js';
import type { ElementSelector, ElementState } from '../element/types.js';

export interface AnimationControlHandle {
  readonly status: AnimationStatus;
  stop(): void;
}

export interface AnimationControlPort {
  play(selector: ElementSelector, animation: AnimationSpec): AnimationControlHandle;
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number;
}

export interface AnimationPreviewPort {
  setPreview(state: Readonly<ElementState>): void;
  clearPreview(elementId: string): void;
}

export type TransformAnimationPort = AnimationControlPort & AnimationPreviewPort;
