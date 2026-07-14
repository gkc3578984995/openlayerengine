import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../animation/types.js';
import type { ElementSelector } from '../element/types.js';

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
