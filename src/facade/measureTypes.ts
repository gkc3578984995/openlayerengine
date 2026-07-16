import type { Coordinate } from '../core/common/types.js';
import type { ShapeState } from '../core/shape/types.js';
import type { CircleSymbolSpec, StrokeSpec, TextSpec } from '../core/style/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';

/** 引擎内置的分段距离、总距离、径向距离和面积测量类型。 */
export const measureTypes = Object.freeze(['distance-segments', 'distance-total', 'distance-radial', 'area'] as const);

/** 测量类型。 */
export type MeasureType = (typeof measureTypes)[number];

/** Measure Session 的启动配置。 */
export interface MeasureOptions {
  /** 本次 Session 采用的测量方式。 */
  readonly type: MeasureType;
  /** 承载测量图形的矢量图层 ID。 */
  readonly layerId?: string;
  /** 距离或面积结果的单位。 */
  readonly unit?: 'm' | 'km' | 'm²' | 'km²';
  /** 默认格式化结果保留的小数位数。 */
  readonly precision?: number;
  /** 将数值和单位格式化为展示文本。 */
  readonly formatter?: (value: number, unit: MeasureResult['unit']) => string;
  /** 测量路径和边界的描边样式。 */
  readonly line?: StrokeSpec;
  /** 测量控制点样式；传入 `false` 时隐藏控制点。 */
  readonly point?: CircleSymbolSpec | false;
  /** 测量提示和结果标签的文本样式。 */
  readonly text?: Omit<TextSpec, 'text' | 'rotateWithView' | 'overflow' | 'placement' | 'maxAngle' | 'repeat' | 'keepUpright'>;
  /** 分段距离测量是否同时显示累计结果。 */
  readonly showTotal?: boolean;
  /** 交互冲突策略：`replace` 替换旧交互，`reject` 拒绝新交互。 */
  readonly policy?: InteractionPolicy;
}

/** 一次测量计算的只读结果。 */
export interface MeasureResult {
  /** 产生本结果的测量方式。 */
  readonly type: MeasureType;
  /** 按 `unit` 表示的原始数值。 */
  readonly value: number;
  /** `value` 和 `formatted` 使用的单位。 */
  readonly unit: 'm' | 'km' | 'm²' | 'km²';
  /** 可直接展示的测量结果文本。 */
  readonly formatted: string;
  /** 当前测量图形的语义几何快照。 */
  readonly geometry: ShapeState;
  /** 当前 Earth 投影下的测量坐标。 */
  readonly coordinates: readonly Coordinate[];
  /** 换算为经纬度后的测量坐标。 */
  readonly geographicCoordinates: readonly Coordinate[];
  /** 距离测量的逐段明细；面积测量中为空。 */
  readonly segments: readonly Readonly<{
    /** 当前投影下的分段起点。 */
    start: Coordinate;
    /** 当前投影下的分段终点。 */
    end: Coordinate;
    /** 经纬度形式的分段起点。 */
    startGeographic: Coordinate;
    /** 经纬度形式的分段终点。 */
    endGeographic: Coordinate;
    /** 按 `unit` 表示的分段距离。 */
    value: number;
    /** 分段距离使用的米或千米单位。 */
    unit: 'm' | 'km';
    /** 可直接展示的分段距离文本。 */
    formatted: string;
  }>[];
}

/** Measure Session 的事件载荷映射。 */
export interface MeasureSessionEventMap {
  /** 变化事件。测量预览结果发生变化时触发。 */
  readonly change: Readonly<{
    /** 固定为 `change`。 */
    type: 'change';
    /** 当前预览的只读测量结果。 */
    result: MeasureResult;
  }>;
  /** 完成事件。测量结果被确认并提交时触发。 */
  readonly complete: Readonly<{
    /** 固定为 `complete`。 */
    type: 'complete';
    /** 最终确认的只读测量结果。 */
    result: MeasureResult;
  }>;
  /** 取消事件。Measure Session 未产生最终结果而结束时触发。 */
  readonly cancel: Readonly<{
    /** 固定为 `cancel`。 */
    type: 'cancel';
    /** Session 被替换、销毁、主动取消或异常终止的具体原因。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

/** 一次测量交互的公共 Session 句柄。 */
export interface MeasureSession {
  /** Session 当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 成功完成时解析为测量结果，取消时解析为 `undefined`。 */
  readonly finished: Promise<MeasureResult | undefined>;
  /**
   * 尝试完成当前测量并结束 Session。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.measure.start({ type: 'distance-total' });
   * session.finish();
   * ```
   */
  finish(): void;
  /**
   * 取消当前测量并丢弃未完成结果。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.measure.start({ type: 'area' });
   * session.cancel();
   * ```
   */
  cancel(): void;
  /**
   * 订阅指定的 Measure Session 事件。
   *
   * @typeParam K 要订阅的事件名称类型。
   * @param type 事件名称。
   * @param listener 接收对应只读载荷的监听函数。
   * @returns 用于取消本次订阅的幂等函数。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.measure.start({ type: 'distance-total' });
   * const off = session.on('change', ({ result }) => console.log(result.formatted));
   * off();
   * ```
   */
  on<K extends keyof MeasureSessionEventMap>(type: K, listener: (event: MeasureSessionEventMap[K]) => void): () => void;
}

/** 距离与面积测量的公开服务。 */
export interface MeasureService {
  /**
   * 启动 Measure Session。
   *
   * @param options 测量类型、样式、单位和交互冲突策略。
   * @returns 已打开且处于活动状态的 Measure Session。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const session = earth.measure.start({ type: 'area', unit: 'km²' });
   * ```
   */
  start(options: MeasureOptions): MeasureSession;
  /**
   * 清除测量服务创建的全部图形和提示。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.measure.clear();
   * ```
   */
  clear(): void;
}
