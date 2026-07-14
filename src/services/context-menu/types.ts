import type { Coordinate, Pixel } from '../../core/common/types.js';
import type { ElementState } from '../../core/element/types.js';

export type InternalContextMenuTarget =
  { readonly kind: 'map' } | { readonly kind: 'module'; readonly module: string } | { readonly kind: 'element'; readonly elementId: string };

export type InternalContextMenuStateTarget = { readonly kind: 'map' } | { readonly kind: 'element'; readonly elementId: string };

export interface InternalContextMenuItemSpec {
  readonly key: string;
  readonly label: string;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly mutexKey?: string;
  readonly children?: readonly InternalContextMenuItemSpec[];
}

export interface InternalContextMenuItemContext {
  readonly item: InternalContextMenuItemSpec;
  readonly scope: 'map' | 'module' | 'element';
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly element?: Readonly<ElementState>;
  readonly module?: string;
  readonly layerId?: string;
}

export interface InternalContextMenuSpec {
  readonly items: readonly InternalContextMenuItemSpec[];
  readonly before?: (context: InternalContextMenuItemContext) => boolean;
  readonly onSelect?: (context: InternalContextMenuItemContext) => void;
}

export interface InternalContextMenuItemState {
  readonly visible: boolean;
  readonly disabled: boolean;
}

export interface ContextMenuRegistrationHandle {
  destroy(): void;
}
