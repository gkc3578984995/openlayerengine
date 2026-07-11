import { createCanvasContext2D } from 'ol/dom';
import type { IPolygonFill, IPolygonPatternFill, PolygonPatternType } from '../interface';

const PATTERN_SIZES = [4, 8, 16, 32, 64, 128] as const;

export interface ResolvedPolygonPatternFill {
  type: PolygonPatternType;
  color: string;
  backgroundColor?: string;
  size: (typeof PATTERN_SIZES)[number];
  lineWidth: number;
  dotRadius: number;
}

/** 判断填充参数是否为 Polygon 内置纹理 */
export function isPolygonPatternFill(fill: IPolygonFill | undefined): fill is IPolygonPatternFill {
  return !!fill && 'type' in fill && typeof fill.type === 'string';
}

/** 规范化纹理参数并解析最终纹理颜色 */
export function normalizePolygonPatternFill(fill: IPolygonPatternFill, strokeColor?: string): ResolvedPolygonPatternFill {
  const size = PATTERN_SIZES.includes(fill.size as (typeof PATTERN_SIZES)[number]) ? (fill.size as (typeof PATTERN_SIZES)[number]) : 16;
  return {
    type: fill.type,
    color: fill.color ?? strokeColor ?? '#000000',
    backgroundColor: fill.backgroundColor,
    size,
    lineWidth: Number.isFinite(fill.lineWidth) && (fill.lineWidth as number) > 0 ? (fill.lineWidth as number) : 1,
    dotRadius: Number.isFinite(fill.dotRadius) && (fill.dotRadius as number) > 0 ? (fill.dotRadius as number) : 1.5
  };
}

function drawDiagonal(context: CanvasRenderingContext2D, size: number, reverse: boolean): void {
  context.beginPath();
  if (reverse) {
    context.moveTo(0, 0);
    context.lineTo(size, size);
  } else {
    context.moveTo(0, size);
    context.lineTo(size, 0);
  }
  context.stroke();
}

/** 在一个 Canvas 图块中绘制内置纹理 */
export function drawPolygonPattern(context: CanvasRenderingContext2D, pattern: ResolvedPolygonPatternFill): void {
  context.strokeStyle = pattern.color;
  context.fillStyle = pattern.color;
  context.lineWidth = pattern.lineWidth;

  if (pattern.type === 'dot') {
    context.beginPath();
    context.arc(pattern.size / 2, pattern.size / 2, pattern.dotRadius, 0, Math.PI * 2);
    context.fill();
    return;
  }

  if (pattern.type === 'horizontal') {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(pattern.size, 0);
    context.stroke();
    return;
  }

  if (pattern.type === 'vertical') {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, pattern.size);
    context.stroke();
    return;
  }

  drawDiagonal(context, pattern.size, false);
  if (pattern.type === 'cross') drawDiagonal(context, pattern.size, true);
}

/** 创建 OpenLayers Fill 可使用的重复 CanvasPattern */
export function createPolygonPattern(fill: IPolygonPatternFill, strokeColor?: string): CanvasPattern {
  const pattern = normalizePolygonPatternFill(fill, strokeColor);
  const context = createCanvasContext2D(pattern.size, pattern.size);
  if (pattern.backgroundColor) {
    context.fillStyle = pattern.backgroundColor;
    context.fillRect(0, 0, pattern.size, pattern.size);
  }
  drawPolygonPattern(context, pattern);
  const canvasPattern = context.createPattern(context.canvas, 'repeat');
  if (!canvasPattern) throw new Error('Unable to create polygon fill pattern');
  return canvasPattern;
}
