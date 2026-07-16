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

/** 结构化样式允许的顶层字段。 */
const styleFields = new Set(['symbol', 'strokes', 'fill', 'text', 'decorations', 'zIndex']);
/** 描边样式允许的字段。 */
const strokeFields = new Set(['color', 'width', 'lineDash', 'lineDashOffset', 'lineCap', 'lineJoin', 'miterLimit', 'fitPatternOnce']);
/** 圆形符号允许的字段。 */
const circleFields = new Set(['type', 'radius', 'fill', 'stroke']);
/** 图片符号允许的字段。 */
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
/** 纯色填充允许的字段。 */
const solidFillFields = new Set(['type', 'color']);
/** 纹理填充允许的字段。 */
const patternFillFields = new Set(['type', 'pattern', 'color', 'size', 'lineWidth', 'dotRadius', 'backgroundColor']);
/** 文本样式允许的字段。 */
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
/** 箭头装饰允许的字段。 */
const arrowFields = new Set(['type', 'placement', 'symbol', 'offset', 'spacing']);
/** 仅圆形符号补丁可使用的字段。 */
const circleOnlyPatchFields = new Set(['radius', 'fill', 'stroke']);
/** 仅图片符号补丁可使用的字段。 */
const iconOnlyPatchFields = new Set([...iconFields].filter((field) => field !== 'type'));

/** 通过 ElementStore 事务设置、合并和复制 Element 样式。 */
export class StyleService {
  /** Element 状态真源；所有持久样式更新都通过事务提交。 */
  readonly #store: ElementStore;

  /** 创建样式服务。 */
  constructor(store: ElementStore) {
    this.#store = store;
  }

  /** 为匹配元素替换完整样式。 */
  set(selector: ElementSelector, style: ElementStyleState): ElementChangeSet {
    return this.setResolved(selector, () => style);
  }

  /** 在事务内解析一次样式，再替换所有匹配 Element 的样式。 */
  setResolved(selector: ElementSelector, resolveStyle: () => ElementStyleState): ElementChangeSet {
    return this.#store.transaction((transaction) => {
      const safeStyle = cloneStyleState(resolveStyle());
      transaction.update(selector, { style: safeStyle });
    }).changes;
  }

  /** 将结构化样式补丁合并到匹配元素。 */
  patch(selector: ElementSelector, patch: StylePatch): ElementChangeSet {
    return this.#store.transaction((transaction) => {
      const safePatch = cloneCoreState(patch);
      assertStylePatch(safePatch);
      // 即使补丁为空，也在事务的只读阶段完成破坏性选择器校验和 getter 防护。
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

  /** 断言样式是可编辑的结构化样式。 */
  assertStructured(style: ElementStyleState): asserts style is StyleSpec {
    if (isNativeStyleRef(style)) throw new UnsupportedOperationError('The operation requires a structured style');
    assertStructuredStyleSpec(style);
  }

  /** 返回样式的安全副本。 */
  clone(style: ElementStyleState): ElementStyleState {
    if (isNativeStyleRef(style)) return style;
    assertStructuredStyleSpec(style);
    return cloneMutable(cloneCoreState(style)) as StyleSpec;
  }

  /** 将结构化样式复制为可序列化数据。 */
  serialize(style: ElementStyleState): StyleSpec {
    if (isNativeStyleRef(style)) throw new UnsupportedOperationError('Native styles cannot be serialized');
    assertStructuredStyleSpec(style);
    return cloneMutable(cloneCoreState(style)) as StyleSpec;
  }
}

/** 复制并校验元素样式状态。 */
function cloneStyleState(style: ElementStyleState): ElementStyleState {
  if (isNativeStyleRef(style)) return style;
  const cloned = cloneCoreState(style);
  assertStructuredStyleSpec(cloned);
  return cloned;
}

/** 合并完整结构化样式与局部补丁。 */
function mergeStyle(style: StyleSpec, patch: StylePatch): StyleSpec {
  return mergePlain(style, patch) as StyleSpec;
}

/** 递归合并普通对象，并支持用 undefined 删除字段。 */
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

/** 深度复制为可修改值。 */
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

/** 严格校验完整结构化样式。 */
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

/** 严格校验结构化样式补丁。 */
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

/** 校验圆形或图片符号配置。 */
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

/** 校验圆形符号配置。 */
function assertCircleSymbol(symbol: Record<string, unknown>, partial: boolean): void {
  assertKnownFields(symbol, circleFields, partial ? 'Circle symbol patch' : 'Circle symbol');
  if (!partial && symbol.type !== 'circle') throw new InvalidArgumentError('Circle symbol requires type circle');
  if (!partial || hasDefined(symbol, 'radius')) nonNegativeFiniteNumber(symbol.radius, 'Circle symbol radius');
  if (hasDefined(symbol, 'fill')) assertFill(symbol.fill, partial);
  if (hasDefined(symbol, 'stroke')) assertStroke(symbol.stroke, partial, 'Circle symbol stroke');
}

/** 校验图片符号配置。 */
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

/** 校验描边样式数组。 */
function assertStrokeArray(value: unknown, label: string): asserts value is StrokeSpec[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  for (const stroke of value) assertStroke(stroke, false, label);
}

/** 校验单条描边样式。 */
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

/** 校验纯色或纹理填充。 */
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

/** 校验纹理填充的具体字段。 */
function assertPatternFields(fill: Record<string, unknown>, partial = false): void {
  if (!partial || hasDefined(fill, 'pattern')) oneOf(fill.pattern, ['diagonal', 'cross', 'dot', 'horizontal', 'vertical'], 'Pattern fill pattern');
  if (hasDefined(fill, 'color')) assertColor(fill.color, 'Pattern fill color');
  if (hasDefined(fill, 'size')) numberValue(fill.size, 'Pattern fill size');
  if (hasDefined(fill, 'lineWidth')) numberValue(fill.lineWidth, 'Pattern fill lineWidth');
  if (hasDefined(fill, 'dotRadius')) numberValue(fill.dotRadius, 'Pattern fill dotRadius');
  if (hasDefined(fill, 'backgroundColor')) assertColor(fill.backgroundColor, 'Pattern fill backgroundColor');
}

/** 校验文本样式。 */
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

/** 校验箭头装饰数组。 */
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

/** 校验单值或二维元组缩放。 */
function assertScale(value: unknown, label: string): void {
  if (typeof value === 'number') finiteNumber(value, label);
  else tuple(value, 2, label);
}

/** 校验颜色字符串或数字元组。 */
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

/** 校验指定长度的有限数字元组。 */
function tuple(value: unknown, length: number, label: string): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== length || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new InvalidArgumentError(`${label} must contain ${length} finite numbers`);
  }
}

/** 校验有限数字数组。 */
function numberArray(value: unknown, label: string): asserts value is number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
    throw new InvalidArgumentError(`${label} must be an array of finite numbers`);
  }
}

/** 将普通对象输入收窄为记录。 */
function record(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

/** 判断值是否为普通对象。 */
function isPlainObject(value: unknown): value is object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** 断言记录只包含已知字段。 */
function assertKnownFields(recordValue: Record<string, unknown>, fields: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(recordValue)) {
    if (typeof key !== 'string' || !fields.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

/** 判断对象是否拥有指定自有属性。 */
function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 判断记录字段存在且不为 undefined。 */
function hasDefined(value: Record<string, unknown>, key: string): boolean {
  return hasOwn(value, key) && value[key] !== undefined;
}

/** 校验有限数字。 */
function finiteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be a finite number`);
}

/** 校验非负有限数字。 */
function nonNegativeFiniteNumber(value: unknown, label: string): asserts value is number {
  finiteNumber(value, label);
  if (value < 0) throw new InvalidArgumentError(`${label} must not be negative`);
}

/** 校验正有限数字。 */
function positiveFiniteNumber(value: unknown, label: string): asserts value is number {
  finiteNumber(value, label);
  if (value <= 0) throw new InvalidArgumentError(`${label} must be greater than zero`);
}

/** 校验数字类型。 */
function numberValue(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number') throw new InvalidArgumentError(`${label} must be a number`);
}

/** 校验字符串类型。 */
function stringValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
}

/** 校验非空字符串。 */
function nonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
}

/** 校验布尔类型。 */
function booleanValue(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
}

/** 校验字符串属于允许值集合。 */
function oneOf(value: unknown, allowed: readonly string[], label: string): asserts value is string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new InvalidArgumentError(`${label} is invalid`);
}
