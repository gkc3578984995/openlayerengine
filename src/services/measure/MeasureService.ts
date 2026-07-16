import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ElementStyleState, StyleSpec } from '../../core/style/types.js';
import type { InternalDrawService } from '../draw/types.js';
import type { StyleService } from '../style/StyleService.js';
import { MeasureSession } from './MeasureSession.js';
import {
  INTERNAL_MEASURE_MODULE,
  type InternalMeasureOptions,
  type InternalMeasureService,
  type InternalMeasureType,
  type InternalMeasureUnit,
  type MeasureServiceDependencies,
  type NormalizedMeasureOptions
} from './types.js';

/** 测量服务支持的测量类型集合。 */
const types = new Set<InternalMeasureType>(['distance-segments', 'distance-total', 'distance-radial', 'area']);

/** 基于 DrawService 创建 Measure Session，并统一管理其结果生命周期。 */
export class MeasureService implements InternalMeasureService {
  /** 复用的 DrawService；Measure 不维护第二套绘制内核。 */
  readonly #draw: InternalDrawService;
  /** Element 状态真源。 */
  readonly #store: ElementStore;
  /** 内部样式服务。 */
  readonly #styles: StyleService;
  /** 测量标签使用的 Overlay 服务。 */
  readonly #overlays: MeasureServiceDependencies['overlays'];
  /** 测量计算端口。 */
  readonly #measurement: MeasureServiceDependencies['measurement'];
  /** 测量提示元素端口。 */
  readonly #tooltips: MeasureServiceDependencies['tooltips'];
  /** 默认测量图层 ID。 */
  readonly #defaultLayerId: string;
  /** 可选的测量元素 ID 生成器。 */
  readonly #providedCreateId: (() => string) | undefined;
  /** 测量错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 尚未进入终态的 Measure Session。 */
  readonly #sessions = new Set<MeasureSession>();
  /** 下一个自动生成的元素 ID。 */
  #nextId = 0;
  #destroyRequested = false;
  /** 服务是否已销毁。 */
  #disposed = false;

  /** 创建测量服务。 */
  constructor(dependencies: MeasureServiceDependencies) {
    this.#draw = dependencies.draw;
    this.#store = dependencies.store;
    this.#styles = dependencies.styles;
    this.#overlays = dependencies.overlays;
    this.#measurement = dependencies.measurement;
    this.#tooltips = dependencies.tooltips;
    this.#defaultLayerId = nonEmptyString(dependencies.defaultLayerId, 'Measure defaultLayerId');
    if (dependencies.createId !== undefined && typeof dependencies.createId !== 'function') {
      throw new InvalidArgumentError('Measure createId must be a function');
    }
    if (dependencies.errorReporter !== undefined && typeof dependencies.errorReporter !== 'function') {
      throw new InvalidArgumentError('Measure errorReporter must be a function');
    }
    this.#providedCreateId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
  }

  /** 启动一个测量会话。 */
  start(input: InternalMeasureOptions): MeasureSession {
    this.#assertActive();
    const options = this.#normalize(input);
    const drawSession = this.#draw.start({
      type: options.type === 'area' ? 'polygon' : 'polyline',
      layerId: options.layerId,
      module: INTERNAL_MEASURE_MODULE,
      style: transparentStyle(options.type === 'area'),
      limit: 1,
      keepGraphics: false,
      policy: options.policy
    });
    let session!: MeasureSession;
    try {
      session = new MeasureSession({
        drawSession,
        store: this.#store,
        styles: this.#styles,
        overlays: this.#overlays,
        measurement: this.#measurement,
        tooltips: this.#tooltips,
        options,
        createId: () => this.#createId(),
        errorReporter: this.#errorReporter,
        onTerminal: () => this.#sessions.delete(session)
      });
      this.#sessions.add(session);
      return session;
    } catch (error) {
      drawSession.destroy();
      throw error;
    }
  }

  /** 清除全部测量会话、元素和标签。 */
  clear(): void {
    this.#assertActive();
    this.#clearOwned();
  }

  /** 销毁测量服务及其全部结果。 */
  destroy(): void {
    if (this.#disposed || this.#destroyRequested) return;
    this.#destroyRequested = true;
    const sessions = [...this.#sessions];
    this.#sessions.clear();
    let failure: unknown;
    try {
      runFinalizers([
        ...sessions.map((session) => () => session.destroy()),
        () => void this.#store.remove({ module: INTERNAL_MEASURE_MODULE }),
        () => void this.#overlays.remove({ module: INTERNAL_MEASURE_MODULE })
      ]);
    } catch (error) {
      failure = error;
    }
    this.#disposed = true;
    if (failure !== undefined) throw failure;
  }

  /** 先取消活动 Session，再移除 MeasureService 拥有的 Element 与 Overlay。 */
  #clearOwned(): void {
    const sessions = [...this.#sessions];
    runFinalizers([
      ...sessions.map((session) => () => session.cancel()),
      () => void this.#store.remove({ module: INTERNAL_MEASURE_MODULE }),
      () => void this.#overlays.remove({ module: INTERNAL_MEASURE_MODULE })
    ]);
  }

  /** 校验并补齐测量配置默认值。 */
  #normalize(input: InternalMeasureOptions): NormalizedMeasureOptions {
    const record = inspectRecord(input, 'Measure options');
    assertFields(record, new Set(['type', 'layerId', 'unit', 'precision', 'formatter', 'line', 'point', 'text', 'showTotal', 'policy']), 'Measure options');
    const type = measureType(required(record, 'type', 'Measure options'));
    const layerId = hasOwn(record, 'layerId') && record.layerId !== undefined ? nonEmptyString(record.layerId, 'Measure layerId') : this.#defaultLayerId;
    const unit = normalizeUnit(type, hasOwn(record, 'unit') ? record.unit : undefined);
    const precision = hasOwn(record, 'precision') && record.precision !== undefined ? boundedInteger(record.precision, 'Measure precision', 0, 12) : 2;
    const formatter = hasOwn(record, 'formatter') && record.formatter !== undefined ? callback(record.formatter, 'Measure formatter') : defaultFormatter;
    const line = normalizeLine(this.#styles, hasOwn(record, 'line') ? record.line : undefined);
    const point = normalizePoint(this.#styles, hasOwn(record, 'point') ? record.point : undefined);
    const text = normalizeText(this.#styles, hasOwn(record, 'text') ? record.text : undefined);
    const showTotal =
      hasOwn(record, 'showTotal') && record.showTotal !== undefined
        ? booleanValue(record.showTotal, 'Measure showTotal')
        : type === 'distance-total' || type === 'area';
    const policy = hasOwn(record, 'policy') && record.policy !== undefined ? interactionPolicy(record.policy) : 'replace';
    return freezeDeep({ type, layerId, unit, precision, formatter, line, point, text, showTotal, policy });
  }

  /** 生成测量结果元素 ID。 */
  #createId(): string {
    const value = this.#providedCreateId?.() ?? `measure-${++this.#nextId}`;
    return nonEmptyString(value, 'Generated measure element id');
  }

  /** 确保测量服务仍可使用。 */
  #assertActive(): void {
    if (this.#disposed || this.#destroyRequested) throw new ObjectDisposedError('MeasureService has been destroyed');
  }
}

/** 校验并规范化测量线样式。 */
function normalizeLine(styles: StyleService, input: unknown): NormalizedMeasureOptions['line'] {
  const line = input === undefined ? { color: '#ffcc33', width: 2 } : inspectRecord(input, 'Measure line style');
  const style = styles.clone({ strokes: [cloneCoreState(line)] } as ElementStyleState) as StyleSpec;
  return freezeDeep(style.strokes?.[0] ?? { color: '#ffcc33', width: 2 });
}

/** 校验并规范化测量控制点样式。 */
function normalizePoint(styles: StyleService, input: unknown): NormalizedMeasureOptions['point'] {
  if (input === false) return false;
  const point = input === undefined ? { type: 'circle', radius: 3, fill: { type: 'solid', color: '#ffffff' }, stroke: { color: '#ffcc33', width: 1 } } : input;
  const style = styles.clone({ symbol: cloneCoreState(point) } as ElementStyleState) as StyleSpec;
  if (style.symbol?.type !== 'circle') throw new InvalidArgumentError('Measure point style must be a circle symbol');
  return freezeDeep(style.symbol);
}

/** 校验并规范化测量文字样式。 */
function normalizeText(styles: StyleService, input: unknown): NormalizedMeasureOptions['text'] {
  const text =
    input === undefined
      ? {
          fontFamily: 'Calibri, sans-serif',
          fontSize: 12,
          fill: { type: 'solid', color: '#ffcc33' },
          backgroundFill: { type: 'solid', color: 'rgba(0, 0, 0, 0.4)' },
          padding: [4, 4, 4, 4]
        }
      : inspectRecord(input, 'Measure text style');
  for (const key of ['rotateWithView', 'overflow', 'placement', 'maxAngle', 'repeat', 'keepUpright']) {
    if (hasOwn(text, key)) throw new InvalidArgumentError(`Measure text style does not support ${key}`);
  }
  const style = styles.clone({ text: { text: '', ...cloneCoreState(text) } } as ElementStyleState) as StyleSpec;
  const normalized = style.text;
  if (normalized === undefined) throw new InvalidArgumentError('Measure text style is invalid');
  const { text: _text, ...withoutText } = normalized;
  void _text;
  return freezeDeep(withoutText);
}

/** 创建不参与显示的绘制占位样式。 */
function transparentStyle(area: boolean): ElementStyleState {
  return freezeDeep({
    strokes: [{ color: 'rgba(0, 0, 0, 0)', width: 1 }],
    ...(area ? { fill: { type: 'solid' as const, color: 'rgba(0, 0, 0, 0)' } } : {})
  });
}

/** 按测量类型校验并选择结果单位。 */
function normalizeUnit(type: InternalMeasureType, value: unknown): InternalMeasureUnit {
  const unit = value === undefined ? (type === 'area' ? 'km²' : 'km') : value;
  if (type === 'area') {
    if (unit !== 'm²' && unit !== 'km²') throw new InvalidArgumentError('Area measure unit must be m² or km²');
  } else if (unit !== 'm' && unit !== 'km') {
    throw new InvalidArgumentError('Distance measure unit must be m or km');
  }
  return unit;
}

/** 校验测量类型。 */
function measureType(value: unknown): InternalMeasureType {
  if (typeof value !== 'string' || !types.has(value as InternalMeasureType)) throw new InvalidArgumentError('Unknown measure type');
  return value as InternalMeasureType;
}

/** 校验交互冲突策略。 */
function interactionPolicy(value: unknown): 'replace' | 'reject' {
  if (value !== 'replace' && value !== 'reject') throw new InvalidArgumentError('Measure policy must be replace or reject');
  return value;
}

/** 读取测量格式化回调。 */
function callback(value: unknown, label: string): NormalizedMeasureOptions['formatter'] {
  if (typeof value !== 'function') throw new InvalidArgumentError(`${label} must be a function`);
  return value as NormalizedMeasureOptions['formatter'];
}

/** 使用数值和单位生成默认结果文本。 */
function defaultFormatter(value: number, unit: InternalMeasureUnit): string {
  return `${value} ${unit}`;
}

/** 校验指定范围内的整数。 */
function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new InvalidArgumentError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

/** 读取布尔值。 */
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

/** 校验非空字符串。 */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 安全读取普通配置对象的数据属性。 */
function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const record = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      record[key] = descriptor.value;
    }
    return record;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

/** 断言配置只包含允许字段。 */
function assertFields(record: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

/** 读取配置中的必填字段。 */
function required(record: Record<PropertyKey, unknown>, key: string, label: string): unknown {
  if (!hasOwn(record, key)) throw new InvalidArgumentError(`${label} requires ${key}`);
  return record[key];
}

/** 判断对象是否拥有指定自有属性。 */
function hasOwn(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** 递归冻结测量配置数据。 */
function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) freezeDeep(descriptor.value, seen);
  }
  return Object.freeze(value);
}
