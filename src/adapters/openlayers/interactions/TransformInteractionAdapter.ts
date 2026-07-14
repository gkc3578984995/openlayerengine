import type Map from 'ol/Map.js';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import PointerInteraction from 'ol/interaction/Pointer.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import type { Coordinate, Pixel } from '../../../core/common/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type {
  TransformCopyPreview,
  TransformDelta,
  TransformInteractionEvent,
  TransformInteractionHandle,
  TransformInteractionOptions,
  TransformInteractionPort,
  TransformInteractionTarget
} from '../../../core/ports/TransformInteractionPort.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';
import { HandleLayer, type TransformHandleHit } from '../transform/HandleLayer.js';
import { extentCenter } from '../transform/PreviewTransform.js';
import type { TransformHitTest } from '../transform/HitTest.js';

export interface TransformInteractionAdapterOptions {
  readonly errorReporter?: ErrorReporter;
}

export class TransformInteractionAdapter implements TransformInteractionPort {
  readonly #map: Map;
  readonly #hitTest: TransformHitTest;
  readonly #binding: FeatureBinding;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;

  constructor(map: Map, hitTest: TransformHitTest, binding: FeatureBinding, styles: StyleCompiler, options: TransformInteractionAdapterOptions = {}) {
    this.#map = map;
    this.#hitTest = hitTest;
    this.#binding = binding;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  open(sessionId: string, options: TransformInteractionOptions, listener: (event: TransformInteractionEvent) => void): TransformInteractionHandle {
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) throw new InvalidArgumentError('Transform session id must be a non-empty string');
    if (typeof listener !== 'function') throw new InvalidArgumentError('Transform interaction listener must be a function');
    const handle = new OpenLayersTransformHandle(this.#map, this.#hitTest, this.#binding, this.#styles, sessionId, options, listener, this.#errorReporter);
    try {
      handle.open();
      return handle;
    } catch (error) {
      handle.destroy();
      throw error;
    }
  }
}

interface DragState {
  readonly hit: TransformHandleHit;
  readonly start: Coordinate;
  readonly center: Coordinate;
  delta: TransformDelta;
}

type PointerMapEvent = MapBrowserEvent<PointerEvent | KeyboardEvent | WheelEvent>;

class OpenLayersTransformHandle implements TransformInteractionHandle {
  readonly #map: Map;
  readonly #hitTest: TransformHitTest;
  readonly #options: TransformInteractionOptions;
  readonly #listener: (event: TransformInteractionEvent) => void;
  readonly #errorReporter: ErrorReporter;
  readonly #handles: HandleLayer;
  readonly #interaction: PointerInteraction;
  readonly #keys: EventsKey[] = [];
  #target: TransformInteractionTarget | undefined;
  #drag: DragState | undefined;
  #hover: TransformHandleHit | undefined;
  #lastCoordinate: Coordinate | undefined;
  #copyAnchor: Coordinate | undefined;
  #copyDelta: Readonly<{ x: number; y: number }> = Object.freeze({ x: 0, y: 0 });
  #copyActive = false;
  #opened = false;
  #destroyed = false;

  constructor(
    map: Map,
    hitTest: TransformHitTest,
    binding: FeatureBinding,
    styles: StyleCompiler,
    sessionId: string,
    options: TransformInteractionOptions,
    listener: (event: TransformInteractionEvent) => void,
    errorReporter: ErrorReporter
  ) {
    this.#map = map;
    this.#hitTest = hitTest;
    this.#options = validateOptions(options);
    this.#listener = listener;
    this.#errorReporter = errorReporter;
    this.#handles = new HandleLayer(map, binding, styles, { sessionId, interaction: this.#options });
    this.#interaction = new PointerInteraction({
      handleDownEvent: (event) => this.#down(event),
      handleDragEvent: (event) => this.#dragEvent(event),
      handleUpEvent: (event) => this.#up(event),
      handleMoveEvent: (event) => this.#move(event),
      stopDown: (handled) => handled
    });
  }

  get renderLayerId(): string {
    return this.#handles.renderLayerId;
  }

  get renderTargetId(): string {
    return this.#handles.renderTargetId;
  }

  open(): void {
    this.#assertActive();
    if (this.#opened) throw new InvalidArgumentError('Transform interaction is already open');
    this.#map.addInteraction(this.#interaction);
    this.#keys.push(this.#map.on('singleclick', (event) => this.#selectAt(event.pixel)));
    this.#map.getViewport().addEventListener('contextmenu', this.#onContextMenu, true);
    this.#opened = true;
  }

  setTarget(target: TransformInteractionTarget): void {
    this.#assertOpen();
    this.#target = snapshotTarget(target);
    this.#drag = undefined;
    this.#handles.setTarget(this.#target);
  }

  clearTarget(): void {
    if (this.#destroyed) return;
    this.cancelCopyPreview();
    this.#leaveHover();
    this.#drag = undefined;
    this.#target = undefined;
    this.#handles.clearTarget();
  }

  startCopyPreview(preview: TransformCopyPreview): void {
    this.#assertOpen();
    this.#copyAnchor = this.#lastCoordinate ?? extentCenter(this.#handles.extent ?? [0, 0, 0, 0]);
    this.#copyDelta = Object.freeze({ x: 0, y: 0 });
    this.#copyActive = true;
    this.#handles.setCopyPreview(preview.geometry, preview.style);
  }

  cancelCopyPreview(): void {
    if (!this.#copyActive && this.#copyAnchor === undefined) return;
    this.#copyActive = false;
    this.#copyAnchor = undefined;
    this.#copyDelta = Object.freeze({ x: 0, y: 0 });
    this.#handles.clearCopyPreview();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#map.getViewport().removeEventListener('contextmenu', this.#onContextMenu, true);
    if (this.#keys.length > 0) unByKey(this.#keys.splice(0));
    if (this.#opened) this.#map.removeInteraction(this.#interaction);
    this.#interaction.setActive(false);
    this.#interaction.setMap(null);
    this.#handles.destroy();
    this.#interaction.dispose();
    this.#target = undefined;
    this.#drag = undefined;
    this.#hover = undefined;
    this.#opened = false;
  }

  #down(event: PointerMapEvent): boolean {
    this.#lastCoordinate = coordinate(event.coordinate);
    if (this.#copyActive) {
      if (!isPrimary(event)) return false;
      const delta = this.#copyDelta;
      this.cancelCopyPreview();
      this.#emit({ type: 'copy-preview-confirm', delta });
      return true;
    }
    if (!isPrimary(event) || this.#target === undefined) return false;
    const hit = this.#handles.hit(pixel(event.pixel), this.#options.hitTolerance);
    if (hit === undefined || !operationAllowed(this.#target, hit.operation)) return false;
    const center = this.#options.handleCenter ?? extentCenter(this.#handles.extent ?? [0, 0, 0, 0]);
    const start = coordinate(event.coordinate);
    const delta = initialDelta(hit, start, center);
    this.#drag = { hit, start, center, delta };
    this.#emit({ type: 'operation-start', operation: hit.operation, delta });
    return true;
  }

  #dragEvent(event: PointerMapEvent): void {
    const drag = this.#drag;
    if (drag === undefined) return;
    this.#lastCoordinate = coordinate(event.coordinate);
    drag.delta = this.#deltaFor(drag, this.#lastCoordinate);
    this.#emit({ type: 'operation-change', operation: drag.hit.operation, delta: drag.delta });
  }

  #up(event: PointerMapEvent): boolean {
    const drag = this.#drag;
    if (drag === undefined) return false;
    this.#lastCoordinate = coordinate(event.coordinate);
    drag.delta = this.#deltaFor(drag, this.#lastCoordinate);
    this.#drag = undefined;
    this.#emit({ type: 'operation-end', operation: drag.hit.operation, delta: drag.delta });
    return true;
  }

  #move(event: PointerMapEvent): void {
    const current = coordinate(event.coordinate);
    this.#lastCoordinate = current;
    if (this.#copyActive && this.#copyAnchor !== undefined) {
      this.#copyDelta = Object.freeze({ x: current[0] - this.#copyAnchor[0], y: current[1] - this.#copyAnchor[1] });
      this.#handles.updateCopyPreview(this.#copyDelta.x, this.#copyDelta.y);
      return;
    }
    const hit = this.#handles.hit(pixel(event.pixel), this.#options.hitTolerance);
    if (sameHit(hit, this.#hover)) return;
    this.#leaveHover();
    if (hit !== undefined) {
      this.#hover = hit;
      this.#emit({ type: 'enter-handle', key: hit.key, cursor: cursorFor(hit.operation) });
    }
  }

  #selectAt(rawPixel: readonly number[]): void {
    if (this.#destroyed || this.#copyActive || this.#drag !== undefined) return;
    const selectedPixel = pixel(rawPixel);
    const candidates = this.#hitTest.atPixel(selectedPixel, this.#options.hitTolerance).map(({ elementId }) => elementId);
    this.#emit({ type: 'select-request', pixel: selectedPixel, candidateIds: Object.freeze(candidates) });
  }

  #deltaFor(drag: DragState, current: Coordinate): TransformDelta {
    if (drag.hit.operation === 'translate') return Object.freeze({ type: 'translate', x: current[0] - drag.start[0], y: current[1] - drag.start[1] });
    if (drag.hit.operation === 'vertex') {
      if (drag.hit.index === undefined) throw new InvalidArgumentError('Transform vertex handle has no index');
      return Object.freeze({ type: 'vertex', index: drag.hit.index, coordinate: current });
    }
    if (drag.hit.operation === 'rotate') {
      const startAngle = Math.atan2(drag.start[1] - drag.center[1], drag.start[0] - drag.center[0]);
      const currentAngle = Math.atan2(current[1] - drag.center[1], current[0] - drag.center[0]);
      return Object.freeze({ type: 'rotate', angle: currentAngle - startAngle, center: drag.center });
    }
    const x = ratio(current[0] - drag.center[0], drag.start[0] - drag.center[0]);
    const y = ratio(current[1] - drag.center[1], drag.start[1] - drag.center[1]);
    let scaleX = drag.hit.axis === 'y' ? 1 : x;
    let scaleY = drag.hit.axis === 'x' ? 1 : y;
    if (this.#options.noFlip) {
      scaleX = Math.max(0.001, scaleX);
      scaleY = Math.max(0.001, scaleY);
    }
    if (drag.hit.operation === 'scale' && this.#options.keepRectangle && this.#target?.type === 'rectangle') {
      const magnitude = Math.max(Math.abs(scaleX), Math.abs(scaleY));
      scaleX = Math.sign(scaleX || 1) * magnitude;
      scaleY = Math.sign(scaleY || 1) * magnitude;
    }
    return Object.freeze({ type: drag.hit.operation, scaleX, scaleY, center: drag.center });
  }

  #leaveHover(): void {
    const hover = this.#hover;
    this.#hover = undefined;
    if (hover !== undefined) this.#emit({ type: 'leave-handle', key: hover.key, cursor: cursorFor(hover.operation) });
  }

  readonly #onContextMenu = (event: MouseEvent): void => {
    if (!this.#copyActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelCopyPreview();
    this.#emit({ type: 'copy-preview-cancel' });
  };

  #emit(event: TransformInteractionEvent): void {
    try {
      this.#listener(Object.freeze(event));
    } catch (error) {
      try {
        const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
          source: 'TransformInteractionAdapter',
          operation: `listener:${event.type}`
        });
        void Promise.resolve(result).catch(() => undefined);
      } catch {
        return;
      }
    }
  }

  #assertOpen(): void {
    this.#assertActive();
    if (!this.#opened) throw new ObjectDisposedError('Transform interaction is not open');
  }

  #assertActive(): void {
    if (this.#destroyed) throw new ObjectDisposedError('Transform interaction has been destroyed');
  }
}

function validateOptions(options: TransformInteractionOptions): TransformInteractionOptions {
  if (options === null || typeof options !== 'object') throw new InvalidArgumentError('Transform interaction options must be an object');
  if (!Number.isFinite(options.hitTolerance) || options.hitTolerance < 0) throw new InvalidArgumentError('Transform hitTolerance must be non-negative');
  if (!Number.isFinite(options.buffer) || options.buffer < 0) throw new InvalidArgumentError('Transform buffer must be non-negative');
  if (!Number.isFinite(options.pointRadius) || options.pointRadius <= 0) throw new InvalidArgumentError('Transform pointRadius must be positive');
  return Object.freeze({ ...options });
}

function snapshotTarget(target: TransformInteractionTarget): TransformInteractionTarget {
  return Object.freeze({
    ...target,
    controlPoints: Object.freeze(target.controlPoints.map(coordinate)),
    ...(target.style === undefined ? {} : { style: target.style })
  });
}

function operationAllowed(target: TransformInteractionTarget, operation: TransformHandleHit['operation']): boolean {
  if (operation === 'translate') return target.canTranslate;
  if (operation === 'rotate') return target.canRotate;
  if (operation === 'scale') return target.canScale;
  if (operation === 'stretch') return target.canStretch;
  return target.canEditVertices;
}

function initialDelta(hit: TransformHandleHit, start: Coordinate, center: Coordinate): TransformDelta {
  if (hit.operation === 'translate') return Object.freeze({ type: 'translate', x: 0, y: 0 });
  if (hit.operation === 'rotate') return Object.freeze({ type: 'rotate', angle: 0, center });
  if (hit.operation === 'vertex') {
    if (hit.index === undefined) throw new InvalidArgumentError('Transform vertex handle has no index');
    return Object.freeze({ type: 'vertex', index: hit.index, coordinate: start });
  }
  return Object.freeze({ type: hit.operation, scaleX: 1, scaleY: 1, center });
}

function coordinate(value: readonly number[]): Coordinate {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3) || value.some((item) => !Number.isFinite(item))) {
    throw new InvalidArgumentError('Transform coordinate must contain two or three finite numbers');
  }
  return Object.freeze([...value]) as Coordinate;
}

function pixel(value: readonly number[]): Pixel {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isFinite(item))) {
    throw new InvalidArgumentError('Transform pixel must contain two finite numbers');
  }
  return Object.freeze([value[0], value[1]]);
}

function ratio(numerator: number, denominator: number): number {
  return Math.abs(denominator) < Number.EPSILON ? 1 : numerator / denominator;
}

function isPrimary(event: PointerMapEvent): boolean {
  const native = event.originalEvent as Partial<PointerEvent>;
  return native.isPrimary !== false && native.button === 0;
}

function sameHit(left: TransformHandleHit | undefined, right: TransformHandleHit | undefined): boolean {
  return left?.key === right?.key;
}

function cursorFor(operation: TransformHandleHit['operation']): string {
  if (operation === 'translate' || operation === 'vertex') return 'move';
  if (operation === 'rotate') return 'crosshair';
  return 'nwse-resize';
}
