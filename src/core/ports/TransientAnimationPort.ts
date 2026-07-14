import type { AnimationChannel, AnimationStatus } from '../animation/types.js';

export interface BlinkAnimationSpec {
  readonly type: 'blink';
  readonly periodMs: number;
}

export interface TransientAnimationSpec {
  readonly ownerId: string;
  readonly renderLayerId: string;
  readonly renderTargetId: string;
  readonly channel: AnimationChannel;
  readonly animation: BlinkAnimationSpec;
}

export interface TransientAnimationHandle {
  readonly status: AnimationStatus;
  stop(): void;
}

export interface TransientAnimationPort {
  playTransient(spec: TransientAnimationSpec): TransientAnimationHandle;
  stopTransient(ownerId: string): number;
}
