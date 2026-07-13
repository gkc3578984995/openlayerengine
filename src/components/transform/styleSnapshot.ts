import type { StyleFunction } from 'ol/style/Style.js';
import Style from 'ol/style/Style.js';

export function cloneStyleSnapshot(style: Style | Style[] | StyleFunction | undefined): Style | Style[] | StyleFunction | undefined {
  if (Array.isArray(style)) return style.map((item) => item.clone());
  if (style instanceof Style) return style.clone();
  return style;
}
