import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import type VectorSource from 'ol/source/Vector.js';
import type { StyleFunction } from 'ol/style/Style.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { runFinalizers } from '../../core/common/dispose.js';
import { CapabilityError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ElementChange, ElementChangeSet } from '../../core/transaction/types.js';
import type { ShapeInput } from '../../core/shape/types.js';
import type { RenderGeometryKind } from './GeometryCodec.js';
import type { GeometryCodec } from './GeometryCodec.js';
import type { LayerAdapter } from './LayerAdapter.js';
import type { StyleCompiler } from './style/StyleCompiler.js';

type BoundSource = VectorSource<Feature<Geometry>>;

/** 单个 Element 与 OpenLayers Feature 的绑定状态。 */
interface BindingRecord {
  readonly feature: Feature<Geometry>;
  readonly generation: symbol;
  readonly suppressionTokens: Set<symbol>;
  suppressionAcquisition: Set<symbol> | undefined;
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
}

/** FeatureBinding 整体销毁进度。 */
interface DestroyProgress {
  readonly records: readonly DestroyRecordProgress[];
  unsubscribed: boolean;
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
}

/** 从 OpenLayers Feature 解析出的 Element 身份。 */
export interface BoundFeatureIdentity {
  readonly elementId: string;
  readonly layerId: string;
  readonly visible: boolean;
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
  readonly #dirty = new Set<string>();
  readonly #unsubscribe: () => void;
  #lifecycle: Lifecycle = 'active';
  #destroyProgress: DestroyProgress | undefined;
  #destroyRunning = false;
  #reconciling = false;

  /** 订阅 Store 后立即完成首次全量对账。 */
  constructor(store: ElementStore, layers: LayerAdapter, geometry: GeometryCodec, styles: StyleCompiler, options: FeatureBindingOptions = {}) {
    this.#store = store;
    this.#layers = layers;
    this.#geometry = geometry;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#unsubscribe = store.subscribe((changes) => this.#onChanges(changes));
    this.reconcile();
  }

  /** 在提交前用临时 Feature 验证图层、Geometry 和样式均可投影。 */
  preflight(state: Readonly<ElementState>): void {
    this.#assertActive();
    void this.#layers.requireVectorSource(state.layerId);
    const feature = new Feature<Geometry>();
    try {
      this.#geometry.project(feature, state.geometry);
      void this.#styles.compile(state.style);
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

  /** 暂停 Element 投影，并以可交接租约管理恢复时机。 */
  suppressProjection(elementId: string): ProjectionSuppressionLease {
    this.#assertActive();
    this.#reconcileDirty();
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${elementId}`);

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
        this.#removeBatches(removals, false);
        if (sources.some((source) => source.hasFeature(binding.feature))) {
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
        if (progress.unsubscribed) return;
        this.#unsubscribe();
        progress.unsubscribed = true;
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
        removed.push([change.id, binding]);
        continue;
      }

      const target = targetSources.get(change.after.layerId);
      if (target === undefined) continue;
      const existing = this.#bindings.get(change.id);
      const binding = existing ?? this.#createBinding(change.id, change.after.layerId);
      try {
        binding.feature.setId(change.after.id);
        this.#geometry.project(binding.feature, change.after.geometry);
        binding.feature.setStyle(change.after.visible ? this.#styles.compile(change.after.style) : hiddenStyle);
        binding.layerId = change.after.layerId;
        binding.visible = change.after.visible;
        for (const source of sources) {
          const shouldContain = change.after.visible && binding.suppressionTokens.size === 0 && source === target;
          const contains = source.hasFeature(binding.feature);
          if (contains && !shouldContain) append(removals, source, binding.feature);
          else if (!contains && shouldContain) append(additions, source, binding.feature);
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
    const record = { feature, generation: Symbol(id), suppressionTokens: new Set<symbol>(), suppressionAcquisition: undefined, layerId, visible: false };
    this.#bindings.set(id, record);
    this.#featureIds.set(feature, id);
    return record;
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
            const id = this.#featureIds.get(feature);
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
          const id = this.#featureIds.get(feature);
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
    binding.suppressionAcquisition = undefined;
    this.#attempt(() => binding.feature.setGeometry(undefined), id, 'clear-geometry');
    this.#attempt(() => binding.feature.setStyle(undefined), id, 'clear-style');
    this.#attempt(() => binding.feature.dispose(), id, 'dispose-feature');
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
      disposed: false
    }));
    this.#destroyProgress = { records, unsubscribed: false, detached: false };
    this.#lifecycle = 'destroying';
    for (const { binding } of records) {
      binding.suppressionTokens.clear();
      binding.suppressionAcquisition = undefined;
    }
  }

  /** 从全部矢量 Source 移除待销毁 Feature。 */
  #detachDestroyRecords(records: readonly DestroyRecordProgress[]): void {
    const sources = this.#layers.vectorSources();
    const bySource = new Map<BoundSource, Feature<Geometry>[]>();
    for (const source of sources) {
      for (const { binding } of records) {
        if (source.hasFeature(binding.feature)) append(bySource, source, binding.feature);
      }
    }
    this.#removeBatches(bySource, false);
    for (const source of sources) {
      for (const { id, binding } of records) {
        if (source.hasFeature(binding.feature)) throw new CapabilityError(`Element Feature could not be detached during destroy: ${id}`);
      }
    }
  }

  /** 判断所有销毁步骤是否已经完成。 */
  #destroyComplete(progress: DestroyProgress): boolean {
    return progress.unsubscribed && progress.detached && progress.records.every((record) => record.geometryCleared && record.styleCleared && record.disposed);
  }

  /** 清空销毁状态并进入最终已销毁状态。 */
  #finishDestroy(progress: DestroyProgress): void {
    if (this.#destroyProgress !== progress) return;
    for (const { id, binding } of progress.records) {
      this.#bindings.delete(id);
      this.#featureIds.delete(binding.feature);
    }
    this.#bindings.clear();
    this.#dirty.clear();
    this.#destroyProgress = undefined;
    this.#lifecycle = 'destroyed';
  }
}

/** 将 Feature 追加到按 Source 分组的批次。 */
function append(map: Map<BoundSource, Feature<Geometry>[]>, source: BoundSource, feature: Feature<Geometry>): void {
  const values = map.get(source);
  if (values === undefined) map.set(source, [feature]);
  else values.push(feature);
}
