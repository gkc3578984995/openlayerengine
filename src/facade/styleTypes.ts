import type { StyleLike } from 'ol/style/Style.js';
import type { ElementSelector } from '../core/element/types.js';
import type { StylePatch, StyleSpec } from '../core/style/types.js';

export type StyleInput = (StyleSpec & { nativeStyle?: never }) | ({ nativeStyle: StyleLike } & { [K in keyof StyleSpec]?: never });

export interface StyleService {
  set(selector: ElementSelector, style: StyleInput): void;
  patch(selector: ElementSelector, patch: StylePatch): void;
}
