import { cloneCoreState } from '../../core/common/clone.js';
import type { Color } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type {
  InlinePathTextSpec,
  LineworkSpec,
  PathCapSpec,
  PathCasingSpec,
  PathDecorationSpec,
  PathGlyphPrimitiveSpec,
  PathGlyphSpec,
  PathTrackSpec,
  StyleSpec
} from '../../core/style/types.js';
import { assertStructuredStyleSpec } from '../../services/style/StyleService.js';

/** 轨道使用实线或内置固定节奏的虚线。 */
export type LinePattern = 'solid' | 'dashed';

/** 开放单轨路径两端可以使用的端帽。 */
export type LineCapType = 'none' | 'bar' | 'arrow';

/** 带轨道路径可以选择的内置固定装饰。 */
export type TrackedLineDecorationType =
  'none' | 'tick' | 'alternating-tick' | 'double-tick' | 'square' | 'circle' | 'center-cross' | 'center-dot' | 'center-dot-pair';

/** 不绘制轨道时可以使用的内置装饰。 */
export type DecorationOnlyLineType = 'slash';

/** 选择默认位于路径中点的内嵌文本。 */
export type InlineTextLineDecorationType = 'inline-text';

/** 单轨、双轨或纯装饰路径的前景轨道配置。 */
export type LineTracksOptions =
  | {
      /** 省略时为单轨。 */
      mode?: 'single';
      /** 单轨使用的实线或虚线，默认实线。 */
      pattern?: LinePattern;
      /** 单轨不能配置双轨 pattern。 */
      patterns?: never;
      /** 前景轨道宽度，单位为 CSS 像素，默认 2。 */
      width?: number;
    }
  | {
      /** 选择两条随宽度保持固定 4px 净间隙的前景轨道。 */
      mode: 'double';
      /** 双轨不能配置单个 pattern。 */
      pattern?: never;
      /** 两条轨道分别使用的 pattern，默认均为实线。 */
      patterns?: readonly [LinePattern, LinePattern];
      /** 每条前景轨道的宽度，单位为 CSS 像素，默认 2。 */
      width?: number;
    }
  | {
      /** 不绘制前景轨道，只允许纯 slash 装饰。 */
      mode: 'none';
      /** 无轨道模式不能配置单轨 pattern。 */
      pattern?: never;
      /** 无轨道模式不能配置双轨 patterns。 */
      patterns?: never;
      /** 无轨道模式没有可配置的前景轨道宽度。 */
      width?: never;
    };

/** 衬色相对完整轨道视觉包络的位置。 */
export type LineCasingType = 'inner' | 'outer' | 'center';

/** 根据完整轨道视觉包络生成的纯色衬色配置。 */
export interface LineCasingOptions {
  /** 衬色颜色。 */
  color: Color;
  /** 衬色位置，默认 `center`。 */
  type?: LineCasingType;
  /** 单个指定方向露出的厚度，单位为 CSS 像素，默认 2。 */
  width?: number;
}

/** 路径装饰短写，或带重复间距、文本参数的完整配置。 */
export type LineDecorationOptions =
  | TrackedLineDecorationType
  | DecorationOnlyLineType
  | {
      /** 位于路径中心或按固定像素间距重复的单 glyph 装饰。 */
      type: Extract<TrackedLineDecorationType, 'center-cross' | 'center-dot' | 'center-dot-pair'>;
      /** 省略时仅在路径中心放置一次；传入时按该 CSS 像素间距重复。 */
      repeatSpacingPx?: number;
    }
  | {
      /** 选择路径文本占位。 */
      type: InlineTextLineDecorationType;
      /** 放在路径上的非空文本。 */
      text: string;
      /** 文本外观；旋转和轨道切口由引擎固定。 */
      style?: InlineLineTextStyleOptions;
      /** 省略时仅在路径中心放置一次；传入时按该 CSS 像素间距重复。 */
      repeatSpacingPx?: number;
    };

/** 开放单轨路径的起点和终点端帽选项。 */
export interface LineCapsOptions {
  /** 起点端帽，默认不绘制。 */
  start?: LineCapType;
  /** 终点端帽，默认不绘制。 */
  end?: LineCapType;
}

/** 路径内嵌文本允许自定义的外观。 */
export interface InlineLineTextStyleOptions {
  /** 字号，单位为 CSS 像素，默认 12。 */
  fontSize?: number;
  /** 字体族，默认 `sans-serif`。 */
  fontFamily?: string;
  /** 字重，默认 `normal`。 */
  fontWeight?: number | 'normal' | 'bold';
  /** 字体样式，默认 `normal`。 */
  fontStyle?: 'normal' | 'italic';
  /** 文本颜色，默认黑色。 */
  color?: Color;
  /** 可选文本轮廓。 */
  outline?: {
    /** 轮廓颜色，默认白色。 */
    color?: Color;
    /** 轮廓宽度，单位为 CSS 像素，默认 2。 */
    width?: number;
  };
  /** 可选文本背景。 */
  background?: {
    /** 背景颜色。 */
    color: Color;
    /** 背景内边距，单位为 CSS 像素，默认 2。 */
    paddingPx?: number;
  };
}

/** `lineStyles.polyline()` 接受的正交参数。 */
export interface PolylineLineStyleOptions {
  /** 前景轨道、端帽和装饰物共用的颜色，默认红色。 */
  color?: Color;
  /** 单轨、双轨或纯装饰路径配置。 */
  tracks?: LineTracksOptions;
  /** 可选的内侧、外侧或居中衬色。 */
  casing?: LineCasingOptions;
  /** 开放单轨路径可以分别设置两端端帽。 */
  caps?: LineCapsOptions;
  /** 沿路径放置的装饰或路径文字。 */
  decoration?: LineDecorationOptions;
}

/** `lineStyles.polygon()` 接受的正交参数。 */
export interface PolygonLineStyleOptions {
  /** 前景轨道和装饰物共用的颜色，默认红色。 */
  color?: Color;
  /** 单轨、双轨或纯装饰路径配置。 */
  tracks?: LineTracksOptions;
  /** 可选的几何内侧、外侧或居中衬色。 */
  casing?: LineCasingOptions;
  /** 沿 Polygon 外环放置的装饰或路径文字。 */
  decoration?: LineDecorationOptions;
}

/** 创建开放路径和 Polygon 闭合边界线饰的公共工厂。 */
export interface LineStyleFactories {
  /**
   * 创建直线、折线或曲线使用的开放路径线饰。
   *
   * @param options - 选择轨道及宽度、衬色、统一颜色、端帽、装饰或路径文本。
   * @returns 可直接传给 `elements.add()` 或 Draw 的独立 `StyleSpec`。
   * @example
   * ```ts
   * const style = lineStyles.polyline({
   *   tracks: { mode: 'double', patterns: ['solid', 'dashed'], width: 3 },
   *   casing: { color: '#ffff00', type: 'center', width: 2 },
   *   decoration: 'tick'
   * });
   * ```
   */
  polyline(options?: PolylineLineStyleOptions): StyleSpec;

  /**
   * 创建只作用于 Polygon 外环的闭合边界线饰。
   *
   * @param options - 选择边界轨道及宽度、衬色、统一颜色、装饰或路径文本。
   * @returns 可与现有 `fill` 组合的独立 `StyleSpec`。
   * @example
   * ```ts
   * const style = {
   *   ...lineStyles.polygon({
   *     tracks: { mode: 'double', patterns: ['solid', 'dashed'], width: 3 },
   *     casing: { color: '#ffff00', type: 'outer', width: 2 },
   *     decoration: 'tick'
   *   }),
   *   fill: { type: 'solid', color: [255, 0, 0, 0.1] }
   * };
   * ```
   */
  polygon(options?: PolygonLineStyleOptions): StyleSpec;
}

type LineFactoryKind = 'polyline' | 'polygon';
type NormalizedLines = [] | [LinePattern] | [LinePattern, LinePattern];

interface NormalizedLineOptions {
  readonly color: Color;
  readonly lines: NormalizedLines;
  readonly trackWidth: number;
  readonly casing?: PathCasingSpec;
  readonly caps?: LineCapsOptions;
  readonly decoration: TrackedLineDecorationType | DecorationOnlyLineType | InlineTextLineDecorationType;
  readonly repeatSpacingPx?: number;
  readonly inlineText?: InlinePathTextSpec;
}

interface NormalizedTrackOptions {
  readonly lines: NormalizedLines;
  readonly width: number;
}

interface NormalizedDecorationOptions {
  readonly decoration: NormalizedLineOptions['decoration'];
  readonly repeatSpacingPx?: number;
  readonly inlineText?: InlinePathTextSpec;
}

const defaultLineColor = '#ff0000';
const defaultTextColor = '#000000';
const defaultOutlineColor = '#ffffff';
const dashedPattern = [8, 6] as const;
const defaultTrackWidth = 2;
const doubleTrackGap = 4;
const optionFields = new Set(['color', 'tracks', 'casing', 'caps', 'decoration']);
const trackFields = new Set(['mode', 'pattern', 'patterns', 'width']);
const casingFields = new Set(['color', 'type', 'width']);
const decorationFields = new Set(['type', 'text', 'style', 'repeatSpacingPx']);
const capFields = new Set(['start', 'end']);
const textStyleFields = new Set(['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'outline', 'background']);
const outlineFields = new Set(['color', 'width']);
const backgroundFields = new Set(['color', 'paddingPx']);
const linePatterns: readonly LinePattern[] = ['solid', 'dashed'];
const capTypes: readonly LineCapType[] = ['none', 'bar', 'arrow'];
const casingTypes: readonly LineCasingType[] = ['inner', 'outer', 'center'];
const trackedDecorationTypes: readonly TrackedLineDecorationType[] = [
  'none',
  'tick',
  'alternating-tick',
  'double-tick',
  'square',
  'circle',
  'center-cross',
  'center-dot',
  'center-dot-pair'
];
const centeredDecorationTypes = ['center-cross', 'center-dot', 'center-dot-pair'] as const;

/** 两个工厂共享同一个纯数据展开内核，不保存调用方对象或运行时回调。 */
export const lineStyles: Readonly<LineStyleFactories> = Object.freeze({
  polyline(options?: PolylineLineStyleOptions): StyleSpec {
    return createLineStyle('polyline', options);
  },
  polygon(options?: PolygonLineStyleOptions): StyleSpec {
    return createLineStyle('polygon', options);
  }
});

/** 归一化判别参数并展开成完整 StyleSpec。 */
function createLineStyle(kind: LineFactoryKind, options: PolylineLineStyleOptions | PolygonLineStyleOptions | undefined): StyleSpec {
  const normalized = normalizeOptions(kind, options);
  const contour: LineworkSpec['contour'] = kind === 'polyline' ? { kind: 'open' } : { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' };
  const linework: LineworkSpec = {
    tracks: createTracks(normalized.lines, normalized.color, normalized.trackWidth),
    ...(normalized.casing === undefined ? {} : { casing: normalized.casing }),
    ...(normalized.caps === undefined ? {} : { caps: createCaps(normalized.caps, normalized.color, normalized.trackWidth) }),
    ...(normalized.decoration === 'none' || normalized.decoration === 'inline-text'
      ? {}
      : { decorations: [createDecoration(normalized.decoration, normalized.color, normalized.repeatSpacingPx, normalized.lines, normalized.trackWidth)] }),
    ...(normalized.inlineText === undefined ? {} : { inlineText: normalized.inlineText }),
    contour
  };
  const style: StyleSpec = { linework };
  assertStructuredStyleSpec(style);
  return style;
}

/** 复制并严格校验工厂输入，避免接受未知字段或非法判别组合。 */
function normalizeOptions(kind: LineFactoryKind, options: PolylineLineStyleOptions | PolygonLineStyleOptions | undefined): NormalizedLineOptions {
  const input = options === undefined ? {} : cloneCoreState(options);
  const record = plainRecord(input, `${kind} line style options`);
  assertKnownFields(record, optionFields, `${kind} line style options`);

  const tracks = normalizeTracks(record.tracks);
  const hasCaps = hasOwn(record, 'caps');
  if (kind === 'polygon' && hasCaps) throw new InvalidArgumentError('Polygon line styles cannot contain caps');
  if (tracks.lines.length !== 1 && hasCaps) throw new InvalidArgumentError('Only single-track polyline styles can contain caps');

  const decoration = normalizeDecoration(record.decoration, tracks.lines);
  const casing = normalizeCasing(record.casing, tracks.lines);

  const color = normalizeColor(record.color === undefined ? defaultLineColor : record.color, 'Line style color');
  const caps = tracks.lines.length === 1 && record.caps !== undefined ? normalizeCaps(record.caps) : undefined;
  return {
    color,
    lines: tracks.lines,
    trackWidth: tracks.width,
    decoration: decoration.decoration,
    ...(casing === undefined ? {} : { casing }),
    ...(caps === undefined ? {} : { caps }),
    ...(decoration.repeatSpacingPx === undefined ? {} : { repeatSpacingPx: decoration.repeatSpacingPx }),
    ...(decoration.inlineText === undefined ? {} : { inlineText: decoration.inlineText })
  };
}

/** 把正交轨道输入转换成固定数量的 pattern 与统一宽度。 */
function normalizeTracks(value: unknown): NormalizedTrackOptions {
  const tracks = value === undefined ? {} : plainRecord(value, 'Line tracks options');
  assertKnownFields(tracks, trackFields, 'Line tracks options');
  const mode = tracks.mode === undefined ? 'single' : tracks.mode;

  if (mode === 'single') {
    if (hasOwn(tracks, 'patterns')) throw new InvalidArgumentError('Single-track line styles cannot contain patterns');
    return {
      lines: [normalizeLinePattern(tracks.pattern, 'Single-track pattern')],
      width: normalizePositiveFinite(tracks.width, defaultTrackWidth, 'Line track width')
    };
  }
  if (mode === 'double') {
    if (hasOwn(tracks, 'pattern')) throw new InvalidArgumentError('Double-track line styles cannot contain pattern');
    const patterns = normalizeDoublePatterns(tracks.patterns);
    return { lines: patterns, width: normalizePositiveFinite(tracks.width, defaultTrackWidth, 'Line track width') };
  }
  if (mode === 'none') {
    if (hasOwn(tracks, 'pattern') || hasOwn(tracks, 'patterns') || hasOwn(tracks, 'width')) {
      throw new InvalidArgumentError('Decoration-only line styles cannot configure track patterns or width');
    }
    return { lines: [], width: defaultTrackWidth };
  }
  throw new InvalidArgumentError('Line tracks mode must be single, double, or none');
}

/** 校验单条轨道的 pattern。 */
function normalizeLinePattern(value: unknown, label: string): LinePattern {
  if (value === undefined) return 'solid';
  if (typeof value === 'string' && linePatterns.includes(value as LinePattern)) return value as LinePattern;
  throw new InvalidArgumentError(`${label} must be solid or dashed`);
}

/** 校验双轨恰好包含两个 pattern。 */
function normalizeDoublePatterns(value: unknown): [LinePattern, LinePattern] {
  if (value === undefined) return ['solid', 'solid'];
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    hasOwn(value, '0') &&
    hasOwn(value, '1') &&
    value.every((entry): entry is LinePattern => typeof entry === 'string' && linePatterns.includes(entry as LinePattern))
  ) {
    return [value[0], value[1]];
  }
  throw new InvalidArgumentError('Double-track patterns must contain exactly two line patterns');
}

/** 校验装饰的局部参数及其与轨道模式的组合。 */
function normalizeDecoration(value: unknown, lines: NormalizedLines): NormalizedDecorationOptions {
  if (value === undefined || typeof value === 'string') {
    const decoration = value === undefined ? 'none' : value;
    if (decoration === 'inline-text') throw new InvalidArgumentError('Inline-text line decoration must use an object with text');
    if (decoration !== 'slash' && !trackedDecorationTypes.includes(decoration as TrackedLineDecorationType)) {
      throw new InvalidArgumentError('Line style decoration is invalid');
    }
    assertDecorationTrackCompatibility(decoration as TrackedLineDecorationType | DecorationOnlyLineType, lines);
    return { decoration: decoration as TrackedLineDecorationType | DecorationOnlyLineType };
  }

  const decoration = plainRecord(value, 'Line decoration options');
  assertKnownFields(decoration, decorationFields, 'Line decoration options');
  if (!hasOwn(decoration, 'type')) throw new InvalidArgumentError('Line decoration options require type');
  const type = decoration.type;
  if (typeof type !== 'string') throw new InvalidArgumentError('Line decoration type is invalid');

  if (centeredDecorationTypes.includes(type as (typeof centeredDecorationTypes)[number])) {
    if (hasOwn(decoration, 'text') || hasOwn(decoration, 'style')) {
      throw new InvalidArgumentError('Center line decorations cannot contain text or style');
    }
    const repeatSpacingPx = normalizeRepeatSpacing(decoration.repeatSpacingPx);
    assertDecorationTrackCompatibility(type as (typeof centeredDecorationTypes)[number], lines);
    return {
      decoration: type as (typeof centeredDecorationTypes)[number],
      ...(repeatSpacingPx === undefined ? {} : { repeatSpacingPx })
    };
  }

  if (type === 'inline-text') {
    if (!hasOwn(decoration, 'text') || typeof decoration.text !== 'string' || decoration.text.trim().length === 0) {
      throw new InvalidArgumentError('Inline-text line styles require non-blank text');
    }
    const repeatSpacingPx = normalizeRepeatSpacing(decoration.repeatSpacingPx);
    assertDecorationTrackCompatibility(type, lines);
    return {
      decoration: type,
      ...(repeatSpacingPx === undefined ? {} : { repeatSpacingPx }),
      inlineText: normalizeInlineText(decoration.text, decoration.style, repeatSpacingPx)
    };
  }

  throw new InvalidArgumentError('Line decoration objects require a center decoration or inline-text');
}

/** 拒绝纯装饰与前景轨道的交叉非法组合。 */
function assertDecorationTrackCompatibility(decoration: NormalizedLineOptions['decoration'], lines: NormalizedLines): void {
  if (lines.length === 0 && decoration !== 'slash') throw new InvalidArgumentError('Decoration-only line styles require slash');
  if (lines.length > 0 && decoration === 'slash') throw new InvalidArgumentError('Tracked line styles cannot use slash');
}

/** 只让中心 glyph 与路径文字配置固定像素重复间距。 */
function normalizeRepeatSpacing(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return normalizePositiveFinite(value, undefined, 'Line style repeatSpacingPx');
}

/** 校验并展开完整轨道视觉包络使用的衬色。 */
function normalizeCasing(value: unknown, lines: NormalizedLines): PathCasingSpec | undefined {
  if (value === undefined) return undefined;
  if (lines.length === 0) throw new InvalidArgumentError('Decoration-only line styles cannot contain casing');
  const casing = plainRecord(value, 'Line casing options');
  assertKnownFields(casing, casingFields, 'Line casing options');
  if (!hasOwn(casing, 'color') || casing.color === undefined) throw new InvalidArgumentError('Line casing options require color');
  const type = casing.type === undefined ? 'center' : casing.type;
  if (typeof type !== 'string' || !casingTypes.includes(type as LineCasingType)) throw new InvalidArgumentError('Line casing type is invalid');
  return {
    color: copyColor(normalizeColor(casing.color, 'Line casing color')),
    type: type as LineCasingType,
    width: normalizePositiveFinite(casing.width, 2, 'Line casing width')
  };
}

/** 校验并展开单轨端帽默认值。 */
function normalizeCaps(value: unknown): LineCapsOptions | undefined {
  const caps = plainRecord(value, 'Line caps options');
  assertKnownFields(caps, capFields, 'Line caps options');
  const start = normalizeCap(caps.start, 'start');
  const end = normalizeCap(caps.end, 'end');
  return start === 'none' && end === 'none' ? undefined : { ...(start === 'none' ? {} : { start }), ...(end === 'none' ? {} : { end }) };
}

/** 校验一个端帽枚举值。 */
function normalizeCap(value: unknown, endpoint: string): LineCapType {
  if (value === undefined) return 'none';
  if (typeof value === 'string' && capTypes.includes(value as LineCapType)) return value as LineCapType;
  throw new InvalidArgumentError(`Line ${endpoint} cap is invalid`);
}

/** 展开路径文本的外观与可选重复放置参数。 */
function normalizeInlineText(text: string, value: unknown, repeatSpacingPx: number | undefined): InlinePathTextSpec {
  const style = value === undefined ? {} : plainRecord(value, 'Inline line text style');
  assertKnownFields(style, textStyleFields, 'Inline line text style');
  const outline = style.outline === undefined ? undefined : plainRecord(style.outline, 'Inline line text outline');
  if (outline !== undefined) assertKnownFields(outline, outlineFields, 'Inline line text outline');
  const background = style.background === undefined ? undefined : plainRecord(style.background, 'Inline line text background');
  if (background !== undefined) {
    assertKnownFields(background, backgroundFields, 'Inline line text background');
    if (!hasOwn(background, 'color') || background.color === undefined) {
      throw new InvalidArgumentError('Inline line text background requires color');
    }
  }

  const normalized: InlinePathTextSpec = {
    text,
    ...(repeatSpacingPx === undefined ? {} : { placement: { kind: 'repeat' as const, spacing: repeatSpacingPx, phase: 0 } }),
    fontFamily: style.fontFamily === undefined ? 'sans-serif' : (style.fontFamily as string),
    fontSize: style.fontSize === undefined ? 12 : (style.fontSize as number),
    fontWeight: style.fontWeight === undefined ? 'normal' : (style.fontWeight as InlinePathTextSpec['fontWeight']),
    fontStyle: style.fontStyle === undefined ? 'normal' : (style.fontStyle as InlinePathTextSpec['fontStyle']),
    fill: { type: 'solid', color: copyColor(normalizeColor(style.color === undefined ? defaultTextColor : style.color, 'Inline line text color')) },
    ...(outline === undefined
      ? {}
      : {
          stroke: {
            color: copyColor(normalizeColor(outline.color === undefined ? defaultOutlineColor : outline.color, 'Inline line text outline color')),
            width: outline.width === undefined ? 2 : (outline.width as number)
          }
        }),
    ...(background === undefined
      ? {}
      : {
          backgroundFill: {
            type: 'solid' as const,
            color: copyColor(normalizeColor(background.color, 'Inline line text background color'))
          },
          backgroundPadding: background.paddingPx === undefined ? 2 : (background.paddingPx as number)
        }),
    gapPadding: 6
  };
  assertStructuredStyleSpec({ linework: { tracks: [{ offset: 0, stroke: { color: defaultLineColor, width: 2 } }], inlineText: normalized } });
  return normalized;
}

/** 按统一宽度、固定双轨净间隙和虚线节奏创建前景轨道。 */
function createTracks(lines: NormalizedLines, color: Color, width: number): PathTrackSpec[] {
  if (lines.length === 0) return [];
  const doubleOffset = (width + doubleTrackGap) / 2;
  const offsets = lines.length === 1 ? [0] : [-doubleOffset, doubleOffset];
  return lines.map((pattern, index) => ({
    offset: offsets[index] ?? 0,
    stroke: {
      color: copyColor(color),
      width,
      ...(pattern === 'dashed' ? { lineDash: [...dashedPattern], lineDashOffset: 0 } : {})
    }
  }));
}

/** 把端帽枚举展开成随单轨宽度保持清晰肩部的局部矢量 glyph。 */
function createCaps(options: LineCapsOptions, color: Color, trackWidth: number): NonNullable<LineworkSpec['caps']> {
  const start = options.start === undefined ? undefined : createCap(options.start, color, trackWidth);
  const end = options.end === undefined ? undefined : createCap(options.end, color, trackWidth);
  return { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
}

/** 创建一个端帽；none 不产生派生渲染资源。 */
function createCap(type: LineCapType, color: Color, trackWidth: number): PathCapSpec | undefined {
  if (type === 'none') return undefined;
  const growth = Math.max(0, trackWidth / 2 - defaultTrackWidth / 2);
  if (type === 'bar') {
    const halfLength = 7 + growth;
    return { glyph: glyph([segment([0, -halfLength], [0, halfLength], color, 2)]) };
  }
  const depth = 11 + growth;
  const baseHalfWidth = 6 + growth;
  return {
    glyph: glyph([
      {
        type: 'polygon',
        points: [
          [0, 0],
          [-depth, -baseHalfWidth],
          [-depth, baseHalfWidth]
        ],
        fill: { type: 'solid', color: copyColor(color) }
      }
    ])
  };
}

/** 把装饰枚举展开成固定间距、并按前景轨道包络派生尺寸的矢量定义。 */
function createDecoration(
  type: Exclude<NormalizedLineOptions['decoration'], 'none' | 'inline-text'>,
  color: Color,
  repeatSpacingPx: number | undefined,
  lines: NormalizedLines,
  trackWidth: number
): PathDecorationSpec {
  if (type === 'slash') return repeatDecoration(12, [glyph([segment([-3, 6], [3, -6], color, 2)])]);
  const envelopeGrowth = decorationEnvelopeGrowth(lines, trackWidth);
  const tickRadius = 7 + envelopeGrowth;
  const tickScale = tickRadius / 7;
  if (type === 'tick') return repeatDecoration(32, [glyph([segment([0, -tickRadius], [0, tickRadius], color, 1.5)])]);
  if (type === 'alternating-tick') {
    return repeatDecoration(22, [glyph([segment([0, 0], [0, -tickRadius], color, 1.5)]), glyph([segment([0, 0], [0, tickRadius], color, 1.5)])]);
  }
  if (type === 'double-tick') {
    return repeatDecoration(32, [
      glyph([
        {
          type: 'group',
          primitives: [
            segment([-2 * tickScale, -tickRadius], [-2 * tickScale, 0], color, 1.5),
            segment([2 * tickScale, -tickRadius], [2 * tickScale, 0], color, 1.5)
          ]
        }
      ])
    ]);
  }
  if (type === 'square') {
    const halfSize = 4 + envelopeGrowth;
    return repeatDecoration(32, [
      glyph([
        {
          type: 'polygon',
          points: [
            [-halfSize, -halfSize],
            [halfSize, -halfSize],
            [halfSize, halfSize],
            [-halfSize, halfSize]
          ],
          fill: { type: 'solid', color: copyColor(color) }
        }
      ])
    ]);
  }
  if (type === 'circle') return repeatDecoration(32, [glyph([circle([0, 0], 4 + envelopeGrowth, color)])]);
  const centered =
    type === 'center-cross'
      ? { glyph: glyph([segment([-4, -4], [4, 4], color, 1.5), segment([-4, 4], [4, -4], color, 1.5)]), cutoutPadding: 4 }
      : type === 'center-dot'
        ? { glyph: glyph([circle([0, 0], 2, color)]), cutoutPadding: 3 }
        : { glyph: glyph([circle([-4, 0], 2, color), circle([4, 0], 2, color)]), cutoutPadding: 3 };
  return repeatSpacingPx === undefined
    ? centerDecoration(centered.glyph, centered.cutoutPadding)
    : repeatDecoration(repeatSpacingPx, [centered.glyph], centered.cutoutPadding);
}

/** 保留默认 2px 轨道下的装饰外露量，窄轨不反向缩小内置 glyph。 */
function decorationEnvelopeGrowth(lines: NormalizedLines, trackWidth: number): number {
  if (lines.length === 0) return 0;
  const baseline = lines.length === 1 ? defaultTrackWidth / 2 : defaultTrackWidth + doubleTrackGap / 2;
  const actual = lines.length === 1 ? trackWidth / 2 : trackWidth + doubleTrackGap / 2;
  return Math.max(0, actual - baseline);
}

/** 创建重复装饰结构。 */
function repeatDecoration(spacing: number, sequence: PathGlyphSpec[], cutoutPadding?: number): PathDecorationSpec {
  return { placement: { kind: 'repeat', spacing, phase: 0 }, sequence, ...(cutoutPadding === undefined ? {} : { cutoutPadding }) };
}

/** 创建会在中心 glyph 两侧切出留白的装饰结构。 */
function centerDecoration(glyphValue: PathGlyphSpec, cutoutPadding: number): PathDecorationSpec {
  return { placement: { kind: 'center' }, glyph: glyphValue, cutoutPadding };
}

/** 创建独立 glyph。 */
function glyph(primitives: PathGlyphPrimitiveSpec[]): PathGlyphSpec {
  return { primitives };
}

/** 创建不可虚线的局部线段原语。 */
function segment(from: [number, number], to: [number, number], color: Color, width: number): PathGlyphPrimitiveSpec {
  return { type: 'segment', from, to, stroke: { color: copyColor(color), width } };
}

/** 创建纯色圆形原语。 */
function circle(center: [number, number], radius: number, color: Color): PathGlyphPrimitiveSpec {
  return { type: 'circle', center, radius, fill: { type: 'solid', color: copyColor(color) } };
}

/** 复制可变颜色元组，避免输入或不同 paint 共享引用。 */
function copyColor(color: Color): Color {
  return typeof color === 'string' ? color : ([...color] as Color);
}

/** 校验工厂公开颜色参数，并保留既有 Color 数值元组语义。 */
function normalizeColor(value: unknown, label: string): Color {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (
    Array.isArray(value) &&
    (value.length === 3 || value.length === 4) &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    return [...value] as Color;
  }
  throw new InvalidArgumentError(`${label} must be a color string or numeric tuple`);
}

/** 读取带可选默认值的正有限 CSS 像素数。 */
function normalizePositiveFinite(value: unknown, fallback: number | undefined, label: string): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive finite CSS pixel distance`);
  }
  return resolved;
}

/** 收窄严格普通对象。 */
function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

/** 拒绝工厂参数中的未知字段。 */
function assertKnownFields(value: Record<string, unknown>, fields: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

/** 判断记录是否显式包含字段。 */
function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
