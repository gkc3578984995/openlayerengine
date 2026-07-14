import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { NativeRef } from '../../core/native/types.js';
import type { MeasurementPort, MeasurementSegment } from '../../core/ports/MeasurementPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ShapeState } from '../../core/shape/types.js';
import type { ElementStyleState } from '../../core/style/types.js';
import type { InternalDrawSession, InternalDrawSessionEventMap } from '../draw/types.js';
import type { InteractionStatus } from '../events/types.js';
import type { OverlayHandle } from '../overlay/OverlayHandle.js';
import type { StyleService } from '../style/StyleService.js';
import {
  INTERNAL_MEASURE_MODULE,
  type InternalMeasureResult,
  type InternalMeasureSegmentResult,
  type InternalMeasureSession,
  type InternalMeasureSessionEventMap,
  type InternalMeasureUnit,
  type MeasurementOverlayService,
  type MeasurementTooltipPort,
  type NormalizedMeasureOptions
} from './types.js';

export interface MeasureSessionDependencies {
  readonly drawSession: InternalDrawSession;
  readonly store: ElementStore;
  readonly styles: StyleService;
  readonly overlays: MeasurementOverlayService;
  readonly measurement: MeasurementPort;
  readonly tooltips: MeasurementTooltipPort;
  readonly options: NormalizedMeasureOptions;
  readonly createId: () => string;
  readonly errorReporter?: ErrorReporter;
  readonly onTerminal: () => void;
}

interface TooltipRecord {
  readonly reference: NativeRef<'element'>;
  readonly handle: OverlayHandle;
}

interface TooltipLabel {
  readonly text: string;
  readonly position: Coordinate;
}

export class MeasureSession implements InternalMeasureSession {
  readonly #drawSession: InternalDrawSession;
  readonly #store: ElementStore;
  readonly #styles: StyleService;
  readonly #overlays: MeasurementOverlayService;
  readonly #measurement: MeasurementPort;
  readonly #tooltips: MeasurementTooltipPort;
  readonly #options: NormalizedMeasureOptions;
  readonly #createId: () => string;
  readonly #errorReporter: ErrorReporter;
  readonly #onTerminal: () => void;
  readonly #listeners = new Map<keyof InternalMeasureSessionEventMap, Map<number, (event: never) => void>>();
  readonly #subscriptions: Array<() => void> = [];
  readonly #tooltipsByIndex: TooltipRecord[] = [];
  readonly #previewIds = new Set<string>();
  #nextListenerId = 0;
  #status: InteractionStatus = 'active';
  #terminalNotified = false;
  #resolveFinished!: (result: InternalMeasureResult | undefined) => void;
  readonly finished: Promise<InternalMeasureResult | undefined>;

  constructor(dependencies: MeasureSessionDependencies) {
    this.#drawSession = dependencies.drawSession;
    this.#store = dependencies.store;
    this.#styles = dependencies.styles;
    this.#overlays = dependencies.overlays;
    this.#measurement = dependencies.measurement;
    this.#tooltips = dependencies.tooltips;
    this.#options = dependencies.options;
    this.#createId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#onTerminal = dependencies.onTerminal;
    this.finished = new Promise((resolve) => {
      this.#resolveFinished = resolve;
    });
    try {
      this.#subscriptions.push(
        this.#drawSession.on('change', (event) => this.#handleChange(event)),
        this.#drawSession.on('complete', (event) => this.#handleComplete(event)),
        this.#drawSession.on('cancel', (event) => this.#handleCancel(event.reason))
      );
    } catch (error) {
      this.#drawSession.destroy();
      this.#handleCancel('error');
      throw error;
    }
  }

  get status(): InteractionStatus {
    return this.#status;
  }

  finish(): void {
    if (this.#status !== 'active') return;
    this.#drawSession.finish();
    if (this.#status === 'active' && this.#drawSession.status !== 'active') this.#handleCancel('incomplete');
  }

  cancel(): void {
    if (this.#status !== 'active') return;
    this.#drawSession.cancel();
    if (this.#status === 'active') this.#handleCancel('cancelled');
  }

  destroy(): void {
    if (this.#status === 'active') {
      this.#drawSession.destroy();
      if (this.#status === 'active') this.#handleCancel('destroyed');
    } else {
      this.#cleanupSubscriptions();
    }
  }

  on<K extends keyof InternalMeasureSessionEventMap>(type: K, listener: (event: InternalMeasureSessionEventMap[K]) => void): () => void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Measure session has finished');
    if (!['change', 'complete', 'cancel'].includes(type)) throw new InvalidArgumentError(`Unknown Measure session event: ${String(type)}`);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Measure session listener must be a function');
    let listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      listeners = new Map();
      this.#listeners.set(type, listeners);
    }
    const id = ++this.#nextListenerId;
    listeners.set(id, listener as (event: never) => void);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#listeners.get(type);
      current?.delete(id);
      if (current?.size === 0) this.#listeners.delete(type);
    };
  }

  #handleChange(event: InternalDrawSessionEventMap['change']): void {
    if (this.#status !== 'active') return;
    try {
      const result = this.#calculate(event.geometry);
      if (result === undefined) return;
      this.#syncPreview(result);
      this.#syncTooltips(result);
      this.#emit('change', freeze({ type: 'change', result }));
    } catch (error) {
      this.#report(error, 'change');
    }
  }

  #handleComplete(event: InternalDrawSessionEventMap['complete']): void {
    if (this.#status !== 'active') return;
    try {
      const result = this.#calculate(event.state.geometry);
      if (result === undefined) throw new InvalidArgumentError('Completed measurement has insufficient geometry');
      this.#syncTooltips(result);
      this.#commitResult(result);
      this.#status = 'finished';
      this.#emit('complete', freeze({ type: 'complete', result }));
      this.#resolveFinished(result);
      this.#tooltipsByIndex.length = 0;
      this.#cleanupSubscriptions();
      this.#listeners.clear();
      this.#notifyTerminal();
    } catch (error) {
      this.#report(error, 'complete');
      this.#drawSession.cancel();
      if (this.#status === 'active') this.#handleCancel('error');
    }
  }

  #handleCancel(reason: InternalMeasureSessionEventMap['cancel']['reason']): void {
    if (this.#status !== 'active') return;
    this.#status = 'cancelled';
    this.#removePreview();
    this.#destroyTooltips();
    this.#emit('cancel', freeze({ type: 'cancel', reason }));
    this.#resolveFinished(undefined);
    this.#cleanupSubscriptions();
    this.#listeners.clear();
    this.#notifyTerminal();
  }

  #calculate(geometry: ShapeState): InternalMeasureResult | undefined {
    if (this.#options.type === 'area') {
      if (geometry.type !== 'polygon') throw new InvalidArgumentError('Area measurement requires polygon geometry');
      const coordinates = cloneCoordinates(geometry.controlPoints);
      const surface = this.#measurement.measureArea(coordinates);
      if (surface === undefined) return undefined;
      const boundaryCoordinates = closeCoordinates(coordinates);
      const boundary = this.#measurement.measureLine(boundaryCoordinates, 'path');
      const segmentUnit = this.#options.unit === 'km²' ? 'km' : 'm';
      const segments = boundary === undefined ? [] : boundary.segments.map((segment) => this.#segmentResult(segment, segmentUnit));
      const value = convertAndRound(surface.squareMeters, this.#options.unit, this.#options.precision);
      return freezeDeep({
        type: this.#options.type,
        value,
        unit: this.#options.unit,
        formatted: this.#options.formatter(value, this.#options.unit),
        geometry: freezeDeep(cloneCoreState(geometry)),
        anchor: cloneCoordinate(surface.anchor),
        coordinates,
        geographicCoordinates: cloneCoordinates(surface.verticesGeographic),
        segments: Object.freeze(segments)
      });
    }

    if (geometry.type !== 'polyline') throw new InvalidArgumentError('Distance measurement requires polyline geometry');
    const coordinates = cloneCoordinates(geometry.controlPoints);
    const line = this.#measurement.measureLine(coordinates, this.#options.type === 'distance-radial' ? 'radial' : 'path');
    if (line === undefined) return undefined;
    const unit = this.#options.unit as 'm' | 'km';
    const segments = line.segments.map((segment) => this.#segmentResult(segment, unit));
    const value = convertAndRound(line.meters, unit, this.#options.precision);
    return freezeDeep({
      type: this.#options.type,
      value,
      unit,
      formatted: this.#options.formatter(value, unit),
      geometry: freezeDeep(cloneCoreState(geometry)),
      anchor: cloneCoordinate(line.anchor),
      coordinates,
      geographicCoordinates: geographicCoordinates(segments, coordinates),
      segments: Object.freeze(segments)
    });
  }

  #segmentResult(segment: MeasurementSegment, unit: 'm' | 'km'): InternalMeasureSegmentResult {
    const value = convertAndRound(segment.meters, unit, this.#options.precision);
    return freezeDeep({
      start: cloneCoordinate(segment.start),
      end: cloneCoordinate(segment.end),
      startGeographic: cloneCoordinate(segment.startGeographic),
      endGeographic: cloneCoordinate(segment.endGeographic),
      anchor: cloneCoordinate(segment.anchor),
      value,
      unit,
      formatted: this.#options.formatter(value, unit)
    });
  }

  #syncPreview(result: InternalMeasureResult): void {
    const states = this.#geometryStates(result, false);
    const previous = [...this.#previewIds];
    this.#store.transaction((transaction) => {
      if (previous.length > 0) transaction.remove({ ids: previous });
      for (const state of states) transaction.add(state);
    });
    this.#previewIds.clear();
    for (const state of states) this.#previewIds.add(state.id);
  }

  #commitResult(result: InternalMeasureResult): void {
    const states = [...this.#geometryStates(result, true), ...this.#pointStates(result.coordinates)];
    const previous = [...this.#previewIds];
    this.#store.transaction((transaction) => {
      if (previous.length > 0) transaction.remove({ ids: previous });
      for (const state of states) transaction.add(state);
    });
    this.#previewIds.clear();
  }

  #geometryStates(result: InternalMeasureResult, final: boolean): ElementState[] {
    const style = this.#shapeStyle(result.type === 'area');
    if (result.type !== 'distance-radial') {
      return [this.#state(result.geometry, style, final ? 'result' : 'preview')];
    }
    return result.segments.map((segment, index) =>
      this.#state({ type: 'polyline', controlPoints: [segment.start, segment.end] }, style, `${final ? 'result' : 'preview'}-ray-${index}`)
    );
  }

  #pointStates(coordinates: readonly Coordinate[]): ElementState[] {
    const point = this.#options.point;
    if (point === false) return [];
    return uniqueCoordinates(coordinates).map((coordinate, index) =>
      this.#state({ type: 'point', controlPoints: [coordinate] }, this.#styles.clone({ symbol: cloneCoreState(point) }), `point-${index}`)
    );
  }

  #state(geometry: ShapeState, style: ElementStyleState, suffix: string): ElementState {
    const id = this.#createId();
    if (typeof id !== 'string' || id.trim().length === 0) throw new InvalidArgumentError('Generated measure element id must be a non-empty string');
    return freezeDeep({
      id,
      type: geometry.type,
      geometry: freezeDeep(cloneCoreState(geometry)),
      style: this.#styles.clone(style),
      data: freeze({ measure: this.#options.type, role: suffix }),
      module: INTERNAL_MEASURE_MODULE,
      layerId: this.#options.layerId,
      visible: true
    });
  }

  #shapeStyle(area: boolean): ElementStyleState {
    return this.#styles.clone({
      strokes: [cloneCoreState(this.#options.line)],
      ...(area ? { fill: { type: 'solid' as const, color: 'rgba(255, 204, 51, 0.15)' } } : {})
    });
  }

  #syncTooltips(result: InternalMeasureResult): void {
    const labels = tooltipLabels(result, this.#options.showTotal);
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index];
      let record = this.#tooltipsByIndex[index];
      if (record === undefined) {
        const reference = this.#tooltips.create(this.#options.text);
        try {
          this.#tooltips.setText(reference, label.text);
          const handle = this.#overlays.add({
            elementRef: reference,
            position: label.position,
            offset: [0, -12],
            positioning: 'bottom-center',
            stopEvent: false,
            className: 'ol-engine-measure-tooltip',
            module: INTERNAL_MEASURE_MODULE,
            ownership: 'earth'
          });
          record = { reference, handle };
          this.#tooltipsByIndex[index] = record;
        } catch (error) {
          try {
            this.#tooltips.release(reference);
          } catch {
            undefined;
          }
          throw error;
        }
      } else {
        this.#tooltips.setText(record.reference, label.text);
        record.handle.setPosition(label.position);
      }
    }
    while (this.#tooltipsByIndex.length > labels.length) {
      const record = this.#tooltipsByIndex.pop();
      if (record !== undefined) this.#destroyTooltip(record);
    }
  }

  #removePreview(): void {
    const ids = [...this.#previewIds];
    this.#previewIds.clear();
    if (ids.length === 0) return;
    try {
      this.#store.remove({ ids });
    } catch (error) {
      this.#report(error, 'preview-cleanup');
    }
  }

  #destroyTooltips(): void {
    for (const record of this.#tooltipsByIndex.splice(0)) this.#destroyTooltip(record);
  }

  #destroyTooltip(record: TooltipRecord): void {
    try {
      record.handle.destroy();
    } catch (error) {
      this.#report(error, 'tooltip-destroy');
      try {
        this.#tooltips.release(record.reference);
      } catch (releaseError) {
        this.#report(releaseError, 'tooltip-release');
      }
    }
  }

  #cleanupSubscriptions(): void {
    const subscriptions = this.#subscriptions.splice(0);
    if (subscriptions.length === 0) return;
    try {
      runFinalizers(subscriptions);
    } catch (error) {
      this.#report(error, 'subscriptions');
    }
  }

  #emit<K extends keyof InternalMeasureSessionEventMap>(type: K, event: InternalMeasureSessionEventMap[K]): void {
    const ids = [...(this.#listeners.get(type)?.keys() ?? [])];
    for (const id of ids) {
      const listener = this.#listeners.get(type)?.get(id);
      if (listener === undefined) continue;
      try {
        const result = listener(event as never) as unknown;
        void Promise.resolve(result).catch((error: unknown) => this.#report(error, `listener:${type}`));
      } catch (error) {
        this.#report(error, `listener:${type}`);
      }
    }
  }

  #notifyTerminal(): void {
    if (this.#terminalNotified) return;
    this.#terminalNotified = true;
    try {
      this.#onTerminal();
    } catch (error) {
      this.#report(error, 'terminal');
    }
  }

  #report(error: unknown, operation: string): void {
    try {
      const result = this.#errorReporter(error, { source: 'MeasureSession', operation });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      undefined;
    }
  }
}

function tooltipLabels(result: InternalMeasureResult, showTotal: boolean): TooltipLabel[] {
  const labels: TooltipLabel[] = [];
  if (result.type === 'distance-segments' || result.type === 'distance-radial' || result.type === 'area') {
    for (const segment of result.segments) labels.push({ text: segment.formatted, position: segment.anchor });
  }
  if (showTotal) labels.push({ text: result.formatted, position: result.anchor });
  return labels;
}

function geographicCoordinates(segments: readonly InternalMeasureSegmentResult[], coordinates: readonly Coordinate[]): readonly Coordinate[] {
  if (segments.length === 0) return Object.freeze([]);
  if (segments[0].start[0] === coordinates[0][0] && segments[0].start[1] === coordinates[0][1]) {
    return Object.freeze([cloneCoordinate(segments[0].startGeographic), ...segments.map(({ endGeographic }) => cloneCoordinate(endGeographic))]);
  }
  return Object.freeze(segments.flatMap(({ startGeographic, endGeographic }) => [cloneCoordinate(startGeographic), cloneCoordinate(endGeographic)]));
}

function convertAndRound(value: number, unit: InternalMeasureUnit, precision: number): number {
  const converted = unit === 'km' ? value / 1_000 : unit === 'km²' ? value / 1_000_000 : value;
  const factor = 10 ** precision;
  const rounded = Math.round(converted * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function closeCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  if (coordinates.length === 0) return [];
  const result = cloneCoordinates(coordinates);
  const first = result[0];
  const last = result[result.length - 1];
  if (first.length !== last.length || first.some((value, index) => value !== last[index])) result.push(cloneCoordinate(first));
  return result;
}

function uniqueCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  const seen = new Set<string>();
  const result: Coordinate[] = [];
  for (const coordinate of coordinates) {
    const key = coordinate.join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cloneCoordinate(coordinate));
  }
  return result;
}

function cloneCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  return coordinates.map(cloneCoordinate);
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return Object.freeze([...coordinate]) as Coordinate;
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) freezeDeep(descriptor.value, seen);
  }
  return Object.freeze(value);
}
