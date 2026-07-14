import { cloneCoreState } from '../../core/common/clone.js';
import type { Color } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementSelector } from '../../core/element/types.js';
import { InvalidArgumentError, UnsupportedOperationError } from '../../core/errors.js';
import {
  isNativeStyleRef,
  type ArrowDecorationSpec,
  type CircleSymbolSpec,
  type ElementStyleState,
  type IconSymbolSpec,
  type PatternFillSpec,
  type SolidFillSpec,
  type StrokeSpec,
  type StylePatch,
  type StyleSpec,
  type TextSpec
} from '../../core/style/types.js';
import type { ElementChangeSet } from '../../core/transaction/types.js';

const styleFields = new Set(['symbol', 'strokes', 'fill', 'text', 'decorations', 'zIndex']);
const strokeFields = new Set(['color', 'width', 'lineDash', 'lineDashOffset', 'lineCap', 'lineJoin', 'miterLimit', 'fitPatternOnce']);
const circleFields = new Set(['type', 'radius', 'fill', 'stroke']);
const iconFields = new Set([
  'type',
  'src',
  'size',
  'color',
  'offset',
  'displacement',
  'scale',
  'rotation',
  'rotateWithView',
  'anchor',
  'anchorOrigin',
  'anchorXUnits',
  'anchorYUnits',
  'origin',
  'opacity',
  'crossOrigin'
]);
const solidFillFields = new Set(['type', 'color']);
const patternFillFields = new Set(['type', 'pattern', 'color', 'size', 'lineWidth', 'dotRadius', 'backgroundColor']);
const textFields = new Set([
  'text',
  'font',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fill',
  'stroke',
  'backgroundFill',
  'backgroundStroke',
  'padding',
  'offsetX',
  'offsetY',
  'scale',
  'textAlign',
  'textBaseline',
  'rotation',
  'rotateWithView',
  'overflow',
  'placement',
  'maxAngle',
  'repeat',
  'justify',
  'keepUpright'
]);
const arrowFields = new Set(['type', 'placement', 'symbol', 'offset', 'spacing']);
const circleOnlyPatchFields = new Set(['radius', 'fill', 'stroke']);
const iconOnlyPatchFields = new Set([...iconFields].filter((field) => field !== 'type'));

export class StyleService {
  readonly #store: ElementStore;

  constructor(store: ElementStore) {
    this.#store = store;
  }

  set(selector: ElementSelector, style: ElementStyleState): ElementChangeSet {
    return this.setResolved(selector, () => style);
  }

  setResolved(selector: ElementSelector, resolveStyle: () => ElementStyleState): ElementChangeSet {
    return this.#store.transaction((transaction) => {
      const safeStyle = cloneStyleState(resolveStyle());
      transaction.update(selector, { style: safeStyle });
    }).changes;
  }

  patch(selector: ElementSelector, patch: StylePatch): ElementChangeSet {
    return this.#store.transaction((transaction) => {
      const safePatch = cloneCoreState(patch);
      assertStylePatch(safePatch);
      // This no-op keeps Task 6's destructive-selector validation and hostile
      // getter protection inside the transaction's continuous read-only scope.
      transaction.update(selector, {});

      const matches = transaction.query(selector);
      if (matches.some((state) => isNativeStyleRef(state.style))) {
        throw new UnsupportedOperationError('Native styles cannot be patched as structured style data');
      }
      if (Reflect.ownKeys(safePatch).length === 0) return;
      const replacements = matches.map((state) => {
        if (isNativeStyleRef(state.style)) throw new UnsupportedOperationError('Native styles cannot be patched as structured style data');
        const merged = mergeStyle(state.style, safePatch);
        assertStructuredStyleSpec(merged);
        return { id: state.id, style: merged };
      });

      for (const replacement of replacements) transaction.update({ id: replacement.id }, { style: replacement.style });
    }).changes;
  }

  assertStructured(style: ElementStyleState): asserts style is StyleSpec {
    if (isNativeStyleRef(style)) throw new UnsupportedOperationError('The operation requires a structured style');
    assertStructuredStyleSpec(style);
  }

  clone(style: ElementStyleState): ElementStyleState {
    if (isNativeStyleRef(style)) return style;
    assertStructuredStyleSpec(style);
    return cloneMutable(cloneCoreState(style)) as StyleSpec;
  }

  serialize(style: ElementStyleState): StyleSpec {
    if (isNativeStyleRef(style)) throw new UnsupportedOperationError('Native styles cannot be serialized');
    assertStructuredStyleSpec(style);
    return cloneMutable(cloneCoreState(style)) as StyleSpec;
  }
}

function cloneStyleState(style: ElementStyleState): ElementStyleState {
  if (isNativeStyleRef(style)) return style;
  const cloned = cloneCoreState(style);
  assertStructuredStyleSpec(cloned);
  return cloned;
}

function mergeStyle(style: StyleSpec, patch: StylePatch): StyleSpec {
  return mergePlain(style, patch) as StyleSpec;
}

function mergePlain(base: unknown, patch: object): object {
  const patchRecord = patch as Record<string, unknown>;
  const baseRecord = isPlainObject(base) ? (base as Record<string, unknown>) : undefined;
  const replacesDiscriminator =
    hasOwn(patchRecord, 'type') && patchRecord.type !== undefined && (baseRecord === undefined || patchRecord.type !== baseRecord.type);
  const result = replacesDiscriminator || baseRecord === undefined ? {} : (cloneMutable(baseRecord) as Record<string, unknown>);

  for (const key of Reflect.ownKeys(patchRecord)) {
    if (typeof key !== 'string') throw new InvalidArgumentError('Style patches cannot contain symbol properties');
    const value = patchRecord[key];
    if (value === undefined) {
      delete result[key];
    } else if (isPlainObject(value)) {
      result[key] = mergePlain(result[key], value);
    } else {
      result[key] = cloneMutable(value);
    }
  }
  return result;
}

function cloneMutable(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneMutable);
  if (!isPlainObject(value)) return cloneCoreState(value);
  const clone = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new InvalidArgumentError('Structured styles cannot contain symbol properties');
    clone[key] = cloneMutable((value as Record<string, unknown>)[key]);
  }
  return clone;
}

export function assertStructuredStyleSpec(value: unknown): asserts value is StyleSpec {
  const style = record(value, 'Style');
  assertKnownFields(style, styleFields, 'Style');
  if (hasDefined(style, 'symbol')) assertSymbol(style.symbol, false);
  if (hasDefined(style, 'strokes')) assertStrokeArray(style.strokes, 'Style strokes');
  if (hasDefined(style, 'fill')) assertFill(style.fill, false);
  if (hasDefined(style, 'text')) assertText(style.text, false);
  if (hasDefined(style, 'decorations')) assertDecorations(style.decorations);
  if (hasDefined(style, 'zIndex')) finiteNumber(style.zIndex, 'Style zIndex');
}

function assertStylePatch(value: unknown): asserts value is StylePatch {
  const patch = record(value, 'Style patch');
  assertKnownFields(patch, styleFields, 'Style patch');
  if (hasDefined(patch, 'symbol')) assertSymbol(patch.symbol, true);
  if (hasDefined(patch, 'strokes')) assertStrokeArray(patch.strokes, 'Style patch strokes');
  if (hasDefined(patch, 'fill')) assertFill(patch.fill, true);
  if (hasDefined(patch, 'text')) assertText(patch.text, true);
  if (hasDefined(patch, 'decorations')) assertDecorations(patch.decorations);
  if (hasDefined(patch, 'zIndex')) finiteNumber(patch.zIndex, 'Style patch zIndex');
}

function assertSymbol(value: unknown, partial: boolean): asserts value is CircleSymbolSpec | IconSymbolSpec {
  const symbol = record(value, partial ? 'Style symbol patch' : 'Style symbol');
  const hasType = hasOwn(symbol, 'type');
  if (hasType && symbol.type === undefined) throw new InvalidArgumentError('Style symbol type cannot be deleted');
  if (hasType || !partial) {
    if (symbol.type === 'circle') return assertCircleSymbol(symbol, false);
    if (symbol.type === 'icon') return assertIconSymbol(symbol, false);
    throw new InvalidArgumentError(`Unknown style symbol type: ${String(symbol.type)}`);
  }

  const fields = new Set(Reflect.ownKeys(symbol).filter((key): key is string => typeof key === 'string'));
  const hasCircleField = [...circleOnlyPatchFields].some((key) => fields.has(key));
  const hasIconField = [...iconOnlyPatchFields].some((key) => fields.has(key));
  if (hasCircleField && hasIconField) throw new InvalidArgumentError('Style symbol patch mixes circle and icon fields');
  if (hasCircleField) assertCircleSymbol(symbol, true);
  else assertIconSymbol(symbol, true);
}

function assertCircleSymbol(symbol: Record<string, unknown>, partial: boolean): void {
  assertKnownFields(symbol, circleFields, partial ? 'Circle symbol patch' : 'Circle symbol');
  if (!partial && symbol.type !== 'circle') throw new InvalidArgumentError('Circle symbol requires type circle');
  if (!partial || hasDefined(symbol, 'radius')) nonNegativeFiniteNumber(symbol.radius, 'Circle symbol radius');
  if (hasDefined(symbol, 'fill')) assertFill(symbol.fill, partial);
  if (hasDefined(symbol, 'stroke')) assertStroke(symbol.stroke, partial, 'Circle symbol stroke');
}

function assertIconSymbol(symbol: Record<string, unknown>, partial: boolean): void {
  assertKnownFields(symbol, iconFields, partial ? 'Icon symbol patch' : 'Icon symbol');
  if (!partial && symbol.type !== 'icon') throw new InvalidArgumentError('Icon symbol requires type icon');
  if (!partial || hasDefined(symbol, 'src')) nonEmptyString(symbol.src, 'Icon symbol src');
  if (hasDefined(symbol, 'size')) tuple(symbol.size, 2, 'Icon symbol size');
  if (hasDefined(symbol, 'color')) assertColor(symbol.color, 'Icon symbol color');
  if (hasDefined(symbol, 'offset')) tuple(symbol.offset, 2, 'Icon symbol offset');
  if (hasDefined(symbol, 'displacement')) tuple(symbol.displacement, 2, 'Icon symbol displacement');
  if (hasDefined(symbol, 'scale')) assertScale(symbol.scale, 'Icon symbol scale');
  if (hasDefined(symbol, 'rotation')) finiteNumber(symbol.rotation, 'Icon symbol rotation');
  if (hasDefined(symbol, 'rotateWithView')) booleanValue(symbol.rotateWithView, 'Icon symbol rotateWithView');
  if (hasDefined(symbol, 'anchor')) tuple(symbol.anchor, 2, 'Icon symbol anchor');
  if (hasDefined(symbol, 'anchorOrigin')) oneOf(symbol.anchorOrigin, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], 'Icon anchorOrigin');
  if (hasDefined(symbol, 'anchorXUnits')) oneOf(symbol.anchorXUnits, ['fraction', 'pixels'], 'Icon anchorXUnits');
  if (hasDefined(symbol, 'anchorYUnits')) oneOf(symbol.anchorYUnits, ['fraction', 'pixels'], 'Icon anchorYUnits');
  if (hasDefined(symbol, 'origin')) oneOf(symbol.origin, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], 'Icon origin');
  if (hasDefined(symbol, 'opacity')) finiteNumber(symbol.opacity, 'Icon symbol opacity');
  if (hasDefined(symbol, 'crossOrigin') && symbol.crossOrigin !== null) stringValue(symbol.crossOrigin, 'Icon symbol crossOrigin');
}

function assertStrokeArray(value: unknown, label: string): asserts value is StrokeSpec[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  for (const stroke of value) assertStroke(stroke, false, label);
}

function assertStroke(value: unknown, _partial: boolean, label: string): asserts value is StrokeSpec {
  const stroke = record(value, label);
  assertKnownFields(stroke, strokeFields, label);
  if (hasDefined(stroke, 'color')) assertColor(stroke.color, `${label} color`);
  if (hasDefined(stroke, 'width')) nonNegativeFiniteNumber(stroke.width, `${label} width`);
  if (hasDefined(stroke, 'lineDash')) numberArray(stroke.lineDash, `${label} lineDash`);
  if (hasDefined(stroke, 'lineDashOffset')) finiteNumber(stroke.lineDashOffset, `${label} lineDashOffset`);
  if (hasDefined(stroke, 'lineCap')) oneOf(stroke.lineCap, ['butt', 'round', 'square'], `${label} lineCap`);
  if (hasDefined(stroke, 'lineJoin')) oneOf(stroke.lineJoin, ['bevel', 'round', 'miter'], `${label} lineJoin`);
  if (hasDefined(stroke, 'miterLimit')) nonNegativeFiniteNumber(stroke.miterLimit, `${label} miterLimit`);
  if (hasDefined(stroke, 'fitPatternOnce')) booleanValue(stroke.fitPatternOnce, `${label} fitPatternOnce`);
}

function assertFill(value: unknown, partial: boolean): asserts value is SolidFillSpec | PatternFillSpec {
  const fill = record(value, partial ? 'Fill patch' : 'Fill');
  const hasType = hasOwn(fill, 'type');
  if (hasType && fill.type === undefined) throw new InvalidArgumentError('Fill type cannot be deleted');
  if (hasType || !partial) {
    if (fill.type === 'solid') {
      assertKnownFields(fill, solidFillFields, 'Solid fill');
      if (!hasDefined(fill, 'color')) throw new InvalidArgumentError('Solid fill requires color');
      assertColor(fill.color, 'Solid fill color');
      return;
    }
    if (fill.type === 'pattern') {
      assertKnownFields(fill, patternFillFields, 'Pattern fill');
      if (!hasDefined(fill, 'pattern')) throw new InvalidArgumentError('Pattern fill requires pattern');
      assertPatternFields(fill);
      return;
    }
    throw new InvalidArgumentError(`Unknown fill type: ${String(fill.type)}`);
  }

  assertKnownFields(fill, new Set([...solidFillFields, ...patternFillFields].filter((field) => field !== 'type')), 'Fill patch');
  assertPatternFields(fill, true);
}

function assertPatternFields(fill: Record<string, unknown>, partial = false): void {
  if (!partial || hasDefined(fill, 'pattern')) oneOf(fill.pattern, ['diagonal', 'cross', 'dot', 'horizontal', 'vertical'], 'Pattern fill pattern');
  if (hasDefined(fill, 'color')) assertColor(fill.color, 'Pattern fill color');
  if (hasDefined(fill, 'size')) numberValue(fill.size, 'Pattern fill size');
  if (hasDefined(fill, 'lineWidth')) numberValue(fill.lineWidth, 'Pattern fill lineWidth');
  if (hasDefined(fill, 'dotRadius')) numberValue(fill.dotRadius, 'Pattern fill dotRadius');
  if (hasDefined(fill, 'backgroundColor')) assertColor(fill.backgroundColor, 'Pattern fill backgroundColor');
}

function assertText(value: unknown, partial: boolean): asserts value is TextSpec {
  const text = record(value, partial ? 'Text patch' : 'Text');
  assertKnownFields(text, textFields, partial ? 'Text patch' : 'Text');
  if (!partial || hasDefined(text, 'text')) stringValue(text.text, 'Text value');
  if (hasDefined(text, 'font')) stringValue(text.font, 'Text font');
  if (hasDefined(text, 'fontFamily')) stringValue(text.fontFamily, 'Text fontFamily');
  if (hasDefined(text, 'fontSize')) {
    if (typeof text.fontSize === 'number') finiteNumber(text.fontSize, 'Text fontSize');
    else stringValue(text.fontSize, 'Text fontSize');
  }
  if (hasDefined(text, 'fontWeight')) {
    if (typeof text.fontWeight === 'number') finiteNumber(text.fontWeight, 'Text fontWeight');
    else oneOf(text.fontWeight, ['normal', 'bold', 'bolder', 'lighter'], 'Text fontWeight');
  }
  if (hasDefined(text, 'fontStyle')) oneOf(text.fontStyle, ['normal', 'italic', 'oblique'], 'Text fontStyle');
  if (hasDefined(text, 'fill')) assertFill(text.fill, partial);
  if (hasDefined(text, 'stroke')) assertStroke(text.stroke, partial, 'Text stroke');
  if (hasDefined(text, 'backgroundFill')) assertFill(text.backgroundFill, partial);
  if (hasDefined(text, 'backgroundStroke')) assertStroke(text.backgroundStroke, partial, 'Text backgroundStroke');
  if (hasDefined(text, 'padding')) numberArray(text.padding, 'Text padding');
  if (hasDefined(text, 'offsetX')) finiteNumber(text.offsetX, 'Text offsetX');
  if (hasDefined(text, 'offsetY')) finiteNumber(text.offsetY, 'Text offsetY');
  if (hasDefined(text, 'scale')) assertScale(text.scale, 'Text scale');
  if (hasDefined(text, 'textAlign')) oneOf(text.textAlign, ['left', 'right', 'center', 'start', 'end'], 'Text textAlign');
  if (hasDefined(text, 'textBaseline')) oneOf(text.textBaseline, ['bottom', 'top', 'middle', 'alphabetic', 'hanging', 'ideographic'], 'Text textBaseline');
  if (hasDefined(text, 'rotation')) finiteNumber(text.rotation, 'Text rotation');
  if (hasDefined(text, 'rotateWithView')) booleanValue(text.rotateWithView, 'Text rotateWithView');
  if (hasDefined(text, 'overflow')) booleanValue(text.overflow, 'Text overflow');
  if (hasDefined(text, 'placement')) oneOf(text.placement, ['point', 'line'], 'Text placement');
  if (hasDefined(text, 'maxAngle')) finiteNumber(text.maxAngle, 'Text maxAngle');
  if (hasDefined(text, 'repeat')) finiteNumber(text.repeat, 'Text repeat');
  if (hasDefined(text, 'justify')) oneOf(text.justify, ['left', 'right', 'center'], 'Text justify');
  if (hasDefined(text, 'keepUpright')) booleanValue(text.keepUpright, 'Text keepUpright');
}

function assertDecorations(value: unknown): asserts value is ArrowDecorationSpec[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError('Style decorations must be an array');
  for (const candidate of value) {
    const decoration = record(candidate, 'Arrow decoration');
    assertKnownFields(decoration, arrowFields, 'Arrow decoration');
    if (decoration.type !== 'arrow') throw new InvalidArgumentError('Arrow decoration requires type arrow');
    oneOf(decoration.placement, ['start', 'end', 'each-segment', 'repeat'], 'Arrow placement');
    if (hasDefined(decoration, 'symbol')) assertIconSymbol(record(decoration.symbol, 'Arrow symbol'), false);
    if (hasDefined(decoration, 'offset')) nonNegativeFiniteNumber(decoration.offset, 'Arrow offset');
    if (hasDefined(decoration, 'spacing')) positiveFiniteNumber(decoration.spacing, 'Arrow spacing');
  }
}

function assertScale(value: unknown, label: string): void {
  if (typeof value === 'number') finiteNumber(value, label);
  else tuple(value, 2, label);
}

function assertColor(value: unknown, label: string): asserts value is Color {
  if (typeof value === 'string') return;
  if (
    !Array.isArray(value) ||
    (value.length !== 3 && value.length !== 4) ||
    !value.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    throw new InvalidArgumentError(`${label} must be a color string or numeric tuple`);
  }
}

function tuple(value: unknown, length: number, label: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== length || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new InvalidArgumentError(`${label} must contain ${length} finite numbers`);
  }
}

function numberArray(value: unknown, label: string): asserts value is number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new InvalidArgumentError(`${label} must be an array of finite numbers`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKnownFields(recordValue: Record<string, unknown>, fields: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(recordValue)) {
    if (typeof key !== 'string' || !fields.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasDefined(value: Record<string, unknown>, key: string): boolean {
  return hasOwn(value, key) && value[key] !== undefined;
}

function finiteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be a finite number`);
}

function nonNegativeFiniteNumber(value: unknown, label: string): asserts value is number {
  finiteNumber(value, label);
  if (value < 0) throw new InvalidArgumentError(`${label} must not be negative`);
}

function positiveFiniteNumber(value: unknown, label: string): asserts value is number {
  finiteNumber(value, label);
  if (value <= 0) throw new InvalidArgumentError(`${label} must be greater than zero`);
}

function numberValue(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number') throw new InvalidArgumentError(`${label} must be a number`);
}

function stringValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
}

function nonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
}

function booleanValue(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
}

function oneOf(value: unknown, allowed: readonly string[], label: string): asserts value is string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new InvalidArgumentError(`${label} is invalid`);
}
