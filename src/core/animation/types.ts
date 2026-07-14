import type { Color } from '../common/types.js';

export type AnimationChannel = string;
export type AnimationStatus = 'running' | 'paused' | 'stopped' | 'finished';

export interface PulseAnimationSpec {
  readonly type: 'pulse';
  readonly channel?: AnimationChannel;
  readonly periodMs?: number;
  readonly color?: Color;
  readonly repeat?: boolean;
  readonly radius?: number;
}

export interface DashFlowAnimationSpec {
  readonly type: 'dash-flow';
  readonly channel?: AnimationChannel;
  readonly speed?: number;
  readonly lineDash?: readonly number[];
  readonly color?: Color;
}

export interface PathTravelAnimationSpec {
  readonly type: 'path-travel';
  readonly channel?: AnimationChannel;
  readonly speed?: number;
  readonly durationMs?: number;
  readonly repeat?: boolean;
  readonly trailLength?: number;
  readonly color?: Color;
  readonly gradient?: readonly (readonly [offset: number, color: Color])[];
  readonly width?: number;
  readonly curvature?: number;
  readonly smoothness?: number;
  readonly arrow?: boolean;
  readonly arrowColor?: Color;
  readonly showStart?: boolean;
  readonly showEnd?: boolean;
  readonly endLineColor?: Color;
  readonly finishBehavior?: 'remove' | 'retain';
}

export type AnimationSpec = PulseAnimationSpec | DashFlowAnimationSpec | PathTravelAnimationSpec;
