import type { Coordinate, Pixel } from '../../core/common/types.js';
import { InvalidArgumentError, UnsupportedOperationError } from '../../core/errors.js';
import type {
  ControlPointHandle,
  ControlPointTopology,
  RenderGeometryState,
  ShapeCapability,
  ShapeDefinition,
  ShapePresentationContext,
  ShapePresentationResult,
  ShapeState
} from '../../core/shape/types.js';
import { isNativeStyleRef, type ElementStyleState, type StyleSpec, type TextSpec } from '../../core/style/types.js';
import { cloneCoordinate, getOwnDataValue, getPlainDataRecord, immutableSet, normalizeCoordinate, normalizeCoordinateArray } from './definition.js';

const defaultMaxTextWidth = 240;
const defaultPadding = Object.freeze([8, 12, 8, 12] as const);
const minimumFrameWidth = 40;
const tailHalfBase = 10;

type CalloutState = ShapeState<'callout'>;
type FrameBounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;

interface TextLayout {
  readonly font: string;
  readonly lineHeight: number;
  readonly padding: readonly [number, number, number, number];
  readonly inset: number;
  readonly minimumWidth: number;
  readonly width: number;
  readonly height: number;
  readonly wrappedText: string;
}

/** 内置文本标注框；尺寸保持为 CSS 像素，最终 Polygon 由 presentation profile 派生。 */
export const calloutDefinition: ShapeDefinition<CalloutState> = Object.freeze({
  type: 'callout',
  capabilities: immutableSet<ShapeCapability>(['draw', 'edit', 'translate']),
  controlPointPolicy: Object.freeze({ previewMin: 2, completeMin: 2, completeMax: 2, autoFinish: 2 }),
  presentation: Object.freeze({
    viewDependent: true,
    validateStyle: (style: ElementStyleState) => {
      requireCalloutText(style);
    },
    present: presentCallout,
    edit: Object.freeze({ describe: describeCallout, move: moveCalloutHandle })
  }),
  createDraft: (controlPoints: readonly Coordinate[]) => {
    const points = normalizeCoordinateArray(controlPoints, 'callout control points');
    if (points.length < 2) return undefined;
    if (points.length > 2) throw new InvalidArgumentError('Callout accepts exactly two draw points');
    requireUniformDimension(points[0], points[1]);
    return freezeCallout(points[0], points[1], 0, 0);
  },
  normalize: normalizeCallout,
  clone: normalizeCallout,
  translate: (state: CalloutState, x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InvalidArgumentError('Callout translation must use finite offsets');
    const normalized = normalizeCallout(state);
    return freezeCallout(translateCoordinate(normalized.anchor, x, y), translateCoordinate(normalized.center, x, y), normalized.size[0], normalized.size[1]);
  },
  isComplete: (state: CalloutState) => {
    normalizeCallout(state);
    return true;
  },
  tryComplete: (state: CalloutState) => ({ status: 'complete' as const, state: normalizeCallout(state) }),
  toRenderGeometry: (state: CalloutState) => {
    const normalized = normalizeCallout(state);
    return Object.freeze({
      type: 'polyline',
      coordinates: Object.freeze([Object.freeze(cloneCoordinate(normalized.anchor)), Object.freeze(cloneCoordinate(normalized.center))])
    });
  }
});

function normalizeCallout(input: unknown): CalloutState {
  const record = getPlainDataRecord(input, 'Callout state');
  if (getOwnDataValue(record, 'type', 'Callout type') !== 'callout') throw new InvalidArgumentError('Expected shape type callout');
  const allowed = new Set(['type', 'anchor', 'center', 'size']);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown Callout field: ${String(key)}`);
  }
  const anchor = normalizeCoordinate(getOwnDataValue(record, 'anchor', 'Callout anchor'), 'Callout anchor');
  const center = normalizeCoordinate(getOwnDataValue(record, 'center', 'Callout center'), 'Callout center');
  requireUniformDimension(anchor, center);
  const size = getOwnDataValue(record, 'size', 'Callout size');
  if (!Array.isArray(size) || size.length !== 2 || !Object.prototype.hasOwnProperty.call(size, 0) || !Object.prototype.hasOwnProperty.call(size, 1)) {
    throw new InvalidArgumentError('Callout size must contain width and height');
  }
  const width = size[0];
  const height = size[1];
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
    throw new InvalidArgumentError('Callout size must contain two non-negative finite CSS pixel values');
  }
  if ((width === 0) !== (height === 0)) {
    throw new InvalidArgumentError('Callout size must be either [0, 0] for automatic layout or two positive CSS pixel values');
  }
  return freezeCallout(anchor, center, width, height);
}

function presentCallout(input: CalloutState, style: ElementStyleState, context: ShapePresentationContext): ShapePresentationResult<CalloutState> {
  const state = normalizeCallout(input);
  const text = requireCalloutText(style);
  const layout = layoutText(state.size[0], state.size[1], style as StyleSpec, text, context);
  const laidOut = freezeCallout(state.anchor, state.center, layout.width, layout.height);
  const centerPixel = context.toPixel(laidOut.center);
  const anchorPixel = context.toPixel(laidOut.anchor);
  const bounds = frameBounds(centerPixel, layout.width, layout.height);
  const ringPixels = calloutRing(bounds, anchorPixel);
  const ring = Object.freeze(ringPixels.map((pixel) => Object.freeze(context.toCoordinate(pixel, laidOut.center))));
  const selectionRing = Object.freeze(closePixels(rectanglePixels(bounds)).map((pixel) => Object.freeze(context.toCoordinate(pixel, laidOut.center))));
  const geometry: RenderGeometryState = Object.freeze({
    type: 'polygon',
    coordinates: Object.freeze([ring]),
    label: Object.freeze({ coordinate: Object.freeze(cloneCoordinate(laidOut.center)), text: layout.wrappedText })
  });
  const selectionGeometry: RenderGeometryState = Object.freeze({
    type: 'polygon',
    coordinates: Object.freeze([selectionRing])
  });
  return Object.freeze({ state: laidOut, geometry, selectionGeometry });
}

function describeCallout(input: CalloutState, style: ElementStyleState, context: ShapePresentationContext): ControlPointTopology {
  const presented = presentCallout(input, style, context);
  const state = presented.state;
  const center = context.toPixel(state.center);
  const bounds = frameBounds(center, state.size[0], state.size[1]);
  const handles: ControlPointHandle[] = [
    handle(0, state.anchor, 'anchor'),
    handle(1, context.toCoordinate([bounds.left, bounds.top], state.center), 'resize-nw'),
    handle(2, context.toCoordinate([(bounds.left + bounds.right) / 2, bounds.top], state.center), 'resize-n'),
    handle(3, context.toCoordinate([bounds.right, bounds.top], state.center), 'resize-ne'),
    handle(4, context.toCoordinate([bounds.right, (bounds.top + bounds.bottom) / 2], state.center), 'resize-e'),
    handle(5, context.toCoordinate([bounds.right, bounds.bottom], state.center), 'resize-se'),
    handle(6, context.toCoordinate([(bounds.left + bounds.right) / 2, bounds.bottom], state.center), 'resize-s'),
    handle(7, context.toCoordinate([bounds.left, bounds.bottom], state.center), 'resize-sw'),
    handle(8, context.toCoordinate([bounds.left, (bounds.top + bounds.bottom) / 2], state.center), 'resize-w')
  ];
  return Object.freeze({ handles: Object.freeze(handles), insertions: Object.freeze([]) });
}

function moveCalloutHandle(
  input: CalloutState,
  index: number,
  coordinate: Coordinate,
  style: ElementStyleState,
  context: ShapePresentationContext
): CalloutState {
  const pointer = normalizeCoordinate(coordinate, 'Callout edit coordinate');
  const presented = presentCallout(input, style, context).state;
  if (!Number.isSafeInteger(index) || index < 0 || index > 8) throw new InvalidArgumentError(`Callout control-point index is out of range: ${index}`);
  const replacement = matchPointerDimension(pointer, index === 0 ? presented.anchor : presented.center);
  if (index === 0) return freezeCallout(replacement, presented.center, presented.size[0], presented.size[1]);

  const centerPixel = context.toPixel(presented.center);
  const pointerPixel = context.toPixel(replacement);
  const current = frameBounds(centerPixel, presented.size[0], presented.size[1]);
  const movesWest = index === 1 || index === 7 || index === 8;
  const movesEast = index === 3 || index === 4 || index === 5;
  const movesNorth = index === 1 || index === 2 || index === 3;
  const movesSouth = index === 5 || index === 6 || index === 7;

  let left = current.left;
  let right = current.right;
  let top = current.top;
  let bottom = current.bottom;
  const currentLayout = layoutText(presented.size[0], 0, style as StyleSpec, requireCalloutText(style), context);
  const minimumWidth = currentLayout.minimumWidth;
  if (movesWest) left = Math.min(pointerPixel[0], right - minimumWidth);
  if (movesEast) right = Math.max(pointerPixel[0], left + minimumWidth);
  const width = right - left;
  const required = layoutText(width, 0, style as StyleSpec, requireCalloutText(style), context);
  const minimumHeight = required.height;
  if (!movesNorth && !movesSouth) {
    const middle = (top + bottom) / 2;
    top = middle - minimumHeight / 2;
    bottom = middle + minimumHeight / 2;
  } else if (movesNorth) top = Math.min(pointerPixel[1], bottom - minimumHeight);
  else bottom = Math.max(pointerPixel[1], top + minimumHeight);

  const nextCenterPixel: Pixel = [(left + right) / 2, (top + bottom) / 2];
  const next = freezeCallout(presented.anchor, context.toCoordinate(nextCenterPixel, presented.center), right - left, bottom - top);
  return presentCallout(next, style, context).state;
}

function layoutText(requestedWidth: number, requestedHeight: number, style: StyleSpec, text: TextSpec, context: ShapePresentationContext): TextLayout {
  const font = composeFont(text);
  const fontSize = fontPixelSize(text, font);
  const measuredHeight = context.measureTextHeight(font);
  const lineHeight = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : Math.max(1, fontSize * 1.2);
  const padding = normalizePadding(text.padding);
  const frameInset = Math.max(
    0,
    ...(style.strokes ?? []).map((stroke) => {
      const width = stroke.width ?? 1;
      return Number.isFinite(width) ? width / 2 : 0;
    })
  );
  const textStrokeWidth = text.stroke === undefined ? 0 : (text.stroke.width ?? 1);
  const inset = frameInset + (Number.isFinite(textStrokeWidth) ? Math.max(0, textStrokeWidth / 2) : 0);
  const measure = (value: string): number => safeTextWidth(context.measureTextWidth(font, value), value, fontSize);
  const graphemes = splitGraphemes(text.text.replaceAll('\r\n', '\n'));
  const widestGrapheme = graphemes.reduce((width, grapheme) => Math.max(width, measure(grapheme)), fontSize);
  const horizontal = padding[1] + padding[3] + inset * 2;
  const vertical = padding[0] + padding[2] + inset * 2;
  const minimumWidth = Math.max(minimumFrameWidth, widestGrapheme + horizontal);
  let width = requestedWidth;
  if (!(width > 0)) {
    const natural = Math.max(...text.text.replaceAll('\r\n', '\n').split('\n').map(measure), widestGrapheme);
    const maxContentWidth = text.maxWidth ?? defaultMaxTextWidth;
    width = Math.max(minimumWidth, Math.min(maxContentWidth, natural) + horizontal);
  }
  width = Math.max(minimumWidth, width);
  const available = Math.max(widestGrapheme, width - horizontal);
  const lines = wrapText(text.text, available, measure);
  const requiredHeight = Math.max(lineHeight, lines.length * lineHeight) + vertical;
  const height = Math.max(requestedHeight, requiredHeight);
  return Object.freeze({
    font,
    lineHeight,
    padding,
    inset,
    minimumWidth,
    width,
    height,
    wrappedText: lines.join('\n')
  });
}

function requireCalloutText(style: ElementStyleState): TextSpec {
  if (isNativeStyleRef(style)) throw new UnsupportedOperationError('Callout requires a structured style with text');
  if (style.text === undefined || typeof style.text.text !== 'string') {
    throw new InvalidArgumentError('Callout style requires TextSpec.text');
  }
  if (style.text.placement === 'line') throw new InvalidArgumentError('Callout text placement must be point');
  if ((style.text.offsetX ?? 0) !== 0 || (style.text.offsetY ?? 0) !== 0) throw new InvalidArgumentError('Callout text offsets must be zero');
  if ((style.text.rotation ?? 0) !== 0 || style.text.rotateWithView === true) throw new InvalidArgumentError('Callout text must remain screen-aligned');
  const scale = style.text.scale;
  if (scale !== undefined && (scale !== 1 || Array.isArray(scale))) throw new InvalidArgumentError('Callout text scale must remain 1');
  if (style.text.backgroundFill !== undefined || style.text.backgroundStroke !== undefined) {
    throw new InvalidArgumentError('Callout uses top-level fill and strokes instead of text background styles');
  }
  if (typeof style.text.fontSize === 'number' && (!Number.isFinite(style.text.fontSize) || style.text.fontSize <= 0)) {
    throw new InvalidArgumentError('Callout numeric text fontSize must be positive and finite');
  }
  return style.text;
}

function composeFont(text: TextSpec): string {
  const split = text.fontFamily !== undefined || text.fontSize !== undefined || text.fontWeight !== undefined || text.fontStyle !== undefined;
  if (!split && text.font !== undefined && text.font.trim().length > 0) return text.font;
  const fontStyle = text.fontStyle ?? 'normal';
  const fontWeight = text.fontWeight ?? 'normal';
  const fontSize = typeof text.fontSize === 'number' ? `${text.fontSize}px` : (text.fontSize ?? '10px');
  const fontFamily = text.fontFamily ?? 'sans-serif';
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

function fontPixelSize(text: TextSpec, font: string): number {
  if (typeof text.fontSize === 'number' && Number.isFinite(text.fontSize) && text.fontSize > 0) return text.fontSize;
  const source = typeof text.fontSize === 'string' ? text.fontSize : font;
  const match = /(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|\/|$)/i.exec(source);
  const parsed = match === null ? Number.NaN : Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function normalizePadding(input: readonly number[] | undefined): readonly [number, number, number, number] {
  if (input === undefined) return defaultPadding;
  if (input.length !== 4 || input.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new InvalidArgumentError('Callout text padding must contain four non-negative finite values');
  }
  return Object.freeze([input[0], input[1], input[2], input[3]]);
}

function wrapText(input: string, maxWidth: number, measure: (text: string) => number): string[] {
  const normalized = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    const tokens = wordTokens(paragraph);
    let current = '';
    for (const token of tokens) {
      const candidate = current + token;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) lines.push(current.trimEnd());
      current = '';
      const remainder = token.trimStart();
      if (remainder.length === 0) continue;
      if (measure(remainder) <= maxWidth) {
        current = remainder;
        continue;
      }
      for (const grapheme of splitGraphemes(remainder)) {
        const next = current + grapheme;
        if (current.length > 0 && measure(next) > maxWidth) {
          lines.push(current);
          current = grapheme;
        } else {
          current = next;
        }
      }
    }
    lines.push(current.trimEnd());
  }
  return lines.length === 0 ? [''] : lines;
}

function wordTokens(value: string): string[] {
  if (value.length === 0) return [];
  const segments = value.match(
    /\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu
  );
  return segments ?? splitGraphemes(value);
}

function splitGraphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (...args: never[]) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter !== undefined) {
    const segmenter = new Segmenter(undefined as never, { granularity: 'grapheme' } as never);
    return [...segmenter.segment(value)].map(({ segment }) => segment);
  }
  return Array.from(value);
}

function safeTextWidth(measured: number, value: string, fontSize: number): number {
  if (Number.isFinite(measured) && measured >= 0) return measured;
  return splitGraphemes(value).reduce((sum, grapheme) => sum + (/\s/u.test(grapheme) ? fontSize * 0.35 : fontSize), 0);
}

function frameBounds(center: Pixel, width: number, height: number): FrameBounds {
  return Object.freeze({ left: center[0] - width / 2, top: center[1] - height / 2, right: center[0] + width / 2, bottom: center[1] + height / 2 });
}

function calloutRing(bounds: FrameBounds, anchor: Pixel): Pixel[] {
  const center: Pixel = [(bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2];
  const dx = anchor[0] - center[0];
  const dy = anchor[1] - center[1];
  const halfWidth = (bounds.right - bounds.left) / 2;
  const halfHeight = (bounds.bottom - bounds.top) / 2;
  if (Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight) return closePixels(rectanglePixels(bounds));
  const xRatio = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const yRatio = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const side = xRatio < yRatio ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
  const ratio = Math.min(xRatio, yRatio);
  const intersection: Pixel = [center[0] + dx * ratio, center[1] + dy * ratio];
  const base = Math.min(tailHalfBase, side === 'top' || side === 'bottom' ? halfWidth / 2 : halfHeight / 2);
  let ring: Pixel[];
  if (side === 'top') {
    const x = clamp(intersection[0], bounds.left + base, bounds.right - base);
    ring = [
      [bounds.left, bounds.top],
      [x - base, bounds.top],
      anchor,
      [x + base, bounds.top],
      [bounds.right, bounds.top],
      [bounds.right, bounds.bottom],
      [bounds.left, bounds.bottom]
    ];
  } else if (side === 'right') {
    const y = clamp(intersection[1], bounds.top + base, bounds.bottom - base);
    ring = [
      [bounds.left, bounds.top],
      [bounds.right, bounds.top],
      [bounds.right, y - base],
      anchor,
      [bounds.right, y + base],
      [bounds.right, bounds.bottom],
      [bounds.left, bounds.bottom]
    ];
  } else if (side === 'bottom') {
    const x = clamp(intersection[0], bounds.left + base, bounds.right - base);
    ring = [
      [bounds.left, bounds.top],
      [bounds.right, bounds.top],
      [bounds.right, bounds.bottom],
      [x + base, bounds.bottom],
      anchor,
      [x - base, bounds.bottom],
      [bounds.left, bounds.bottom]
    ];
  } else {
    const y = clamp(intersection[1], bounds.top + base, bounds.bottom - base);
    ring = [
      [bounds.left, bounds.top],
      [bounds.right, bounds.top],
      [bounds.right, bounds.bottom],
      [bounds.left, bounds.bottom],
      [bounds.left, y + base],
      anchor,
      [bounds.left, y - base]
    ];
  }
  return closePixels(ring);
}

function rectanglePixels(bounds: FrameBounds): Pixel[] {
  return [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.right, bounds.bottom],
    [bounds.left, bounds.bottom]
  ];
}

function closePixels(pixels: Pixel[]): Pixel[] {
  return [...pixels, [pixels[0][0], pixels[0][1]]];
}

function handle(index: number, coordinate: Coordinate, role: string): ControlPointHandle {
  return Object.freeze({ index, coordinate: Object.freeze(cloneCoordinate(coordinate)), role, removable: false });
}

function freezeCallout(anchor: Coordinate, center: Coordinate, width: number, height: number): CalloutState {
  const size = Object.freeze([width, height]) as readonly [number, number];
  return Object.freeze({
    type: 'callout',
    anchor: Object.freeze(cloneCoordinate(anchor)),
    center: Object.freeze(cloneCoordinate(center)),
    size
  });
}

function translateCoordinate(coordinate: Coordinate, x: number, y: number): Coordinate {
  const nextX = coordinate[0] + x;
  const nextY = coordinate[1] + y;
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) throw new InvalidArgumentError('Callout translation exceeds the finite numeric range');
  return coordinate.length === 3 ? [nextX, nextY, coordinate[2]] : [nextX, nextY];
}

function requireUniformDimension(left: Coordinate, right: Coordinate): void {
  if (left.length !== right.length) throw new InvalidArgumentError('Callout anchor and center must use the same coordinate dimension');
}

/** OpenLayers 指针只有 XY；编辑三维 Callout 时沿用当前语义点的 Z。 */
function matchPointerDimension(pointer: Coordinate, template: Coordinate): Coordinate {
  if (pointer.length === template.length) return pointer;
  if (pointer.length === 2 && template.length === 3) return [pointer[0], pointer[1], template[2]];
  throw new InvalidArgumentError('Callout edit coordinate dimension is incompatible with the edited state');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
