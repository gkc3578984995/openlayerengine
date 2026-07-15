import Feature from 'ol/Feature.js';
import CircleGeometry from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
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
  /** 接收单帧渲染中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
}

/** 已应用到渲染目标的一条通道记录。 */
interface AppliedTarget {
  /** 目标注册配置。 */
  readonly spec: LayerRenderTargetSpec;
  /** 已应用的通道名。 */
  readonly channel: string;
}

/** 单个图层渲染循环的运行状态。 */
interface LoopRecord {
  /** 业务图层 ID。 */
  readonly layerId: string;
  /** 实际 OpenLayers 矢量图层。 */
  readonly layer: VectorLayer;
  /** 每帧生成渲染批次的回调。 */
  readonly render: (frame: LayerRenderFrame) => LayerRenderBatch;
  /** 图层 postrender 事件键。 */
  key: EventsKey | undefined;
  /** 当前已经应用的目标通道。 */
  readonly applied: Map<string, AppliedTarget>;
  /** 循环是否已经销毁。 */
  destroyed: boolean;
  /** 循环是否正在销毁。 */
  destroying: boolean;
  /** 是否仍订阅图层渲染事件。 */
  subscribed: boolean;
}

/** 在 OpenLayers 图层 postrender 阶段执行统一渲染批次。 */
export class LayerRenderPass implements LayerRenderPort {
  /** 提供受管理的 OpenLayers 图层。 */
  readonly #layers: LayerAdapter;
  /** 识别默认元素渲染目标。 */
  readonly #binding: FeatureBinding;
  /** 编译渲染图元样式。 */
  readonly #styles: StyleCompiler;
  /** 接收单帧渲染错误。 */
  readonly #errorReporter: ErrorReporter;
  /** 按图层 ID 保存活动渲染循环。 */
  readonly #loops = new Map<string, LoopRecord>();
  /** 保存显式注册的渲染目标。 */
  readonly #targets = new Map<string, LayerRenderTargetSpec>();
  /** 渲染通道是否已经销毁。 */
  #disposed = false;
  /** 渲染通道是否正在销毁。 */
  #destroying = false;

  /** 保存图层、要素绑定、样式和错误上报依赖。 */
  constructor(layers: LayerAdapter, binding: FeatureBinding, styles: StyleCompiler, options: LayerRenderPassOptions = {}) {
    if (options.errorReporter !== undefined && typeof options.errorReporter !== 'function') {
      throw new InvalidArgumentError('LayerRenderPass errorReporter must be a function');
    }
    this.#layers = layers;
    this.#binding = binding;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
  }

  /** 返回当前活动渲染循环数量。 */
  get activeLoopCount(): number {
    return this.#loops.size;
  }

  /** 返回当前显式渲染目标数量。 */
  get registeredTargetCount(): number {
    return this.#targets.size;
  }

  /** 为矢量图层打开一个 postrender 渲染循环。 */
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
        if (!destroyed && !record.destroyed && this.#loops.get(safeLayerId) === record) layer.changed();
      },
      destroy: () => {
        if (destroyed) return;
        this.#destroyLoop(record);
        destroyed = true;
      }
    };
  }

  /** 注册一个可接收渲染通道值的目标。 */
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

  /** 判断图层上是否存在显式或元素渲染目标。 */
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

  /** 销毁全部渲染循环和目标注册。 */
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

  /** 处理单帧批次、目标通道和直接绘制图元。 */
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
    let drawing: Readonly<{ context: ReturnType<typeof getVectorContext>; offsets: readonly number[] }> | undefined;
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
              drawing ??= Object.freeze({ context: getVectorContext(event), offsets: worldOffsets(event, record.layer) });
              this.#drawPrimitive(drawing.context, drawing.offsets, primitive, frame.resolution);
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
    if (batch.requestNextFrame && !record.destroyed && this.#loops.get(record.layerId) === record) record.layer.changed();
  }

  /** 在当前帧的矢量上下文中绘制一个图元。 */
  #drawPrimitive(vectorContext: ReturnType<typeof getVectorContext>, offsets: readonly number[], primitive: LayerRenderPrimitive, resolution: number): void {
    for (const offset of offsets) {
      const geometry = createGeometry(primitive.geometry);
      if (offset !== 0) geometry.translate(offset, 0);
      const feature = new Feature<Geometry>(geometry);
      try {
        const styles = resolveStyles(this.#styles.compile(primitive.style), feature, resolution);
        for (const style of styles) vectorContext.drawFeature(feature, style);
      } finally {
        feature.setGeometry(undefined);
        feature.dispose();
      }
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
function worldOffsets(event: RenderEvent, layer: VectorLayer): readonly number[] {
  const frameState = event.frameState;
  if (frameState === undefined || frameState === null) return [0];
  if (layer.getSource()?.getWrapX() !== true) return [0];
  const projection = frameState.viewState.projection;
  if (!projection.canWrapX()) return [0];
  const width = getWidth(projection.getExtent());
  if (!Number.isFinite(width) || width <= 0) return [0];
  const world = Math.round(frameState.viewState.center[0] / width);
  return Object.freeze([(world - 1) * width, world * width, (world + 1) * width]);
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
