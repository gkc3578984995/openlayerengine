import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { cloneElementSnapshot, isElementSnapshot } from '../../core/element/snapshot.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError, UnsupportedOperationError } from '../../core/errors.js';
import type { AnimationControlPort, AnimationPreviewPort } from '../../core/ports/AnimationControlPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { LayerRenderBatch, LayerRenderContribution, LayerRenderFrame, LayerRenderLoopHandle, LayerRenderPort } from '../../core/ports/LayerRenderPort.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { TransientAnimationHandle, TransientAnimationPort, TransientAnimationSpec } from '../../core/ports/TransientAnimationPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { RenderGeometryState } from '../../core/shape/types.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import type { ElementChangeSet, ElementGeneration, ElementRevision } from '../../core/transaction/types.js';
import { createBuiltinAnimationRegistry } from '../../builtins/animations/index.js';
import { AnimationHandleImpl } from './AnimationHandle.js';
import type { AnimationRegistry } from './AnimationRegistry.js';
import type { AnimationDefinition, AnimationHandle, AnimationManager } from './types.js';

/** 构造动画管理器所需的依赖。 */
export interface AnimationManagerDependencies {
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 图形定义注册表。 */
  readonly shapes: ShapeRegistry;
  /** 图层渲染端口。 */
  readonly render: LayerRenderPort;
  /** 将元素规范状态转换为 View 工作状态。 */
  readonly shapeProjection: ShapeProjectionPort;
  /** 可选的动画定义注册表。 */
  readonly registry?: AnimationRegistry;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
}

/** 保存一个动画句柄及其管理的记录。 */
interface HandleRecord {
  /** 动画句柄实现。 */
  readonly handle: AnimationHandleImpl;
  /** 归属于该句柄的动画记录 ID。 */
  readonly recordIds: Set<string>;
}

/** 元素动画与临时动画共享的运行状态。 */
interface BaseRecord {
  /** 动画记录 ID。 */
  readonly id: string;
  /** 保持跨图层迁移前后渲染顺序稳定的创建序号。 */
  readonly order: number;
  /** 用于替换同目标动画的唯一键。 */
  readonly key: string;
  /** 所属动画句柄 ID。 */
  readonly handleId: string;
  /** 渲染通道。 */
  readonly channel: string;
  /** 当前渲染图层 ID。 */
  layerId: string;
  /** 已累计的动画时间。 */
  elapsedMs: number;
  /** 上一帧时间。 */
  lastFrameTime: number | undefined;
  /** 选择器暂停的嵌套层数。 */
  selectorPauseDepth: number;
  /** 是否被句柄暂停。 */
  handlePaused: boolean;
  /** 动画目标是否隐藏。 */
  hidden: boolean;
  /** 动画结束后是否保留最终渲染值。 */
  retained: boolean;
}

/** 绑定到元素状态的动画记录。 */
interface ElementRecord extends BaseRecord {
  /** 元素动画类型标记。 */
  readonly kind: 'element';
  /** 目标元素 ID。 */
  readonly elementId: string;
  /** 动画类型定义。 */
  readonly definition: AnimationDefinition;
  /** 规范化后的动画配置。 */
  readonly spec: AnimationSpec;
}

/** 绑定到临时渲染目标的动画记录。 */
interface TransientRecord extends BaseRecord {
  /** 临时动画类型标记。 */
  readonly kind: 'transient';
  /** 临时动画所有者 ID。 */
  readonly ownerId: string;
  /** 临时渲染目标 ID。 */
  readonly targetId: string;
  /** 闪烁动画配置。 */
  readonly spec: TransientAnimationSpec['animation'];
}

/** 动画管理器持有的记录联合类型。 */
type ManagedRecord = ElementRecord | TransientRecord;
/** 动画记录的终止状态。 */
type TerminalStatus = Extract<AnimationStatus, 'stopped' | 'finished'>;

/** 单个图层的动画记录及其热路径计数。 */
interface LayerRecordIndex {
  /** 按记录创建顺序排列的图层动画记录。 */
  records: Set<ManagedRecord>;
  /** 当前需要参与渲染的记录数。 */
  renderableCount: number;
  /** 当前需要继续请求动画帧的记录数。 */
  runningCount: number;
  /** 该索引见过的最大创建序号，用于快速追加新记录。 */
  lastOrder: number;
}

/** 已按仓库版本准备好的动画帧输入。 */
interface PreparedElementState {
  /** 深冻结的元素状态。 */
  readonly state: Readonly<ElementState>;
  /** 只在状态版本变化时生成一次的深冻结渲染几何。 */
  readonly geometry: RenderGeometryState;
  /** 元素实例生命周期令牌。 */
  readonly generation: ElementGeneration;
  /** 元素内容版本令牌。 */
  readonly revision: ElementRevision;
  /** 可安全按身份复用的预览输入。 */
  readonly sourceIdentity?: Readonly<ElementState>;
}

/** 统一管理元素动画、临时动画、预览状态和图层渲染循环。 */
export class AnimationManagerImpl implements AnimationManager, AnimationControlPort, AnimationPreviewPort, TransientAnimationPort {
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 图形定义注册表。 */
  readonly #shapes: ShapeRegistry;
  /** 图层渲染端口。 */
  readonly #render: LayerRenderPort;
  /** 将元素规范状态转换为 View 工作状态。 */
  readonly #shapeProjection: ShapeProjectionPort;
  /** 动画定义注册表。 */
  readonly #registry: AnimationRegistry;
  /** 动画错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 当前活动动画句柄。 */
  readonly #handles = new Map<string, HandleRecord>();
  /** 当前活动动画记录。 */
  readonly #records = new Map<string, ManagedRecord>();
  /** 图层到动画记录及热路径计数的索引。 */
  readonly #recordsByLayer = new Map<string, LayerRecordIndex>();
  /** 元素到结构化动画记录的索引。 */
  readonly #recordsByElement = new Map<string, Set<ElementRecord>>();
  /** 临时动画所有者到记录的索引。 */
  readonly #transientRecordsByOwner = new Map<string, Set<TransientRecord>>();
  /** 唯一记录键到记录 ID 的映射。 */
  readonly #recordKeys = new Map<string, string>();
  /** 各图层的渲染循环。 */
  readonly #passes = new Map<string, LayerRenderLoopHandle>();
  /** Transform 等交互提供的元素预览状态。 */
  readonly #previews = new Map<string, PreparedElementState>();
  /** 当前有动画记录的元素所对应的已提交帧输入。 */
  readonly #committedStates = new Map<string, PreparedElementState>();
  /** 元素仓库订阅释放函数。 */
  readonly #unsubscribeStore: () => void;
  /** 下一个动画句柄 ID。 */
  #nextHandleId = 0;
  /** 下一个动画记录 ID。 */
  #nextRecordId = 0;
  /** 管理器是否已销毁。 */
  #disposed = false;
  /** 是否正在执行销毁流程。 */
  #destroying = false;
  /** 是否已请求销毁。 */
  #destroyRequested = false;
  /** 元素仓库订阅是否仍有效。 */
  #storeSubscribed = true;

  /** 创建动画管理器并订阅元素变化。 */
  constructor(dependencies: AnimationManagerDependencies) {
    if (dependencies.errorReporter !== undefined && typeof dependencies.errorReporter !== 'function') {
      throw new InvalidArgumentError('Animation errorReporter must be a function');
    }
    this.#store = dependencies.store;
    this.#shapes = dependencies.shapes;
    this.#render = dependencies.render;
    this.#shapeProjection = dependencies.shapeProjection;
    this.#registry = dependencies.registry ?? createBuiltinAnimationRegistry();
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#unsubscribeStore = this.#store.subscribe((changes) => this.#handleStoreChanges(changes));
  }

  /** 返回当前活动动画记录数量。 */
  get activeCount(): number {
    return this.#records.size;
  }

  /** 返回当前活动渲染图层数量。 */
  get activeLayerCount(): number {
    return this.#passes.size;
  }

  /** 为匹配元素启动结构化动画。 */
  play(selector: ElementSelector, input: AnimationSpec): AnimationHandle {
    this.#assertActive();
    const safeSelector = normalizeElementSelector(selector);
    const definition = this.#registry.get(animationType(input));
    const spec = definition.normalize(input);
    const states = this.#store.query(safeSelector);
    const prepared = states.map(({ id }) => {
      const current = this.#resolvePreparedState(id);
      if (isNativeStyleRef(current.state.style)) throw new UnsupportedOperationError('Native styles cannot use structured animations');
      definition.assertCompatible(current.state, current.geometry);
      return current;
    });
    const handle = this.#createHandle(prepared.length === 0 ? 'finished' : 'running');
    if (prepared.length === 0) return handle;
    const added: ManagedRecord[] = [];
    try {
      for (const committed of prepared) {
        const preview = this.#previews.get(committed.state.id);
        const state = (preview ?? committed).state;
        const channel = animationChannel(spec);
        this.#replaceRecord(elementKey(state.id, channel));
        if (preview !== undefined) this.#previews.set(state.id, preview);
        const order = ++this.#nextRecordId;
        const record: ElementRecord = {
          kind: 'element',
          id: `animation-record-${order}`,
          order,
          key: elementKey(state.id, channel),
          handleId: handle.id,
          elementId: state.id,
          layerId: state.layerId,
          channel,
          definition,
          spec,
          elapsedMs: 0,
          lastFrameTime: undefined,
          selectorPauseDepth: 0,
          handlePaused: false,
          hidden: !state.visible,
          retained: false
        };
        this.#addRecord(record, committed);
        added.push(record);
      }
      this.#syncPasses();
      this.#requestLayers(new Set(added.map(({ layerId }) => layerId)));
      return handle;
    } catch (error) {
      for (const record of added) this.#removeRecord(record, 'stopped');
      this.#terminateHandle(handle.id, 'stopped');
      this.#syncPasses();
      throw error;
    }
  }

  /** 为临时渲染目标启动闪烁动画。 */
  playTransient(spec: TransientAnimationSpec): TransientAnimationHandle {
    this.#assertActive();
    const safe = normalizeTransient(spec);
    if (!this.#render.hasTarget(safe.renderLayerId, safe.renderTargetId)) {
      throw new ObjectDisposedError(`Transient animation target is unavailable: ${safe.renderTargetId}`);
    }
    const handle = this.#createHandle('running');
    const key = transientKey(safe.renderLayerId, safe.renderTargetId, safe.channel);
    this.#replaceRecord(key);
    const order = ++this.#nextRecordId;
    const record: TransientRecord = {
      kind: 'transient',
      id: `animation-record-${order}`,
      order,
      key,
      handleId: handle.id,
      ownerId: safe.ownerId,
      targetId: safe.renderTargetId,
      layerId: safe.renderLayerId,
      channel: safe.channel,
      spec: safe.animation,
      elapsedMs: 0,
      lastFrameTime: undefined,
      selectorPauseDepth: 0,
      handlePaused: false,
      hidden: false,
      retained: false
    };
    try {
      this.#addRecord(record);
      this.#syncPasses();
      this.#passes.get(record.layerId)?.requestRender();
      return handle;
    } catch (error) {
      this.#removeRecord(record, 'stopped');
      this.#terminateHandle(handle.id, 'stopped');
      this.#syncPasses();
      throw error;
    }
  }

  /** 暂停匹配元素指定通道的动画。 */
  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number {
    this.#assertActive();
    const records = this.#matchingElementRecords(selector, channels);
    for (const record of records) {
      this.#updateRecordState(record, () => {
        record.selectorPauseDepth += 1;
        record.lastFrameTime = undefined;
      });
    }
    const layers = new Set(records.map(({ layerId }) => layerId));
    this.#refreshHandles(records);
    this.#syncPasses(layers);
    this.#requestLayers(layers);
    return records.length;
  }

  /** 恢复匹配元素指定通道的动画。 */
  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number {
    this.#assertActive();
    const records = this.#matchingElementRecords(selector, channels).filter(({ selectorPauseDepth }) => selectorPauseDepth > 0);
    for (const record of records) {
      this.#updateRecordState(record, () => {
        record.selectorPauseDepth -= 1;
        record.lastFrameTime = undefined;
      });
    }
    const layers = new Set(records.map(({ layerId }) => layerId));
    this.#refreshHandles(records);
    this.#syncPasses(layers);
    this.#requestLayers(layers);
    return records.length;
  }

  /** 停止匹配元素指定通道的动画。 */
  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number {
    this.#assertActive();
    const records = this.#matchingElementRecords(selector, channels);
    const layers = new Set(records.map(({ layerId }) => layerId));
    for (const record of records) this.#removeRecord(record, 'stopped');
    this.#syncPasses(layers);
    this.#requestLayers(layers);
    return records.length;
  }

  /** 停止指定所有者的全部临时动画。 */
  stopTransient(ownerId: string): number {
    this.#assertActive();
    const safeOwner = nonEmptyString(ownerId, 'Transient animation ownerId');
    const records = [...(this.#transientRecordsByOwner.get(safeOwner) ?? [])];
    const layers = new Set(records.map(({ layerId }) => layerId));
    for (const record of records) this.#removeRecord(record, 'stopped');
    this.#syncPasses(layers);
    this.#requestLayers(layers);
    return records.length;
  }

  /** 停止管理器中的全部动画。 */
  stopAll(): void {
    if (this.#disposed && !this.#destroying) return;
    for (const record of [...this.#records.values()]) this.#removeRecord(record, 'stopped');
    this.#syncPasses();
  }

  /** 设置交互期间优先使用的元素预览状态。 */
  setPreview(state: Readonly<ElementState>, geometry: RenderGeometryState): void {
    this.#assertActive();
    if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Animation preview must be an Element state');
    const elementId = nonEmptyString(state.id, 'Animation preview Element id');
    const records = this.#elementRecords(elementId);
    if (records.length === 0) return;
    const committed = this.#resolvePreparedState(elementId);
    if (committed.state.type !== state.type) throw new InvalidArgumentError('Animation preview cannot change Element type');
    const existing = this.#previews.get(elementId);
    if (existing?.sourceIdentity === state && existing.generation === committed.generation && existing.revision === committed.revision) return;
    const trusted = isElementSnapshot(state);
    const snapshot = trusted ? state : cloneElementSnapshot(this.#shapes, state);
    const preview: PreparedElementState = Object.freeze({
      state: snapshot,
      geometry: freezeRenderGeometry(geometry),
      generation: committed.generation,
      revision: committed.revision,
      ...(trusted ? { sourceIdentity: state } : {})
    });
    const affectedLayers = new Set(records.map(({ layerId }) => layerId));
    this.#previews.set(elementId, preview);
    for (const record of records) {
      const timingChanged = record.layerId !== snapshot.layerId || record.hidden === snapshot.visible;
      this.#updateRecordState(record, () => {
        record.layerId = snapshot.layerId;
        record.hidden = !snapshot.visible;
        if (timingChanged) record.lastFrameTime = undefined;
      });
      affectedLayers.add(record.layerId);
      this.#refreshHandle(record.handleId);
    }
    this.#syncPasses(affectedLayers);
    this.#requestLayers(affectedLayers);
  }

  /** 清除指定元素的预览状态。 */
  clearPreview(elementId: string): void {
    this.#assertActive();
    const safeId = nonEmptyString(elementId, 'Animation preview Element id');
    if (!this.#previews.delete(safeId)) return;
    const state = this.#committedStates.get(safeId)?.state;
    const records = this.#elementRecords(safeId);
    const affectedLayers = new Set(records.map(({ layerId }) => layerId));
    if (state !== undefined) {
      for (const record of records) {
        const timingChanged = record.layerId !== state.layerId || record.hidden === state.visible;
        this.#updateRecordState(record, () => {
          record.layerId = state.layerId;
          record.hidden = !state.visible;
          if (timingChanged) record.lastFrameTime = undefined;
        });
        affectedLayers.add(record.layerId);
        this.#refreshHandle(record.handleId);
      }
    }
    this.#syncPasses(affectedLayers);
    this.#requestLayers(affectedLayers);
  }

  /** 通过句柄 ID 暂停动画组。 */
  pauseHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    for (const record of records) {
      this.#updateRecordState(record, () => {
        record.handlePaused = true;
        record.lastFrameTime = undefined;
      });
    }
    const layers = new Set(records.map(({ layerId }) => layerId));
    this.#refreshHandle(id);
    this.#syncPasses(layers);
    this.#requestLayers(layers);
  }

  /** 通过句柄 ID 恢复动画组。 */
  resumeHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    for (const record of records) {
      this.#updateRecordState(record, () => {
        record.handlePaused = false;
        record.lastFrameTime = undefined;
      });
    }
    const layers = new Set(records.map(({ layerId }) => layerId));
    this.#refreshHandle(id);
    this.#syncPasses(layers);
    this.#requestLayers(layers);
  }

  /** 通过句柄 ID 停止动画组。 */
  stopHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    const layers = new Set(records.map(({ layerId }) => layerId));
    for (const record of records) this.#removeRecord(record, 'stopped');
    this.#terminateHandle(id, 'stopped');
    this.#syncPasses(layers);
    this.#requestLayers(layers);
  }

  /** 销毁动画记录、渲染循环和仓库订阅。 */
  destroy(): void {
    if (this.#disposed || this.#destroying) return;
    this.#destroying = true;
    this.#destroyRequested = true;
    try {
      this.stopAll();
      if (this.#passes.size > 0) throw new Error('Animation render pass cleanup failed');
      if (this.#storeSubscribed) {
        this.#unsubscribeStore();
        this.#storeSubscribed = false;
      }
      this.#previews.clear();
      this.#committedStates.clear();
      this.#handles.clear();
      this.#disposed = true;
    } finally {
      this.#destroying = false;
    }
  }

  /** 创建动画句柄并在需要时登记。 */
  #createHandle(status: AnimationStatus): AnimationHandleImpl {
    const id = `animation-${++this.#nextHandleId}`;
    const handle = new AnimationHandleImpl(
      id,
      {
        pause: (handleId) => this.pauseHandle(handleId),
        resume: (handleId) => this.resumeHandle(handleId),
        stop: (handleId) => this.stopHandle(handleId)
      },
      status
    );
    if (status !== 'finished' && status !== 'stopped') this.#handles.set(id, { handle, recordIds: new Set() });
    return handle;
  }

  /** 将动画记录加入句柄和索引。 */
  #addRecord(record: ManagedRecord, committed?: PreparedElementState): void {
    const group = this.#handles.get(record.handleId);
    if (group === undefined) throw new ObjectDisposedError(`Animation handle is unavailable: ${record.handleId}`);
    this.#records.set(record.id, record);
    this.#recordKeys.set(record.key, record.id);
    group.recordIds.add(record.id);
    this.#indexLayerRecord(record);
    if (record.kind === 'element') {
      if (committed === undefined) throw new InvalidArgumentError('Element animation requires a prepared state');
      this.#committedStates.set(record.elementId, committed);
      const records = this.#recordsByElement.get(record.elementId) ?? new Set<ElementRecord>();
      records.add(record);
      this.#recordsByElement.set(record.elementId, records);
    } else {
      const records = this.#transientRecordsByOwner.get(record.ownerId) ?? new Set<TransientRecord>();
      records.add(record);
      this.#transientRecordsByOwner.set(record.ownerId, records);
    }
  }

  /** 停止并替换使用相同唯一键的动画。 */
  #replaceRecord(key: string): void {
    const id = this.#recordKeys.get(key);
    const record = id === undefined ? undefined : this.#records.get(id);
    if (record !== undefined) this.#removeRecord(record, 'stopped');
  }

  /** 移除动画记录并刷新所属句柄。 */
  #removeRecord(record: ManagedRecord, status: TerminalStatus): void {
    if (!this.#records.delete(record.id)) return;
    if (this.#recordKeys.get(record.key) === record.id) this.#recordKeys.delete(record.key);
    this.#unindexLayerRecord(record, record.layerId, this.#shouldRender(record), this.#isRunning(record));
    if (record.kind === 'element') {
      const records = this.#recordsByElement.get(record.elementId);
      records?.delete(record);
      if (records?.size === 0) {
        this.#recordsByElement.delete(record.elementId);
        this.#committedStates.delete(record.elementId);
        this.#previews.delete(record.elementId);
      }
    } else {
      const records = this.#transientRecordsByOwner.get(record.ownerId);
      records?.delete(record);
      if (records?.size === 0) this.#transientRecordsByOwner.delete(record.ownerId);
    }
    const group = this.#handles.get(record.handleId);
    group?.recordIds.delete(record.id);
    record.lastFrameTime = undefined;
    if (group !== undefined && group.recordIds.size === 0) this.#terminateHandle(record.handleId, status);
    else if (group !== undefined) this.#refreshHandle(record.handleId);
  }

  /** 完成动画记录，并按定义决定是否保留结果。 */
  #finishRecord(record: ManagedRecord, retain: boolean, status: TerminalStatus): void {
    if (!this.#records.has(record.id)) return;
    if (retain) {
      this.#updateRecordState(record, () => {
        record.retained = true;
        record.lastFrameTime = undefined;
      });
      this.#refreshHandle(record.handleId);
      return;
    }
    this.#removeRecord(record, status);
  }

  /** 把记录加入图层索引，并维护渲染与帧推进计数。 */
  #indexLayerRecord(record: ManagedRecord): void {
    const renderable = this.#shouldRender(record);
    const running = this.#isRunning(record);
    const current = this.#recordsByLayer.get(record.layerId);
    if (current === undefined) {
      this.#recordsByLayer.set(record.layerId, {
        records: new Set([record]),
        renderableCount: renderable ? 1 : 0,
        runningCount: running ? 1 : 0,
        lastOrder: record.order
      });
      return;
    }
    if (record.order > current.lastOrder) current.records.add(record);
    else current.records = new Set([...current.records, record].sort((left, right) => left.order - right.order));
    current.renderableCount += renderable ? 1 : 0;
    current.runningCount += running ? 1 : 0;
    current.lastOrder = Math.max(current.lastOrder, record.order);
  }

  /** 从图层索引移除记录，并维护调用方捕获的旧状态计数。 */
  #unindexLayerRecord(record: ManagedRecord, layerId: string, renderable: boolean, running: boolean): void {
    const current = this.#recordsByLayer.get(layerId);
    if (current === undefined || !current.records.delete(record)) return;
    current.renderableCount -= renderable ? 1 : 0;
    current.runningCount -= running ? 1 : 0;
    if (current.records.size === 0) this.#recordsByLayer.delete(layerId);
  }

  /** 原子更新会影响图层热路径索引的记录状态。 */
  #updateRecordState(record: ManagedRecord, update: () => void): void {
    const previousLayerId = record.layerId;
    const wasRenderable = this.#shouldRender(record);
    const wasRunning = this.#isRunning(record);
    update();
    if (record.layerId !== previousLayerId) {
      this.#unindexLayerRecord(record, previousLayerId, wasRenderable, wasRunning);
      this.#indexLayerRecord(record);
      return;
    }
    const current = this.#recordsByLayer.get(record.layerId);
    if (current === undefined) return;
    current.renderableCount += Number(this.#shouldRender(record)) - Number(wasRenderable);
    current.runningCount += Number(this.#isRunning(record)) - Number(wasRunning);
  }

  /** 将动画句柄置为终态并按需移除。 */
  #terminateHandle(id: string, status: TerminalStatus): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    group.handle.setStatus(status);
    if (group.recordIds.size === 0) this.#handles.delete(id);
  }

  /** 刷新一组动画记录所属的句柄状态。 */
  #refreshHandles(records: readonly ManagedRecord[]): void {
    for (const id of new Set(records.map(({ handleId }) => handleId))) this.#refreshHandle(id);
  }

  /** 根据动画记录刷新单个句柄状态。 */
  #refreshHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    const active = records.filter(({ retained }) => !retained);
    if (active.length === 0) {
      group.handle.setStatus('finished');
      return;
    }
    group.handle.setStatus(active.some((record) => this.#isRunning(record)) ? 'running' : 'paused');
  }

  /** 返回句柄当前仍管理的动画记录。 */
  #recordsFor(group: HandleRecord): ManagedRecord[] {
    return [...group.recordIds].flatMap((id) => {
      const record = this.#records.get(id);
      return record === undefined ? [] : [record];
    });
  }

  /** 查找选择器和通道匹配的元素动画记录。 */
  #matchingElementRecords(selector: ElementSelector, channels: readonly AnimationChannel[] | undefined): ElementRecord[] {
    const safeSelector = normalizeElementSelector(selector);
    const channelSet = normalizeChannels(channels);
    const matches = new Set<ElementRecord>();
    for (const { id } of this.#store.query(safeSelector)) {
      for (const record of this.#recordsByElement.get(id) ?? []) {
        if (channelSet === undefined || channelSet.has(record.channel)) matches.add(record);
      }
    }
    return [...matches].sort((left, right) => left.order - right.order);
  }

  /** 查找指定元素的全部动画记录。 */
  #elementRecords(elementId: string): ElementRecord[] {
    return [...(this.#recordsByElement.get(elementId) ?? [])];
  }

  /** 创建需要的图层渲染循环并清理空闲循环。 */
  #syncPasses(layerIds?: ReadonlySet<string>): void {
    const targets = [...(layerIds ?? new Set([...this.#recordsByLayer.keys(), ...this.#passes.keys()]))];
    for (const layerId of targets) {
      const pass = this.#passes.get(layerId);
      if (pass === undefined || (this.#recordsByLayer.get(layerId)?.renderableCount ?? 0) > 0) continue;
      pass.requestRender();
      if (this.#destroyPass(pass)) this.#passes.delete(layerId);
    }
    for (const layerId of targets) {
      if (this.#passes.has(layerId) || (this.#recordsByLayer.get(layerId)?.renderableCount ?? 0) === 0) continue;
      const pass = this.#render.open(layerId, (frame) => this.#renderLayer(layerId, frame));
      this.#passes.set(layerId, pass);
    }
  }

  /** 计算指定图层当前帧的动画渲染贡献。 */
  #renderLayer(layerId: string, frame: LayerRenderFrame): LayerRenderBatch {
    const contributions: LayerRenderContribution[] = [];
    const finished: Array<{ record: ManagedRecord; retain: boolean; status: TerminalStatus }> = [];
    const records = [...(this.#recordsByLayer.get(layerId)?.records ?? [])];
    for (const record of records) {
      if (record.layerId !== layerId || !this.#shouldRender(record)) continue;
      if (record.kind === 'transient') {
        if (!this.#render.hasTarget(record.layerId, record.targetId)) {
          finished.push({ record, retain: false, status: 'stopped' });
          continue;
        }
        if (this.#isRunning(record)) this.#advance(record, frame.time);
        contributions.push(
          Object.freeze({
            targetId: record.targetId,
            channel: record.channel,
            value: Object.freeze({ visible: Math.floor(record.elapsedMs / record.spec.periodMs) % 2 === 0 })
          })
        );
        continue;
      }
      const prepared = this.#previews.get(record.elementId) ?? this.#committedStates.get(record.elementId);
      if (prepared === undefined || prepared.state.layerId !== record.layerId || !prepared.state.visible) continue;
      try {
        const { geometry, state } = prepared;
        record.definition.assertCompatible(state, geometry);
        if (isNativeStyleRef(state.style)) throw new UnsupportedOperationError('Native styles cannot use structured animations');
        if (this.#isRunning(record)) this.#advance(record, frame.time);
        const result = record.definition.frame(
          {
            instance: record,
            state,
            geometry,
            style: state.style,
            elapsedMs: record.elapsedMs,
            resolution: frame.resolution
          },
          record.spec
        );
        if ((result.value.primitives?.length ?? 0) > 0 || result.value.visible !== undefined) {
          contributions.push(Object.freeze({ targetId: record.elementId, channel: record.channel, value: result.value }));
        }
        if (result.finished && !record.retained) finished.push({ record, retain: result.retain === true, status: 'finished' });
      } catch (error) {
        this.#report(error, 'render-frame', record.id);
        finished.push({ record, retain: false, status: 'stopped' });
      }
    }
    for (const item of finished) this.#finishRecord(item.record, item.retain, item.status);
    if (finished.length > 0) this.#syncPasses(new Set([layerId]));
    return Object.freeze({
      contributions: Object.freeze(contributions),
      requestNextFrame: (this.#recordsByLayer.get(layerId)?.runningCount ?? 0) > 0
    });
  }

  /** 累计动画经过时间。 */
  #advance(record: ManagedRecord, time: number): void {
    if (!Number.isFinite(time)) throw new InvalidArgumentError('Animation frame time must be finite');
    if (record.lastFrameTime !== undefined) record.elapsedMs += Math.max(0, time - record.lastFrameTime);
    record.lastFrameTime = time;
  }

  /** 判断动画记录是否正在推进时间。 */
  #isRunning(record: ManagedRecord): boolean {
    return !record.retained && !record.hidden && !record.handlePaused && record.selectorPauseDepth === 0;
  }

  /** 判断动画记录是否需要参与渲染。 */
  #shouldRender(record: ManagedRecord): boolean {
    return !record.hidden;
  }

  /** 根据元素仓库变化同步动画记录。 */
  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#disposed || this.#destroyRequested) return;
    const affectedLayers = new Set<string>();
    for (const change of changes.changes) {
      const records = this.#elementRecords(change.id);
      if (change.kind === 'remove' || change.after === undefined) {
        this.#previews.delete(change.id);
        this.#committedStates.delete(change.id);
      }
      let committed: PreparedElementState | undefined;
      if (change.kind !== 'remove' && change.after !== undefined && records.length > 0) {
        try {
          committed = this.#resolvePreparedState(change.id);
          this.#committedStates.set(change.id, committed);
        } catch (error) {
          for (const record of records) {
            affectedLayers.add(record.layerId);
            this.#report(error, 'prepare-element', record.id);
            this.#removeRecord(record, 'stopped');
          }
          continue;
        }
      }
      for (const record of records) {
        affectedLayers.add(record.layerId);
        if (change.kind === 'remove' || change.after === undefined) {
          this.#removeRecord(record, 'stopped');
          continue;
        }
        const state = (this.#previews.get(change.id) ?? committed)?.state;
        if (state === undefined) continue;
        const timingChanged = record.layerId !== state.layerId || record.hidden === state.visible;
        this.#updateRecordState(record, () => {
          record.layerId = state.layerId;
          record.hidden = !state.visible;
          if (timingChanged) record.lastFrameTime = undefined;
        });
        affectedLayers.add(record.layerId);
        this.#refreshHandle(record.handleId);
      }
    }
    this.#syncPasses(affectedLayers);
    this.#requestLayers(affectedLayers);
  }

  /** 解析当前仓库版本并复用或生成对应的动画帧输入。 */
  #resolvePreparedState(elementId: string): PreparedElementState {
    const state = this.#store.resolve(elementId);
    const generation = this.#store.generationOf(elementId);
    const revision = this.#store.revisionOf(elementId);
    if (state === undefined || generation === undefined || revision === undefined) {
      throw new InvalidArgumentError(`Animation Element does not exist: ${elementId}`);
    }
    const cached = this.#committedStates.get(elementId);
    if (cached?.state === state && cached.generation === generation && cached.revision === revision) return cached;
    return Object.freeze({
      state,
      geometry: freezeRenderGeometry(this.#shapes.get(state.type).toRenderGeometry(this.#shapeProjection.toViewState(state.geometry) as never)),
      generation,
      revision
    });
  }

  /** 请求指定图层重新渲染。 */
  #requestLayers(layerIds: ReadonlySet<string>): void {
    for (const layerId of layerIds) this.#passes.get(layerId)?.requestRender();
  }

  /** 安全销毁图层渲染循环。 */
  #destroyPass(pass: LayerRenderLoopHandle): boolean {
    try {
      pass.destroy();
      return true;
    } catch (error) {
      this.#report(error, 'destroy-render-pass');
      return false;
    }
  }

  /** 隔离并上报动画错误。 */
  #report(error: unknown, operation: string, ownerId?: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'AnimationManager',
        operation,
        ...(ownerId === undefined ? {} : { ownerId })
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      return;
    }
  }

  /** 确保动画管理器仍可使用。 */
  #assertActive(): void {
    if (this.#disposed || this.#destroyRequested) throw new ObjectDisposedError('AnimationManager has been destroyed');
  }
}

/** 深冻结动画专用渲染几何，使按坐标身份建立的帧缓存可安全复用。 */
function freezeRenderGeometry(geometry: RenderGeometryState): RenderGeometryState {
  if (geometry.type === 'point') {
    Object.freeze(geometry.coordinates);
  } else if (geometry.type === 'polyline') {
    for (const coordinate of geometry.coordinates) Object.freeze(coordinate);
    Object.freeze(geometry.coordinates);
  } else if (geometry.type === 'polygon') {
    for (const ring of geometry.coordinates) {
      for (const coordinate of ring) Object.freeze(coordinate);
      Object.freeze(ring);
    }
    Object.freeze(geometry.coordinates);
  } else {
    Object.freeze(geometry.center);
  }
  return Object.freeze(geometry);
}

/** 从未信任输入中读取动画类型。 */
function animationType(input: AnimationSpec): AnimationSpec['type'] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Animation spec must be a plain object');
  const descriptor = Object.getOwnPropertyDescriptor(input, 'type');
  if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Animation type must be a data property');
  if (descriptor.value !== 'pulse' && descriptor.value !== 'dash-flow' && descriptor.value !== 'path-travel') {
    throw new InvalidArgumentError(`Unknown animation type: ${String(descriptor.value)}`);
  }
  return descriptor.value;
}

/** 校验并冻结元素动画选择器。 */
function normalizeElementSelector(input: ElementSelector): ElementSelector {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Animation selector must be a plain object');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Animation selector must be a plain object');
  const allowed = new Set(['id', 'ids', 'module', 'layerId', 'type', 'visible', 'predicate']);
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown animation selector field: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Animation selector cannot contain accessor properties');
    values[key] = descriptor.value;
  }
  if (values.id !== undefined && values.ids !== undefined) throw new InvalidArgumentError('Animation selector cannot contain both id and ids');
  const id = optionalNonEmptyString(values.id, 'Animation selector id');
  const ids = values.ids === undefined ? undefined : stringArray(values.ids, 'Animation selector ids');
  const module = optionalNonEmptyString(values.module, 'Animation selector module');
  const layerId = optionalNonEmptyString(values.layerId, 'Animation selector layerId');
  const type = optionalNonEmptyString(values.type, 'Animation selector type') as ElementSelector['type'];
  if (values.visible !== undefined && typeof values.visible !== 'boolean') throw new InvalidArgumentError('Animation selector visible must be a boolean');
  if (values.predicate !== undefined && typeof values.predicate !== 'function')
    throw new InvalidArgumentError('Animation selector predicate must be a function');
  return Object.freeze({
    ...(id === undefined ? {} : { id }),
    ...(ids === undefined ? {} : { ids }),
    ...(module === undefined ? {} : { module }),
    ...(layerId === undefined ? {} : { layerId }),
    ...(type === undefined ? {} : { type }),
    ...(values.visible === undefined ? {} : { visible: values.visible as boolean }),
    ...(values.predicate === undefined ? {} : { predicate: values.predicate as ElementSelector['predicate'] })
  });
}

/** 解析动画使用的渲染通道。 */
function animationChannel(spec: AnimationSpec): string {
  return nonEmptyString(spec.channel ?? spec.type, 'Animation channel');
}

/** 校验通道数组并转换为集合。 */
function normalizeChannels(channels: readonly AnimationChannel[] | undefined): ReadonlySet<string> | undefined {
  if (channels === undefined) return undefined;
  return new Set(stringArray(channels, 'Animation channels'));
}

/** 校验并冻结临时动画配置。 */
function normalizeTransient(input: TransientAnimationSpec): TransientAnimationSpec {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Transient animation must be a plain object');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Transient animation must be a plain object');
  const allowed = new Set(['ownerId', 'renderLayerId', 'renderTargetId', 'channel', 'animation']);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown transient animation field: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Transient animation cannot contain accessor properties');
  }
  const animation = strictBlinkAnimation(input.animation);
  return Object.freeze({
    ownerId: nonEmptyString(input.ownerId, 'Transient animation ownerId'),
    renderLayerId: nonEmptyString(input.renderLayerId, 'Transient animation renderLayerId'),
    renderTargetId: nonEmptyString(input.renderTargetId, 'Transient animation renderTargetId'),
    channel: nonEmptyString(input.channel, 'Transient animation channel'),
    animation: Object.freeze({ type: 'blink', periodMs: animation.periodMs })
  });
}

/** 严格校验临时闪烁动画配置。 */
function strictBlinkAnimation(input: TransientAnimationSpec['animation']): TransientAnimationSpec['animation'] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Transient animation type must be blink');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Transient blink animation must be a plain object');
  const values = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || (key !== 'type' && key !== 'periodMs')) throw new InvalidArgumentError(`Unknown transient blink field: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Transient blink animation cannot contain accessor properties');
    values[key] = descriptor.value;
  }
  if (values.type !== 'blink') throw new InvalidArgumentError('Transient animation type must be blink');
  if (typeof values.periodMs !== 'number' || !Number.isFinite(values.periodMs) || values.periodMs <= 0) {
    throw new InvalidArgumentError('Transient blink periodMs must be positive');
  }
  return Object.freeze({ type: 'blink', periodMs: values.periodMs });
}

/** 读取非空字符串。 */
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

/** 读取可选的非空字符串。 */
function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, label);
}

/** 校验并冻结非空字符串数组。 */
function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new InvalidArgumentError(`${label} must be an array`);
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain holes or accessor properties`);
    result.push(nonEmptyString(descriptor.value, `${label} item`));
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length' || (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length)) continue;
    throw new InvalidArgumentError(`${label} cannot contain extra properties`);
  }
  return Object.freeze(result);
}

/** 生成元素动画的唯一记录键。 */
function elementKey(elementId: string, channel: string): string {
  return `element\u0000${elementId}\u0000${channel}`;
}

/** 生成临时动画的唯一记录键。 */
function transientKey(layerId: string, targetId: string, channel: string): string {
  return `transient\u0000${layerId}\u0000${targetId}\u0000${channel}`;
}
