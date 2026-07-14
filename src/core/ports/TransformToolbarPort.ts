import type { Coordinate } from '../common/types.js';

export interface TransformToolbarItemState {
  readonly key: string;
  readonly title: string;
  readonly icon?: string;
  readonly iconClass?: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly active: boolean;
}

export interface TransformToolbarViewOptions {
  readonly position: Coordinate;
  readonly offset: readonly [number, number];
  readonly className?: string;
  readonly visible: boolean;
}

export interface TransformToolbarViewSpec {
  readonly ownerId: string;
  readonly items: readonly TransformToolbarItemState[];
  readonly options: TransformToolbarViewOptions;
}

export interface TransformToolbarViewHandle {
  setActive(key: string): void;
  updateItem(key: string, patch: Partial<Omit<TransformToolbarItemState, 'key'>>): void;
  updateOptions(patch: Partial<TransformToolbarViewOptions>): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export interface TransformToolbarPort {
  open(spec: TransformToolbarViewSpec, command: (key: string) => void): TransformToolbarViewHandle;
}
