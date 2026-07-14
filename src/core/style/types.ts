import type { Color } from '../common/types.js';

const nativeStyleRefBrand: unique symbol = Symbol('ol-engine.native-style-ref');
const issuedNativeStyleRefs = new WeakSet<object>();

export interface NativeStyleRef {
  readonly [nativeStyleRefBrand]: true;
}

export interface StrokeSpec {
  color?: Color;
  width?: number;
  lineDash?: number[];
  lineDashOffset?: number;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'bevel' | 'round' | 'miter';
  miterLimit?: number;
  fitPatternOnce?: boolean;
}

export interface SolidFillSpec {
  type: 'solid';
  color: Color;
}

export interface PatternFillSpec {
  type: 'pattern';
  pattern: 'diagonal' | 'cross' | 'dot' | 'horizontal' | 'vertical';
  color?: Color;
  size?: number;
  lineWidth?: number;
  dotRadius?: number;
  backgroundColor?: Color;
}

export interface CircleSymbolSpec {
  type: 'circle';
  radius: number;
  fill?: SolidFillSpec | PatternFillSpec;
  stroke?: StrokeSpec;
}

export interface IconSymbolSpec {
  type: 'icon';
  src: string;
  size?: [number, number];
  color?: Color;
  offset?: [number, number];
  displacement?: [number, number];
  scale?: number | [number, number];
  rotation?: number;
  rotateWithView?: boolean;
  anchor?: [number, number];
  anchorOrigin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  anchorXUnits?: 'fraction' | 'pixels';
  anchorYUnits?: 'fraction' | 'pixels';
  origin?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  crossOrigin?: string | null;
}

export interface TextSpec {
  text: string;
  font?: string;
  fontFamily?: string;
  fontSize?: number | string;
  fontWeight?: number | 'normal' | 'bold' | 'bolder' | 'lighter';
  fontStyle?: 'normal' | 'italic' | 'oblique';
  fill?: SolidFillSpec | PatternFillSpec;
  stroke?: StrokeSpec;
  backgroundFill?: SolidFillSpec | PatternFillSpec;
  backgroundStroke?: StrokeSpec;
  padding?: number[];
  offsetX?: number;
  offsetY?: number;
  scale?: number | [number, number];
  textAlign?: 'left' | 'right' | 'center' | 'start' | 'end';
  textBaseline?: 'bottom' | 'top' | 'middle' | 'alphabetic' | 'hanging' | 'ideographic';
  rotation?: number;
  rotateWithView?: boolean;
  overflow?: boolean;
  placement?: 'point' | 'line';
  maxAngle?: number;
  repeat?: number;
  justify?: 'left' | 'right' | 'center';
  keepUpright?: boolean;
}

export interface ArrowDecorationSpec {
  type: 'arrow';
  placement: 'start' | 'end' | 'each-segment' | 'repeat';
  symbol?: IconSymbolSpec;
  offset?: number;
  spacing?: number;
}

export interface StyleSpec {
  symbol?: CircleSymbolSpec | IconSymbolSpec;
  strokes?: StrokeSpec[];
  fill?: SolidFillSpec | PatternFillSpec;
  text?: TextSpec;
  decorations?: ArrowDecorationSpec[];
  zIndex?: number;
}

/**
 * Deep structured-style patch. Arrays are replacement values; object branches
 * are recursively merged. Explicit `undefined` removes a property. Supplying a
 * discriminator replaces that complete variant and therefore requires the
 * corresponding full specification.
 */
export type StylePatch = {
  symbol?:
    | CircleSymbolSpec
    | IconSymbolSpec
    | undefined
    | {
        type?: undefined;
        radius?: CircleSymbolSpec['radius'] | undefined;
        fill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | ({ type?: undefined } & { [K in Exclude<keyof SolidFillSpec, 'type'>]?: SolidFillSpec[K] | undefined })
          | ({ type?: undefined } & { [K in Exclude<keyof PatternFillSpec, 'type'>]?: PatternFillSpec[K] | undefined });
        stroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
      }
    | ({ type?: undefined } & { [K in Exclude<keyof IconSymbolSpec, 'type'>]?: IconSymbolSpec[K] | undefined });
  strokes?: StrokeSpec[] | undefined;
  fill?:
    | SolidFillSpec
    | PatternFillSpec
    | undefined
    | ({ type?: undefined } & { [K in Exclude<keyof SolidFillSpec, 'type'>]?: SolidFillSpec[K] | undefined })
    | ({ type?: undefined } & { [K in Exclude<keyof PatternFillSpec, 'type'>]?: PatternFillSpec[K] | undefined });
  text?:
    | undefined
    | (Omit<{ [K in keyof TextSpec]?: TextSpec[K] | undefined }, 'fill' | 'stroke' | 'backgroundFill' | 'backgroundStroke'> & {
        fill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | ({ type?: undefined } & { [K in Exclude<keyof SolidFillSpec, 'type'>]?: SolidFillSpec[K] | undefined })
          | ({ type?: undefined } & { [K in Exclude<keyof PatternFillSpec, 'type'>]?: PatternFillSpec[K] | undefined });
        stroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
        backgroundFill?:
          | SolidFillSpec
          | PatternFillSpec
          | undefined
          | ({ type?: undefined } & { [K in Exclude<keyof SolidFillSpec, 'type'>]?: SolidFillSpec[K] | undefined })
          | ({ type?: undefined } & { [K in Exclude<keyof PatternFillSpec, 'type'>]?: PatternFillSpec[K] | undefined });
        backgroundStroke?: { [K in keyof StrokeSpec]?: StrokeSpec[K] | undefined } | undefined;
      });
  decorations?: ArrowDecorationSpec[] | undefined;
  zIndex?: number | undefined;
};

export type ElementStyleState = StyleSpec | NativeStyleRef;

export function createNativeStyleRef(): NativeStyleRef {
  const reference = Object.freeze({ [nativeStyleRefBrand]: true }) as NativeStyleRef;
  issuedNativeStyleRefs.add(reference);
  return reference;
}

export function isNativeStyleRef(value: unknown): value is NativeStyleRef {
  if (typeof value !== 'object' || value === null) return false;
  return Object.isFrozen(value) && issuedNativeStyleRefs.has(value);
}
