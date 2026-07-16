import Feature from 'ol/Feature.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import { unByKey } from 'ol/Observable.js';
import { getWidth } from 'ol/extent.js';
import type { EventsKey } from 'ol/events.js';
import type RenderEvent from 'ol/render/Event.js';
import { getVectorContext } from 'ol/render.js';
import type { StyleLike } from 'ol/style/Style.js';
import Style from 'ol/style/Style.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type {
  LayerRenderBatch,
  LayerRenderFrame,
  LayerRenderLoopHandle,
  LayerRenderPort,
  LayerRenderPrimitive,
  LayerRenderTargetHandle,
  LayerRenderTargetSpec
} from '../../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import type { LayerAdapter } from '../LayerAdapter.js';
import type { StyleCompiler } from '../style/StyleCompiler.js';

/** 图层渲染通道的可选配置。 */
export interface LayerRenderPassOptions {
  /** 接收单帧批次或绘制过程中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
}

/** 已应用到渲染目标的一条通道记录。 */
interface AppliedTarget {
  readonly spec: LayerRenderTargetSpec;
  readonly channel: string;
}

/** 单个图层渲染循环的运行状态。 */
interface LoopRecord {
  readonly layerId: string;
  readonly layer: VectorLayer;
  readonly render: (frame: LayerRenderFrame) => LayerRenderBatch;
  key: EventsKey | undefined;
  readonly applied: Map<string, AppliedTarget>;
  destroyed: boolean;
  destroying: boolean;
  subscribed: boolean;
}

/** 在图层 `postrender` 阶段统一消费动画通道和直接绘制图元。 */
export class LayerRenderPass implements LayerRenderPort {
  /** 仅调度地图帧，不改变业务图层 revision。 */
  readonly #map: OlMap;
  readonly #layers: LayerAdapter;
  readonly #binding: FeatureBinding;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #loops = new Map<string, LoopRecord>();
  readonly #targets = new Map<string, LayerRenderTargetSpec>();
  #disposed = false;
  #destroying = false;

  constructor(map: OlMap, layers: LayerAdapter, binding: FeatureBinding, styles: StyleCompiler, options: LayerRenderPassOptions = {}) {
    if (options.errorReporter !== undefined && typeof options.errorReporter !== 'function') {
      throw new InvalidArgumentError('LayerRenderPass errorReporter must be a function');
    }
    this.#map = map;
    this.#layers = layers;
    this.#binding = binding;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  /** 当前活动的图层渲染循环数。 */
  get activeLoopCount(): number {
    return this.#loops.size;
  }

  /** 当前显式注册的渲染目标数。 */
  get registeredTargetCount(): number {
    return this.#targets.size;
  }

  /** 为矢量图层打开唯一的 `postrender` 循环。 */
  open(layerId: string, render: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle {
    this.#assertActive();
    const safeLayerId = nonEmptyString(layerId, 'Render layer id');
    if (typeof render !== 'function') throw new InvalidArgumentError('Layer render callback must be a function');
    if (this.#loops.has(safeLayerId)) throw new InvalidArgumentError(`Layer render loop is already open: ${safeLayerId}`);
    const layer = this.#layers.requireLayer(safeLayerId);
    if (!(layer instanceof VectorLayer)) throw new InvalidArgumentError(`Layer render loop requires a vector layer: ${safeLayerId}`);
    const record: LoopRecord = {
      layerId: safeLayerId,
      layer,
      render,
      key: undefined,
      applied: new Map(),
      destroyed: false,
      destroying: false,
      subscribed: true
    };
    record.key = layer.on('postrender', (event) => this.#renderFrame(record, event));
    this.#loops.set(safeLayerId, record);
    let destroyed = false;
    return {
      requestRender: () => {
        if (!destroyed && !record.destroyed && this.#loops.get(safeLayerId) === record) this.#map.render?.();
      },
      destroy: () => {
        if (destroyed) return;
        this.#destroyLoop(record);
        destroyed = true;
      }
    };
  }

  /** 注册可接收通道值的目标，并在句柄销毁时清除已应用通道。 */
  registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle {
    this.#assertActive();
    const safe = normalizeTarget(spec);
    const key = targetKey(safe.layerId, safe.targetId);
    if (this.#targets.has(key)) throw new InvalidArgumentError(`Layer render target is already registered: ${safe.targetId}`);
    this.#targets.set(key, safe);
    let destroyed = false;
    let destroying = false;
    return {
      destroy: () => {
        if (destroyed || destroying) return;
        destroying = true;
        try {
          let failed = false;
          let firstError: unknown;
          for (const loop of this.#loops.values()) {
            for (const [appliedKey, applied] of [...loop.applied]) {
              if (applied.spec !== safe) continue;
              try {
                safe.clear(applied.channel);
                loop.applied.delete(appliedKey);
              } catch (error) {
                if (!failed) {
                  failed = true;
                  firstError = error;
                }
              }
            }
          }
          if (failed) throw firstError;
          if (this.#targets.get(key) === safe) this.#targets.delete(key);
          destroyed = true;
        } finally {
          destroying = false;
        }
      }
    };
  }

  /** 同时检查显式目标和 FeatureBinding 提供的默认 Element 目标。 */
  hasTarget(layerId: string, targetId: string): boolean {
    if (this.#disposed) return false;
    const safeLayerId = nonEmptyString(layerId, 'Render layer id');
    const safeTargetId = nonEmptyString(targetId, 'Render target id');
    if (this.#targets.has(targetKey(safeLayerId, safeTargetId))) return true;
    try {
      const feature = this.#binding.requireFeature(safeTargetId);
      return this.#binding.resolveFeature(feature)?.layerId === safeLayerId;
    } catch {
      return false;
    }
  }

  /** 移除全部 `postrender` 监听并注销渲染目标。 */
  destroy(): void {
    if (this.#disposed || this.#destroying) return;
    this.#destroying = true;
    try {
      runFinalizers([...this.#loops.values()].map((loop) => () => this.#destroyLoop(loop)));
      this.#loops.clear();
      this.#targets.clear();
      this.#disposed = true;
    } finally {
      this.#destroying = false;
    }
  }

  /** 单帧内先应用目标通道，再通过同一矢量上下文绘制图元。 */
  #renderFrame(record: LoopRecord, event: RenderEvent): void {
    if (this.#disposed || this.#destroying || record.destroyed || this.#loops.get(record.layerId) !== record) return;
    const frameState = event.frameState;
    if (frameState === undefined || frameState === null || !Number.isFinite(frameState.time) || !Number.isFinite(frameState.viewState.resolution)) return;
    const frame: LayerRenderFrame = Object.freeze({ layerId: record.layerId, time: frameState.time, resolution: frameState.viewState.resolution });
    let batch: LayerRenderBatch;
    try {
      batch = normalizeBatch(record.render(frame));
    } catch (error) {
      this.#report(error, 'render-batch', record.layerId);
      return;
    }
    const seen = new Set<string>();
    let drawing: ReturnType<typeof getVectorContext> | undefined;
    for (const contribution of batch.contributions) {
      try {
        const target = this.#targets.get(targetKey(record.layerId, contribution.targetId));
        if (target !== undefined) {
          const key = appliedKey(contribution.targetId, contribution.channel);
          target.apply(contribution.value, frame);
          seen.add(key);
          record.applied.set(key, { spec: target, channel: contribution.channel });
          continue;
        }
        if (!this.hasTarget(record.layerId, contribution.targetId)) continue;
        for (const primitive of contribution.value.primitives ?? []) {
          this.#attempt(
            () => {
              drawing ??= getVectorContext(event);
              this.#drawPrimitive(drawing, event, record.layer, primitive, frame.resolution);
            },
            'draw-primitive',
            contribution.targetId
          );
        }
      } catch (error) {
        this.#report(error, 'apply-contribution', contribution.targetId);
      }
    }
    for (const [key, applied] of [...record.applied]) {
      if (seen.has(key)) continue;
      try {
        applied.spec.clear(applied.channel);
        record.applied.delete(key);
      } catch (error) {
        this.#report(error, 'clear-target-channel', applied.spec.targetId);
      }
    }
    if (batch.requestNextFrame && !record.destroyed && this.#loops.get(record.layerId) === record) this.#map.render?.();
  }

  /** 在当前帧的矢量上下文中绘制一个图元。 */
  #drawPrimitive(
    vectorContext: ReturnType<typeof getVectorContext>,
    event: RenderEvent,
    layer: VectorLayer,
    primitive: LayerRenderPrimitive,
    resolution: number
  ): void {
    const geometry = createGeometry(primitive.geometry);
    const feature = new Feature<Geometry>(geometry);
    try {
      const compiledStyle = this.#styles.compile(primitive.style);
      const offsets = worldOffsets(event, layer, geometry.getExtent(), resolution);
      let appliedOffset = 0;
      for (const offset of offsets) {
        const delta = offset - appliedOffset;
        if (delta !== 0) geometry.translate(delta, 0);
        appliedOffset = offset;
        const styles = resolveStyles(compiledStyle, feature, resolution);
        for (const style of styles) vectorContext.drawFeature(feature, style);
      }
    } finally {
      feature.setGeometry(undefined);
      feature.dispose();
    }
  }

  /** 清除目标通道并关闭指定图层循环。 */
  #destroyLoop(record: LoopRecord): void {
    if (record.destroyed || record.destroying) return;
    record.destroying = true;
    try {
      let failed = false;
      let firstError: unknown;
      for (const [key, applied] of [...record.applied]) {
        try {
          applied.spec.clear(applied.channel);
          record.applied.delete(key);
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      }
      if (failed) throw firstError;
      if (record.subscribed) {
        if (record.key !== undefined) unByKey(record.key);
        record.key = undefined;
        record.subscribed = false;
      }
      record.destroyed = true;
      this.#loops.delete(record.layerId);
    } finally {
      record.destroying = false;
    }
  }

  /** 执行单帧操作，并把失败交给错误上报器。 */
  #attempt(work: () => void, operation: string, ownerId?: string): void {
    try {
      work();
    } catch (error) {
      this.#report(error, operation, ownerId);
    }
  }

  /** 安全上报渲染过程中的错误。 */
  #report(error: unknown, operation: string, ownerId?: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'LayerRenderPass',
        operation,
        ...(ownerId === undefined ? {} : { ownerId })
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      return;
    }
  }

  /** 确认渲染通道仍可使用。 */
  #assertActive(): void {
    if (this.#disposed || this.#destroying) throw new ObjectDisposedError('LayerRenderPass has been destroyed');
  }
}

/** 校验并冻结渲染目标配置。 */
function normalizeTarget(spec: LayerRenderTargetSpec): LayerRenderTargetSpec {
  if (spec === null || typeof spec !== 'object') throw new InvalidArgumentError('Layer render target must be an object');
  const prototype = Object.getPrototypeOf(spec);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Layer render target must be a plain object');
  const allowed = new Set(['layerId', 'targetId', 'apply', 'clear']);
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(spec)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown layer render target field: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(spec, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Layer render target cannot contain accessor properties');
    values[key] = descriptor.value;
  }
  if (typeof values.apply !== 'function' || typeof values.clear !== 'function')
    throw new InvalidArgumentError('Layer render target callbacks must be functions');
  return Object.freeze({
    layerId: nonEmptyString(values.layerId, 'Render target layerId'),
    targetId: nonEmptyString(values.targetId, 'Render target id'),
    apply: values.apply as LayerRenderTargetSpec['apply'],
    clear: values.clear as LayerRenderTargetSpec['clear']
  });
}

/** 确认渲染回调返回有效批次。 */
function normalizeBatch(batch: LayerRenderBatch): LayerRenderBatch {
  if (batch === null || typeof batch !== 'object' || !Array.isArray(batch.contributions) || typeof batch.requestNextFrame !== 'boolean') {
    throw new InvalidArgumentError('Layer render callback returned an invalid batch');
  }
  return batch;
}

/** 将渲染几何状态转换为 OpenLayers Geometry。 */
function createGeometry(state: RenderGeometryState): Geometry {
  if (state.type === 'point') return new Point([...state.coordinates]);
  if (state.type === 'polyline') return new LineString(state.coordinates.map((coordinate) => [...coordinate]));
  if (state.type === 'polygon') return new Polygon(state.coordinates.map((ring) => ring.map((coordinate) => [...coordinate])));
  return new CircleGeometry([...state.center], state.radius);
}

/** 将静态或函数样式统一解析为样式数组。 */
function resolveStyles(style: StyleLike, feature: Feature<Geometry>, resolution: number): readonly Style[] {
  const resolved = typeof style === 'function' ? style(feature, resolution) : style;
  if (resolved === undefined) return [];
  return Array.isArray(resolved) ? resolved : [resolved];
}

/** 计算循环世界中本帧需要重复绘制的水平偏移。 */
function worldOffsets(event: RenderEvent, layer: VectorLayer, geometryExtent: readonly number[], resolution: number): readonly number[] {
  const frameState = event.frameState;
  if (frameState === undefined || frameState === null) return [0];
  if (layer.getSource()?.getWrapX() !== true) return [0];
  const projection = frameState.viewState.projection;
  if (!projection.canWrapX()) return [0];
  const width = getWidth(projection.getExtent());
  if (!Number.isFinite(width) || width <= 0) return [0];
  const frameExtent = frameState.extent;
  if (
    frameExtent === undefined ||
    frameExtent === null ||
    frameExtent.length < 4 ||
    frameExtent.some((value) => !Number.isFinite(value)) ||
    geometryExtent.length < 4 ||
    geometryExtent.some((value) => !Number.isFinite(value))
  ) {
    return nearestWorldOffset(frameState.viewState.center[0], width);
  }
  const renderBuffer = layer.getRenderBuffer();
  const padding = typeof renderBuffer === 'number' && Number.isFinite(renderBuffer) && Number.isFinite(resolution) ? Math.max(0, renderBuffer * resolution) : 0;
  const firstWorld = Math.ceil((frameExtent[0] - padding - geometryExtent[2]) / width);
  const lastWorld = Math.floor((frameExtent[2] + padding - geometryExtent[0]) / width);
  if (!Number.isFinite(firstWorld) || !Number.isFinite(lastWorld) || firstWorld > lastWorld) return [];
  if (!Number.isSafeInteger(firstWorld) || !Number.isSafeInteger(lastWorld)) return nearestWorldOffset(frameState.viewState.center[0], width);
  const maximumCopies = 256;
  const availableCopies = lastWorld - firstWorld + 1;
  const copyCount = Number.isSafeInteger(availableCopies) ? Math.min(availableCopies, maximumCopies) : maximumCopies;
  const preferredWorld = Math.min(lastWorld, Math.max(firstWorld, Math.round(frameState.viewState.center[0] / width)));
  const preferredFirst = preferredWorld - Math.floor((copyCount - 1) / 2);
  const boundedFirst = Math.min(lastWorld - copyCount + 1, Math.max(firstWorld, preferredFirst));
  const offsets: number[] = [];
  for (let index = 0; index < copyCount; index += 1) offsets.push((boundedFirst + index) * width);
  return Object.freeze(offsets);
}

/** 在无法安全枚举极远世界时，仅返回离视图中心最近的有限副本。 */
function nearestWorldOffset(centerX: number, width: number): readonly number[] {
  if (!Number.isFinite(centerX)) return Object.freeze([0]);
  const offset = Math.round(centerX / width) * width;
  return Object.freeze([Number.isFinite(offset) ? offset : 0]);
}

/** 生成图层和目标组合键。 */
function targetKey(layerId: string, targetId: string): string {
  return JSON.stringify([layerId, targetId]);
}

/** 生成目标和通道组合键。 */
function appliedKey(targetId: string, channel: string): string {
  return JSON.stringify([targetId, channel]);
}

/** 读取不能为空的字符串。 */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}
