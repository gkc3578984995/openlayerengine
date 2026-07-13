import type { Color } from '../common/types.js';

const nativeStyleRefBrand: unique symbol = Symbol('ol-engine.native-style-ref');

export interface NativeStyleRef {
  readonly [nativeStyleRefBrand]: true;
}

export interface StrokeSpec {
  readonly color?: Color;
  readonly width?: number;
  readonly lineDash?: readonly number[];
  readonly lineDashOffset?: number;
  readonly lineCap?: 'butt' | 'round' | 'square';
  readonly lineJoin?: 'bevel' | 'round' | 'miter';
  readonly miterLimit?: number;
  readonly fitPatternOnce?: boolean;
}

export interface SolidFillSpec {
  readonly type: 'solid';
  readonly color: Color;
}

export interface PatternFillSpec {
  readonly type: 'pattern';
  readonly pattern: 'diagonal' | 'cross' | 'dot' | 'horizontal' | 'vertical';
  readonly color?: Color;
  readonly size?: number;
  readonly lineWidth?: number;
  readonly dotRadius?: number;
  readonly backgroundColor?: Color;
}

export interface CircleSymbolSpec {
  readonly type: 'circle';
  readonly radius: number;
  readonly fill?: SolidFillSpec | PatternFillSpec;
  readonly stroke?: StrokeSpec;
}

export interface IconSymbolSpec {
  readonly type: 'icon';
  readonly src: string;
  readonly size?: readonly [number, number];
  readonly color?: Color;
  readonly offset?: readonly [number, number];
  readonly displacement?: readonly [number, number];
  readonly scale?: number | readonly [number, number];
  readonly rotation?: number;
  readonly rotateWithView?: boolean;
  readonly anchor?: readonly [number, number];
  readonly anchorOrigin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly anchorXUnits?: 'fraction' | 'pixels';
  readonly anchorYUnits?: 'fraction' | 'pixels';
  readonly origin?: readonly [number, number];
  readonly opacity?: number;
  readonly crossOrigin?: string | null;
}

export interface TextSpec {
  readonly text: string;
  readonly font?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number | string;
  readonly fontWeight?: number | 'normal' | 'bold' | 'bolder' | 'lighter';
  readonly fontStyle?: 'normal' | 'italic' | 'oblique';
  readonly fill?: SolidFillSpec | PatternFillSpec;
  readonly stroke?: StrokeSpec;
  readonly backgroundFill?: SolidFillSpec | PatternFillSpec;
  readonly backgroundStroke?: StrokeSpec;
  readonly padding?: readonly number[];
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly scale?: number | readonly [number, number];
  readonly textAlign?: 'left' | 'right' | 'center' | 'start' | 'end';
  readonly textBaseline?: 'bottom' | 'top' | 'middle' | 'alphabetic' | 'hanging' | 'ideographic';
  readonly rotation?: number;
  readonly rotateWithView?: boolean;
  readonly overflow?: boolean;
  readonly placement?: 'point' | 'line';
  readonly maxAngle?: number;
  readonly repeat?: number;
  readonly justify?: 'left' | 'right' | 'center';
  readonly keepUpright?: boolean;
}

export interface ArrowDecorationSpec {
  readonly type: 'arrow';
  readonly placement: 'start' | 'end' | 'each-segment' | 'repeat';
  readonly symbol?: IconSymbolSpec;
  readonly offset?: number;
  readonly spacing?: number;
}

export interface StyleSpec {
  readonly symbol?: CircleSymbolSpec | IconSymbolSpec;
  readonly strokes?: readonly StrokeSpec[];
  readonly fill?: SolidFillSpec | PatternFillSpec;
  readonly text?: TextSpec;
  readonly decorations?: readonly ArrowDecorationSpec[];
  readonly zIndex?: number;
}

export type ElementStyleState = StyleSpec | NativeStyleRef;

export function createNativeStyleRef(): NativeStyleRef {
  return Object.freeze({ [nativeStyleRefBrand]: true }) as NativeStyleRef;
}

export function isNativeStyleRef(value: unknown): value is NativeStyleRef {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { readonly [nativeStyleRefBrand]?: unknown })[nativeStyleRefBrand] === true;
}
