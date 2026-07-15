import { createCanvasContext2D } from 'ol/dom.js';
import type { Color } from '../../../core/common/types.js';
import { InvalidArgumentError } from '../../../core/errors.js';
import type { PatternFillSpec } from '../../../core/style/types.js';

/** 支持的纹理画布尺寸。 */
const patternSizes = [4, 8, 16, 32, 64, 128] as const;

/** 经过默认值补齐的纹理填充配置。 */
export interface ResolvedPatternFill {
  /** 纹理类型。 */
  readonly pattern: PatternFillSpec['pattern'];
  /** 纹理线条或圆点颜色。 */
  readonly color: string;
  /** 可选的纹理底色。 */
  readonly backgroundColor?: string;
  /** 单个纹理单元尺寸。 */
  readonly size: (typeof patternSizes)[number];
  /** 纹理线宽。 */
  readonly lineWidth: number;
  /** 圆点纹理半径。 */
  readonly dotRadius: number;
}

/** HTML Canvas 和 OffscreenCanvas 共用的最小绘图能力。 */
export interface PatternCanvasContext {
  /** 用于生成重复纹理的画布。 */
  readonly canvas: unknown;
  /** 当前描边颜色。 */
  strokeStyle: unknown;
  /** 当前填充颜色。 */
  fillStyle: unknown;
  /** 当前线宽。 */
  lineWidth: number;
  /** 开始一条新路径。 */
  beginPath(): void;
  /** 将路径起点移动到指定位置。 */
  moveTo(x: number, y: number): void;
  /** 从当前点绘制直线。 */
  lineTo(x: number, y: number): void;
  /** 描边当前路径。 */
  stroke(): void;
  /** 向当前路径加入圆弧。 */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  /** 填充当前路径。 */
  fill(): void;
  /** 填充指定矩形。 */
  fillRect(x: number, y: number, width: number, height: number): void;
  /** 使用画布创建重复纹理。 */
  createPattern(image: unknown, repetition: string | null): CanvasPattern | null;
}

/** 创建指定尺寸纹理画布上下文的函数。 */
export type PatternCanvasFactory = (width: number, height: number) => PatternCanvasContext;

/** 校验纹理参数并补齐默认颜色和尺寸。 */
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

/** 在画布上下文中绘制一个纹理单元。 */
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

/** 创建可供 OpenLayers 填充使用的重复纹理。 */
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

/** 创建浏览器或离屏的默认二维画布上下文。 */
function defaultCanvasFactory(width: number, height: number): PatternCanvasContext {
  if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new InvalidArgumentError('Unable to create an OffscreenCanvas 2D context');
    return context as unknown as PatternCanvasContext;
  }
  return createCanvasContext2D(width, height) as unknown as PatternCanvasContext;
}

/** 将核心颜色转换为 CSS 颜色。 */
function colorToCss(color: Color): string {
  if (typeof color === 'string') return color;
  const alpha = color.length === 4 ? color[3] : 1;
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/** 绘制一个方向的对角线纹理。 */
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
