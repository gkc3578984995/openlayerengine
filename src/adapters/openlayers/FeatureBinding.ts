import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type VectorSource from 'ol/source/Vector.js';
import Style, { type StyleFunction, type StyleLike } from 'ol/style/Style.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { CapabilityError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { LayerPresentationLease } from '../../core/ports/LayerRenderPort.js';
import type { ShapePresentationFrame, ShapePresentationPort } from '../../core/ports/ShapePresentationPort.js';
import type { ElementChange, ElementChangeSet } from '../../core/transaction/types.js';
import type { ShapeInput } from '../../core/shape/types.js';
import { isNativeStyleRef, type ElementStyleState, type StyleSpec } from '../../core/style/types.js';
import { projectRenderGeometry, type GeometryCodec, type RenderGeometryKind } from './GeometryCodec.js';
import type { LayerAdapter } from './LayerAdapter.js';
import { PresentedPolygonGeometry } from './PresentedPolygonGeometry.js';
import { createTransparentStyleProxy, type StyleCompiler } from './style/StyleCompiler.js';

type BoundSource = VectorSource<Feature<Geometry>>;

/** 单个 Element 与 OpenLayers Feature 的绑定状态。 */
interface BindingRecord {
  readonly feature: Feature<Geometry>;
  presentationLabelFeature: Feature<Geometry> | undefined;
  readonly generation: symbol;
  /** 当前 Element generation 建立时分配的稳定规范渲染顺序。 */
  readonly renderOrder: number;
  readonly suppressionTokens: Set<symbol>;
  readonly presentationTokens: Set<symbol>;
  readonly styleFunction: StyleFunction;
  suppressionAcquisition: Set<symbol> | undefined;
  canonicalStyle: StyleLike;
  presentationLabelStyle: StyleLike | undefined;
  presentationProxy: StyleFunction | undefined;
  hasPresentationLabel: boolean;
  structuredStyle: boolean;
  layerId: string;
  visible: boolean;
}

/** 销毁单个绑定时的分步进度。 */
interface DestroyRecordProgress {
  readonly id: string;
  readonly binding: BindingRecord;
  geometryCleared: boolean;
  styleCleared: boolean;
  disposed: boolean;
  presentationLabelGeometryCleared: boolean;
  presentationLabelStyleCleared: boolean;
  presentationLabelDisposed: boolean;
}

/** FeatureBinding 整体销毁进度。 */
interface DestroyProgress {
  readonly records: readonly DestroyRecordProgress[];
  storeUnsubscribed: boolean;
  presentationUnsubscribed: boolean;
  presentationMotionUnsubscribed: boolean;
  detached: boolean;
}

type Lifecycle = 'active' | 'destroying' | 'destroyed';

/** 一份投影抑制租约共享的内部状态。 */
interface SuppressionLeaseState {
  readonly elementId: string;
  readonly binding: BindingRecord;
  readonly generation: symbol;
  readonly token: symbol;
  owner: symbol | undefined;
  released: boolean;
}

/** FeatureBinding 的可选配置。 */
export interface FeatureBindingOptions {
  /** 接收投影同步与资源清理中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
  /** 在 View presentation revision 变化时只重投影依赖 View 的 Shape。 */
  readonly shapePresentation?: ShapePresentationPort;
}

/** 从 OpenLayers Feature 解析出的 Element 身份。 */
export interface BoundFeatureIdentity {
  readonly elementId: string;
  readonly layerId: string;
  readonly visible: boolean;
}

/** 打印 Adapter 读取的规范 Feature 副本，不暴露活动 Source 中的展示代理。 */
export interface CanonicalFeatureSnapshot {
  readonly elementId: string;
  readonly layerId: string;
  readonly renderOrder: number;
  readonly structuredStyle: boolean;
  readonly feature: Feature<Geometry>;
}

/** 暂停 Element 投影到矢量 Source 的租约。 */
export interface ProjectionSuppressionLease {
  /** 暂停投影的 Element ID。 */
  readonly elementId: string;
  /** 当前句柄是否仍持有有效租约。 */
  readonly active: boolean;
  /** 把所有权移交给新句柄，旧句柄随即失效。 */
  handoff(): ProjectionSuppressionLease;
  /** 释放最后一份租约时恢复 Element 投影。 */
  release(): void;
}

const hiddenStyle: StyleFunction = () => [];

/** 将 ElementStore 的规范状态单向投影为 OpenLayers Feature。 */
export class FeatureBinding {
  readonly #store: ElementStore;
  readonly #layers: LayerAdapter;
  readonly #geometry: GeometryCodec;
  readonly #styles: StyleCompiler;
  readonly #errorReporter: ErrorReporter;
  readonly #bindings = new Map<string, BindingRecord>();
  readonly #featureIds = new WeakMap<Feature<Geometry>, string>();
  readonly #presentationLabelFeatureIds = new WeakMap<Feature<Geometry>, string>();
  readonly #printFallbackCandidates = new Map<string, ReadonlySet<string>>();
  readonly #dirty = new Set<string>();
  readonly #pendingPresentationLayers = new Set<string>();
  readonly #unsubscribeStore: () => void;
  readonly #unsubscribePresentation: () => void;
  readonly #unsubscribePresentationMotion: () => void;
  #lifecycle: Lifecycle = 'active';
  #destroyProgress: DestroyProgress | undefined;
  #destroyRunning = false;
  #reconciling = false;
  #presentationRefreshing = false;
  #presentationSuspended = false;
  #presentationRefreshPending = false;
  #presentationInvalidationScheduled = false;
  #printFallbackCandidatesDirty = true;
  #nextRenderOrder = 0;

  /** 订阅 Store 后立即完成首次全量对账。 */
  constructor(store: ElementStore, layers: LayerAdapter, geometry: GeometryCodec, styles: StyleCompiler, options: FeatureBindingOptions = {}) {
    this.#store = store;
    this.#layers = layers;
    this.#geometry = geometry;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    const unsubscribeStore = store.subscribe((changes) => this.#onChanges(changes));
    let unsubscribePresentation: (() => void) | undefined;
    let unsubscribePresentationMotion: (() => void) | undefined;
    try {
      unsubscribePresentation = options.shapePresentation?.subscribe(() => this.#onPresentationFrame());
      unsubscribePresentationMotion = options.shapePresentation?.subscribeMotion?.((moving) => this.#onPresentationMotion(moving));
      this.#unsubscribeStore = unsubscribeStore;
      this.#unsubscribePresentation = unsubscribePresentation ?? (() => undefined);
      this.#unsubscribePresentationMotion = unsubscribePresentationMotion ?? (() => undefined);
      this.reconcile();
    } catch (error) {
      runFinalizers([
        unsubscribeStore,
        ...(unsubscribePresentation === undefined ? [] : [unsubscribePresentation]),
        ...(unsubscribePresentationMotion === undefined ? [] : [unsubscribePresentationMotion])
      ]);
      throw error;
    }
  }

  /** 在提交前用临时 Feature 验证图层、Geometry 和样式均可投影。 */
  preflight(state: Readonly<ElementState>): void {
    this.#assertActive();
    void this.#layers.requireVectorSource(state.layerId);
    const feature = new Feature<Geometry>();
    try {
      const geometry = this.#geometry.project(feature, state.geometry, state.style);
      const label = geometry instanceof PresentedPolygonGeometry ? geometry.getPresentationLabel() : undefined;
      if (label !== undefined && !isNativeStyleRef(state.style)) {
        void this.#styles.compilePresentationLabelParts(state.style, label.visualScale ?? 1);
      } else {
        void this.#styles.compile(state.style);
      }
    } finally {
      feature.setGeometry(undefined);
      feature.setStyle(undefined);
      feature.dispose();
    }
  }

  renderKind(state: ShapeInput): RenderGeometryKind {
    this.#assertActive();
    return this.#geometry.renderKind(state);
  }

  /** 取得 Element 当前绑定的 Feature；读取前先重试脏绑定。 */
  requireFeature(id: string): Feature<Geometry> {
    this.#assertActive();
    this.#reconcileDirty();
    const feature = this.#bindings.get(id)?.feature;
    if (feature === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${id}`);
    return feature;
  }

  /** 取得当前 Element generation 的稳定规范渲染顺序。 */
  renderOrderOf(id: string): number {
    this.#assertActive();
    this.#reconcileDirty();
    const order = this.#bindings.get(id)?.renderOrder;
    if (order === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${id}`);
    return order;
  }

  /**
   * 复制规范 Feature 和规范样式。动画 presentation lease 即使把活动 Feature 变为透明，打印副本也不受影响。
   */
  cloneCanonicalFeature(id: string, frame: number | Readonly<ShapePresentationFrame>): Feature<Geometry> {
    this.#assertActive();
    this.#reconcileDirty();
    const binding = this.#bindings.get(id);
    if (binding === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${id}`);
    return this.#cloneCanonicalFeature(id, binding, frame);
  }

  /** 按规范渲染顺序复制指定业务图层的全部可见 Feature，包括暂时从活动 Source 抑制的目标。 */
  captureCanonicalLayerFeatures(layerId: string, frame: number | Readonly<ShapePresentationFrame>): readonly Readonly<CanonicalFeatureSnapshot>[] {
    this.#assertActive();
    this.#reconcileDirty();
    const result = [...this.#bindings.entries()]
      .filter(([, binding]) => binding.layerId === layerId && binding.visible)
      .sort((left, right) => left[1].renderOrder - right[1].renderOrder)
      .map(([elementId, binding]) =>
        Object.freeze({
          elementId,
          layerId,
          renderOrder: binding.renderOrder,
          structuredStyle: binding.structuredStyle,
          feature: this.#cloneCanonicalFeature(elementId, binding, frame)
        })
      );
    return Object.freeze(result);
  }

  /** View-dependent Shape 以打印帧重新 presentation；普通调用保持现有活动展示副本语义。 */
  #cloneCanonicalFeature(elementId: string, binding: Readonly<BindingRecord>, frame: number | Readonly<ShapePresentationFrame>): Feature<Geometry> {
    const resolution = typeof frame === 'number' ? frame : frame.resolution;
    if (!Number.isFinite(resolution) || resolution <= 0) {
      throw new CapabilityError('Canonical Feature snapshot resolution must be finite and positive');
    }
    if (typeof frame === 'number') return cloneCanonicalBindingFeature(binding, resolution);
    const state = this.#store.resolve(elementId);
    if (state === undefined || !this.#geometry.isViewDependent(state.geometry)) return cloneCanonicalBindingFeature(binding, resolution);

    const feature = new Feature<Geometry>();
    try {
      const geometry = this.#geometry.presentAt(state.geometry, state.style, frame);
      projectRenderGeometry(feature, geometry);
      feature.setId(state.id);
      feature.setStyle(this.#styles.compile(state.style));
      return feature;
    } catch (error) {
      feature.setGeometry(undefined);
      feature.setStyle(undefined);
      feature.dispose();
      throw error;
    }
  }

  /** 通过活动 VectorSource 的空间索引取得打印粗筛候选，并保守保留自定义 Style 与临时 suppression 目标。 */
  queryPrintCandidateIds(layerId: string, extents: readonly (readonly [number, number, number, number])[]): readonly string[] {
    this.#assertActive();
    this.#reconcileDirty();
    const candidates = new Set<string>();
    const source = this.#layers.requireVectorSource(layerId);
    for (const extent of extents) {
      for (const feature of source.getFeaturesInExtent([...extent])) {
        const elementId = this.#featureIds.get(feature);
        const binding = elementId === undefined ? undefined : this.#bindings.get(elementId);
        if (elementId !== undefined && binding?.layerId === layerId && binding.visible) candidates.add(elementId);
      }
    }
    this.#refreshPrintFallbackCandidates();
    for (const elementId of this.#printFallbackCandidates.get(layerId) ?? []) candidates.add(elementId);
    return Object.freeze([...candidates].sort((left, right) => this.#bindings.get(left)!.renderOrder - this.#bindings.get(right)!.renderOrder));
  }

  #refreshPrintFallbackCandidates(): void {
    if (!this.#printFallbackCandidatesDirty) return;
    this.#printFallbackCandidates.clear();
    const mutable = new Map<string, Set<string>>();
    for (const [elementId, binding] of this.#bindings) {
      const state = this.#store.resolve(elementId);
      const viewDependent = state !== undefined && this.#geometry.isViewDependent(state.geometry);
      if (!binding.visible || (binding.suppressionTokens.size === 0 && binding.structuredStyle && !viewDependent)) continue;
      const layerCandidates = mutable.get(binding.layerId) ?? new Set<string>();
      layerCandidates.add(elementId);
      mutable.set(binding.layerId, layerCandidates);
    }
    for (const [layerId, elementIds] of mutable) this.#printFallbackCandidates.set(layerId, elementIds);
    this.#printFallbackCandidatesDirty = false;
  }

  /** 临时接管结构化 Element 的展示权，规范 Feature 仍保留在原 Source。 */
  acquirePresentation(elementId: string): LayerPresentationLease {
    this.#assertActive();
    this.#reconcileDirty();
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${elementId}`);
    if (!binding.structuredStyle) throw new CapabilityError(`Element presentation requires a structured style: ${elementId}`);

    const token = Symbol(elementId);
    const first = binding.presentationTokens.size === 0;
    binding.presentationTokens.add(token);
    if (binding.presentationProxy === undefined) binding.presentationProxy = createTransparentStyleProxy(binding.canonicalStyle);
    if (binding.feature.getStyle() !== binding.styleFunction) binding.feature.setStyle(binding.styleFunction);
    if (first) this.#schedulePresentationInvalidation(binding.layerId);

    let released = false;
    const isActive = (): boolean =>
      this.#lifecycle === 'active' &&
      !released &&
      this.#bindings.get(elementId) === binding &&
      binding.presentationTokens.has(token) &&
      binding.structuredStyle;
    return Object.freeze({
      layerId: binding.layerId,
      targetId: elementId,
      get active() {
        return isActive();
      },
      release: () => {
        if (released) return;
        released = true;
        if (this.#bindings.get(elementId) !== binding || !binding.presentationTokens.delete(token) || binding.presentationTokens.size > 0) return;
        binding.presentationProxy = undefined;
        this.#schedulePresentationInvalidation(binding.layerId);
      }
    });
  }

  /** 暂停 Element 投影，并以可交接租约管理恢复时机。 */
  suppressProjection(elementId: string): ProjectionSuppressionLease {
    this.#assertActive();
    this.#reconcileDirty();
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${elementId}`);
    this.#printFallbackCandidatesDirty = true;

    const token = Symbol(elementId);
    const state: SuppressionLeaseState = {
      elementId,
      binding,
      generation: binding.generation,
      token,
      owner: undefined,
      released: false
    };
    const pendingAcquisition = binding.suppressionAcquisition;
    if (pendingAcquisition !== undefined) {
      binding.suppressionTokens.add(token);
      pendingAcquisition.add(token);
      return this.#createSuppressionLease(state);
    }

    const first = binding.suppressionTokens.size === 0;
    binding.suppressionTokens.add(token);
    if (first) {
      const acquisition = new Set([token]);
      binding.suppressionAcquisition = acquisition;
      try {
        const sources = this.#layers.vectorSources();
        const removals = new Map<BoundSource, Feature<Geometry>[]>();
        for (const source of sources) {
          if (source.hasFeature(binding.feature)) append(removals, source, binding.feature);
        }
        const presentationLabelFeature = binding.presentationLabelFeature;
        if (presentationLabelFeature !== undefined) {
          for (const source of this.#layers.presentationLabelSources()) {
            if (source.hasFeature(presentationLabelFeature)) append(removals, source, presentationLabelFeature);
          }
        }
        this.#removeBatches(removals, false);
        if (
          sources.some((source) => source.hasFeature(binding.feature)) ||
          (presentationLabelFeature !== undefined && this.#layers.presentationLabelSources().some((source) => source.hasFeature(presentationLabelFeature)))
        ) {
          throw new CapabilityError(`Element Feature could not be suppressed: ${elementId}`);
        }
        this.#assertActive();
        if (this.#bindings.get(elementId) !== binding) throw new ObjectDisposedError(`Element Feature is not bound: ${elementId}`);
        if (binding.suppressionAcquisition === acquisition) binding.suppressionAcquisition = undefined;
      } catch (error) {
        if (binding.suppressionAcquisition === acquisition) binding.suppressionAcquisition = undefined;
        for (const acquisitionToken of acquisition) binding.suppressionTokens.delete(acquisitionToken);
        this.#report(error, 'suppression-acquire', elementId);
        try {
          this.#reconcileElement(elementId);
        } catch (rollbackError) {
          this.#report(rollbackError, 'suppression-rollback', elementId);
        }
        if (error instanceof CapabilityError || error instanceof ObjectDisposedError) throw error;
        throw new CapabilityError(`Element Feature could not be suppressed: ${elementId}`);
      }
    }

    return this.#createSuppressionLease(state);
  }

  /** 为共享抑制状态创建一个可交接的租约句柄。 */
  #createSuppressionLease(state: SuppressionLeaseState): ProjectionSuppressionLease {
    const owner = Symbol(state.elementId);
    state.owner = owner;
    const isActive = (): boolean => this.#isSuppressionLeaseActive(state, owner);
    const handoff = (): ProjectionSuppressionLease => {
      if (!this.#isSuppressionLeaseOwned(state, owner)) throw new ObjectDisposedError(`Projection suppression lease is stale: ${state.elementId}`);
      state.owner = undefined;
      return this.#createSuppressionLease(state);
    };
    const release = (): void => {
      if (!this.#isSuppressionLeaseOwned(state, owner)) return;
      this.#printFallbackCandidatesDirty = true;
      state.owner = undefined;
      state.released = true;
      const pending = state.binding.suppressionAcquisition?.delete(state.token) ?? false;
      if (!state.binding.suppressionTokens.delete(state.token) || pending || state.binding.suppressionTokens.size > 0) return;
      try {
        this.#reconcileElement(state.elementId);
      } catch (error) {
        this.#dirty.add(state.elementId);
        this.#report(error, 'suppression-release', state.elementId);
        this.#attempt(
          () => {
            const removals = new Map<BoundSource, Feature<Geometry>[]>();
            for (const source of this.#layers.vectorSources()) {
              if (source.hasFeature(state.binding.feature)) append(removals, source, state.binding.feature);
            }
            const presentationLabelFeature = state.binding.presentationLabelFeature;
            if (presentationLabelFeature !== undefined) {
              for (const source of this.#layers.presentationLabelSources()) {
                if (source.hasFeature(presentationLabelFeature)) append(removals, source, presentationLabelFeature);
              }
            }
            this.#removeBatches(removals, false);
          },
          state.elementId,
          'suppression-release-detach'
        );
      }
    };
    return Object.freeze({
      elementId: state.elementId,
      get active() {
        return isActive();
      },
      handoff,
      release
    });
  }

  /** 判断租约是否已经生效且仍由当前句柄持有。 */
  #isSuppressionLeaseActive(state: SuppressionLeaseState, owner: symbol): boolean {
    return this.#isSuppressionLeaseOwned(state, owner) && !state.binding.suppressionAcquisition?.has(state.token);
  }

  /** 判断租约是否仍属于当前句柄和绑定代次。 */
  #isSuppressionLeaseOwned(state: SuppressionLeaseState, owner: symbol): boolean {
    if (this.#lifecycle !== 'active' || state.released || state.owner !== owner || !state.binding.suppressionTokens.has(state.token)) return false;
    const current = this.#bindings.get(state.elementId);
    return current === state.binding && current.generation === state.generation;
  }

  /** 判断 Feature 是否仍是指定 Element 的当前绑定。 */
  isCurrentFeature(id: string, feature: Feature<Geometry>): boolean {
    this.#assertActive();
    return this.#bindings.get(id)?.feature === feature;
  }

  /** 从当前 Feature 反查 Element ID。 */
  elementIdFor(feature: Feature<Geometry>): string | undefined {
    if (this.#lifecycle !== 'active') return undefined;
    const id = this.#featureIds.get(feature);
    return id !== undefined && this.#bindings.get(id)?.feature === feature ? id : undefined;
  }

  /** 解析 Feature 当前对应的 Element、图层和可见状态。 */
  resolveFeature(feature: Feature<Geometry>): BoundFeatureIdentity | undefined {
    if (this.#lifecycle !== 'active') return undefined;
    const elementId = this.elementIdFor(feature);
    if (elementId === undefined) return undefined;
    if (this.#dirty.has(elementId)) return undefined;
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) return undefined;
    return { elementId, layerId: binding.layerId, visible: binding.visible };
  }

  /** 判断 Element 所属矢量 Source 是否启用水平世界环绕。 */
  wrapsX(elementId: string): boolean {
    this.#assertActive();
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) return false;
    return this.#layers.requireVectorSource(binding.layerId).getWrapX() === true;
  }

  /** 以整个 Element Store 为准修正全部 Feature 绑定。 */
  reconcile(): void {
    this.#assertActive();
    if (this.#reconciling) return;
    this.#reconciling = true;
    try {
      const states = this.#store.query();
      const currentIds = new Set(states.map(({ id }) => id));
      const changes: ElementChange[] = states.map((after) => ({ kind: this.#bindings.has(after.id) ? 'update' : 'add', id: after.id, after }));
      for (const id of this.#bindings.keys()) {
        if (!currentIds.has(id)) changes.push({ kind: 'remove', id });
      }
      this.#applyChanges(Object.freeze({ changes: Object.freeze(changes) }));
    } finally {
      this.#reconciling = false;
    }
  }

  /** 分步解绑并销毁全部 OpenLayers Feature。 */
  destroy(): void {
    if (this.#lifecycle === 'destroyed' || this.#destroyRunning) return;
    if (this.#lifecycle === 'active') this.#beginDestroy();
    const progress = this.#destroyProgress;
    if (progress === undefined) return;

    const finalizers: Array<() => void> = [
      () => {
        if (progress.storeUnsubscribed) return;
        this.#unsubscribeStore();
        progress.storeUnsubscribed = true;
      },
      () => {
        if (progress.presentationUnsubscribed) return;
        this.#unsubscribePresentation();
        progress.presentationUnsubscribed = true;
      },
      () => {
        if (progress.presentationMotionUnsubscribed) return;
        this.#unsubscribePresentationMotion();
        progress.presentationMotionUnsubscribed = true;
      },
      () => {
        if (progress.detached) return;
        this.#detachDestroyRecords(progress.records);
        progress.detached = true;
      }
    ];
    for (const record of progress.records) {
      finalizers.push(
        () => {
          if (record.geometryCleared) return;
          record.binding.feature.setGeometry(undefined);
          record.geometryCleared = true;
        },
        () => {
          if (record.styleCleared) return;
          record.binding.feature.setStyle(undefined);
          record.styleCleared = true;
        },
        () => {
          if (record.disposed) return;
          record.binding.feature.dispose();
          record.disposed = true;
        },
        () => {
          if (record.presentationLabelGeometryCleared) return;
          record.binding.presentationLabelFeature?.setGeometry(undefined);
          record.presentationLabelGeometryCleared = true;
        },
        () => {
          if (record.presentationLabelStyleCleared) return;
          record.binding.presentationLabelFeature?.setStyle(undefined);
          record.presentationLabelStyleCleared = true;
        },
        () => {
          if (record.presentationLabelDisposed) return;
          record.binding.presentationLabelFeature?.dispose();
          record.presentationLabelDisposed = true;
        }
      );
    }

    this.#destroyRunning = true;
    try {
      runFinalizers(finalizers);
    } finally {
      this.#destroyRunning = false;
      if (this.#destroyComplete(progress)) this.#finishDestroy(progress);
    }
  }

  /** 接收 Store 变化并同步对应 Feature。 */
  #onChanges(changes: ElementChangeSet): void {
    if (this.#lifecycle !== 'active') return;
    this.#reconcileDirty();
    this.#applyChanges(changes);
  }

  /** 当前 View 变化时只重建显式声明 viewDependent 的 Feature。 */
  #onPresentationFrame(): void {
    if (this.#presentationSuspended) {
      this.#presentationRefreshPending = true;
      return;
    }
    this.#refreshPresentation();
  }

  /** 连续缩放或旋转时合并业务投影，并只暂停独立的显式文字层。 */
  #onPresentationMotion(moving: boolean): void {
    if (this.#lifecycle !== 'active' || moving === this.#presentationSuspended) return;
    if (moving) {
      this.#presentationSuspended = true;
      this.#presentationRefreshPending = false;
      this.#attempt(() => this.#layers.setPresentationLabelsSuspended(true), 'presentation-labels', 'suspend');
      return;
    }

    this.#presentationSuspended = false;
    const refreshPending = this.#presentationRefreshPending;
    this.#presentationRefreshPending = false;
    try {
      if (refreshPending) this.#refreshPresentation();
    } finally {
      if (!this.#presentationSuspended) {
        this.#attempt(() => this.#layers.setPresentationLabelsSuspended(false), 'presentation-labels', 'resume');
      }
    }
  }

  /** 重建当前稳定 View 下全部 view-dependent 业务 Feature。 */
  #refreshPresentation(): void {
    if (this.#lifecycle !== 'active' || this.#presentationRefreshing) return;
    this.#presentationRefreshing = true;
    try {
      this.#reconcileDirty();
      const changes: ElementChange[] = [];
      for (const id of this.#bindings.keys()) {
        const state = this.#store.get(id);
        if (state === undefined || this.#dirty.has(id) || !this.#geometry.isViewDependent(state.geometry)) continue;
        changes.push({ kind: 'update', id, after: state });
      }
      if (changes.length > 0) this.#applyChanges({ changes });
    } catch (error) {
      this.#report(error, 'presentation-refresh');
    } finally {
      this.#presentationRefreshing = false;
    }
  }

  /** 重新同步此前失败并标记为脏的 Element。 */
  #reconcileDirty(): void {
    if (this.#dirty.size === 0 || this.#reconciling) return;
    const ids = [...this.#dirty];
    this.#dirty.clear();
    const changes: ElementChange[] = [];
    for (const id of ids) {
      const state = this.#store.get(id);
      changes.push(state === undefined ? { kind: 'remove', id } : { kind: this.#bindings.has(id) ? 'update' : 'add', id, after: state });
    }
    this.#applyChanges({ changes });
  }

  /** 只重新同步一个 Element。 */
  #reconcileElement(id: string): void {
    this.#assertActive();
    const state = this.#store.get(id);
    const change: ElementChange = state === undefined ? { kind: 'remove', id } : { kind: this.#bindings.has(id) ? 'update' : 'add', id, after: state };
    this.#applyChanges({ changes: [change] });
  }

  /** 批量应用 Element 增删改并更新 Source。 */
  #applyChanges(changes: ElementChangeSet): void {
    if (changes.changes.length > 0) this.#printFallbackCandidatesDirty = true;
    const sources = this.#layers.vectorSources();
    const targetSources = new Map<string, BoundSource>();
    for (const change of changes.changes) {
      if (change.after !== undefined && !targetSources.has(change.after.layerId)) {
        try {
          targetSources.set(change.after.layerId, this.#layers.requireVectorSource(change.after.layerId));
        } catch (error) {
          this.#markFailed(change.id, error, 'prepare-source');
        }
      }
    }

    const removals = new Map<BoundSource, Feature<Geometry>[]>();
    const additions = new Map<BoundSource, Feature<Geometry>[]>();
    const removed: Array<readonly [string, BindingRecord]> = [];

    for (const change of changes.changes) {
      if (change.kind === 'remove' || change.after === undefined) {
        const binding = this.#bindings.get(change.id);
        if (binding === undefined) continue;
        for (const source of sources) if (source.hasFeature(binding.feature)) append(removals, source, binding.feature);
        const presentationLabelFeature = binding.presentationLabelFeature;
        if (presentationLabelFeature !== undefined) {
          for (const source of this.#layers.presentationLabelSources()) {
            if (source.hasFeature(presentationLabelFeature)) append(removals, source, presentationLabelFeature);
          }
        }
        removed.push([change.id, binding]);
        continue;
      }

      const target = targetSources.get(change.after.layerId);
      if (target === undefined) continue;
      const existing = this.#bindings.get(change.id);
      const binding = existing ?? this.#createBinding(change.id, change.after.layerId);
      try {
        binding.feature.setId(change.after.id);
        const geometry = this.#geometry.project(binding.feature, change.after.geometry, change.after.style);
        const presentationVisualScale = this.#projectPresentationLabel(binding, geometry, change.id);
        const hasPresentationLabel = presentationVisualScale !== undefined;
        this.#projectStyle(binding, change.after.style, presentationVisualScale);
        binding.layerId = change.after.layerId;
        binding.visible = change.after.visible;
        for (const source of sources) {
          const shouldContain = change.after.visible && binding.suppressionTokens.size === 0 && source === target;
          const contains = source.hasFeature(binding.feature);
          if (contains && !shouldContain) append(removals, source, binding.feature);
          else if (!contains && shouldContain) append(additions, source, binding.feature);
        }
        const presentationLabelFeature = binding.presentationLabelFeature;
        if (presentationLabelFeature !== undefined) {
          const labelTarget = hasPresentationLabel ? this.#layers.ensurePresentationLabelSource(change.after.layerId) : undefined;
          for (const source of this.#layers.presentationLabelSources()) {
            const shouldContain = hasPresentationLabel && change.after.visible && binding.suppressionTokens.size === 0 && source === labelTarget;
            const contains = source.hasFeature(presentationLabelFeature);
            if (contains && !shouldContain) append(removals, source, presentationLabelFeature);
            else if (!contains && shouldContain) append(additions, source, presentationLabelFeature);
          }
        }
        this.#dirty.delete(change.id);
      } catch (error) {
        if (existing === undefined) this.#disposeBinding(change.id, binding);
        this.#markFailed(change.id, error, 'project');
      }
    }

    this.#removeBatches(removals, true);
    this.#addBatches(additions);
    for (const [id, binding] of removed) this.#disposeBinding(id, binding);
  }

  /** 创建并登记一个新的 Feature 绑定。 */
  #createBinding(id: string, layerId: string): BindingRecord {
    const feature = new Feature<Geometry>();
    const record = createBindingRecord(feature, id, layerId, this.#nextRenderOrder);
    this.#nextRenderOrder += 1;
    feature.setStyle(record.styleFunction);
    this.#bindings.set(id, record);
    this.#featureIds.set(feature, id);
    return record;
  }

  /** 把显式定位文字复制到伴随 Feature，并从规范框体 Geometry 移除重复文字。 */
  #projectPresentationLabel(binding: BindingRecord, geometry: Geometry, id: string): number | undefined {
    if (!(geometry instanceof PresentedPolygonGeometry)) {
      binding.hasPresentationLabel = false;
      return undefined;
    }
    const label = geometry.getPresentationLabel();
    if (label === undefined) {
      binding.hasPresentationLabel = false;
      return undefined;
    }

    const feature = this.#ensurePresentationLabelFeature(binding, id);
    const current = feature.getGeometry();
    if (current instanceof PresentedPolygonGeometry) {
      current.setCoordinates(geometry.getCoordinates());
      current.setPresentationLabel(label);
    } else {
      feature.setGeometry(geometry.clone());
    }
    geometry.setPresentationLabel(undefined);
    binding.hasPresentationLabel = true;
    return label.visualScale ?? 1;
  }

  /** 首次遇到显式文字时才分配内部 Feature。 */
  #ensurePresentationLabelFeature(binding: BindingRecord, id: string): Feature<Geometry> {
    const existing = binding.presentationLabelFeature;
    if (existing !== undefined) return existing;
    const feature = new Feature<Geometry>();
    const styleFunction: StyleFunction = (styledFeature, resolution) => {
      if (
        !binding.visible ||
        !binding.hasPresentationLabel ||
        binding.suppressionTokens.size > 0 ||
        binding.presentationTokens.size > 0 ||
        binding.presentationLabelStyle === undefined
      ) {
        return [];
      }
      const selected = binding.presentationLabelStyle;
      return typeof selected === 'function' ? selected(styledFeature, resolution) : selected;
    };
    feature.setStyle(styleFunction);
    binding.presentationLabelFeature = feature;
    this.#presentationLabelFeatureIds.set(feature, id);
    return feature;
  }

  /** 保存最新业务样式，并在租约期间更新透明代理而不替换稳定 StyleFunction。 */
  #projectStyle(binding: BindingRecord, style: ElementStyleState, presentationVisualScale: number | undefined): void {
    const structured = !isNativeStyleRef(style);
    if (structured && presentationVisualScale !== undefined) {
      const compiled = this.#styles.compilePresentationLabelParts(style as StyleSpec, presentationVisualScale);
      binding.canonicalStyle = compiled.base;
      binding.presentationLabelStyle = compiled.label;
    } else {
      binding.canonicalStyle = this.#styles.compile(style);
      binding.presentationLabelStyle = undefined;
    }
    binding.structuredStyle = structured;
    if (structured) {
      binding.presentationProxy = binding.presentationTokens.size === 0 ? undefined : createTransparentStyleProxy(binding.canonicalStyle);
      if (binding.feature.getStyle() !== binding.styleFunction) binding.feature.setStyle(binding.styleFunction);
      return;
    }

    if (binding.presentationTokens.size > 0) {
      binding.presentationTokens.clear();
      this.#schedulePresentationInvalidation(binding.layerId);
    }
    binding.presentationProxy = undefined;
    if (binding.feature.getStyle() !== binding.canonicalStyle) binding.feature.setStyle(binding.canonicalStyle);
  }

  /** 把同一同步批次中的 lease 边界变化合并为每层一次 revision 更新。 */
  #schedulePresentationInvalidation(layerId: string): void {
    this.#pendingPresentationLayers.add(layerId);
    if (this.#presentationInvalidationScheduled) return;
    this.#presentationInvalidationScheduled = true;
    queueMicrotask(() => {
      this.#presentationInvalidationScheduled = false;
      const layerIds = [...this.#pendingPresentationLayers];
      this.#pendingPresentationLayers.clear();
      if (this.#lifecycle !== 'active') return;
      for (const pendingLayerId of layerIds) {
        this.#attempt(() => this.#layers.requireLayer(pendingLayerId).changed(), pendingLayerId, 'presentation-changed');
        this.#attempt(() => this.#layers.presentationLabelLayer(pendingLayerId)?.changed(), pendingLayerId, 'presentation-label-changed');
      }
    });
  }

  /** 按 Source 批量移除 Feature，失败时逐个重试。 */
  #removeBatches(batches: Map<BoundSource, Feature<Geometry>[]>, markDirty: boolean): void {
    for (const [source, features] of batches) {
      const unique = [...new Set(features)];
      try {
        source.removeFeatures(unique);
      } catch (error) {
        this.#report(error, 'remove-features');
        for (const feature of unique) {
          if (markDirty) {
            const id = this.#featureIds.get(feature) ?? this.#presentationLabelFeatureIds.get(feature);
            if (id !== undefined) this.#dirty.add(id);
          }
          if (!source.hasFeature(feature)) continue;
          try {
            source.removeFeature(feature);
          } catch (retryError) {
            this.#report(retryError, 'remove-feature-retry');
          }
        }
      }
    }
  }

  /** 按 Source 批量新增 Feature，失败时逐个重试。 */
  #addBatches(batches: Map<BoundSource, Feature<Geometry>[]>): void {
    for (const [source, features] of batches) {
      const unique = [...new Set(features)].filter((feature) => !source.hasFeature(feature));
      if (unique.length === 0) continue;
      try {
        source.addFeatures(unique);
      } catch (error) {
        this.#report(error, 'add-features');
        for (const feature of unique) {
          const id = this.#featureIds.get(feature) ?? this.#presentationLabelFeatureIds.get(feature);
          if (id !== undefined) this.#dirty.add(id);
          if (source.hasFeature(feature)) continue;
          try {
            source.addFeature(feature);
          } catch (retryError) {
            this.#report(retryError, 'add-feature-retry');
          }
        }
      }
    }
  }

  /** 删除绑定并尽力清理对应 OpenLayers Feature。 */
  #disposeBinding(id: string, binding: BindingRecord): void {
    this.#bindings.delete(id);
    this.#featureIds.delete(binding.feature);
    this.#dirty.delete(id);
    binding.suppressionTokens.clear();
    binding.presentationTokens.clear();
    binding.suppressionAcquisition = undefined;
    binding.presentationProxy = undefined;
    binding.presentationLabelStyle = undefined;
    binding.hasPresentationLabel = false;
    this.#attempt(() => binding.feature.setGeometry(undefined), id, 'clear-geometry');
    this.#attempt(() => binding.feature.setStyle(undefined), id, 'clear-style');
    this.#attempt(() => binding.feature.dispose(), id, 'dispose-feature');
    const presentationLabelFeature = binding.presentationLabelFeature;
    if (presentationLabelFeature !== undefined) {
      this.#presentationLabelFeatureIds.delete(presentationLabelFeature);
      this.#attempt(() => presentationLabelFeature.setGeometry(undefined), id, 'clear-presentation-label-geometry');
      this.#attempt(() => presentationLabelFeature.setStyle(undefined), id, 'clear-presentation-label-style');
      this.#attempt(() => presentationLabelFeature.dispose(), id, 'dispose-presentation-label-feature');
      binding.presentationLabelFeature = undefined;
    }
  }

  /** 标记 Element 需要重试并上报本次错误。 */
  #markFailed(id: string, error: unknown, operation: string): void {
    this.#dirty.add(id);
    this.#report(error, operation, id);
  }

  /** 执行清理操作，并把失败交给错误上报器。 */
  #attempt(work: () => void, id: string, operation: string): void {
    try {
      work();
    } catch (error) {
      this.#report(error, operation, id);
    }
  }

  /** 安全上报绑定同步错误。 */
  #report(error: unknown, operation: string, ownerId?: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'FeatureBinding',
        operation,
        ...(ownerId === undefined ? {} : { ownerId })
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 投影错误报告失败时不能回滚已经提交的 Core 状态。
    }
  }

  /** 确认绑定服务仍可使用。 */
  #assertActive(): void {
    if (this.#lifecycle !== 'active') throw new ObjectDisposedError('FeatureBinding has been destroyed');
  }

  /** 建立可重试的销毁进度并停止新增租约。 */
  #beginDestroy(): void {
    const records = [...this.#bindings].map(([id, binding]): DestroyRecordProgress => ({
      id,
      binding,
      geometryCleared: false,
      styleCleared: false,
      disposed: false,
      presentationLabelGeometryCleared: binding.presentationLabelFeature === undefined,
      presentationLabelStyleCleared: binding.presentationLabelFeature === undefined,
      presentationLabelDisposed: binding.presentationLabelFeature === undefined
    }));
    this.#destroyProgress = {
      records,
      storeUnsubscribed: false,
      presentationUnsubscribed: false,
      presentationMotionUnsubscribed: false,
      detached: false
    };
    this.#lifecycle = 'destroying';
    for (const { binding } of records) {
      binding.suppressionTokens.clear();
      binding.presentationTokens.clear();
      binding.suppressionAcquisition = undefined;
      binding.presentationProxy = undefined;
      binding.presentationLabelStyle = undefined;
      binding.hasPresentationLabel = false;
    }
  }

  /** 从全部矢量 Source 移除待销毁 Feature。 */
  #detachDestroyRecords(records: readonly DestroyRecordProgress[]): void {
    const sources = this.#layers.vectorSources();
    const presentationLabelSources = this.#layers.presentationLabelSources();
    const bySource = new Map<BoundSource, Feature<Geometry>[]>();
    for (const source of sources) {
      for (const { binding } of records) {
        if (source.hasFeature(binding.feature)) append(bySource, source, binding.feature);
      }
    }
    for (const source of presentationLabelSources) {
      for (const { binding } of records) {
        const feature = binding.presentationLabelFeature;
        if (feature !== undefined && source.hasFeature(feature)) append(bySource, source, feature);
      }
    }
    this.#removeBatches(bySource, false);
    for (const source of sources) {
      for (const { id, binding } of records) {
        if (source.hasFeature(binding.feature)) throw new CapabilityError(`Element Feature could not be detached during destroy: ${id}`);
      }
    }
    for (const source of presentationLabelSources) {
      for (const { id, binding } of records) {
        const feature = binding.presentationLabelFeature;
        if (feature !== undefined && source.hasFeature(feature)) {
          throw new CapabilityError(`Element presentation label Feature could not be detached during destroy: ${id}`);
        }
      }
    }
  }

  /** 判断所有销毁步骤是否已经完成。 */
  #destroyComplete(progress: DestroyProgress): boolean {
    return (
      progress.storeUnsubscribed &&
      progress.presentationUnsubscribed &&
      progress.presentationMotionUnsubscribed &&
      progress.detached &&
      progress.records.every(
        (record) =>
          record.geometryCleared &&
          record.styleCleared &&
          record.disposed &&
          record.presentationLabelGeometryCleared &&
          record.presentationLabelStyleCleared &&
          record.presentationLabelDisposed
      )
    );
  }

  /** 清空销毁状态并进入最终已销毁状态。 */
  #finishDestroy(progress: DestroyProgress): void {
    if (this.#destroyProgress !== progress) return;
    for (const { id, binding } of progress.records) {
      this.#bindings.delete(id);
      this.#featureIds.delete(binding.feature);
      if (binding.presentationLabelFeature !== undefined) this.#presentationLabelFeatureIds.delete(binding.presentationLabelFeature);
    }
    this.#bindings.clear();
    this.#printFallbackCandidates.clear();
    this.#dirty.clear();
    this.#pendingPresentationLayers.clear();
    this.#destroyProgress = undefined;
    this.#lifecycle = 'destroyed';
  }
}

/** 创建一条自引用稳定 StyleFunction 的绑定记录。 */
function createBindingRecord(feature: Feature<Geometry>, id: string, layerId: string, renderOrder: number): BindingRecord {
  const holder: { record?: BindingRecord } = {};
  const styleFunction: StyleFunction = (styledFeature, resolution) => {
    const record = holder.record;
    if (record === undefined || !record.visible) return [];
    const selected = record.presentationTokens.size > 0 ? record.presentationProxy : record.canonicalStyle;
    if (selected === undefined) return [];
    return typeof selected === 'function' ? selected(styledFeature, resolution) : selected;
  };
  const record: BindingRecord = {
    feature,
    presentationLabelFeature: undefined,
    generation: Symbol(id),
    renderOrder,
    suppressionTokens: new Set<symbol>(),
    presentationTokens: new Set<symbol>(),
    styleFunction,
    suppressionAcquisition: undefined,
    canonicalStyle: hiddenStyle,
    presentationLabelStyle: undefined,
    presentationProxy: undefined,
    hasPresentationLabel: false,
    structuredStyle: true,
    layerId,
    visible: false
  };
  holder.record = record;
  return record;
}

function cloneCanonicalBindingFeature(binding: BindingRecord, resolution: number): Feature<Geometry> {
  if (!Number.isFinite(resolution) || resolution <= 0) throw new CapabilityError('Canonical Feature snapshot resolution must be finite and positive');
  const clone = binding.feature.clone();
  const id = binding.feature.getId();
  if (id !== undefined) clone.setId(id);
  try {
    const resolved = typeof binding.canonicalStyle === 'function' ? binding.canonicalStyle(binding.feature, resolution) : binding.canonicalStyle;
    if (resolved === undefined) clone.setStyle(undefined);
    else if (Array.isArray(resolved)) clone.setStyle(resolved.map((style) => style.clone()));
    else clone.setStyle((resolved as Style).clone());
    return clone;
  } catch (error) {
    clone.setGeometry(undefined);
    clone.setStyle(undefined);
    clone.dispose();
    throw error;
  }
}

/** 将 Feature 追加到按 Source 分组的批次。 */
function append(map: Map<BoundSource, Feature<Geometry>[]>, source: BoundSource, feature: Feature<Geometry>): void {
  const values = map.get(source);
  if (values === undefined) map.set(source, [feature]);
  else values.push(feature);
}
