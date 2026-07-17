import type { IconSymbolSpec, StrokeSpec, StyleSpec } from './types.js';

/** 当前帧通过公开样式 setter 覆盖的视觉尺寸。 */
export interface StyleVisualOutsetOverrides {
  readonly symbolRadius?: number;
  readonly strokeWidth?: number;
}

/**
 * 返回结构化样式相对 Geometry 的最大 CSS 像素外扩；无法可靠估算时返回 undefined。
 *
 * 动态值表示当前帧对模板值的覆盖，而不是额外增量。
 */
export function styleVisualOutsetPx(style: StyleSpec, overrides?: StyleVisualOutsetOverrides): number | undefined {
  if (style.text !== undefined) return undefined;
  if (!validOverride(overrides?.symbolRadius) || !validOverride(overrides?.strokeWidth)) return undefined;
  let result = 0;
  for (const stroke of style.strokes ?? []) {
    const outset = strokeVisualOutsetPx(stroke, overrides?.strokeWidth);
    if (outset === undefined) return undefined;
    result = Math.max(result, outset);
  }
  if (style.symbol?.type === 'circle') {
    const radius = overrides?.symbolRadius ?? style.symbol.radius;
    const strokeWidth = style.symbol.stroke === undefined ? 0 : (overrides?.strokeWidth ?? style.symbol.stroke.width ?? 1);
    if (![radius, strokeWidth].every(Number.isFinite) || radius < 0 || strokeWidth < 0) return undefined;
    result = Math.max(result, radius + strokeWidth / 2);
  } else if (style.symbol?.type === 'icon') {
    const iconOutset = iconVisualOutsetPx(style.symbol);
    if (iconOutset === undefined) return undefined;
    result = Math.max(result, iconOutset);
  }
  for (const decoration of style.decorations ?? []) {
    if (decoration.symbol === undefined) result = Math.max(result, 7);
    else {
      const iconOutset = iconVisualOutsetPx(decoration.symbol);
      if (iconOutset === undefined) return undefined;
      result = Math.max(result, iconOutset);
    }
  }
  return result;
}

function validOverride(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

function strokeVisualOutsetPx(stroke: StrokeSpec, widthOverride: number | undefined): number | undefined {
  const width = widthOverride ?? stroke.width ?? 1;
  if (!Number.isFinite(width) || width < 0) return undefined;
  const halfWidth = width / 2;
  if (stroke.lineJoin === 'round' || stroke.lineJoin === 'bevel') return halfWidth;
  const miterLimit = stroke.miterLimit ?? 10;
  return Number.isFinite(miterLimit) && miterLimit >= 0 ? halfWidth * Math.max(1, miterLimit) : undefined;
}

function iconVisualOutsetPx(icon: IconSymbolSpec): number | undefined {
  if (icon.size === undefined) return undefined;
  const [width, height] = icon.size;
  const scaleX = Math.abs(Array.isArray(icon.scale) ? icon.scale[0] : (icon.scale ?? 1));
  const scaleY = Math.abs(Array.isArray(icon.scale) ? icon.scale[1] : (icon.scale ?? 1));
  const anchor = icon.anchor ?? [0.5, 0.5];
  const anchorX = icon.anchorXUnits === 'pixels' ? anchor[0] : anchor[0] * width;
  const anchorY = icon.anchorYUnits === 'pixels' ? anchor[1] : anchor[1] * height;
  const displacement = icon.displacement ?? [0, 0];
  const values = [width, height, scaleX, scaleY, anchorX, anchorY, displacement[0], displacement[1]];
  if (!values.every(Number.isFinite) || width < 0 || height < 0) return undefined;
  const radiusX = Math.max(Math.abs(anchorX), Math.abs(width - anchorX)) * scaleX;
  const radiusY = Math.max(Math.abs(anchorY), Math.abs(height - anchorY)) * scaleY;
  return Math.hypot(radiusX, radiusY) + Math.hypot(displacement[0], displacement[1]);
}
