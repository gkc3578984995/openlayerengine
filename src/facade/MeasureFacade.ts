import { cloneCoreState } from '../core/common/clone.js';
import type { Coordinate } from '../core/common/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { ShapeState } from '../core/shape/types.js';
import type {
  InternalMeasureOptions,
  InternalMeasureResult,
  InternalMeasureService,
  InternalMeasureSession,
  InternalMeasureSessionEventMap
} from '../services/measure/types.js';
import type { MeasureOptions, MeasureResult, MeasureService, MeasureSession, MeasureSessionEventMap } from './measureTypes.js';

/** 在公共测量 API 与内部测量服务之间转换参数和结果。 */
export class MeasureFacade implements MeasureService {
  /** 执行实际测量工作的内部服务。 */
  readonly #service: InternalMeasureService;

  /** 绑定当前 Earth 的内部测量服务。 */
  constructor(service: InternalMeasureService) {
    this.#service = service;
  }

  /** 复制公共参数并启动 Measure Session。 */
  start(options: MeasureOptions): MeasureSession {
    return new PublicMeasureSession(this.#service.start(copyOptions(options)));
  }

  /** 清理测量服务生成的内容。 */
  clear(): void {
    this.#service.clear();
  }

  /** 销毁内部测量服务。 */
  destroy(): void {
    this.#service.destroy();
  }
}

/** 将内部测量 Session 包装为公共句柄。 */
class PublicMeasureSession implements MeasureSession {
  /** 执行实际测量工作的内部 Session。 */
  readonly #session: InternalMeasureSession;
  /** Session 完成后的只读测量结果。 */
  readonly finished: Promise<MeasureResult | undefined>;

  /** 绑定内部 Session，并转换最终结果。 */
  constructor(session: InternalMeasureSession) {
    this.#session = session;
    this.finished = session.finished.then((result) => (result === undefined ? undefined : toPublicResult(result)));
  }

  /** 当前 Session 状态。 */
  get status(): MeasureSession['status'] {
    return this.#session.status;
  }

  /** 完成本次测量。 */
  finish(): void {
    this.#session.finish();
  }

  /** 取消本次测量。 */
  cancel(): void {
    this.#session.cancel();
  }

  /** 监听测量事件，并把内部结果转换为公共只读结果。 */
  on<K extends keyof MeasureSessionEventMap>(type: K, listener: (event: MeasureSessionEventMap[K]) => void): () => void {
    if (typeof listener !== 'function') throw new InvalidArgumentError('Measure session listener must be a function');
    if (type === 'change')
      return this.#session.on('change', (event) =>
        (listener as (event: MeasureSessionEventMap['change']) => void)(Object.freeze({ type: 'change', result: toPublicResult(event.result) }))
      );
    if (type === 'complete')
      return this.#session.on('complete', (event) =>
        (listener as (event: MeasureSessionEventMap['complete']) => void)(Object.freeze({ type: 'complete', result: toPublicResult(event.result) }))
      );
    if (type === 'cancel') return this.#session.on('cancel', listener as (event: InternalMeasureSessionEventMap['cancel']) => void);
    throw new InvalidArgumentError(`Unknown Measure session event: ${String(type)}`);
  }
}

/** 校验并复制测量参数，隔离调用方持有的对象。 */
function copyOptions(input: MeasureOptions): InternalMeasureOptions {
  const record = inspectRecord(input, 'Measure options');
  const allowed = new Set(['type', 'layerId', 'unit', 'precision', 'formatter', 'line', 'point', 'text', 'showTotal', 'policy']);
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown Measure options field: ${String(key)}`);
  }
  return {
    ...(hasOwn(record, 'type') ? { type: record.type as MeasureOptions['type'] } : { type: undefined as never }),
    ...(hasOwn(record, 'layerId') ? { layerId: record.layerId as MeasureOptions['layerId'] } : {}),
    ...(hasOwn(record, 'unit') ? { unit: record.unit as MeasureOptions['unit'] } : {}),
    ...(hasOwn(record, 'precision') ? { precision: record.precision as MeasureOptions['precision'] } : {}),
    ...(hasOwn(record, 'formatter') ? { formatter: record.formatter as MeasureOptions['formatter'] } : {}),
    ...(hasOwn(record, 'line') ? { line: cloneCoreState(record.line) as MeasureOptions['line'] } : {}),
    ...(hasOwn(record, 'point') ? { point: record.point === false ? false : (cloneCoreState(record.point) as Exclude<MeasureOptions['point'], false>) } : {}),
    ...(hasOwn(record, 'text') ? { text: cloneCoreState(record.text) as MeasureOptions['text'] } : {}),
    ...(hasOwn(record, 'showTotal') ? { showTotal: record.showTotal as MeasureOptions['showTotal'] } : {}),
    ...(hasOwn(record, 'policy') ? { policy: record.policy as MeasureOptions['policy'] } : {})
  };
}

/** 复制并冻结内部测量结果，形成公共只读快照。 */
function toPublicResult(result: InternalMeasureResult): MeasureResult {
  return freezeDeep({
    type: result.type,
    value: result.value,
    unit: result.unit,
    formatted: result.formatted,
    geometry: cloneCoreState(result.geometry) as ShapeState,
    coordinates: result.coordinates.map(cloneCoordinate),
    geographicCoordinates: result.geographicCoordinates.map(cloneCoordinate),
    segments: result.segments.map((segment) => ({
      start: cloneCoordinate(segment.start),
      end: cloneCoordinate(segment.end),
      startGeographic: cloneCoordinate(segment.startGeographic),
      endGeographic: cloneCoordinate(segment.endGeographic),
      value: segment.value,
      unit: segment.unit,
      formatted: segment.formatted
    }))
  });
}

/** 从普通对象中安全读取数据属性。 */
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

/** 判断对象是否直接拥有指定字段。 */
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 复制并冻结单个坐标。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return Object.freeze([...coordinate]) as Coordinate;
}

/** 递归冻结对象，循环引用只处理一次。 */
function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) freezeDeep(descriptor.value, seen);
  }
  return Object.freeze(value);
}
