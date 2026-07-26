import type Map from 'ol/Map.js';
import type { Coordinate } from '../../core/common/types.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError, PrintError } from '../../core/errors.js';
import type { CursorPort, CursorViewHandle } from '../../core/ports/CursorPort.js';
import type { InteractionCoordinator } from '../../services/events/InteractionCoordinator.js';
import type { ContextMenuDecision, ExclusiveInteractionSession, InteractionCancelReason, InteractionPolicy } from '../../services/events/types.js';
import { printPixelToCoordinate, readPrintViewTransform } from './PrintCoordinateTransform.js';

export interface PrintBoxSelectionRequest {
  readonly aspectRatio: number;
  readonly fixedSizeCssPixels?: readonly [width: number, height: number];
  readonly onChange?: (result: Readonly<PrintBoxSelectionResult>) => void;
  readonly policy?: InteractionPolicy;
  readonly signal?: AbortSignal;
}

export interface PrintBoxSelectionResult {
  readonly sourceExtent: readonly [number, number, number, number];
  readonly footprint: readonly [Coordinate, Coordinate, Coordinate, Coordinate];
  readonly center: Coordinate;
  readonly rotation: number;
}

interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 在活动地图上显示来源框、成品框和外遮罩，并把框选结果转换为 View 坐标。 */
export class PrintBoxSelectionAdapter {
  readonly #map: Map;
  readonly #viewport: HTMLElement;
  readonly #coordinator: InteractionCoordinator;
  readonly #cursor: CursorPort;
  #active: BoxSelectionSession | undefined;
  #disposed = false;

  constructor(map: Map, viewport: HTMLElement, coordinator: InteractionCoordinator, cursor: CursorPort) {
    this.#map = map;
    this.#viewport = viewport;
    this.#coordinator = coordinator;
    this.#cursor = cursor;
  }

  select(request: PrintBoxSelectionRequest): Promise<Readonly<PrintBoxSelectionResult>> {
    if (this.#disposed) throw new ObjectDisposedError('打印框选适配器已销毁。');
    assertRequest(request);
    assertFixedSizeFitsViewport(request, this.#viewport);
    this.#active?.cancel('replaced');
    const session = new BoxSelectionSession(this.#map, this.#viewport, this.#coordinator, this.#cursor, request, () => {
      if (this.#active === session) this.#active = undefined;
    });
    try {
      this.#coordinator.activate(session, request.policy ?? 'replace');
      this.#active = session;
      return session.start();
    } catch (error) {
      try {
        session.cancel('cancelled');
      } catch {
        // 保留启动失败的原始异常；下方仍会强制释放协调器所有权。
      }
      this.#coordinator.release(session);
      if (this.#active === session) this.#active = undefined;
      throw error;
    }
  }

  cancel(): void {
    this.#active?.cancel('cancelled');
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#active?.cancel('destroyed');
    this.#active = undefined;
  }
}

class BoxSelectionSession implements ExclusiveInteractionSession {
  readonly #map: Map;
  readonly #viewport: HTMLElement;
  readonly #coordinator: InteractionCoordinator;
  readonly #cursorPort: CursorPort;
  readonly #request: PrintBoxSelectionRequest;
  readonly #onEnd: () => void;
  readonly #root: HTMLDivElement;
  readonly #box: HTMLDivElement;
  readonly #outputBox: HTMLDivElement;
  readonly #masks: readonly HTMLDivElement[];
  #cursor: CursorViewHandle | undefined;
  #resolve: ((value: Readonly<PrintBoxSelectionResult>) => void) | undefined;
  #reject: ((reason: unknown) => void) | undefined;
  #started = false;
  #ended = false;
  #dragging = false;
  #pointerId: number | undefined;
  #origin: readonly [number, number] | undefined;
  #pending: readonly [number, number] | undefined;
  #frame: number | ReturnType<typeof globalThis.setTimeout> = 0;
  #rect: ScreenRect | undefined;

  constructor(map: Map, viewport: HTMLElement, coordinator: InteractionCoordinator, cursor: CursorPort, request: PrintBoxSelectionRequest, onEnd: () => void) {
    this.#map = map;
    this.#viewport = viewport;
    this.#coordinator = coordinator;
    this.#cursorPort = cursor;
    this.#request = request;
    this.#onEnd = onEnd;
    this.#root = document.createElement('div');
    this.#root.className = 'ol-print-selection-overlay';
    this.#root.setAttribute('aria-hidden', 'true');
    this.#box = document.createElement('div');
    this.#box.className = 'ol-print-selection-box';
    this.#outputBox = document.createElement('div');
    this.#outputBox.className = 'ol-print-selection-output';
    this.#masks = Object.freeze(
      ['top', 'right', 'bottom', 'left'].map((position) => {
        const mask = document.createElement('div');
        mask.className = `ol-print-selection-mask ol-print-selection-mask--${position}`;
        this.#root.append(mask);
        return mask;
      })
    );
    this.#root.append(this.#outputBox, this.#box);
  }

  start(): Promise<Readonly<PrintBoxSelectionResult>> {
    if (this.#started) throw new InvalidArgumentError('打印框选已经启动。');
    this.#started = true;
    try {
      this.#viewport.append(this.#root);
      this.#cursor = this.#cursorPort.open();
      this.#cursor.set('crosshair');
      this.#viewport.addEventListener('pointerdown', this.#onPointerDown, true);
      this.#viewport.addEventListener('pointermove', this.#onPointerMove, true);
      this.#viewport.addEventListener('pointerup', this.#onPointerUp, true);
      this.#viewport.addEventListener('pointercancel', this.#onPointerCancel, true);
      document.addEventListener('keydown', this.#onKeyDown, true);
      this.#request.signal?.addEventListener('abort', this.#onAbort, { once: true });
      if (this.#request.signal?.aborted === true) this.cancel('cancelled');
      return new Promise((resolve, reject) => {
        this.#resolve = resolve;
        this.#reject = reject;
        if (this.#ended) reject(cancelledError());
      });
    } catch (error) {
      try {
        this.#finish();
      } catch {
        // 启动失败必须保留原始异常，清理过程不能覆盖诊断信息。
      }
      throw error;
    }
  }

  cancel(reason: InteractionCancelReason): void {
    void reason;
    if (this.#ended) return;
    const reject = this.#reject;
    this.#finish();
    reject?.(cancelledError());
  }

  handleContextMenu(): ContextMenuDecision {
    return 'consume';
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (this.#ended || this.#dragging || event.button !== 0 || !event.isPrimary || isPrintUiTarget(event.target)) return;
    consume(event);
    const point = localPoint(event, this.#viewport);
    this.#pointerId = event.pointerId;
    this.#origin = point;
    this.#pending = point;
    this.#dragging = true;
    this.#viewport.setPointerCapture?.(event.pointerId);
    if (this.#request.fixedSizeCssPixels !== undefined) this.#publishFixed(point);
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const fixed = this.#request.fixedSizeCssPixels !== undefined;
    if (this.#ended || !event.isPrimary || isPrintUiTarget(event.target)) return;
    if (!fixed && (!this.#dragging || event.pointerId !== this.#pointerId)) return;
    if (fixed && this.#dragging && event.pointerId !== this.#pointerId) return;
    consume(event);
    this.#pending = localPoint(event, this.#viewport);
    if (this.#frame !== 0) return;
    this.#frame = requestFrame(() => {
      this.#frame = 0;
      this.#flushPending();
    });
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (!this.#dragging || event.pointerId !== this.#pointerId) return;
    consume(event);
    this.#pending = localPoint(event, this.#viewport);
    this.#flushPending();
    const rect = this.#rect;
    const isFixed = this.#request.fixedSizeCssPixels !== undefined;
    if (rect === undefined || (!isFixed && (rect.width < 2 || rect.height < 2))) {
      this.#resetPointer();
      return;
    }
    const resolve = this.#resolve;
    const reject = this.#reject;
    try {
      const result = this.#toResult(rect);
      this.#finish();
      resolve?.(result);
    } catch (error) {
      this.#finish();
      reject?.(error);
    }
  };

  readonly #onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.#pointerId) this.cancel('cancelled');
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.cancel('cancelled');
  };

  readonly #onAbort = (): void => this.cancel('cancelled');

  #flushPending(): void {
    const point = this.#pending;
    if (point === undefined) return;
    this.#pending = undefined;
    if (this.#request.fixedSizeCssPixels === undefined) this.#publishFit(point);
    else this.#publishFixed(point);
  }

  #publishFit(point: readonly [number, number]): void {
    const origin = this.#origin;
    if (origin === undefined) return;
    this.#publishRect(rectFromCorners(origin, point));
  }

  #publishFixed(center: readonly [number, number]): void {
    const size = this.#request.fixedSizeCssPixels;
    if (size === undefined) return;
    this.#publishRect({ left: center[0] - size[0] / 2, top: center[1] - size[1] / 2, width: size[0], height: size[1] });
  }

  #publishRect(rect: ScreenRect): void {
    this.#rect = rect;
    for (const mask of this.#masks) mask.style.display = '';
    this.#box.style.display = '';
    applyRect(this.#box, rect);
    let printRect = rect;
    if (this.#request.fixedSizeCssPixels === undefined) {
      this.#outputBox.style.display = '';
      printRect = expandRectToAspectRatio(rect, this.#request.aspectRatio);
      applyRect(this.#outputBox, printRect);
    } else {
      this.#outputBox.style.display = 'none';
    }
    const width = this.#viewport.clientWidth;
    const height = this.#viewport.clientHeight;
    const visiblePrintRect = intersectRect(printRect, width, height);
    applyRect(this.#masks[0], { left: 0, top: 0, width, height: visiblePrintRect.top });
    applyRect(this.#masks[1], {
      left: visiblePrintRect.left + visiblePrintRect.width,
      top: visiblePrintRect.top,
      width: Math.max(0, width - visiblePrintRect.left - visiblePrintRect.width),
      height: visiblePrintRect.height
    });
    applyRect(this.#masks[2], {
      left: 0,
      top: visiblePrintRect.top + visiblePrintRect.height,
      width,
      height: Math.max(0, height - visiblePrintRect.top - visiblePrintRect.height)
    });
    applyRect(this.#masks[3], { left: 0, top: visiblePrintRect.top, width: visiblePrintRect.left, height: visiblePrintRect.height });
    const canPublishChange = this.#request.fixedSizeCssPixels !== undefined || (rect.width >= 2 && rect.height >= 2);
    if (canPublishChange && this.#request.onChange !== undefined) {
      try {
        this.#request.onChange(this.#toResult(rect));
      } catch {
        // 临时草稿发布失败不结束指针会话；pointerup 仍会执行最终范围校验。
      }
    }
  }

  #toResult(rect: ScreenRect): Readonly<PrintBoxSelectionResult> {
    const transform = readPrintViewTransform(this.#map);
    const footprint = [
      printPixelToCoordinate([rect.left, rect.top], transform),
      printPixelToCoordinate([rect.left + rect.width, rect.top], transform),
      printPixelToCoordinate([rect.left + rect.width, rect.top + rect.height], transform),
      printPixelToCoordinate([rect.left, rect.top + rect.height], transform)
    ];
    if (footprint.some((coordinate) => coordinate === null || coordinate === undefined || coordinate.some((value) => !Number.isFinite(value)))) {
      throw new PrintError('render-failed', '无法把打印选框转换为地图坐标。');
    }
    const safe = footprint as unknown as [Coordinate, Coordinate, Coordinate, Coordinate];
    const xs = safe.map((coordinate) => coordinate[0]);
    const ys = safe.map((coordinate) => coordinate[1]);
    const sourceExtent = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
    return Object.freeze({
      sourceExtent: Object.freeze(sourceExtent),
      footprint: Object.freeze(
        safe.map((coordinate) => Object.freeze([coordinate[0], coordinate[1]]) as Coordinate)
      ) as unknown as PrintBoxSelectionResult['footprint'],
      center: Object.freeze([(sourceExtent[0] + sourceExtent[2]) / 2, (sourceExtent[1] + sourceExtent[3]) / 2]) as Coordinate,
      rotation: this.#map.getView().getRotation()
    });
  }

  #finish(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#dragging = false;
    try {
      if (this.#frame !== 0) cancelFrame(this.#frame);
      this.#frame = 0;
      this.#viewport.removeEventListener('pointerdown', this.#onPointerDown, true);
      this.#viewport.removeEventListener('pointermove', this.#onPointerMove, true);
      this.#viewport.removeEventListener('pointerup', this.#onPointerUp, true);
      this.#viewport.removeEventListener('pointercancel', this.#onPointerCancel, true);
      document.removeEventListener('keydown', this.#onKeyDown, true);
      this.#request.signal?.removeEventListener('abort', this.#onAbort);
      this.#releasePointerCapture();
      this.#root.remove();
    } finally {
      const cursor = this.#cursor;
      this.#cursor = undefined;
      try {
        cursor?.destroy();
      } finally {
        try {
          this.#coordinator.release(this);
        } finally {
          this.#onEnd();
        }
      }
    }
  }

  #resetPointer(): void {
    if (this.#frame !== 0) cancelFrame(this.#frame);
    this.#frame = 0;
    this.#releasePointerCapture();
    this.#dragging = false;
    this.#pointerId = undefined;
    this.#origin = undefined;
    this.#pending = undefined;
    this.#rect = undefined;
    this.#box.style.display = 'none';
    this.#outputBox.style.display = 'none';
    for (const mask of this.#masks) mask.style.display = 'none';
  }

  #releasePointerCapture(): void {
    if (this.#pointerId !== undefined && this.#viewport.hasPointerCapture?.(this.#pointerId)) this.#viewport.releasePointerCapture?.(this.#pointerId);
  }
}

function assertRequest(request: PrintBoxSelectionRequest): void {
  if (!Number.isFinite(request.aspectRatio) || request.aspectRatio <= 0) throw new InvalidArgumentError('打印框宽高比必须是有限正数。');
  if (request.onChange !== undefined && typeof request.onChange !== 'function') throw new InvalidArgumentError('打印框 onChange 必须是函数。');
  const size = request.fixedSizeCssPixels;
  if (size !== undefined && (size.length !== 2 || size.some((value) => !Number.isFinite(value) || value <= 0))) {
    throw new InvalidArgumentError('固定打印框尺寸必须包含两个有限正数。');
  }
}

function assertFixedSizeFitsViewport(request: PrintBoxSelectionRequest, viewport: HTMLElement): void {
  const size = request.fixedSizeCssPixels;
  if (size === undefined || (size[0] <= viewport.clientWidth && size[1] <= viewport.clientHeight)) return;
  throw new CapabilityError('固定比例尺打印框超出当前地图视口，请调整比例尺、纸张或地图缩放级别后重新框选。');
}

function localPoint(event: PointerEvent, viewport: HTMLElement): readonly [number, number] {
  const bounds = viewport.getBoundingClientRect();
  return [Math.max(0, Math.min(viewport.clientWidth, event.clientX - bounds.left)), Math.max(0, Math.min(viewport.clientHeight, event.clientY - bounds.top))];
}

function rectFromCorners(first: readonly [number, number], second: readonly [number, number]): ScreenRect {
  return {
    left: Math.min(first[0], second[0]),
    top: Math.min(first[1], second[1]),
    width: Math.abs(first[0] - second[0]),
    height: Math.abs(first[1] - second[1])
  };
}

function expandRectToAspectRatio(rect: ScreenRect, aspectRatio: number): ScreenRect {
  if (rect.width === 0 || rect.height === 0) return rect;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const width = rect.width / rect.height < aspectRatio ? rect.height * aspectRatio : rect.width;
  const height = rect.width / rect.height > aspectRatio ? rect.width / aspectRatio : rect.height;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height
  };
}

function intersectRect(rect: ScreenRect, width: number, height: number): ScreenRect {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(width, rect.left + rect.width);
  const bottom = Math.min(height, rect.top + rect.height);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function isPrintUiTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest('.ol-print-dialog__header, .ol-print-dialog__steps, .ol-print-dialog__content, .ol-print-dialog__splitter, .ol-print-dialog__preview') !==
      null
  );
}

function applyRect(element: HTMLElement, rect: ScreenRect): void {
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}

function consume(event: PointerEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function cancelledError(): PrintError {
  return new PrintError('cancelled', '打印范围选择已取消。');
}

function requestFrame(callback: FrameRequestCallback): number | ReturnType<typeof globalThis.setTimeout> {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : globalThis.setTimeout(() => callback(Date.now()), 16);
}

function cancelFrame(handle: number | ReturnType<typeof globalThis.setTimeout>): void {
  if (typeof cancelAnimationFrame === 'function' && typeof handle === 'number') cancelAnimationFrame(handle);
  else globalThis.clearTimeout(handle);
}
