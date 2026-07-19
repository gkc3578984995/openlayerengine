import { cloneCoreState } from '../../core/common/clone.js';
import type { Color } from '../../core/common/types.js';
import { InvalidArgumentError } from '../../core/errors.js';
import type {
  InlinePathTextSpec,
  LineworkSpec,
  PathCapSpec,
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

/** 选择严格位于路径累计长度中点的文本占位。 */
export type InlineTextLineDecorationType = 'inline-text';

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

/** `lineStyles.polyline()` 接受的严格判别参数。 */
export type PolylineLineStyleOptions =
  | ((
      | {
          /** 线段、端帽和装饰物共用的颜色，默认红色。 */
          color?: Color;
          /** 省略时绘制单轨实线。 */
          lines?: LinePattern;
          /** 单轨路径可以分别设置两端端帽。 */
          caps?: LineCapsOptions;
        }
      | {
          /** 线段和装饰物共用的颜色，默认红色。 */
          color?: Color;
          /** 两条轨道分别选择实线或虚线。 */
          lines: readonly [LinePattern, LinePattern];
          /** 双轨路径不允许端帽。 */
          caps?: never;
        }
    ) &
      (
        | {
            /** 普通固定装饰，默认不绘制。 */
            decoration?: TrackedLineDecorationType;
            /** 普通装饰不能传入文本。 */
            text?: never;
            /** 普通装饰不能传入文本样式。 */
            textStyle?: never;
          }
        | {
            /** 固定选择路径中点文本占位。 */
            decoration: InlineTextLineDecorationType;
            /** 放在路径累计长度中点的非空文本。 */
            text: string;
            /** 文本外观；位置、旋转和轨道切口由引擎固定。 */
            textStyle?: InlineLineTextStyleOptions;
          }
      ))
  | {
      /** 纯装饰路径使用的颜色，默认红色。 */
      color?: Color;
      /** 固定为不绘制轨道。 */
      lines: 'none';
      /** 纯装饰路径不允许端帽。 */
      caps?: never;
      /** 第一版纯装饰路径固定为斜杠。 */
      decoration: DecorationOnlyLineType;
      /** 纯装饰路径不能传入文本。 */
      text?: never;
      /** 纯装饰路径不能传入文本样式。 */
      textStyle?: never;
    };

/** `lineStyles.polygon()` 接受的严格判别参数。 */
export type PolygonLineStyleOptions =
  | ({
      /** 边界轨道和装饰物共用的颜色，默认红色。 */
      color?: Color;
      /** 省略时绘制单轨实线，也可以分别设置两条轨道。 */
      lines?: LinePattern | readonly [LinePattern, LinePattern];
      /** Polygon 闭合边界不允许端帽。 */
      caps?: never;
    } & (
      | {
          /** 普通固定装饰，默认不绘制。 */
          decoration?: TrackedLineDecorationType;
          /** 普通装饰不能传入文本。 */
          text?: never;
          /** 普通装饰不能传入文本样式。 */
          textStyle?: never;
        }
      | {
          /** 固定选择路径中点文本占位。 */
          decoration: InlineTextLineDecorationType;
          /** 放在外环累计周长中点的非空文本。 */
          text: string;
          /** 文本外观；位置、旋转和轨道切口由引擎固定。 */
          textStyle?: InlineLineTextStyleOptions;
        }
    ))
  | {
      /** 纯装饰边界使用的颜色，默认红色。 */
      color?: Color;
      /** 固定为不绘制边界轨道。 */
      lines: 'none';
      /** 第一版纯装饰边界固定为斜杠。 */
      decoration: DecorationOnlyLineType;
      /** Polygon 闭合边界不允许端帽。 */
      caps?: never;
      /** 纯装饰边界不能传入文本。 */
      text?: never;
      /** 纯装饰边界不能传入文本样式。 */
      textStyle?: never;
    };

/** 创建开放路径和 Polygon 闭合边界线饰的公共工厂。 */
export interface LineStyleFactories {
  /**
   * 创建直线、折线或曲线使用的开放路径线饰。
   *
   * @param options - 选择轨道、统一颜色、端帽、装饰或中点文本。
   * @returns 可直接传给 `elements.add()` 或 Draw 的独立 `StyleSpec`。
   * @example
   * ```ts
   * const style = lineStyles.polyline({
   *   lines: 'dashed',
   *   caps: { start: 'bar', end: 'arrow' },
   *   decoration: 'circle'
   * });
   * ```
   */
  polyline(options?: PolylineLineStyleOptions): StyleSpec;

  /**
   * 创建只作用于 Polygon 外环的闭合边界线饰。
   *
   * @param options - 选择边界轨道、统一颜色、装饰或中点文本。
   * @returns 可与现有 `fill` 组合的独立 `StyleSpec`。
   * @example
   * ```ts
   * const style = {
   *   ...lineStyles.polygon({ lines: ['solid', 'dashed'], decoration: 'tick' }),
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
  readonly caps?: LineCapsOptions;
  readonly decoration: TrackedLineDecorationType | DecorationOnlyLineType | InlineTextLineDecorationType;
  readonly inlineText?: InlinePathTextSpec;
}

const defaultLineColor = '#ff0000';
const defaultTextColor = '#000000';
const defaultOutlineColor = '#ffffff';
const dashedPattern = [8, 6] as const;
const optionFields = new Set(['color', 'lines', 'caps', 'decoration', 'text', 'textStyle']);
const capFields = new Set(['start', 'end']);
const textStyleFields = new Set(['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'outline', 'background']);
const outlineFields = new Set(['color', 'width']);
const backgroundFields = new Set(['color', 'paddingPx']);
const linePatterns: readonly LinePattern[] = ['solid', 'dashed'];
const capTypes: readonly LineCapType[] = ['none', 'bar', 'arrow'];
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
    tracks: createTracks(normalized.lines, normalized.color),
    ...(normalized.caps === undefined ? {} : { caps: createCaps(normalized.caps, normalized.color) }),
    ...(normalized.decoration === 'none' || normalized.decoration === 'inline-text'
      ? {}
      : { decorations: [createDecoration(normalized.decoration, normalized.color)] }),
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

  const lines = normalizeLines(record.lines);
  const hasCaps = hasOwn(record, 'caps');
  if (kind === 'polygon' && hasCaps) throw new InvalidArgumentError('Polygon line styles cannot contain caps');
  if (lines.length !== 1 && hasCaps) throw new InvalidArgumentError('Only single-track polyline styles can contain caps');

  const decoration = normalizeDecoration(record.decoration, lines);
  const hasText = hasOwn(record, 'text');
  const hasTextStyle = hasOwn(record, 'textStyle');
  let inlineText: InlinePathTextSpec | undefined;
  if (decoration === 'inline-text') {
    if (!hasText || typeof record.text !== 'string' || record.text.trim().length === 0) {
      throw new InvalidArgumentError('Inline-text line styles require non-blank text');
    }
    inlineText = normalizeInlineText(record.text, record.textStyle);
  } else if (hasText || hasTextStyle) {
    throw new InvalidArgumentError('Only inline-text line styles can contain text or textStyle');
  }

  if (lines.length === 0) {
    if (decoration !== 'slash') throw new InvalidArgumentError('Decoration-only line styles require slash');
    if (hasCaps || hasText || hasTextStyle) throw new InvalidArgumentError('Decoration-only line styles cannot contain caps or text');
  }

  const color = normalizeColor(record.color === undefined ? defaultLineColor : record.color, 'Line style color');
  const caps = lines.length === 1 && record.caps !== undefined ? normalizeCaps(record.caps) : undefined;
  return { color, lines, decoration, ...(caps === undefined ? {} : { caps }), ...(inlineText === undefined ? {} : { inlineText }) };
}

/** 把单轨、双轨和纯装饰判别值转换成稳定元组。 */
function normalizeLines(value: unknown): NormalizedLines {
  if (value === undefined || value === 'solid') return ['solid'];
  if (value === 'dashed') return ['dashed'];
  if (value === 'none') return [];
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry): entry is LinePattern => typeof entry === 'string' && linePatterns.includes(entry as LinePattern))
  ) {
    return [value[0], value[1]];
  }
  throw new InvalidArgumentError('Line style lines must be solid, dashed, none, or a two-pattern tuple');
}

/** 校验装饰类型与轨道分支的组合。 */
function normalizeDecoration(value: unknown, lines: NormalizedLines): NormalizedLineOptions['decoration'] {
  const decoration = value === undefined ? 'none' : value;
  if (lines.length === 0) {
    if (decoration !== 'slash') throw new InvalidArgumentError('Decoration-only line styles require slash');
    return 'slash';
  }
  if (decoration === 'slash') throw new InvalidArgumentError('Tracked line styles cannot use slash');
  if (decoration === 'inline-text') return decoration;
  if (typeof decoration === 'string' && trackedDecorationTypes.includes(decoration as TrackedLineDecorationType)) {
    return decoration as TrackedLineDecorationType;
  }
  throw new InvalidArgumentError('Line style decoration is invalid');
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

/** 展开只允许修改外观的中点文本参数。 */
function normalizeInlineText(text: string, value: unknown): InlinePathTextSpec {
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

/** 按冻结的宽度、偏移和虚线节奏创建轨道。 */
function createTracks(lines: NormalizedLines, color: Color): PathTrackSpec[] {
  if (lines.length === 0) return [];
  const offsets = lines.length === 1 ? [0] : [-3, 3];
  return lines.map((pattern, index) => ({
    offset: offsets[index] ?? 0,
    stroke: {
      color: copyColor(color),
      width: 2,
      ...(pattern === 'dashed' ? { lineDash: [...dashedPattern], lineDashOffset: 0 } : {})
    }
  }));
}

/** 把端帽枚举展开成局部矢量 glyph。 */
function createCaps(options: LineCapsOptions, color: Color): NonNullable<LineworkSpec['caps']> {
  const start = options.start === undefined ? undefined : createCap(options.start, color);
  const end = options.end === undefined ? undefined : createCap(options.end, color);
  return { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
}

/** 创建一个端帽；none 不产生派生渲染资源。 */
function createCap(type: LineCapType, color: Color): PathCapSpec | undefined {
  if (type === 'none') return undefined;
  if (type === 'bar') return { glyph: glyph([segment([0, -7], [0, 7], color, 2)]) };
  return {
    glyph: glyph([
      {
        type: 'polygon',
        points: [
          [0, 0],
          [-11, -6],
          [-11, 6]
        ],
        fill: { type: 'solid', color: copyColor(color) }
      }
    ])
  };
}

/** 把装饰枚举展开成固定尺寸和固定间距的矢量定义。 */
function createDecoration(type: Exclude<NormalizedLineOptions['decoration'], 'none' | 'inline-text'>, color: Color): PathDecorationSpec {
  if (type === 'slash') return repeatDecoration(12, [glyph([segment([-3, 6], [3, -6], color, 2)])]);
  if (type === 'tick') return repeatDecoration(32, [glyph([segment([0, -7], [0, 7], color, 1.5)])]);
  if (type === 'alternating-tick') {
    return repeatDecoration(22, [glyph([segment([0, 0], [0, -7], color, 1.5)]), glyph([segment([0, 0], [0, 7], color, 1.5)])]);
  }
  if (type === 'double-tick') {
    return repeatDecoration(32, [
      glyph([
        {
          type: 'group',
          primitives: [segment([-2, -7], [-2, 0], color, 1.5), segment([2, -7], [2, 0], color, 1.5)]
        }
      ])
    ]);
  }
  if (type === 'square') {
    return repeatDecoration(32, [
      glyph([
        {
          type: 'polygon',
          points: [
            [-4, -4],
            [4, -4],
            [4, 4],
            [-4, 4]
          ],
          fill: { type: 'solid', color: copyColor(color) }
        }
      ])
    ]);
  }
  if (type === 'circle') return repeatDecoration(32, [glyph([circle([0, 0], 4, color)])]);
  if (type === 'center-cross') {
    return centerDecoration(glyph([segment([-4, -4], [4, 4], color, 1.5), segment([-4, 4], [4, -4], color, 1.5)]), 4);
  }
  if (type === 'center-dot') return centerDecoration(glyph([circle([0, 0], 2, color)]), 3);
  return centerDecoration(glyph([circle([-4, 0], 2, color), circle([4, 0], 2, color)]), 3);
}

/** 创建重复装饰结构。 */
function repeatDecoration(spacing: number, sequence: PathGlyphSpec[]): PathDecorationSpec {
  return { placement: { kind: 'repeat', spacing, phase: 0 }, sequence };
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
