import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import { unByKey } from 'ol/Observable.js';
import { getWidth } from 'ol/extent.js';
import type { EventsKey } from 'ol/events.js';
import type RenderEvent from 'ol/render/Event.js';
import { getVectorContext } from 'ol/render.js';
import CircleStyle from 'ol/style/Circle.js';
import RegularShape from 'ol/style/RegularShape.js';
import Style from 'ol/style/Style.js';
import { runFinalizers } from '../../../core/common/dispose.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../../core/ports/ErrorReporter.js';
import type {
  LayerRenderBatch,
  LayerRenderFrame,
  LayerRenderLoopHandle,
  LayerPresentationLease,
  LayerRenderPort,
  LayerRenderDynamicStyle,
  LayerRenderPrimitive,
  LayerRenderSlotReservation,
  LayerRenderTargetHandle,
  LayerRenderTargetSpec
} from '../../../core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../../../core/shape/types.js';
import type { StyleSpec } from '../../../core/style/types.js';
import { styleVisualOutsetPx } from '../../../core/style/visualOutset.js';
import type { FeatureBinding } from '../FeatureBinding.js';
import { projectRenderGeometry } from '../GeometryCodec.js';
import type { LayerAdapter } from '../LayerAdapter.js';
import type { CompiledPresentationStyle, StyleCompiler } from '../style/StyleCompiler.js';

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
  readonly baseSlots: Map<string, CachedPrimitive>;
  readonly overlaySlots: Map<string, CachedPrimitive>;
  rendering: boolean;
  flushBeforeDestroy: boolean;
  destroyed: boolean;
  destroying: boolean;
  subscribed: boolean;
}

/** 可在稳定帧中原地更新的 OpenLayers 图元。 */
interface CachedPrimitive {
  readonly feature: Feature<Geometry>;
  readonly canonicalFeature: Feature<Geometry>;
  geometryInput: RenderGeometryState;
  styleInput: LayerRenderPrimitive['style'];
  compiledStyle: CompiledPresentationStyle;
  compiledStyleRevision: number | undefined;
  dynamicDefaults: Map<Style, DynamicStyleDefaults>;
  geometryCleared: boolean;
  styleDisposed: boolean;
  disposed: boolean;
}

/** 单个 Style 在模板编译后的动态标量基线。 */
interface DynamicStyleDefaults {
  readonly lineDashOffset: number | undefined;
  readonly strokeWidth: number | undefined;
  readonly imageStrokeWidth: number | undefined;
  readonly symbolRadius: number | undefined;
  readonly rotation: number | undefined;
}

/** 一帧中等待按业务顺序绘制的缓存 slot。 */
interface DrawItem {
  readonly cached: CachedPrimitive;
  readonly primitive: LayerRenderPrimitive;
  readonly targetOrder: number;
  readonly targetZIndex: number;
  readonly targetId: string;
  readonly channel: string;
  readonly kind: 'base' | 'overlay';
  readonly sequence: number;
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
  #observedFrameTime: number | undefined;
  #renderRequested = false;
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

  /** 当前缓存的合成基础替身数。 */
  get cachedPresentationCount(): number {
    let count = 0;
    for (const loop of this.#loops.values()) count += loop.baseSlots.size;
    return count;
  }

  /** 当前缓存的 overlay slot 数。 */
  get cachedOverlayCount(): number {
    let count = 0;
    for (const loop of this.#loops.values()) count += loop.overlaySlots.size;
    return count;
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
      baseSlots: new Map(),
      overlaySlots: new Map(),
      rendering: false,
      flushBeforeDestroy: false,
      destroyed: false,
      destroying: false,
      subscribed: true
    };
    record.key = layer.on('postrender', (event) => this.#renderFrame(record, event));
    this.#loops.set(safeLayerId, record);
    let destroyed = false;
    return {
      requestRender: () => {
        if (!destroyed && !record.destroyed && this.#loops.get(safeLayerId) === record) this.#requestRender();
      },
      destroy: (options) => {
        if (destroyed) return;
        if (options?.flushCurrentFrame === true && record.rendering) {
          record.flushBeforeDestroy = true;
          destroyed = true;
          return;
        }
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

  /** 获取规范 Feature 的展示租约，且严格核对目标仍属于请求图层。 */
  acquirePresentation(layerId: string, targetId: string): LayerPresentationLease {
    this.#assertActive();
    const safeLayerId = nonEmptyString(layerId, 'Render layer id');
    const safeTargetId = nonEmptyString(targetId, 'Render target id');
    const feature = this.#binding.requireFeature(safeTargetId);
    const identity = this.#binding.resolveFeature(feature);
    if (identity?.layerId !== safeLayerId) throw new CapabilityError(`Element presentation target is not in layer ${safeLayerId}: ${safeTargetId}`);
    return this.#binding.acquirePresentation(safeTargetId);
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

  /** 单帧内先应用临时目标，再准备稳定 slot 并按目标顺序统一绘制。 */
  #renderFrame(record: LoopRecord, event: RenderEvent): void {
    if (this.#disposed || this.#destroying || record.destroyed || this.#loops.get(record.layerId) !== record) return;
    const frameState = event.frameState;
    if (
      frameState === undefined ||
      frameState === null ||
      !Number.isFinite(frameState.time) ||
      !Number.isFinite(frameState.viewState.resolution) ||
      !validExtent(frameState.extent)
    )
      return;
    if (this.#observedFrameTime !== frameState.time) {
      this.#observedFrameTime = frameState.time;
      this.#renderRequested = false;
    }
    const projection = frameState.viewState.projection;
    const candidateWorldWidth = record.layer.getSource()?.getWrapX() === true && projection.canWrapX() ? getWidth(projection.getExtent()) : undefined;
    const frame: LayerRenderFrame = Object.freeze({
      layerId: record.layerId,
      time: frameState.time,
      resolution: frameState.viewState.resolution,
      extent: Object.freeze([...frameState.extent]) as [number, number, number, number],
      pixelRatio: finitePositive(frameState.pixelRatio, 1),
      rotation: finiteNumber(frameState.viewState.rotation, 0),
      ...(candidateWorldWidth !== undefined && Number.isFinite(candidateWorldWidth) && candidateWorldWidth > 0 ? { worldWidth: candidateWorldWidth } : {})
    });
    let batch: LayerRenderBatch;
    record.rendering = true;
    try {
      batch = normalizeBatch(record.render(frame));
    } catch (error) {
      this.#report(error, 'render-batch', record.layerId);
      this.#completeFrame(record);
      return;
    } finally {
      record.rendering = false;
    }
    if (this.#disposed || this.#destroying || record.destroyed || this.#loops.get(record.layerId) !== record) {
      this.#completeFrame(record);
      return;
    }
    const seen = new Set<string>();
    const liveBaseSlots = new Set<string>();
    const liveOverlaySlots = new Set<string>();
    for (const reservation of batch.slotReservations ?? []) this.#reserveSlot(reservation, liveBaseSlots, liveOverlaySlots);
    const drawItems: DrawItem[] = [];
    for (let contributionIndex = 0; contributionIndex < batch.contributions.length; contributionIndex += 1) {
      const contribution = batch.contributions[contributionIndex];
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
        if (contribution.value.visible === false) continue;
        const canonicalFeature = this.#binding.requireFeature(contribution.targetId);
        const targetOrder = this.#binding.renderOrderOf(contribution.targetId);
        const targetZIndex = finiteNumber(contribution.targetZIndex, 0);
        const presentation = contribution.value.presentation;
        if (presentation !== undefined) {
          const key = baseSlotKey(contribution.targetId);
          const cached = this.#prepareSlot(record.baseSlots, key, canonicalFeature, presentation);
          liveBaseSlots.add(key);
          drawItems.push({
            cached,
            primitive: presentation,
            targetOrder,
            targetZIndex,
            targetId: contribution.targetId,
            channel: contribution.channel,
            kind: 'base',
            sequence: contributionIndex
          });
        }
        const primitives = contribution.value.primitives ?? [];
        for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex += 1) {
          const primitive = primitives[primitiveIndex];
          const slotKey = normalizeSlotKey(primitive.slotKey, primitiveIndex);
          const key = overlaySlotKey(contribution.targetId, contribution.channel, slotKey);
          const cached = this.#prepareSlot(record.overlaySlots, key, canonicalFeature, primitive);
          liveOverlaySlots.add(key);
          drawItems.push({
            cached,
            primitive,
            targetOrder,
            targetZIndex,
            targetId: contribution.targetId,
            channel: contribution.channel,
            kind: 'overlay',
            sequence: contributionIndex * 1_000 + primitiveIndex
          });
        }
      } catch (error) {
        this.#report(error, 'apply-contribution', contribution.targetId);
      }
    }
    this.#pruneSlots(record.baseSlots, liveBaseSlots);
    this.#pruneSlots(record.overlaySlots, liveOverlaySlots);
    for (const [key, applied] of [...record.applied]) {
      if (seen.has(key)) continue;
      try {
        applied.spec.clear(applied.channel);
        record.applied.delete(key);
      } catch (error) {
        this.#report(error, 'clear-target-channel', applied.spec.targetId);
      }
    }
    drawItems.sort(compareDrawItems);
    let drawing: ReturnType<typeof getVectorContext> | undefined;
    for (const item of drawItems) {
      this.#attempt(
        () => {
          const opacity = normalizeOpacity(item.primitive.opacity);
          if (opacity === 0) return;
          drawing ??= getVectorContext(event);
          this.#drawCachedPrimitive(
            drawing,
            event,
            record.layer,
            item.cached,
            item.primitive.dynamicStyle,
            item.primitive.pathReveal,
            opacity,
            frame.resolution
          );
        },
        item.kind === 'base' ? 'draw-presentation' : 'draw-overlay',
        item.targetId
      );
    }
    if (batch.requestNextFrame && !record.destroyed && this.#loops.get(record.layerId) === record) this.#requestRender();
    this.#completeFrame(record);
  }

  /** 在终态批次完成绘制后兑现渲染回调内请求的延迟销毁。 */
  #completeFrame(record: LoopRecord): void {
    if (!record.flushBeforeDestroy) return;
    try {
      this.#destroyLoop(record);
      record.flushBeforeDestroy = false;
    } catch (error) {
      this.#report(error, 'destroy-loop-after-frame', record.layerId);
      if (!record.destroyed && !this.#disposed && !this.#destroying && this.#loops.get(record.layerId) === record) {
        this.#attempt(() => this.#requestRender(), 'request-destroy-loop-retry', record.layerId);
      }
    }
  }

  /** 同一个 Earth 调度周期只提交一次地图渲染请求，由首个新 frame time 重新开放下一次请求。 */
  #requestRender(): void {
    if (this.#disposed || this.#destroying || this.#renderRequested) return;
    const render = this.#map.render;
    if (typeof render !== 'function') return;
    this.#renderRequested = true;
    try {
      render.call(this.#map);
    } catch (error) {
      this.#renderRequested = false;
      throw error;
    }
  }

  /** 复用一个稳定 slot 的 Feature、Geometry 和编译样式。 */
  #prepareSlot(slots: Map<string, CachedPrimitive>, key: string, canonicalFeature: Feature<Geometry>, primitive: LayerRenderPrimitive): CachedPrimitive {
    assertPathReveal(primitive.pathReveal);
    let cached = slots.get(key);
    if (cached !== undefined && (cached.geometryCleared || cached.styleDisposed || cached.disposed)) {
      this.#disposeCachedPrimitive(cached);
      if (!cached.geometryCleared || !cached.styleDisposed || !cached.disposed)
        throw new ObjectDisposedError(`Layer render slot could not be recycled: ${key}`);
      slots.delete(key);
      cached = undefined;
    }
    if (cached !== undefined && cached.canonicalFeature !== canonicalFeature) {
      this.#disposeCachedPrimitive(cached);
      slots.delete(key);
      cached = undefined;
    }
    if (cached === undefined) {
      const feature = new Feature<Geometry>();
      try {
        projectRenderGeometry(feature, primitive.geometry);
        cached = {
          feature,
          canonicalFeature,
          geometryInput: primitive.geometry,
          styleInput: primitive.style,
          compiledStyle: this.#styles.compilePresentation(primitive.style, canonicalFeature),
          compiledStyleRevision: undefined,
          dynamicDefaults: new Map(),
          geometryCleared: false,
          styleDisposed: false,
          disposed: false
        };
        slots.set(key, cached);
      } catch (error) {
        feature.setGeometry(undefined);
        feature.dispose();
        throw error;
      }
      return cached;
    }
    projectRenderGeometry(cached.feature, primitive.geometry);
    cached.geometryInput = primitive.geometry;
    if (cached.styleInput !== primitive.style) {
      const compiledStyle = this.#styles.compilePresentation(primitive.style, canonicalFeature);
      cached.compiledStyle.destroy();
      cached.compiledStyle = compiledStyle;
      cached.compiledStyleRevision = undefined;
      cached.styleInput = primitive.style;
      cached.dynamicDefaults = new Map();
    }
    return cached;
  }

  /** 在当前帧矢量上下文中绘制缓存图元，并在所有异常路径恢复坐标与 alpha。 */
  #drawCachedPrimitive(
    vectorContext: ReturnType<typeof getVectorContext>,
    event: RenderEvent,
    layer: VectorLayer,
    cached: CachedPrimitive,
    dynamicStyle: LayerRenderDynamicStyle | undefined,
    pathReveal: LayerRenderPrimitive['pathReveal'],
    opacity: number,
    resolution: number
  ): void {
    const geometry = cached.feature.getGeometry();
    if (geometry === undefined) return;
    const offsets = worldOffsets(event, layer, geometry.getExtent(), cached.styleInput, dynamicStyle, resolution);
    let appliedOffset = 0;
    try {
      withGlobalAlpha(event.context, opacity, () => {
        for (const offset of offsets) {
          const delta = offset - appliedOffset;
          if (delta !== 0) geometry.translate(delta, 0);
          appliedOffset = offset;
          restoreDynamicStyle(cached.dynamicDefaults);
          const styles = cached.compiledStyle.resolve(cached.feature, resolution, pathReveal);
          if (cached.compiledStyleRevision !== cached.compiledStyle.revision) {
            cached.dynamicDefaults.clear();
            cached.compiledStyleRevision = cached.compiledStyle.revision;
          }
          applyDynamicStyle(styles, dynamicStyle, cached.dynamicDefaults, cached.styleInput);
          for (const style of styles) vectorContext.drawFeature(cached.feature, style);
        }
      });
    } finally {
      if (appliedOffset !== 0) geometry.translate(-appliedOffset, 0);
    }
  }

  /** 把本帧不可见但生命周期仍存活的 slot 纳入缓存保留集合。 */
  #reserveSlot(reservation: LayerRenderSlotReservation, baseSlots: Set<string>, overlaySlots: Set<string>): void {
    if (reservation.kind === 'presentation') {
      baseSlots.add(baseSlotKey(reservation.targetId));
      return;
    }
    overlaySlots.add(overlaySlotKey(reservation.targetId, reservation.channel, reservation.slotKey));
  }

  /** 清理生命周期已结束的稳定 slot。 */
  #pruneSlots(slots: Map<string, CachedPrimitive>, live: ReadonlySet<string>): void {
    for (const [key, cached] of slots) {
      if (live.has(key)) continue;
      try {
        this.#disposeCachedPrimitive(cached);
      } catch (error) {
        this.#report(error, 'dispose-slot');
      }
      if (cached.geometryCleared && cached.styleDisposed && cached.disposed) slots.delete(key);
    }
  }

  /** 释放缓存展示对象。 */
  #disposeCachedPrimitive(cached: CachedPrimitive): void {
    runFinalizers([
      () => {
        if (cached.geometryCleared) return;
        cached.feature.setGeometry(undefined);
        cached.geometryCleared = true;
      },
      () => {
        if (cached.styleDisposed) return;
        cached.compiledStyle.destroy();
        cached.dynamicDefaults.clear();
        cached.styleDisposed = true;
      },
      () => {
        if (cached.disposed) return;
        cached.feature.dispose();
        cached.disposed = true;
      }
    ]);
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
      runFinalizers([
        ...[...record.baseSlots.values(), ...record.overlaySlots.values()].map((cached) => () => this.#disposeCachedPrimitive(cached)),
        () => {
          for (const [key, cached] of record.baseSlots) if (cached.geometryCleared && cached.styleDisposed && cached.disposed) record.baseSlots.delete(key);
          for (const [key, cached] of record.overlaySlots)
            if (cached.geometryCleared && cached.styleDisposed && cached.disposed) record.overlaySlots.delete(key);
        }
      ]);
      if (record.baseSlots.size > 0 || record.overlaySlots.size > 0)
        throw new ObjectDisposedError(`Layer render slots could not be destroyed: ${record.layerId}`);
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
  if (
    batch === null ||
    typeof batch !== 'object' ||
    !Array.isArray(batch.contributions) ||
    (batch.slotReservations !== undefined && !Array.isArray(batch.slotReservations)) ||
    typeof batch.requestNextFrame !== 'boolean'
  ) {
    throw new InvalidArgumentError('Layer render callback returned an invalid batch');
  }
  for (const reservation of batch.slotReservations ?? []) assertSlotReservation(reservation);
  return batch;
}

/** 在 Adapter 边界拒绝无法形成稳定缓存键的 slot reservation。 */
function assertSlotReservation(reservation: LayerRenderSlotReservation): void {
  if (reservation === null || typeof reservation !== 'object') throw new InvalidArgumentError('Layer render slot reservation must be an object');
  nonEmptyString(reservation.targetId, 'Layer render slot reservation targetId');
  if (reservation.kind === 'presentation') return;
  if (reservation.kind !== 'overlay') throw new InvalidArgumentError('Layer render slot reservation kind is invalid');
  nonEmptyString(reservation.channel, 'Layer render slot reservation channel');
  nonEmptyString(reservation.slotKey, 'Layer render slot reservation slotKey');
}

/** 用公开 setter 应用动态标量；字段缺省时恢复模板基线。 */
function applyDynamicStyle(
  styles: readonly Style[],
  dynamic: LayerRenderDynamicStyle | undefined,
  defaults: Map<Style, DynamicStyleDefaults>,
  styleInput: StyleSpec
): void {
  assertDynamicStyle(dynamic);
  const lineworkBasePhase = styleInput.linework?.tracks.length === 1 ? (styleInput.linework.tracks[0]?.stroke.lineDashOffset ?? 0) : undefined;
  let strokeIndex = 0;
  for (const style of styles) {
    let baseline = defaults.get(style);
    const stroke = style.getStroke();
    const image = style.getImage();
    const imageStroke = image instanceof RegularShape ? image.getStroke() : undefined;
    if (baseline === undefined) {
      baseline = {
        lineDashOffset: stroke?.getLineDashOffset(),
        strokeWidth: stroke?.getWidth(),
        imageStrokeWidth: imageStroke?.getWidth(),
        symbolRadius: image instanceof CircleStyle ? image.getRadius() : undefined,
        rotation: image?.getRotation()
      };
      defaults.set(style, baseline);
    }
    if (stroke !== null) {
      if (dynamic?.lineDashOffset !== undefined && (dynamic.lineDashOffsetStrokeIndex === undefined || dynamic.lineDashOffsetStrokeIndex === strokeIndex)) {
        stroke.setLineDashOffset(
          lineworkBasePhase === undefined ? dynamic.lineDashOffset : (stroke.getLineDashOffset() ?? 0) + dynamic.lineDashOffset - lineworkBasePhase
        );
      }
      strokeIndex += 1;
    }
    if (stroke !== null && dynamic?.strokeWidth !== undefined) stroke.setWidth(dynamic.strokeWidth);
    if (imageStroke !== null && imageStroke !== undefined && dynamic?.strokeWidth !== undefined) imageStroke.setWidth(dynamic.strokeWidth);
    if (image instanceof CircleStyle && dynamic?.symbolRadius !== undefined) image.setRadius(dynamic.symbolRadius);
    if (image !== null && dynamic?.rotation !== undefined) image.setRotation(dynamic.rotation);
  }
  if (dynamic?.lineDashOffsetStrokeIndex !== undefined && dynamic.lineDashOffsetStrokeIndex >= strokeIndex) {
    throw new InvalidArgumentError('Layer render dynamic style lineDashOffset stroke index is out of range');
  }
}

/** 在下一次 handle.resolve() 前移除上一世界或上一帧的动态覆盖。 */
function restoreDynamicStyle(defaults: ReadonlyMap<Style, DynamicStyleDefaults>): void {
  for (const [style, baseline] of defaults) {
    const stroke = style.getStroke();
    const image = style.getImage();
    const imageStroke = image instanceof RegularShape ? image.getStroke() : undefined;
    if (stroke !== null) {
      stroke.setLineDashOffset(baseline.lineDashOffset ?? 0);
      stroke.setWidth(baseline.strokeWidth);
    }
    if (imageStroke !== null && imageStroke !== undefined) imageStroke.setWidth(baseline.imageStrokeWidth);
    if (image instanceof CircleStyle && baseline.symbolRadius !== undefined) image.setRadius(baseline.symbolRadius);
    if (image !== null) image.setRotation(baseline.rotation ?? 0);
  }
}

/** 动态标量属于内部协议，也需要在 Adapter 边界拒绝非有限值。 */
function assertDynamicStyle(dynamic: LayerRenderDynamicStyle | undefined): void {
  if (dynamic === undefined) return;
  for (const [key, value] of Object.entries(dynamic)) {
    if (value !== undefined && !Number.isFinite(value)) throw new InvalidArgumentError(`Layer render dynamic style ${key} must be finite`);
  }
  if (dynamic.symbolRadius !== undefined && dynamic.symbolRadius < 0)
    throw new InvalidArgumentError('Layer render dynamic style symbolRadius must be non-negative');
  if (dynamic.strokeWidth !== undefined && dynamic.strokeWidth < 0)
    throw new InvalidArgumentError('Layer render dynamic style strokeWidth must be non-negative');
  if (
    dynamic.lineDashOffsetStrokeIndex !== undefined &&
    (!Number.isSafeInteger(dynamic.lineDashOffsetStrokeIndex) || dynamic.lineDashOffsetStrokeIndex < 0 || dynamic.lineDashOffset === undefined)
  ) {
    throw new InvalidArgumentError('Layer render dynamic style lineDashOffset stroke index is invalid');
  }
}

function assertPathReveal(pathReveal: LayerRenderPrimitive['pathReveal']): void {
  if (pathReveal === undefined) return;
  if (
    pathReveal === null ||
    typeof pathReveal !== 'object' ||
    !Number.isFinite(pathReveal.progress) ||
    pathReveal.progress < 0 ||
    pathReveal.progress > 1 ||
    (pathReveal.direction !== 'forward' && pathReveal.direction !== 'reverse')
  ) {
    throw new InvalidArgumentError('Layer render pathReveal must contain a progress from 0 to 1 and a supported direction');
  }
}

/** 在已有 Canvas alpha 上相乘，并保证绘制异常后恢复上下文。 */
function withGlobalAlpha(context: RenderEvent['context'], opacity: number, draw: () => void): void {
  if (!isCanvasContext(context)) {
    draw();
    return;
  }
  context.save();
  try {
    context.globalAlpha *= opacity;
    draw();
  } finally {
    context.restore();
  }
}

/** 只接受 Canvas 2D 公共上下文能力，WebGL 事件不进入该路径。 */
function isCanvasContext(context: RenderEvent['context']): context is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (context === undefined || context === null || !('globalAlpha' in context)) return false;
  const candidate = context as { save?: unknown; restore?: unknown };
  return typeof candidate.save === 'function' && typeof candidate.restore === 'function';
}

/** presentation 先于同目标 overlay；目标之间按 zIndex 和规范顺序稳定排列。 */
function compareDrawItems(left: DrawItem, right: DrawItem): number {
  const targetZIndex = left.targetZIndex - right.targetZIndex;
  if (targetZIndex !== 0) return targetZIndex;
  if (left.targetOrder !== right.targetOrder) return left.targetOrder - right.targetOrder;
  if (left.kind !== right.kind) return left.kind === 'base' ? -1 : 1;
  const primitiveZIndex = (left.primitive.style.zIndex ?? 0) - (right.primitive.style.zIndex ?? 0);
  if (primitiveZIndex !== 0) return primitiveZIndex;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  const channel = left.channel.localeCompare(right.channel);
  return channel !== 0 ? channel : (left.primitive.slotKey ?? '').localeCompare(right.primitive.slotKey ?? '');
}

/** 缺省 slotKey 仅用于兼容旧动画，其数组位置必须保持稳定。 */
function normalizeSlotKey(slotKey: string | undefined, index: number): string {
  if (slotKey === undefined) return `legacy-${index}`;
  return nonEmptyString(slotKey, 'Layer render slot key');
}

function baseSlotKey(targetId: string): string {
  return JSON.stringify(['base', targetId]);
}

function overlaySlotKey(targetId: string, channel: string, slotKey: string): string {
  return JSON.stringify(['overlay', targetId, channel, slotKey]);
}

function normalizeOpacity(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) throw new InvalidArgumentError('Layer render primitive opacity must be finite');
  return Math.max(0, Math.min(1, value));
}

function validExtent(extent: readonly number[] | null | undefined): extent is [number, number, number, number] {
  return extent !== undefined && extent !== null && extent.length >= 4 && extent.slice(0, 4).every(Number.isFinite);
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** 结合 primitive 视觉外扩和图层缓冲，计算本帧需要重复绘制的水平世界偏移。 */
function worldOffsets(
  event: RenderEvent,
  layer: VectorLayer,
  geometryExtent: readonly number[],
  style: LayerRenderPrimitive['style'],
  dynamicStyle: LayerRenderDynamicStyle | undefined,
  resolution: number
): readonly number[] {
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
  if (!Number.isFinite(resolution) || resolution <= 0) return nearestWorldOffset(frameState.viewState.center[0], width);
  const renderBuffer = layer.getRenderBuffer();
  const renderBufferPx = typeof renderBuffer === 'number' && Number.isFinite(renderBuffer) ? Math.max(0, renderBuffer) : 0;
  const visualOutsetPx = styleVisualOutsetPx(style, dynamicStyle);
  const renderPadding = renderBufferPx * resolution;
  const padding = visualOutsetPx === undefined ? undefined : (renderBufferPx + visualOutsetPx) * resolution;
  const centerX = geometryExtent[0] / 2 + geometryExtent[2] / 2;
  const firstWorld =
    padding === undefined
      ? Math.min(Math.ceil((frameExtent[0] - renderPadding - geometryExtent[2]) / width), Math.floor((frameExtent[0] - renderPadding - centerX) / width))
      : Math.ceil((frameExtent[0] - padding - geometryExtent[2]) / width);
  const lastWorld =
    padding === undefined
      ? Math.max(Math.floor((frameExtent[2] + renderPadding - geometryExtent[0]) / width), Math.ceil((frameExtent[2] + renderPadding - centerX) / width))
      : Math.floor((frameExtent[2] + padding - geometryExtent[0]) / width);
  if (!Number.isFinite(firstWorld) || !Number.isFinite(lastWorld)) return nearestWorldOffset(frameState.viewState.center[0], width);
  if (firstWorld > lastWorld) return [];
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
