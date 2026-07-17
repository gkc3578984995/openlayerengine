import type { Color } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';

type RgbaComponents = readonly [red: number, green: number, blue: number, alpha: number];

/** 读取范围合法的数值 RGB/RGBA tuple。输入结构由上层严格数组校验负责。 */
export function numericColorComponents(parts: readonly unknown[]): RgbaComponents | undefined {
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const red = parts[0];
  const green = parts[1];
  const blue = parts[2];
  const alpha = parts.length === 4 ? parts[3] : 1;
  if (![red, green, blue, alpha].every((part) => typeof part === 'number' && Number.isFinite(part))) return undefined;
  if ((red as number) < 0 || (red as number) > 255 || (green as number) < 0 || (green as number) > 255 || (blue as number) < 0 || (blue as number) > 255) {
    return undefined;
  }
  if ((alpha as number) < 0 || (alpha as number) > 1) return undefined;
  return [red as number, green as number, blue as number, alpha as number];
}

/** 解析不依赖 DOM 上下文的绝对 CSS 颜色。 */
export function absoluteColorComponents(value: Color): RgbaComponents | undefined {
  if (Array.isArray(value)) return numericColorComponents(value);
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent') return [0, 0, 0, 0];
  const named = Object.hasOwn(cssNamedColors, normalized) ? cssNamedColors[normalized] : undefined;
  if (named !== undefined) return hexComponents(named);
  if (normalized.startsWith('#')) return hexComponents(normalized);
  return functionalColorComponents(normalized);
}

/** 把可确定解析的颜色转换成 RGBA，避免渐变在 Adapter 或 DOM 环境中二次解释。 */
export function normalizeInterpolableColor(value: Color, label: string): Color {
  const components = absoluteColorComponents(value);
  if (components === undefined) {
    throw new InvalidArgumentError(
      `${label} must use transparent, a CSS named color, #RGB[A], #RRGGBB[AA], numeric rgb()/rgba() or hsl()/hsla(), or a numeric RGB/RGBA tuple`
    );
  }
  return [components[0], components[1], components[2], components[3]];
}

/** 对两个可确定解析的颜色执行逐 RGBA 通道线性插值。 */
export function interpolateColor(left: Color, right: Color, ratio: number): Color {
  const start = absoluteColorComponents(left);
  const end = absoluteColorComponents(right);
  if (start === undefined || end === undefined) {
    throw new InvalidArgumentError('Interpolated colors must be normalized RGBA-compatible colors');
  }
  const progress = clamp(ratio, 0, 1);
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
    start[2] + (end[2] - start[2]) * progress,
    start[3] + (end[3] - start[3]) * progress
  ];
}

function functionalColorComponents(value: string): RgbaComponents | undefined {
  const match = /^(rgba?|hsla?)\((.*)\)$/.exec(value);
  if (match === null) return undefined;
  const parts = functionalColorParts(match[2]);
  if (parts === undefined) return undefined;
  const alpha = parts.alpha === undefined ? 1 : alphaPart(parts.alpha);
  if (alpha === undefined) return undefined;
  if (match[1] === 'rgb' || match[1] === 'rgba') {
    if (parts.commaSeparated && mixesRgbComponentUnits(parts.components)) return undefined;
    const red = rgbPart(parts.components[0]);
    const green = rgbPart(parts.components[1]);
    const blue = rgbPart(parts.components[2]);
    return red === undefined || green === undefined || blue === undefined ? undefined : [red, green, blue, alpha];
  }
  const hue = huePart(parts.components[0]);
  const saturation = percentagePart(parts.components[1]);
  const lightness = percentagePart(parts.components[2]);
  return hue === undefined || saturation === undefined || lightness === undefined ? undefined : hslComponents(hue, saturation, lightness, alpha);
}

interface FunctionalColorParts {
  readonly components: readonly [string, string, string];
  readonly alpha?: string;
  readonly commaSeparated: boolean;
}

function functionalColorParts(value: string): FunctionalColorParts | undefined {
  if (value.includes(',')) {
    if (value.includes('/')) return undefined;
    const parts = value.split(',').map((part) => part.trim());
    if ((parts.length !== 3 && parts.length !== 4) || parts.some((part) => part.length === 0)) return undefined;
    return { components: [parts[0], parts[1], parts[2]], ...(parts[3] === undefined ? {} : { alpha: parts[3] }), commaSeparated: true };
  }
  const slashParts = value.split('/');
  if (slashParts.length > 2) return undefined;
  const components = slashParts[0].trim().split(/\s+/);
  const alpha = slashParts[1]?.trim();
  if (components.length !== 3 || components.some((part) => part.length === 0) || alpha === '') return undefined;
  return { components: [components[0], components[1], components[2]], ...(alpha === undefined ? {} : { alpha }), commaSeparated: false };
}

function mixesRgbComponentUnits(components: readonly [string, string, string]): boolean {
  const percentageCount = components.reduce((count, component) => count + (component.trim().endsWith('%') ? 1 : 0), 0);
  return percentageCount !== 0 && percentageCount !== components.length;
}

function hexComponents(value: string): RgbaComponents | undefined {
  const hex = value.slice(1);
  if (!/^[0-9a-f]+$/.test(hex) || (hex.length !== 3 && hex.length !== 4 && hex.length !== 6 && hex.length !== 8)) return undefined;
  const expanded = hex.length <= 4 ? [...hex].map((part) => part + part).join('') : hex;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
    expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
  ];
}

function rgbPart(value: string): number | undefined {
  const normalized = value.trim();
  if (normalized.endsWith('%')) {
    const percentage = cssNumber(normalized.slice(0, -1));
    return percentage === undefined ? undefined : (clamp(percentage, 0, 100) * 255) / 100;
  }
  const result = cssNumber(normalized);
  return result === undefined ? undefined : clamp(result, 0, 255);
}

function alphaPart(value: string): number | undefined {
  const normalized = value.trim();
  if (normalized.endsWith('%')) {
    const percentage = cssNumber(normalized.slice(0, -1));
    return percentage === undefined ? undefined : clamp(percentage, 0, 100) / 100;
  }
  const result = cssNumber(normalized);
  return result === undefined ? undefined : clamp(result, 0, 1);
}

function huePart(value: string): number | undefined {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/i.exec(value.trim());
  if (match === null) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const degrees = match[2] === 'grad' ? amount * 0.9 : match[2] === 'rad' ? (amount * 180) / Math.PI : match[2] === 'turn' ? amount * 360 : amount;
  return positiveModulo(degrees, 360);
}

function percentagePart(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized.endsWith('%')) return undefined;
  const result = cssNumber(normalized.slice(0, -1));
  return result === undefined ? undefined : clamp(result, 0, 100) / 100;
}

function cssNumber(value: string): number | undefined {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function hslComponents(hue: number, saturation: number, lightness: number, alpha: number): RgbaComponents {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return [(red + offset) * 255, (green + offset) * 255, (blue + offset) * 255, alpha];
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const cssNamedColors: Readonly<Record<string, string>> = Object.freeze({
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32'
});
