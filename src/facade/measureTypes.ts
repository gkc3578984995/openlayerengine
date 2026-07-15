import type { Coordinate } from '../core/common/types.js';
import type { ShapeState } from '../core/shape/types.js';
import type { CircleSymbolSpec, StrokeSpec, TextSpec } from '../core/style/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';

/** 可用测量类型。列出距离分段、距离总计、径向距离和面积测量。 */
export const measureTypes = Object.freeze(['distance-segments', 'distance-total', 'distance-radial', 'area'] as const);

/** 测量类型。 */
export type MeasureType = (typeof measureTypes)[number];

/** 测量会话的启动配置。 */
export interface MeasureOptions {
  /** 测量类型。指定本次会话采用的测量方式。 */
  readonly type: MeasureType;
  /** 目标图层。指定承载测量图形的矢量图层 ID。 */
  readonly layerId?: string;
  /** 结果单位。指定距离或面积结果使用的单位。 */
  readonly unit?: 'm' | 'km' | 'm²' | 'km²';
  /** 小数精度。指定默认格式化结果保留的小数位数。 */
  readonly precision?: number;
  /** 结果格式化器。自定义数值和单位的展示文本。 */
  readonly formatter?: (value: number, unit: MeasureResult['unit']) => string;
  /** 线样式。设置测量路径和边界的描边样式。 */
  readonly line?: StrokeSpec;
  /** 点样式。设置测量控制点样式，传入 `false` 时隐藏控制点。 */
  readonly point?: CircleSymbolSpec | false;
  /** 文本样式。设置测量提示和结果标签的文本外观。 */
  readonly text?: Omit<TextSpec, 'text' | 'rotateWithView' | 'overflow' | 'placement' | 'maxAngle' | 'repeat' | 'keepUpright'>;
  /** 总计标签。控制分段距离测量是否同时显示累计结果。 */
  readonly showTotal?: boolean;
  /** 冲突策略。使用 `replace` 替换旧交互，使用 `reject` 拒绝新交互。 */
  readonly policy?: InteractionPolicy;
}

/** 一次测量计算的只读结果。 */
export interface MeasureResult {
  /** 测量类型。表示产生本结果的测量方式。 */
  readonly type: MeasureType;
  /** 数值结果。提供使用结果单位表示的原始数值。 */
  readonly value: number;
  /** 结果单位。表示数值和格式化文本使用的单位。 */
  readonly unit: 'm' | 'km' | 'm²' | 'km²';
  /** 格式化文本。提供可直接展示的测量结果。 */
  readonly formatted: string;
  /** 测量几何。提供当前测量图形的语义几何快照。 */
  readonly geometry: ShapeState;
  /** 投影坐标。提供当前 Earth 投影下的测量坐标。 */
  readonly coordinates: readonly Coordinate[];
  /** 地理坐标。提供转换为经纬度的测量坐标。 */
  readonly geographicCoordinates: readonly Coordinate[];
  /** 分段结果。提供距离测量中每一段的明细。 */
  readonly segments: readonly Readonly<{
    /** 起点坐标。提供当前投影下的分段起点。 */
    start: Coordinate;
    /** 终点坐标。提供当前投影下的分段终点。 */
    end: Coordinate;
    /** 起点地理坐标。提供经纬度形式的分段起点。 */
    startGeographic: Coordinate;
    /** 终点地理坐标。提供经纬度形式的分段终点。 */
    endGeographic: Coordinate;
    /** 分段数值。提供使用分段单位表示的距离。 */
    value: number;
    /** 分段单位。表示分段数值使用米或千米。 */
    unit: 'm' | 'km';
    /** 分段文本。提供可直接展示的分段距离。 */
    formatted: string;
  }>[];
}

/** 测量会话的事件载荷映射。 */
export interface MeasureSessionEventMap {
  /** 变化事件。测量预览结果发生变化时触发。 */
  readonly change: Readonly<{
    /** 事件类型。固定为 `change`。 */
    type: 'change';
    /** 测量结果。提供当前预览的只读结果。 */
    result: MeasureResult;
  }>;
  /** 完成事件。测量结果被确认并提交时触发。 */
  readonly complete: Readonly<{
    /** 事件类型。固定为 `complete`。 */
    type: 'complete';
    /** 测量结果。提供最终确认的只读结果。 */
    result: MeasureResult;
  }>;
  /** 取消事件。测量会话未产生最终结果而结束时触发。 */
  readonly cancel: Readonly<{
    /** 事件类型。固定为 `cancel`。 */
    type: 'cancel';
    /** 取消原因。说明会话被替换、销毁、主动取消或异常终止的原因。 */
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

/** 一次测量交互的公开会话句柄。 */
export interface MeasureSession {
  /** 会话状态。表示会话当前处于活动、完成或取消状态。 */
  readonly status: InteractionStatus;
  /** 完成结果。成功完成时解析为测量结果，取消时解析为 `undefined`。 */
  readonly finished: Promise<MeasureResult | undefined>;
  /**
   * 尝试完成当前测量并结束会话。
   *
   * @returns 无返回值。
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
   * @returns 无返回值。
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
   * 订阅指定的测量会话事件。
   *
   * @typeParam K 事件类型。表示订阅事件名称的类型。
   * @param type 事件名称。指定要订阅的事件。
   * @param listener 监听函数。接收对应的只读事件载荷。
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

/** 测量能力的公开入口。 */
export interface MeasureService {
  /**
   * 启动一个测量会话。
   *
   * @param options 测量配置。指定测量类型、样式、单位和冲突策略。
   * @returns 已打开并处于活动状态的测量会话。
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
   * @returns 无返回值。
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
