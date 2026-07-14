import type { Coordinate, Pixel } from '../common/types.js';

export interface ContextMenuViewItem {
  readonly key: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly children?: readonly ContextMenuViewItem[];
}

export interface ContextMenuViewModel {
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly items: readonly ContextMenuViewItem[];
}

export type ContextMenuViewEvent = { readonly type: 'select'; readonly key: string } | { readonly type: 'close' };

export interface ContextMenuViewPort {
  listen(listener: (event: ContextMenuViewEvent) => void): () => void;
  show(model: ContextMenuViewModel): void;
  close(): void;
  setTheme(theme: 'light' | 'dark'): void;
  destroy(): void;
}
