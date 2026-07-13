import type { ShapeState, ShapeType } from '../shape/types.js';
import type { ElementStyleState } from '../style/types.js';

export interface ElementState<T = unknown> {
  readonly id: string;
  readonly type: ShapeType;
  readonly geometry: ShapeState;
  readonly style: ElementStyleState;
  readonly data?: T;
  readonly module?: string;
  readonly layerId: string;
  readonly visible: boolean;
}

export interface ElementSelector<T = unknown> {
  id?: string;
  ids?: readonly string[];
  module?: string;
  layerId?: string;
  type?: ShapeType;
  visible?: boolean;
  predicate?: (state: Readonly<ElementState<T>>) => boolean;
}

export type ElementPatch<T = unknown> = Partial<Omit<ElementState<T>, 'id' | 'type'>>;

export type ElementCopyOptions<T = unknown> = Partial<Omit<ElementState<T>, 'id' | 'type'>>;
