import type { StyleLike } from 'ol/style/Style.js';
import type { ElementSelector } from '../core/element/types.js';
import type { StylePatch, StyleSpec } from '../core/style/types.js';

export type StyleInput = StyleSpec | { nativeStyle: StyleLike };

export interface StyleService {
  set(selector: ElementSelector, style: StyleInput): void;
  patch(selector: ElementSelector, patch: StylePatch): void;
}
