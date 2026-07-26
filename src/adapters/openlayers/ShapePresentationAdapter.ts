import type Map from 'ol/Map.js';
import { checkedFonts, measureTextHeight as measureCanvasTextHeight, measureTextWidth as measureCanvasTextWidth } from 'ol/render/canvas.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate, Pixel } from '../../core/common/types.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { ShapePresentationFrame, ShapePresentationPort } from '../../core/ports/ShapePresentationPort.js';
import type { ControlPointTopology, ShapeDefinition, ShapePresentationContext, ShapePresentationResult, ShapeState } from '../../core/shape/types.js';
import { moveTrustedShapeState, renderTrustedShapeState } from '../../core/shape/trustedRender.js';
import type { ElementStyleState } from '../../core/style/types.js';

/** OpenLayers 同源的 CSS 字体宽度测量，测试环境失败时交给调用方回退。 */
export function measurePresentationTextWidth(font: string, text: string): number {
  try {
    return measureCanvasTextWidth(font, text);
  } catch {
    return Number.NaN;
  }
}

/** OpenLayers 同源的 CSS 字体单行高度测量，测试环境失败时交给调用方回退。 */
export function measurePresentationTextHeight(font: string): number {
  try {
    return measureCanvasTextHeight(font);
  } catch {
    return Number.NaN;
  }
}

/** 把 Shape presentation profile 接到当前 OpenLayers Map 的公开像素 API。 */
export class ShapePresentationAdapter implements ShapePresentationPort {
  readonly #map: Map;
  readonly #view: ReturnType<Map['getView']>;
  readonly #context: ShapePresentationContext;
  readonly #listeners = new Set<() => void>();
  readonly #motionListeners = new Set<(moving: boolean) => void>();
  readonly #unsubscribeEvents: readonly (() => void)[];
  readonly #eventUnsubscribed: boolean[];
  #framePending = false;
  #motionActive = false;
  #lifecycle: 'active' | 'destroying' | 'destroyed' = 'active';
  #destroyRunning = false;

  constructor(map: Map) {
    this.#map = map;
    this.#view = map.getView();
    this.#context = Object.freeze({
      toPixel: (coordinate: Coordinate) => this.#toPixel(coordinate),
      toCoordinate: (pixel: Pixel, template?: Coordinate) => this.#toCoordinate(pixel, template),
      measureTextWidth: measurePresentationTextWidth,
      measureTextHeight: measurePresentationTextHeight,
      getResolution: () => this.#resolution()
    });
    const handleResolution = (): void => this.#requestMotionFrame();
    const handleRotation = (): void => this.#requestMotionFrame();
    const handleFont = (): void => this.#requestFrame();
    const handlePrecompose = (): void => this.#publishFrame();
    const unsubscribeEvents = [
      () => this.#view.un('change:resolution', handleResolution),
      () => this.#view.un('change:rotation', handleRotation),
      () => checkedFonts.un('change', handleFont),
      () => map.un('precompose', handlePrecompose)
    ];
    let installed = 0;
    try {
      this.#view.on('change:resolution', handleResolution);
      installed = 1;
      this.#view.on('change:rotation', handleRotation);
      installed = 2;
      checkedFonts.on('change', handleFont);
      installed = 3;
      map.on('precompose', handlePrecompose);
      installed = 4;
    } catch (error) {
      runFinalizers(unsubscribeEvents.slice(0, installed));
      throw error;
    }
    this.#unsubscribeEvents = Object.freeze(unsubscribeEvents);
    this.#eventUnsubscribed = unsubscribeEvents.map(() => false);
  }

  materialize(definition: ShapeDefinition, input: unknown, referenceState?: ShapeState): ShapeState {
    this.#assertActive();
    const materialize = definition.presentation?.materialize;
    const state = materialize === undefined ? definition.normalize(input) : (materialize(input, this.#context, referenceState as never) as ShapeState);
    return definition.normalize(state);
  }

  present(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState): ShapePresentationResult {
    this.#assertActive();
    const profile = definition.presentation;
    if (profile === undefined) {
      return Object.freeze({ state, geometry: renderTrustedShapeState(definition, state as never) });
    }
    return profile.present(state as never, style, this.#context) as ShapePresentationResult;
  }

  presentAt(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState, frame: Readonly<ShapePresentationFrame>): ShapePresentationResult {
    this.#assertActive();
    const profile = definition.presentation;
    if (profile === undefined) {
      return Object.freeze({ state, geometry: renderTrustedShapeState(definition, state as never) });
    }
    return profile.present(state as never, style, createFramePresentationContext(frame)) as ShapePresentationResult;
  }

  describeEdit(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState): ControlPointTopology {
    this.#assertActive();
    const contextual = definition.presentation?.edit;
    if (contextual !== undefined) return contextual.describe(state as never, style, this.#context);
    const topology = definition.editTopology;
    if (topology === undefined) throw new CapabilityError(`Shape does not support editing: ${definition.type}`);
    return topology.describe(state as never);
  }

  moveEdit(definition: ShapeDefinition, state: ShapeState, style: ElementStyleState, index: number, coordinate: Coordinate): ShapeState {
    this.#assertActive();
    const contextual = definition.presentation?.edit;
    if (contextual !== undefined) return contextual.move(state as never, index, coordinate, style, this.#context) as ShapeState;
    return moveTrustedShapeState(definition, state as never, index, coordinate) as ShapeState;
  }

  subscribe(listener: () => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Shape presentation listener must be a function');
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  }

  subscribeMotion(listener: (moving: boolean) => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Shape presentation motion listener must be a function');
    this.#motionListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#motionListeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.#lifecycle === 'destroyed' || this.#destroyRunning) return;
    this.#lifecycle = 'destroying';
    this.#destroyRunning = true;
    try {
      runFinalizers(
        this.#unsubscribeEvents.map((unsubscribe, index) => () => {
          if (this.#eventUnsubscribed[index]) return;
          unsubscribe();
          this.#eventUnsubscribed[index] = true;
        })
      );
    } finally {
      this.#listeners.clear();
      this.#motionListeners.clear();
      this.#motionActive = false;
      this.#destroyRunning = false;
      if (this.#eventUnsubscribed.every(Boolean)) this.#lifecycle = 'destroyed';
    }
  }

  #toPixel(coordinate: Coordinate): Pixel {
    if (this.#framePending) return this.#toPixelFromView(coordinate);
    const pixel = this.#map.getPixelFromCoordinate([...coordinate]);
    return Array.isArray(pixel) && pixel.length >= 2 && Number.isFinite(pixel[0]) && Number.isFinite(pixel[1])
      ? [pixel[0], pixel[1]]
      : this.#toPixelFromView(coordinate);
  }

  #toCoordinate(pixel: Pixel, template?: Coordinate): Coordinate {
    if (pixel.length < 2 || !Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) {
      throw new InvalidArgumentError('Callout CSS pixel must contain two finite numbers');
    }
    if (this.#framePending) return this.#toCoordinateFromView(pixel, template);
    const coordinate = this.#map.getCoordinateFromPixel([pixel[0], pixel[1]]);
    return Array.isArray(coordinate) && coordinate.length >= 2 && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
      ? template?.length === 3
        ? [coordinate[0], coordinate[1], template[2]]
        : [coordinate[0], coordinate[1]]
      : this.#toCoordinateFromView(pixel, template);
  }

  /** View 事件早于 Map 帧变换更新；统一等到公开 precompose 帧边界再发布 revision。 */
  #requestFrame(): void {
    if (this.#lifecycle !== 'active' || this.#framePending) return;
    this.#framePending = true;
    this.#map.render();
  }

  #requestMotionFrame(): void {
    if (this.#lifecycle !== 'active') return;
    const publishMotion = !this.#motionActive;
    this.#motionActive = true;
    this.#requestFrame();
    if (publishMotion) {
      for (const listener of [...this.#motionListeners]) listener(true);
    }
  }

  #publishFrame(): void {
    if (this.#lifecycle !== 'active') return;
    if (this.#framePending) {
      this.#framePending = false;
      for (const listener of [...this.#listeners]) listener();
    }
    this.#publishMotionSettled();
  }

  /** 新的 View 帧已发布且运动提示清空后，再恢复依赖像素布局的展示。 */
  #publishMotionSettled(): void {
    if (this.#lifecycle !== 'active' || !this.#motionActive || this.#framePending || this.#view.getAnimating() || this.#view.getInteracting()) return;
    this.#motionActive = false;
    for (const listener of [...this.#motionListeners]) listener(false);
    if (this.#lifecycle === 'active' && !this.#motionActive) this.#map.render();
  }

  /** 首帧前或待提交的新 View 帧使用公开 View 状态构造等价的局部仿射变换。 */
  #toPixelFromView(coordinate: Coordinate): Pixel {
    const { centerX, centerY, resolution, cosine, sine } = this.#viewTransform();
    const x = coordinate[0] - centerX;
    const y = coordinate[1] - centerY;
    return [(cosine * x + sine * y) / resolution, (sine * x - cosine * y) / resolution];
  }

  #toCoordinateFromView(pixel: Pixel, template?: Coordinate): Coordinate {
    const { centerX, centerY, resolution, cosine, sine } = this.#viewTransform();
    const x = centerX + resolution * (cosine * pixel[0] + sine * pixel[1]);
    const y = centerY + resolution * (sine * pixel[0] - cosine * pixel[1]);
    return template?.length === 3 ? [x, y, template[2]] : [x, y];
  }

  #viewTransform(): { readonly centerX: number; readonly centerY: number; readonly resolution: number; readonly cosine: number; readonly sine: number } {
    const resolution = this.#resolution();
    const rotation = this.#view.getRotation();
    const center = this.#view.getCenter();
    if (!Number.isFinite(rotation)) {
      throw new CapabilityError('Current View cannot resolve Callout CSS pixels before rendering');
    }
    const centerX = center?.[0] ?? 0;
    const centerY = center?.[1] ?? 0;
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) throw new CapabilityError('Current View has no finite Callout center');
    return { centerX, centerY, resolution, cosine: Math.cos(rotation), sine: Math.sin(rotation) };
  }

  #resolution(): number {
    const resolution = this.#view.getResolution();
    if (resolution === undefined || !Number.isFinite(resolution) || resolution <= 0) {
      throw new CapabilityError('Current View has no positive finite resolution');
    }
    return resolution;
  }

  #assertActive(): void {
    if (this.#lifecycle !== 'active') throw new ObjectDisposedError('ShapePresentationAdapter has been destroyed');
  }
}

/** 打印等隔离渲染使用冻结 View 帧，避免借用活动 Map 的像素变换。 */
function createFramePresentationContext(frame: Readonly<ShapePresentationFrame>): Readonly<ShapePresentationContext> {
  const center = frame.center;
  const centerX = center[0];
  const centerY = center[1];
  const resolution = frame.resolution;
  const rotation = frame.rotation;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) throw new InvalidArgumentError('Shape presentation frame center must be finite');
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new InvalidArgumentError('Shape presentation frame resolution must be positive and finite');
  }
  if (!Number.isFinite(rotation)) throw new InvalidArgumentError('Shape presentation frame rotation must be finite');
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return Object.freeze({
    toPixel: (coordinate: Coordinate): Pixel => {
      const x = coordinate[0] - centerX;
      const y = coordinate[1] - centerY;
      return [(cosine * x + sine * y) / resolution, (sine * x - cosine * y) / resolution];
    },
    toCoordinate: (pixel: Pixel, template?: Coordinate): Coordinate => {
      if (pixel.length < 2 || !Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) {
        throw new InvalidArgumentError('Shape presentation frame pixel must contain two finite numbers');
      }
      const x = centerX + resolution * (cosine * pixel[0] + sine * pixel[1]);
      const y = centerY + resolution * (sine * pixel[0] - cosine * pixel[1]);
      return template?.length === 3 ? [x, y, template[2]] : [x, y];
    },
    measureTextWidth: measurePresentationTextWidth,
    measureTextHeight: measurePresentationTextHeight,
    getResolution: () => resolution
  });
}
