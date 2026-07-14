import type { Coordinate } from '../core/common/types.js';
import type { ShapeState } from '../core/shape/types.js';
import type { CircleSymbolSpec, StrokeSpec, TextSpec } from '../core/style/types.js';
import type { InteractionPolicy, InteractionStatus } from '../services/events/types.js';

export const measureTypes = Object.freeze(['distance-segments', 'distance-total', 'distance-radial', 'area'] as const);

export type MeasureType = (typeof measureTypes)[number];

export interface MeasureOptions {
  readonly type: MeasureType;
  readonly layerId?: string;
  readonly unit?: 'm' | 'km' | 'm²' | 'km²';
  readonly precision?: number;
  readonly formatter?: (value: number, unit: MeasureResult['unit']) => string;
  readonly line?: StrokeSpec;
  readonly point?: CircleSymbolSpec | false;
  readonly text?: Omit<TextSpec, 'text'>;
  readonly showTotal?: boolean;
  readonly policy?: InteractionPolicy;
}

export interface MeasureResult {
  readonly type: MeasureType;
  readonly value: number;
  readonly unit: 'm' | 'km' | 'm²' | 'km²';
  readonly formatted: string;
  readonly geometry: ShapeState;
  readonly coordinates: readonly Coordinate[];
  readonly geographicCoordinates: readonly Coordinate[];
  readonly segments: readonly Readonly<{
    start: Coordinate;
    end: Coordinate;
    startGeographic: Coordinate;
    endGeographic: Coordinate;
    value: number;
    unit: 'm' | 'km';
    formatted: string;
  }>[];
}

export interface MeasureSessionEventMap {
  readonly change: Readonly<{ type: 'change'; result: MeasureResult }>;
  readonly complete: Readonly<{ type: 'complete'; result: MeasureResult }>;
  readonly cancel: Readonly<{
    type: 'cancel';
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
}

export interface MeasureSession {
  readonly status: InteractionStatus;
  readonly finished: Promise<MeasureResult | undefined>;
  finish(): void;
  cancel(): void;
  on<K extends keyof MeasureSessionEventMap>(type: K, listener: (event: MeasureSessionEventMap[K]) => void): () => void;
}

export interface MeasureService {
  start(options: MeasureOptions): MeasureSession;
  clear(): void;
}
