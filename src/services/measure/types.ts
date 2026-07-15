import type { Coordinate } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { NativeRef } from '../../core/native/types.js';
import type { MeasurementPort } from '../../core/ports/MeasurementPort.js';
import type { ShapeState } from '../../core/shape/types.js';
import type { CircleSymbolSpec, StrokeSpec, TextSpec } from '../../core/style/types.js';
import type { InternalDrawService } from '../draw/types.js';
import type { InteractionPolicy, InteractionStatus } from '../events/types.js';
import type { OverlayService } from '../overlay/OverlayService.js';
import type { StyleService } from '../style/StyleService.js';

/** 测量结果使用的内部业务模块标识。 */
export const INTERNAL_MEASURE_MODULE = '@vrsim/measure';

/** 内部支持的测量方式。 */
export type InternalMeasureType = 'distance-segments' | 'distance-total' | 'distance-radial' | 'area';
/** 内部支持的测量单位。 */
export type InternalMeasureUnit = 'm' | 'km' | 'm²' | 'km²';

/** 启动测量会话时使用的内部配置。 */
export interface InternalMeasureOptions {
  /** 测量方式。 */
  readonly type: InternalMeasureType;
  /** 测量图形所属图层。 */
  readonly layerId?: string;
  /** 结果显示单位。 */
  readonly unit?: InternalMeasureUnit;
  /** 结果保留的小数位数。 */
  readonly precision?: number;
  /** 自定义结果格式化函数。 */
  readonly formatter?: (value: number, unit: InternalMeasureUnit) => string;
  /** 测量线样式。 */
  readonly line?: StrokeSpec;
  /** 测量控制点样式，传入 false 时隐藏。 */
  readonly point?: CircleSymbolSpec | false;
  /** 测量文字样式。 */
  readonly text?: Omit<TextSpec, 'text'>;
  /** 是否显示累计总值。 */
  readonly showTotal?: boolean;
  /** 与其他交互冲突时采用的策略。 */
  readonly policy?: InteractionPolicy;
}

/** 补齐默认值后的测量配置。 */
export interface NormalizedMeasureOptions {
  /** 测量方式。 */
  readonly type: InternalMeasureType;
  /** 测量图形所属图层。 */
  readonly layerId: string;
  /** 结果显示单位。 */
  readonly unit: InternalMeasureUnit;
  /** 结果保留的小数位数。 */
  readonly precision: number;
  /** 结果格式化函数。 */
  readonly formatter: (value: number, unit: InternalMeasureUnit) => string;
  /** 冻结后的测量线样式。 */
  readonly line: Readonly<StrokeSpec>;
  /** 冻结后的控制点样式或隐藏标记。 */
  readonly point: Readonly<CircleSymbolSpec> | false;
  /** 冻结后的文字样式。 */
  readonly text: Readonly<Omit<TextSpec, 'text'>>;
  /** 是否显示累计总值。 */
  readonly showTotal: boolean;
  /** 交互冲突策略。 */
  readonly policy: InteractionPolicy;
}

/** 单段距离测量结果。 */
export interface InternalMeasureSegmentResult {
  /** 线段起点的地图坐标。 */
  readonly start: Coordinate;
  /** 线段终点的地图坐标。 */
  readonly end: Coordinate;
  /** 线段起点的地理坐标。 */
  readonly startGeographic: Coordinate;
  /** 线段终点的地理坐标。 */
  readonly endGeographic: Coordinate;
  /** 标签显示位置。 */
  readonly anchor: Coordinate;
  /** 距离数值。 */
  readonly value: number;
  /** 距离单位。 */
  readonly unit: 'm' | 'km';
  /** 格式化后的距离文本。 */
  readonly formatted: string;
}

/** 一次测量计算得到的完整结果。 */
export interface InternalMeasureResult {
  /** 测量方式。 */
  readonly type: InternalMeasureType;
  /** 测量结果数值。 */
  readonly value: number;
  /** 测量结果单位。 */
  readonly unit: InternalMeasureUnit;
  /** 格式化后的结果文本。 */
  readonly formatted: string;
  /** 测量图形状态。 */
  readonly geometry: ShapeState;
  /** 总结果标签的显示位置。 */
  readonly anchor: Coordinate;
  /** 测量图形的地图坐标。 */
  readonly coordinates: readonly Coordinate[];
  /** 测量图形的地理坐标。 */
  readonly geographicCoordinates: readonly Coordinate[];
  /** 分段测量结果。 */
  readonly segments: readonly Readonly<InternalMeasureSegmentResult>[];
}

/** 测量会话可发出的内部事件。 */
export interface InternalMeasureSessionEventMap {
  /** 测量结果变化事件。 */
  readonly change: Readonly<{ type: 'change'; result: InternalMeasureResult }>;
  /** 测量完成事件。 */
  readonly complete: Readonly<{ type: 'complete'; result: InternalMeasureResult }>;
  /** 测量取消事件。 */
  readonly cancel: Readonly<{
    type: 'cancel';
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

/** Facade 与实现之间使用的测量会话契约。 */
export interface InternalMeasureSession {
  /** 会话当前状态。 */
  readonly status: InteractionStatus;
  /** 会话结束后解析最终测量结果。 */
  readonly finished: Promise<InternalMeasureResult | undefined>;
  /** 主动完成当前测量。 */
  finish(): void;
  /** 取消当前测量。 */
  cancel(): void;
  /** 销毁当前测量会话。 */
  destroy(): void;
  /** 订阅测量会话事件。 */
  on<K extends keyof InternalMeasureSessionEventMap>(type: K, listener: (event: InternalMeasureSessionEventMap[K]) => void): () => void;
}

/** 测量服务的内部契约。 */
export interface InternalMeasureService {
  /** 启动测量会话。 */
  start(options: InternalMeasureOptions): InternalMeasureSession;
  /** 清除测量服务创建的结果。 */
  clear(): void;
  /** 销毁测量服务。 */
  destroy(): void;
}

/** 创建并更新测量提示元素的端口。 */
export interface MeasurementTooltipPort {
  /** 创建提示元素引用。 */
  create(style: Readonly<Omit<TextSpec, 'text'>>): NativeRef<'element'>;
  /** 更新提示文本。 */
  setText(reference: NativeRef<'element'>, text: string): void;
  /** 释放提示元素引用。 */
  release(reference: NativeRef<'element'>): void;
}

/** 测量功能使用的 Overlay 服务子集。 */
export type MeasurementOverlayService = Pick<OverlayService, 'add' | 'remove'>;

/** 构造测量服务所需的依赖。 */
export interface MeasureServiceDependencies {
  /** 内部绘制服务。 */
  readonly draw: InternalDrawService;
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 样式服务。 */
  readonly styles: StyleService;
  /** 测量标签使用的 Overlay 服务。 */
  readonly overlays: MeasurementOverlayService;
  /** 负责测量计算的端口。 */
  readonly measurement: MeasurementPort;
  /** 负责创建测量提示的端口。 */
  readonly tooltips: MeasurementTooltipPort;
  /** 默认测量图层 ID。 */
  readonly defaultLayerId: string;
  /** 可选的结果 ID 生成器。 */
  readonly createId?: () => string;
  /** 可选的错误上报函数。 */
  readonly errorReporter?: import('../../core/ports/ErrorReporter.js').ErrorReporter;
}
