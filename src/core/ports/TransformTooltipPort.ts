import type { Coordinate } from '../common/types.js';

export interface TransformTooltipViewState {
  readonly position: Coordinate;
  readonly lines: readonly string[];
  readonly offset: readonly [number, number];
  readonly visible: boolean;
}

export interface TransformTooltipViewSpec extends TransformTooltipViewState {
  readonly ownerId: string;
}

export interface TransformTooltipViewHandle {
  update(patch: Partial<TransformTooltipViewState>): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface TransformTooltipPort {
  open(spec: TransformTooltipViewSpec): TransformTooltipViewHandle;
}
