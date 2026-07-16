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

/** 已绑定要素使用的矢量数据源。 */
type BoundSource = VectorSource<Feature<Geometry>>;

/** 单个元素与 OpenLayers 要素的绑定状态。 */
interface BindingRecord {
  /** 实际 OpenLayers 要素。 */
  readonly feature: Feature<Geometry>;
  /** 用于识别绑定代次的标记。 */
  readonly generation: symbol;
  /** 当前持有的投影抑制令牌。 */
  readonly suppressionTokens: Set<symbol>;
  /** 正在获取抑制权时加入的令牌。 */
  suppressionAcquisition: Set<symbol> | undefined;
  /** 要素当前所属的图层 ID。 */
  layerId: string;
  /** 元素当前是否可见。 */
  visible: boolean;
}

/** 销毁单个绑定时的分步进度。 */
interface DestroyRecordProgress {
  /** 元素 ID。 */
  readonly id: string;
  /** 待销毁的绑定。 */
  readonly binding: BindingRecord;
  /** 几何是否已经清除。 */
  geometryCleared: boolean;
  /** 样式是否已经清除。 */
  styleCleared: boolean;
  /** 要素是否已经销毁。 */
  disposed: boolean;
}

/** FeatureBinding 整体销毁进度。 */
interface DestroyProgress {
  /** 每个绑定的清理进度。 */
  readonly records: readonly DestroyRecordProgress[];
  /** 是否已经取消 Store 订阅。 */
  unsubscribed: boolean;
  /** 是否已经从全部数据源移除要素。 */
  detached: boolean;
}

/** FeatureBinding 的生命周期状态。 */
type Lifecycle = 'active' | 'destroying' | 'destroyed';

/** 一份投影抑制租约共享的内部状态。 */
interface SuppressionLeaseState {
  /** 被抑制的元素 ID。 */
  readonly elementId: string;
  /** 获取租约时的绑定。 */
  readonly binding: BindingRecord;
  /** 获取租约时的绑定代次。 */
  readonly generation: symbol;
  /** 写入绑定令牌集合的唯一标记。 */
  readonly token: symbol;
  /** 当前租约句柄的所有者。 */
  owner: symbol | undefined;
  /** 租约是否已经释放。 */
  released: boolean;
}

/** FeatureBinding 的可选配置。 */
export interface FeatureBindingOptions {
  /** 接收投影和清理过程中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
}

/** 从 OpenLayers 要素解析出的元素身份。 */
export interface BoundFeatureIdentity {
  /** 元素 ID。 */
  readonly elementId: string;
  /** 元素所属图层 ID。 */
  readonly layerId: string;
  /** 元素当前是否可见。 */
  readonly visible: boolean;
}

/** 暂停元素投影到矢量数据源的租约。 */
export interface ProjectionSuppressionLease {
  /** 被暂停投影的元素 ID。 */
  readonly elementId: string;
  /** 租约是否已经生效且仍有效。 */
  readonly active: boolean;
  /** 将租约所有权转交给新句柄。 */
  handoff(): ProjectionSuppressionLease;
  /** 释放租约并恢复元素投影。 */
  release(): void;
}

/** 元素隐藏时使用的空样式函数。 */
const hiddenStyle: StyleFunction = () => [];

/** 将元素 Store 持续同步为 OpenLayers 要素。 */
export class FeatureBinding {
  /** 元素核心状态来源。 */
  readonly #store: ElementStore;
  /** 提供矢量图层和数据源。 */
  readonly #layers: LayerAdapter;
  /** 将图形状态转换为 Geometry。 */
  readonly #geometry: GeometryCodec;
  /** 将样式状态编译为 OpenLayers 样式。 */
  readonly #styles: StyleCompiler;
  /** 接收同步过程中的非致命错误。 */
  readonly #errorReporter: ErrorReporter;
  /** 按元素 ID 保存当前绑定。 */
  readonly #bindings = new Map<string, BindingRecord>();
  /** 从 OpenLayers 要素反查元素 ID。 */
  readonly #featureIds = new WeakMap<Feature<Geometry>, string>();
  /** 等待再次同步的元素 ID。 */
  readonly #dirty = new Set<string>();
  /** 取消元素 Store 订阅的函数。 */
  readonly #unsubscribe: () => void;
  /** 当前生命周期状态。 */
  #lifecycle: Lifecycle = 'active';
  /** 可重试的销毁进度。 */
  #destroyProgress: DestroyProgress | undefined;
  /** 是否正在执行销毁。 */
  #destroyRunning = false;
  /** 是否正在进行完整对账。 */
  #reconciling = false;

  /** 保存同步依赖、订阅 Store，并执行首次对账。 */
  constructor(store: ElementStore, layers: LayerAdapter, geometry: GeometryCodec, styles: StyleCompiler, options: FeatureBindingOptions = {}) {
    this.#store = store;
    this.#layers = layers;
    this.#geometry = geometry;
    this.#styles = styles;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#unsubscribe = store.subscribe((changes) => this.#onChanges(changes));
    this.reconcile();
  }

  /** 在状态提交前检查图层、图形和样式是否可投影。 */
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

  /** 返回图形最终使用的渲染类型。 */
  renderKind(state: ShapeInput): RenderGeometryKind {
    this.#assertActive();
    return this.#geometry.renderKind(state);
  }

  /** 获取元素当前绑定的 OpenLayers 要素。 */
  requireFeature(id: string): Feature<Geometry> {
    this.#assertActive();
    this.#reconcileDirty();
    const feature = this.#bindings.get(id)?.feature;
    if (feature === undefined) throw new ObjectDisposedError(`Element Feature is not bound: ${id}`);
    return feature;
  }

  /** 临时将元素要素从所有矢量数据源移除。 */
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

  /** 判断要素是否仍是指定元素的当前绑定。 */
  isCurrentFeature(id: string, feature: Feature<Geometry>): boolean {
    this.#assertActive();
    return this.#bindings.get(id)?.feature === feature;
  }

  /** 从当前要素反查元素 ID。 */
  elementIdFor(feature: Feature<Geometry>): string | undefined {
    if (this.#lifecycle !== 'active') return undefined;
    const id = this.#featureIds.get(feature);
    return id !== undefined && this.#bindings.get(id)?.feature === feature ? id : undefined;
  }

  /** 解析要素当前对应的元素、图层和可见状态。 */
  resolveFeature(feature: Feature<Geometry>): BoundFeatureIdentity | undefined {
    if (this.#lifecycle !== 'active') return undefined;
    const elementId = this.elementIdFor(feature);
    if (elementId === undefined) return undefined;
    if (this.#dirty.has(elementId)) return undefined;
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) return undefined;
    return { elementId, layerId: binding.layerId, visible: binding.visible };
  }

  /** 判断元素所属矢量源是否启用水平世界环绕。 */
  wrapsX(elementId: string): boolean {
    this.#assertActive();
    const binding = this.#bindings.get(elementId);
    if (binding === undefined) return false;
    return this.#layers.requireVectorSource(binding.layerId).getWrapX() === true;
  }

  /** 对照整个元素 Store 修正全部要素绑定。 */
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

  /** 分步解绑并销毁全部 OpenLayers 要素。 */
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

  /** 接收 Store 变化并同步对应要素。 */
  #onChanges(changes: ElementChangeSet): void {
    if (this.#lifecycle !== 'active') return;
    this.#reconcileDirty();
    this.#applyChanges(changes);
  }

  /** 重新同步之前失败并标记为脏的元素。 */
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

  /** 只重新同步一个元素。 */
  #reconcileElement(id: string): void {
    this.#assertActive();
    const state = this.#store.get(id);
    const change: ElementChange = state === undefined ? { kind: 'remove', id } : { kind: this.#bindings.has(id) ? 'update' : 'add', id, after: state };
    this.#applyChanges({ changes: [change] });
  }

  /** 批量应用元素增删改并更新数据源。 */
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

  /** 创建并登记一个新的要素绑定。 */
  #createBinding(id: string, layerId: string): BindingRecord {
    const feature = new Feature<Geometry>();
    const record = { feature, generation: Symbol(id), suppressionTokens: new Set<symbol>(), suppressionAcquisition: undefined, layerId, visible: false };
    this.#bindings.set(id, record);
    this.#featureIds.set(feature, id);
    return record;
  }

  /** 按数据源批量移除要素，失败时逐个重试。 */
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

  /** 按数据源批量新增要素，失败时逐个重试。 */
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

  /** 删除绑定并尽力清理对应 OpenLayers 要素。 */
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

  /** 标记元素需要重试并上报本次错误。 */
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

  /** 从全部矢量数据源移除待销毁要素。 */
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

/** 将要素追加到按数据源分组的批次。 */
function append(map: Map<BoundSource, Feature<Geometry>[]>, source: BoundSource, feature: Feature<Geometry>): void {
  const values = map.get(source);
  if (values === undefined) map.set(source, [feature]);
  else values.push(feature);
}
