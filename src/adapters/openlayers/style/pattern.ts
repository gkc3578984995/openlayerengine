import { createCanvasContext2D } from 'ol/dom.js';
import type { Color } from '../../../core/common/types.js';
import { InvalidArgumentError } from '../../../core/errors.js';
import type { PatternFillSpec } from '../../../core/style/types.js';

/** 纹理画布只使用这些离散尺寸，避免产生无界缓存键。 */
const patternSizes = [4, 8, 16, 32, 64, 128] as const;

/** 补齐默认值后的纹理填充配置。 */
export interface ResolvedPatternFill {
  readonly pattern: PatternFillSpec['pattern'];
  readonly color: string;
  readonly backgroundColor?: string;
  readonly size: (typeof patternSizes)[number];
  readonly lineWidth: number;
  readonly dotRadius: number;
}

/** HTML Canvas 和 OffscreenCanvas 共用的最小绘图能力。 */
export interface PatternCanvasContext {
  readonly canvas: unknown;
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  createPattern(image: unknown, repetition: string | null): CanvasPattern | null;
}

/** 按给定尺寸创建纹理画布上下文。 */
export type PatternCanvasFactory = (width: number, height: number) => PatternCanvasContext;

/** 规范化纹理参数，并为无效尺寸、线宽和圆点半径采用默认值。 */
export function normalizePatternFill(fill: PatternFillSpec, strokeColor?: Color): ResolvedPatternFill {
  const size = patternSizes.includes(fill.size as (typeof patternSizes)[number]) ? (fill.size as (typeof patternSizes)[number]) : 16;
  return {
    pattern: fill.pattern,
    color: colorToCss(fill.color ?? strokeColor ?? '#000000'),
    ...(fill.backgroundColor === undefined ? {} : { backgroundColor: colorToCss(fill.backgroundColor) }),
    size,
    lineWidth: Number.isFinite(fill.lineWidth) && (fill.lineWidth as number) > 0 ? (fill.lineWidth as number) : 1,
    dotRadius: Number.isFinite(fill.dotRadius) && (fill.dotRadius as number) > 0 ? (fill.dotRadius as number) : 1.5
  };
}

/** 在画布上绘制一个可平铺的纹理单元。 */
export function drawPatternFill(context: PatternCanvasContext, pattern: ResolvedPatternFill): void {
  context.strokeStyle = pattern.color;
  context.fillStyle = pattern.color;
  context.lineWidth = pattern.lineWidth;

  if (pattern.pattern === 'dot') {
    context.beginPath();
    context.arc(pattern.size / 2, pattern.size / 2, pattern.dotRadius, 0, Math.PI * 2);
    context.fill();
    return;
  }

  if (pattern.pattern === 'horizontal') {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(pattern.size, 0);
    context.stroke();
    return;
  }

  if (pattern.pattern === 'vertical') {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, pattern.size);
    context.stroke();
    return;
  }

  drawDiagonal(context, pattern.size, false);
  if (pattern.pattern === 'cross') drawDiagonal(context, pattern.size, true);
}

/** 创建可直接交给 OpenLayers Fill 的重复纹理。 */
export function createPatternFill(fill: PatternFillSpec, strokeColor?: Color, createContext: PatternCanvasFactory = defaultCanvasFactory): CanvasPattern {
  const pattern = normalizePatternFill(fill, strokeColor);
  const context = createContext(pattern.size, pattern.size);
  if (pattern.backgroundColor !== undefined) {
    context.fillStyle = pattern.backgroundColor;
    context.fillRect(0, 0, pattern.size, pattern.size);
  }
  drawPatternFill(context, pattern);
  const result = context.createPattern(context.canvas, 'repeat');
  if (result === null) throw new InvalidArgumentError('Unable to create a repeating fill pattern');
  return result;
}

/** 优先使用 OffscreenCanvas；浏览器环境则沿用 OpenLayers 的画布工厂。 */
function defaultCanvasFactory(width: number, height: number): PatternCanvasContext {
  if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new InvalidArgumentError('Unable to create an OffscreenCanvas 2D context');
    return context as unknown as PatternCanvasContext;
  }
  return createCanvasContext2D(width, height) as unknown as PatternCanvasContext;
}

function colorToCss(color: Color): string {
  if (typeof color === 'string') return color;
  const alpha = color.length === 4 ? color[3] : 1;
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function drawDiagonal(context: PatternCanvasContext, size: number, reverse: boolean): void {
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
