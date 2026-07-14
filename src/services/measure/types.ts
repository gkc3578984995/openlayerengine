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

export const INTERNAL_MEASURE_MODULE = '@vrsim/measure';

export type InternalMeasureType = 'distance-segments' | 'distance-total' | 'distance-radial' | 'area';
export type InternalMeasureUnit = 'm' | 'km' | 'm²' | 'km²';

export interface InternalMeasureOptions {
  readonly type: InternalMeasureType;
  readonly layerId?: string;
  readonly unit?: InternalMeasureUnit;
  readonly precision?: number;
  readonly formatter?: (value: number, unit: InternalMeasureUnit) => string;
  readonly line?: StrokeSpec;
  readonly point?: CircleSymbolSpec | false;
  readonly text?: Omit<TextSpec, 'text'>;
  readonly showTotal?: boolean;
  readonly policy?: InteractionPolicy;
}

export interface NormalizedMeasureOptions {
  readonly type: InternalMeasureType;
  readonly layerId: string;
  readonly unit: InternalMeasureUnit;
  readonly precision: number;
  readonly formatter: (value: number, unit: InternalMeasureUnit) => string;
  readonly line: Readonly<StrokeSpec>;
  readonly point: Readonly<CircleSymbolSpec> | false;
  readonly text: Readonly<Omit<TextSpec, 'text'>>;
  readonly showTotal: boolean;
  readonly policy: InteractionPolicy;
}

export interface InternalMeasureSegmentResult {
  readonly start: Coordinate;
  readonly end: Coordinate;
  readonly startGeographic: Coordinate;
  readonly endGeographic: Coordinate;
  readonly anchor: Coordinate;
  readonly value: number;
  readonly unit: 'm' | 'km';
  readonly formatted: string;
}

export interface InternalMeasureResult {
  readonly type: InternalMeasureType;
  readonly value: number;
  readonly unit: InternalMeasureUnit;
  readonly formatted: string;
  readonly geometry: ShapeState;
  readonly anchor: Coordinate;
  readonly coordinates: readonly Coordinate[];
  readonly geographicCoordinates: readonly Coordinate[];
  readonly segments: readonly Readonly<InternalMeasureSegmentResult>[];
}

export interface InternalMeasureSessionEventMap {
  readonly change: Readonly<{ type: 'change'; result: InternalMeasureResult }>;
  readonly complete: Readonly<{ type: 'complete'; result: InternalMeasureResult }>;
  readonly cancel: Readonly<{
    type: 'cancel';
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

export interface InternalMeasureSession {
  readonly status: InteractionStatus;
  readonly finished: Promise<InternalMeasureResult | undefined>;
  finish(): void;
  cancel(): void;
  destroy(): void;
  on<K extends keyof InternalMeasureSessionEventMap>(type: K, listener: (event: InternalMeasureSessionEventMap[K]) => void): () => void;
}

export interface InternalMeasureService {
  start(options: InternalMeasureOptions): InternalMeasureSession;
  clear(): void;
  destroy(): void;
}

export interface MeasurementTooltipPort {
  create(style: Readonly<Omit<TextSpec, 'text'>>): NativeRef<'element'>;
  setText(reference: NativeRef<'element'>, text: string): void;
  release(reference: NativeRef<'element'>): void;
}

export type MeasurementOverlayService = Pick<OverlayService, 'add' | 'remove'>;

export interface MeasureServiceDependencies {
  readonly draw: InternalDrawService;
  readonly store: ElementStore;
  readonly styles: StyleService;
  readonly overlays: MeasurementOverlayService;
  readonly measurement: MeasurementPort;
  readonly tooltips: MeasurementTooltipPort;
  readonly defaultLayerId: string;
  readonly createId?: () => string;
  readonly errorReporter?: import('../../core/ports/ErrorReporter.js').ErrorReporter;
}
