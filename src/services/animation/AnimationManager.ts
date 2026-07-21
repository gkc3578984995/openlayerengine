import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { cloneElementSnapshot, isElementSnapshot } from '../../core/element/snapshot.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError, UnsupportedOperationError } from '../../core/errors.js';
import type { AnimationControlPort, AnimationPreviewPort } from '../../core/ports/AnimationControlPort.js';
import type { AnimationClockPort } from '../../core/ports/AnimationClockPort.js';
import type { AnimationWakePort } from '../../core/ports/AnimationWakePort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type {
  LayerPresentationLease,
  LayerRenderBatch,
  LayerRenderContribution,
  LayerRenderDynamicStyle,
  LayerRenderFrame,
  LayerRenderLoopHandle,
  LayerRenderPort,
  LayerRenderPrimitive,
  LayerRenderSlotReservation
} from '../../core/ports/LayerRenderPort.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { TransientAnimationHandle, TransientAnimationPort, TransientAnimationSpec } from '../../core/ports/TransientAnimationPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import { calculateRenderGeometryExtent, type RenderGeometryExtent } from '../../core/shape/geometryDetails.js';
import { renderTrustedShapeState } from '../../core/shape/trustedRender.js';
import type { RenderGeometryState } from '../../core/shape/types.js';
import { isNativeStyleRef, type StyleSpec } from '../../core/style/types.js';
import { styleVisualOutsetPx } from '../../core/style/visualOutset.js';
import type { ElementChangeSet, ElementGeneration, ElementRevision } from '../../core/transaction/types.js';
import { createAnimationFrameBuffer } from './AnimationFrameBuffer.js';
import { AnimationDeadlineScheduler } from './AnimationDeadlineScheduler.js';
import { AnimationHandleImpl } from './AnimationHandle.js';
import type { AnimationRegistry } from './AnimationRegistry.js';
import type {
  AnimationDefinition,
  AnimationFrameBuffer,
  AnimationHandle,
  AnimationManager,
  AnimationOverlaySlotBuffer,
  AnimationRuntime,
  AnimationSample,
  AnimationSlotDefinition,
  AnimationStyleParameter,
  AnimationTargetProfile
} from './types.js';

/** 构造动画管理器所需的依赖。 */
export interface AnimationManagerDependencies {
  /** Element 状态真源；动画只读取已提交状态。 */
  readonly store: ElementStore;
  /** 图形定义注册表。 */
  readonly shapes: ShapeRegistry;
  /** 隔离具体渲染 Adapter 的图层渲染 Port。 */
  readonly render: LayerRenderPort;
  /** 将元素规范状态转换为 View 工作状态。 */
  readonly shapeProjection: ShapeProjectionPort;
  /** 动画定义注册表。 */
  readonly registry: AnimationRegistry;
  /** 与渲染帧时间使用同一时间域的时钟。 */
  readonly clock: AnimationClockPort;
  /** Earth 级单次截止时间唤醒。 */
  readonly wake: AnimationWakePort;
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
  /** 同一目标与通道发生 replace 时使用的唯一键。 */
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
  /** 交互预览暂时接管展示权时是否抑制动画。 */
  suppressed: boolean;
  /** 动画结束后是否保留最终渲染值。 */
  retained: boolean;
  /** 当前已登记的绝对截止时间。 */
  deadlineTimestamp: number | undefined;
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
  readonly runtime: AnimationRuntime;
  /** Runtime 本次绑定对应的稳定 slot 声明与裁剪画像。 */
  renderProfile: AnimationRecordRenderProfile;
  buffer: AnimationFrameBuffer;
  sample: AnimationSample | undefined;
  /** Runtime 独立 tick 时复用的最后一份视图参数。 */
  lastRenderFrame: LayerRenderFrame | undefined;
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
type RenderBounds = RenderGeometryExtent;

/** 单个图层的动画记录及其热路径计数。 */
interface LayerRecordIndex {
  /** 按记录创建顺序排列的图层动画记录。 */
  records: Set<ManagedRecord>;
  /** 当前需要参与渲染的记录数。 */
  renderableCount: number;
  /** 当前需要继续请求动画帧的记录数。 */
  runningCount: number;
  /** 已收录的最大创建序号，新记录可据此直接追加。 */
  lastOrder: number;
}

/** 已按仓库版本准备好的动画帧输入。 */
interface PreparedElementState {
  /** 深冻结的元素状态。 */
  readonly state: Readonly<ElementState>;
  /** 只在状态版本变化时生成一次的深冻结渲染几何。 */
  readonly geometry: RenderGeometryState;
  /** 规范渲染几何的保守 View 坐标范围。 */
  readonly bounds: RenderBounds | undefined;
  /** 规范样式相对 Geometry 的最大 CSS 像素外扩；undefined 表示不可安全裁剪。 */
  readonly baseVisualOutsetPx: number | undefined;
  readonly target: AnimationTargetProfile;
  /** 元素实例生命周期令牌。 */
  readonly generation: ElementGeneration;
  /** 元素内容版本令牌。 */
  readonly revision: ElementRevision;
  /** 可安全按身份复用的预览输入。 */
  readonly sourceIdentity?: Readonly<ElementState>;
}

/** Runtime 在 create/rebind 边界生成、稳定帧只读复用的渲染元数据。 */
interface AnimationRecordRenderProfile {
  /** 当前 Runtime 绑定声明的稳定 slot。 */
  readonly slots: readonly AnimationSlotDefinition[];
  /** Adapter 用于保留 inactive slot 的不可变声明。 */
  readonly slotReservations: readonly LayerRenderSlotReservation[];
  /** target modifier 需要的基础展示 slot 声明。 */
  readonly presentationReservation: LayerRenderSlotReservation | undefined;
  /** 任一视觉范围无法可靠估算时禁用裁剪。 */
  readonly disableViewportCulling: boolean;
  /** Runtime 与所有 slot 样式的最大 CSS 像素外扩。 */
  readonly visualOutsetPx: number;
}

/** Session 当前持有的预览输入；没有动画记录时只保留引用，延迟到 play 再准备帧数据。 */
interface ActivePreviewState {
  readonly state: Readonly<ElementState>;
  readonly geometry: RenderGeometryState;
}

const ANIMATION_RENDER_CHANNEL = '$animation';

/** 统一管理 Element 动画、Session 临时预览和图层级渲染循环。 */
export class AnimationManagerImpl implements AnimationManager, AnimationControlPort, AnimationPreviewPort, TransientAnimationPort {
  /** Element 状态真源；帧内临时值绝不反写。 */
  readonly #store: ElementStore;
  /** 图形定义注册表。 */
  readonly #shapes: ShapeRegistry;
  /** 隔离具体渲染 Adapter 的图层渲染 Port。 */
  readonly #render: LayerRenderPort;
  /** 将元素规范状态转换为 View 工作状态。 */
  readonly #shapeProjection: ShapeProjectionPort;
  /** 动画定义注册表。 */
  readonly #registry: AnimationRegistry;
  readonly #clock: AnimationClockPort;
  readonly #deadlines: AnimationDeadlineScheduler;
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
  /** Transform 等 Session 提供的临时 Element 工作态。 */
  readonly #previews = new Map<string, PreparedElementState>();
  /** 独立于动画记录生命周期的交互预览所有权。 */
  readonly #activePreviews = new Map<string, ActivePreviewState>();
  /** 活动动画对应的已提交帧输入，按 Element 版本复用。 */
  readonly #committedStates = new Map<string, PreparedElementState>();
  readonly #presentationLeases = new Map<string, LayerPresentationLease>();
  /** ElementStore 订阅的释放函数。 */
  readonly #unsubscribeStore: () => void;
  /** 下一个动画句柄 ID。 */
  #nextHandleId = 0;
  /** 下一个动画记录 ID。 */
  #nextRecordId = 0;
  /** 管理器是否已销毁。 */
  #disposed = false;
  #destroying = false;
  /** 是否已请求销毁。 */
  #destroyRequested = false;
  /** ElementStore 订阅是否仍有效。 */
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
    this.#registry = dependencies.registry;
    this.#clock = dependencies.clock;
    this.#deadlines = new AnimationDeadlineScheduler({
      clock: dependencies.clock,
      wake: dependencies.wake,
      onWake: (recordIds, now) => this.#handleDeadlineWake(recordIds, now)
    });
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
    if (states.length === 0) return this.#createHandle('finished');
    const channel = animationChannel(spec);
    const startedAt = this.#clock.now();
    if (!Number.isFinite(startedAt)) throw new InvalidArgumentError('Animation clock must return a finite timestamp');
    const candidates: Array<{
      committed: PreparedElementState;
      interaction: PreparedElementState;
      suppressed: boolean;
      runtime: AnimationRuntime;
      renderProfile: AnimationRecordRenderProfile;
      buffer: AnimationFrameBuffer;
      sample: AnimationSample;
    }> = [];
    try {
      for (const { id } of states) {
        try {
          const committed = this.#resolvePreparedState(id);
          const preview = this.#resolveActivePreview(id, committed);
          const interaction = preview ?? committed;
          const followsPreview = preview !== undefined && definition.interactionPolicy.transform === 'follow-preview';
          const bound = followsPreview ? preview : committed;
          const suppressed = preview !== undefined && !followsPreview;
          definition.assertCompatible(bound.target);
          if (definition.writeDomains.has('target-geometry')) {
            const conflicting = this.#elementRecords(id).find((record) => record.channel !== channel && record.definition.writeDomains.has('target-geometry'));
            if (conflicting !== undefined) {
              throw new CapabilityError(
                `Animation target ${id} already has target-geometry writer on channel ${conflicting.channel}; requested channel ${channel}`
              );
            }
          }
          const runtime = definition.create(bound.target, spec);
          try {
            const slots = runtime.slots;
            const buffer = createAnimationFrameBuffer(slots);
            const renderProfile = createAnimationRecordRenderProfile(id, channel, definition, runtime, slots);
            const sample = runtime.sample({ target: bound.target, elapsedMs: 0, resolution: 1, rotation: 0, pixelRatio: 1 }, buffer);
            candidates.push({ committed, interaction, suppressed, runtime, renderProfile, buffer, sample });
          } catch (error) {
            runtime.destroy();
            throw error;
          }
        } catch (error) {
          throw animationTargetFailure(id, error);
        }
      }
    } catch (error) {
      for (const { runtime } of candidates) runtime.destroy();
      throw error;
    }

    const handle = this.#createHandle('running');
    const added: ElementRecord[] = [];
    const immediatelyFinished: Array<{ record: ElementRecord; retain: boolean }> = [];
    const replaced = candidates.map(({ interaction }) => {
      const key = elementKey(interaction.state.id, channel);
      const currentId = this.#recordKeys.get(key);
      return currentId === undefined ? undefined : this.#records.get(currentId);
    });
    try {
      for (const { committed, interaction, suppressed, runtime, renderProfile, buffer, sample } of candidates) {
        const state = interaction.state;
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
          runtime,
          renderProfile,
          buffer,
          sample,
          lastRenderFrame: undefined,
          elapsedMs: 0,
          lastFrameTime: state.visible && !suppressed ? startedAt : undefined,
          selectorPauseDepth: 0,
          handlePaused: false,
          hidden: !state.visible,
          suppressed,
          retained: false,
          deadlineTimestamp: undefined
        };
        added.push(record);
        this.#addRecord(record, committed);
        this.#syncRecordDeadline(record, startedAt);
        if (sample.finished) immediatelyFinished.push({ record, retain: sample.retain === true });
      }
      this.#syncPasses();
      for (const record of replaced) {
        if (record !== undefined) this.#removeRecord(record, 'stopped');
      }
      for (const { record, retain } of immediatelyFinished) this.#finishRecord(record, retain, 'finished');
      this.#refreshHandle(handle.id);
      this.#syncPasses();
      this.#requestLayers(new Set(added.map(({ layerId }) => layerId)));
      return handle;
    } catch (error) {
      for (const record of added) this.#removeRecord(record, 'stopped');
      for (const { runtime } of candidates) runtime.destroy();
      for (const record of replaced) {
        if (record !== undefined && this.#records.has(record.id)) this.#recordKeys.set(record.key, record.id);
      }
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
      suppressed: false,
      retained: false,
      deadlineTimestamp: undefined
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

  /** 设置交互期间优先渲染的 Session 工作态，不写回 ElementStore。 */
  setPreview(state: Readonly<ElementState>, geometry: RenderGeometryState): void {
    this.#assertActive();
    if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Animation preview must be an Element state');
    const elementId = nonEmptyString(state.id, 'Animation preview Element id');
    const activePreview = Object.freeze({ state, geometry });
    const records = this.#elementRecords(elementId);
    if (records.length === 0) {
      this.#activePreviews.set(elementId, activePreview);
      this.#previews.delete(elementId);
      return;
    }
    const committed = this.#resolvePreparedState(elementId);
    const preview = this.#preparePreview(activePreview, committed);
    this.#activePreviews.set(elementId, activePreview);
    if (this.#previews.get(elementId) === preview) return;
    const affectedLayers = new Set(records.map(({ layerId }) => layerId));
    this.#previews.set(elementId, preview);
    for (const record of records) {
      const followsPreview = record.definition.interactionPolicy.transform === 'follow-preview';
      const timingChanged = record.layerId !== preview.state.layerId || record.hidden === preview.state.visible || record.suppressed === followsPreview;
      this.#updateRecordState(record, () => {
        record.layerId = preview.state.layerId;
        record.hidden = !preview.state.visible;
        record.suppressed = !followsPreview;
        if (timingChanged) record.lastFrameTime = undefined;
      });
      if (followsPreview) this.#rebindRecord(record, preview);
      affectedLayers.add(record.layerId);
      this.#refreshHandle(record.handleId);
    }
    this.#syncPresentation(elementId);
    this.#syncPasses(affectedLayers);
    this.#requestLayers(affectedLayers);
  }

  /** 清除指定元素的预览状态。 */
  clearPreview(elementId: string): void {
    this.#assertActive();
    const safeId = nonEmptyString(elementId, 'Animation preview Element id');
    const hadActivePreview = this.#activePreviews.delete(safeId);
    const hadPreparedPreview = this.#previews.delete(safeId);
    if (!hadActivePreview && !hadPreparedPreview) return;
    const committed = this.#committedStates.get(safeId);
    const records = this.#elementRecords(safeId);
    const affectedLayers = new Set(records.map(({ layerId }) => layerId));
    if (committed !== undefined) {
      const state = committed.state;
      for (const record of records) {
        const timingChanged = record.layerId !== state.layerId || record.hidden === state.visible || record.suppressed;
        this.#updateRecordState(record, () => {
          record.layerId = state.layerId;
          record.hidden = !state.visible;
          record.suppressed = false;
          if (timingChanged) record.lastFrameTime = undefined;
        });
        this.#rebindRecord(record, committed);
        affectedLayers.add(record.layerId);
        this.#refreshHandle(record.handleId);
      }
    }
    this.#syncPresentation(safeId);
    this.#syncPasses(affectedLayers);
    this.#requestLayers(affectedLayers);
  }

  /** 通过句柄 ID 暂停动画组。 */
  pauseHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group).filter(({ handlePaused }) => !handlePaused);
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
    const records = this.#recordsFor(group).filter(({ handlePaused }) => handlePaused);
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
      this.#deadlines.destroy();
      this.#activePreviews.clear();
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
      this.#syncPresentation(record.elementId);
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
    this.#clearRecordDeadline(record);
    if (this.#recordKeys.get(record.key) === record.id) this.#recordKeys.delete(record.key);
    this.#unindexLayerRecord(record, record.layerId, this.#shouldRender(record), this.#isRunning(record));
    if (record.kind === 'element') {
      try {
        record.runtime.destroy();
      } catch (error) {
        this.#report(error, 'destroy-runtime', record.id);
      }
      const records = this.#recordsByElement.get(record.elementId);
      records?.delete(record);
      if (records?.size === 0) {
        this.#recordsByElement.delete(record.elementId);
        this.#committedStates.delete(record.elementId);
        this.#previews.delete(record.elementId);
      }
      this.#syncPresentation(record.elementId);
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

  /** 从图层索引移除记录，并按移除前状态修正热路径计数。 */
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
    if (wasRunning) this.#advance(record, this.#clock.now());
    update();
    if (record.layerId !== previousLayerId) {
      this.#unindexLayerRecord(record, previousLayerId, wasRenderable, wasRunning);
      this.#indexLayerRecord(record);
      this.#syncRecordDeadline(record);
      return;
    }
    const current = this.#recordsByLayer.get(record.layerId);
    if (current === undefined) return;
    current.renderableCount += Number(this.#shouldRender(record)) - Number(wasRenderable);
    current.runningCount += Number(this.#isRunning(record)) - Number(wasRunning);
    this.#syncRecordDeadline(record);
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

  /** 元素或预览版本变化后失效目标缓存，但不重置 elapsed。 */
  #rebindRecord(record: ElementRecord, prepared: PreparedElementState): void {
    const now = this.#clock.now();
    if (!Number.isFinite(now)) throw new InvalidArgumentError('Animation clock must return a finite timestamp');
    if (this.#isRunning(record)) this.#advance(record, now);
    this.#clearRecordDeadline(record);
    record.definition.assertCompatible(prepared.target);
    record.runtime.rebind(prepared.target);
    const slots = record.runtime.slots;
    const nextBuffer = createAnimationFrameBuffer(slots);
    const nextRenderProfile = createAnimationRecordRenderProfile(record.elementId, record.channel, record.definition, record.runtime, slots);
    const frame = record.lastRenderFrame;
    const nextSample = record.runtime.sample(
      {
        target: prepared.target,
        elapsedMs: record.elapsedMs,
        resolution: frame?.resolution ?? 1,
        rotation: frame?.rotation ?? 0,
        pixelRatio: frame?.pixelRatio ?? 1,
        ...(frame === undefined ? {} : { extent: frame.extent })
      },
      nextBuffer
    );
    record.renderProfile = nextRenderProfile;
    record.buffer = nextBuffer;
    record.sample = nextSample;
    if (record.sample.finished) this.#finishRecord(record, record.sample.retain === true, 'finished');
    else this.#syncRecordDeadline(record, now);
  }

  /** 按最早阶跃或自然完成边界登记单一 Earth 级唤醒。 */
  #syncRecordDeadline(record: ManagedRecord, referenceTime?: number): void {
    if (record.kind !== 'element' || !this.#isRunning(record) || record.sample === undefined) {
      this.#clearRecordDeadline(record);
      return;
    }
    const atElapsedMs = nextWakeElapsed(record.sample);
    if (atElapsedMs === undefined) {
      this.#clearRecordDeadline(record);
      return;
    }
    const base = referenceTime ?? this.#clock.now();
    if (!Number.isFinite(base)) throw new InvalidArgumentError('Animation clock must return a finite timestamp');
    const timestamp = base + Math.max(0, atElapsedMs - record.elapsedMs);
    record.deadlineTimestamp = timestamp;
    this.#deadlines.upsert(record.id, timestamp);
  }

  /** 取消一条记录的截止时间，并保持重复调用幂等。 */
  #clearRecordDeadline(record: ManagedRecord): void {
    record.deadlineTimestamp = undefined;
    this.#deadlines.remove(record.id);
  }

  /** 在无渲染帧时独立推进已到期的阶跃或终态记录。 */
  #handleDeadlineWake(recordIds: readonly string[], now: number): void {
    if (this.#disposed || this.#destroyRequested) return;
    if (!Number.isFinite(now)) throw new InvalidArgumentError('Animation clock must return a finite timestamp');
    const finished: Array<{ record: ElementRecord; retain: boolean; status: TerminalStatus }> = [];
    const presentationCleanupCandidates: Array<{ readonly elementId: string; readonly layerId: string }> = [];
    const affectedLayers = new Set<string>();
    const renderLayers = new Set<string>();
    for (const recordId of recordIds) {
      const record = this.#records.get(recordId);
      if (record?.kind !== 'element' || record.deadlineTimestamp === undefined || record.deadlineTimestamp > now || !this.#isRunning(record)) continue;
      const prepared = this.#previews.get(record.elementId) ?? this.#committedStates.get(record.elementId);
      if (prepared === undefined) {
        affectedLayers.add(record.layerId);
        renderLayers.add(record.layerId);
        finished.push({ record, retain: false, status: 'stopped' });
        continue;
      }
      const dueElapsedMs = record.sample === undefined ? undefined : nextWakeElapsed(record.sample);
      if (dueElapsedMs === undefined) {
        this.#clearRecordDeadline(record);
        continue;
      }
      const scheduledTimestamp = record.deadlineTimestamp;
      record.deadlineTimestamp = undefined;
      affectedLayers.add(record.layerId);
      try {
        record.elapsedMs = Math.max(record.elapsedMs, dueElapsedMs + Math.max(0, now - scheduledTimestamp));
        record.lastFrameTime = now;
        const records = this.#elementRecords(record.elementId).filter((candidate) => candidate.layerId === record.layerId && this.#shouldRender(candidate));
        const wasFullyTransparent = this.#hasContributingZeroOpacity(records);
        record.buffer.reset();
        const frame = record.lastRenderFrame;
        record.sample = record.runtime.sample(
          {
            target: prepared.target,
            elapsedMs: record.elapsedMs,
            resolution: frame?.resolution ?? 1,
            rotation: frame?.rotation ?? 0,
            pixelRatio: frame?.pixelRatio ?? 1,
            ...(frame === undefined ? {} : { extent: frame.extent })
          },
          record.buffer
        );
        const removesPresentation =
          record.sample.finished &&
          record.sample.retain !== true &&
          (record.definition.writeDomains.has('target-opacity') || record.definition.writeDomains.has('target-geometry'));
        if (removesPresentation) presentationCleanupCandidates.push({ elementId: record.elementId, layerId: record.layerId });
        const needsSlotPrune = record.sample.finished && record.sample.retain !== true && record.runtime.slots.length > 0;
        if (needsSlotPrune || this.#deadlineWakeNeedsRender(record, prepared, records, wasFullyTransparent)) renderLayers.add(record.layerId);
        if (record.sample.finished) {
          finished.push({ record, retain: record.sample.retain === true, status: 'finished' });
        } else {
          this.#syncRecordDeadline(record, now);
        }
      } catch (error) {
        this.#report(error, 'deadline-tick', record.id);
        renderLayers.add(record.layerId);
        finished.push({ record, retain: false, status: 'stopped' });
      }
    }
    for (const item of finished) this.#finishRecord(item.record, item.retain, item.status);
    for (const candidate of presentationCleanupCandidates) {
      if (this.#presentationLeases.get(candidate.elementId)?.layerId !== candidate.layerId) renderLayers.add(candidate.layerId);
    }
    this.#syncPasses(affectedLayers);
    this.#requestLayers(renderLayers);
  }

  /** 判断 deadline 采样是否可能改变当前可见画面。 */
  #deadlineWakeNeedsRender(record: ElementRecord, prepared: PreparedElementState, records: readonly ElementRecord[], wasFullyTransparent: boolean): boolean {
    if (wasFullyTransparent && this.#hasContributingZeroOpacity(records)) return false;
    const frame = record.lastRenderFrame;
    if (frame === undefined || frame.layerId !== record.layerId) return true;
    return animationTargetIntersectsFrame(prepared, records, frame);
  }

  /** 判断当前参与最终合成的透明度记录是否已完全遮蔽目标。 */
  #hasContributingZeroOpacity(records: readonly ElementRecord[]): boolean {
    return records.some((candidate) => {
      if (!candidate.definition.writeDomains.has('target-opacity')) return false;
      const sample = candidate.sample;
      return sample !== undefined && (!sample.finished || sample.retain === true) && candidate.buffer.targetOpacity === 0;
    });
  }

  /** 按目标修饰器的存在性同步稳定展示租约。 */
  #syncPresentation(elementId: string): void {
    const records = this.#elementRecords(elementId);
    const owner = records.find(
      (record) => this.#shouldRender(record) && (record.definition.writeDomains.has('target-opacity') || record.definition.writeDomains.has('target-geometry'))
    );
    const current = this.#presentationLeases.get(elementId);
    if (owner === undefined) {
      if (current !== undefined) {
        current.release();
        this.#presentationLeases.delete(elementId);
      }
      return;
    }
    if (current?.active === true && current.layerId === owner.layerId) return;
    current?.release();
    const next = this.#render.acquirePresentation(owner.layerId, elementId);
    this.#presentationLeases.set(elementId, next);
  }

  /** 创建需要的图层渲染循环并清理空闲循环。 */
  #syncPasses(layerIds?: ReadonlySet<string>, flushCurrentFrame = false): void {
    const targets = [...(layerIds ?? new Set([...this.#recordsByLayer.keys(), ...this.#passes.keys()]))];
    for (const layerId of targets) {
      const pass = this.#passes.get(layerId);
      if (pass === undefined || (this.#recordsByLayer.get(layerId)?.renderableCount ?? 0) > 0) continue;
      if (!flushCurrentFrame) pass.requestRender();
      if (this.#destroyPass(pass, flushCurrentFrame)) this.#passes.delete(layerId);
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
    const elementGroups = new Map<string, ElementRecord[]>();
    const presentationCleanupTargets = new Set<string>();
    let requestNextFrame = false;
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
        requestNextFrame ||= this.#isRunning(record);
        continue;
      }
      const group = elementGroups.get(record.elementId) ?? [];
      group.push(record);
      elementGroups.set(record.elementId, group);
    }

    for (const [elementId, group] of elementGroups) {
      const prepared = this.#previews.get(elementId) ?? this.#committedStates.get(elementId);
      if (prepared === undefined || prepared.state.layerId !== layerId || !prepared.state.visible) continue;
      if (!animationTargetIntersectsFrame(prepared, group, frame)) {
        for (const record of group) {
          if (this.#isRunning(record)) this.#advance(record, frame.time);
          record.lastRenderFrame = frame;
        }
        continue;
      }
      const sampled: ElementRecord[] = [];
      let removesPresentationAfterFrame = false;
      let targetOpacity = 1;
      let effectiveGeometry: RenderGeometryState | undefined = prepared.geometry;
      let effectiveReveal: AnimationFrameBuffer['targetReveal'];
      const hasPresentationModifier = group.some(
        ({ definition }) => definition.writeDomains.has('target-opacity') || definition.writeDomains.has('target-geometry')
      );
      for (const record of group) {
        try {
          if (!record.retained || record.sample === undefined) {
            if (this.#isRunning(record)) this.#advance(record, frame.time);
            record.buffer.reset();
            record.sample = record.runtime.sample(
              {
                target: prepared.target,
                elapsedMs: record.elapsedMs,
                resolution: frame.resolution,
                rotation: frame.rotation,
                pixelRatio: frame.pixelRatio,
                extent: frame.extent
              },
              record.buffer
            );
          }
          record.lastRenderFrame = frame;
          const sample = record.sample;
          if (sample === undefined) throw new InvalidArgumentError('Animation runtime did not produce a sample');
          this.#syncRecordDeadline(record, frame.time);
          sampled.push(record);
          const contributesFinalState = !sample.finished || sample.retain === true;
          if (contributesFinalState && record.definition.writeDomains.has('target-opacity')) {
            targetOpacity *= normalizeAnimationOpacity(record.buffer.targetOpacity);
          }
          if (contributesFinalState && record.definition.writeDomains.has('target-geometry')) {
            effectiveGeometry = record.buffer.targetGeometry;
            effectiveReveal = record.buffer.targetReveal;
          }
          if (sample.finished && !record.retained) finished.push({ record, retain: sample.retain === true, status: 'finished' });
          removesPresentationAfterFrame ||=
            sample.finished &&
            sample.retain !== true &&
            (record.definition.writeDomains.has('target-opacity') || record.definition.writeDomains.has('target-geometry'));
        } catch (error) {
          this.#report(error, 'render-frame', record.id);
          finished.push({ record, retain: false, status: 'stopped' });
          removesPresentationAfterFrame ||= record.definition.writeDomains.has('target-opacity') || record.definition.writeDomains.has('target-geometry');
        }
      }

      const primitives: LayerRenderPrimitive[] = [];
      for (const record of sampled) {
        const slots = record.renderProfile.slots;
        if (slots.length !== record.buffer.overlays.length) throw new InvalidArgumentError('Animation runtime changed slots without rebind');
        for (let index = 0; index < slots.length; index += 1) {
          const value = record.buffer.overlays[index];
          if (!value.active) continue;
          const opacity = normalizeAnimationOpacity(value.opacity) * targetOpacity;
          if (opacity === 0) continue;
          const geometry = value.geometryKind === 'effective-target' ? effectiveGeometry : value.geometry;
          if (geometry === undefined) continue;
          const slot = slots[index];
          assertDynamicParameters(slot.dynamicParameters, value);
          const dynamicStyle = dynamicStyleValue(value);
          const pathReveal = value.geometryKind === 'effective-target' ? effectiveReveal : undefined;
          primitives.push(
            Object.freeze({
              slotKey: `${record.channel}/${slot.slotKey}`,
              geometry,
              style: slot.style,
              opacity,
              ...(dynamicStyle === undefined ? {} : { dynamicStyle }),
              ...(pathReveal === undefined ? {} : { pathReveal })
            })
          );
        }
      }

      const presentation =
        hasPresentationModifier && effectiveGeometry !== undefined
          ? Object.freeze({
              slotKey: 'base',
              geometry: effectiveGeometry,
              style: prepared.target.style,
              opacity: targetOpacity,
              ...(effectiveReveal === undefined ? {} : { pathReveal: effectiveReveal })
            })
          : undefined;
      if (presentation !== undefined || primitives.length > 0) {
        contributions.push(
          Object.freeze({
            targetId: elementId,
            channel: ANIMATION_RENDER_CHANNEL,
            targetZIndex: prepared.target.style.zIndex ?? 0,
            value: Object.freeze({
              ...(presentation === undefined ? {} : { presentation }),
              ...(primitives.length === 0 ? {} : { primitives: Object.freeze(primitives) })
            })
          })
        );
      }
      if (presentation !== undefined && removesPresentationAfterFrame) presentationCleanupTargets.add(elementId);
      for (const record of sampled) {
        const continuous = record.sample?.schedule.kind === 'continuous' && this.#isRunning(record);
        const changesOpacity = record.definition.writeDomains.has('target-opacity');
        requestNextFrame ||= continuous && (changesOpacity || targetOpacity > 0);
      }
    }
    for (const item of finished) this.#finishRecord(item.record, item.retain, item.status);
    if ((this.#recordsByLayer.get(layerId)?.renderableCount ?? 0) > 0) {
      for (const elementId of presentationCleanupTargets) {
        if (this.#presentationLeases.get(elementId)?.layerId !== layerId) requestNextFrame = true;
      }
    }
    if (finished.length > 0) this.#syncPasses(new Set([layerId]), true);
    const slotReservations = this.#collectSlotReservations(layerId, elementGroups);
    return Object.freeze({
      contributions: Object.freeze(contributions),
      slotReservations: Object.freeze(slotReservations),
      requestNextFrame
    });
  }

  /** 声明仍存活的稳定 slot；本帧 inactive 或离屏不会触发 Adapter 重建资源。 */
  #collectSlotReservations(layerId: string, elementGroups: ReadonlyMap<string, readonly ElementRecord[]>): LayerRenderSlotReservation[] {
    const reservations: LayerRenderSlotReservation[] = [];
    for (const [elementId, group] of elementGroups) {
      const prepared = this.#previews.get(elementId) ?? this.#committedStates.get(elementId);
      if (prepared === undefined || prepared.state.layerId !== layerId || !prepared.state.visible) continue;
      let presentationReservation: LayerRenderSlotReservation | undefined;
      for (const record of group) {
        if (this.#records.get(record.id) !== record || !this.#shouldRender(record)) continue;
        presentationReservation ??= record.renderProfile.presentationReservation;
        for (const reservation of record.renderProfile.slotReservations) reservations.push(reservation);
      }
      if (presentationReservation !== undefined) reservations.push(presentationReservation);
    }
    return reservations;
  }

  /** 累计动画经过时间。 */
  #advance(record: ManagedRecord, time: number): void {
    if (!Number.isFinite(time)) throw new InvalidArgumentError('Animation frame time must be finite');
    if (record.lastFrameTime !== undefined) record.elapsedMs += Math.max(0, time - record.lastFrameTime);
    record.lastFrameTime = time;
  }

  /** 判断动画记录是否正在推进时间。 */
  #isRunning(record: ManagedRecord): boolean {
    return !record.retained && !record.hidden && !record.suppressed && !record.handlePaused && record.selectorPauseDepth === 0;
  }

  /** 判断动画记录是否需要参与渲染。 */
  #shouldRender(record: ManagedRecord): boolean {
    return !record.hidden && !record.suppressed;
  }

  /** 根据 ElementStore 变化同步动画记录。 */
  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#disposed || this.#destroyRequested) return;
    const affectedLayers = new Set<string>();
    for (const change of changes.changes) {
      const records = this.#elementRecords(change.id);
      if (change.kind === 'remove' || change.after === undefined) {
        this.#activePreviews.delete(change.id);
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
        const preview = this.#previews.get(change.id);
        const prepared = preview ?? committed;
        if (prepared === undefined || committed === undefined) continue;
        const state = prepared.state;
        const timingChanged = record.layerId !== state.layerId || record.hidden === state.visible;
        this.#updateRecordState(record, () => {
          record.layerId = state.layerId;
          record.hidden = !state.visible;
          if (timingChanged) record.lastFrameTime = undefined;
        });
        try {
          if (preview === undefined || record.definition.interactionPolicy.transform === 'follow-preview') {
            this.#rebindRecord(record, prepared);
          }
        } catch (error) {
          this.#report(error, 'rebind-runtime', record.id);
          this.#removeRecord(record, 'stopped');
          continue;
        }
        affectedLayers.add(record.layerId);
        this.#refreshHandle(record.handleId);
      }
      this.#syncPresentation(change.id);
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
    if (isNativeStyleRef(state.style)) throw new UnsupportedOperationError('Native styles cannot use structured animations');
    const shape = this.#shapes.get(state.type);
    const viewShape = this.#shapeProjection.toViewState(state.geometry);
    const geometry = freezeRenderGeometry(renderTrustedShapeState(shape, viewShape as never));
    return Object.freeze({
      state,
      geometry,
      bounds: renderGeometryBounds(geometry),
      baseVisualOutsetPx: styleVisualOutsetPx(state.style as StyleSpec),
      target: Object.freeze({ state, viewShape, geometry, style: state.style as StyleSpec, shape }),
      generation,
      revision
    });
  }

  /** 按当前 Store 版本延迟准备 active preview，并只复用可信快照与同一渲染几何。 */
  #resolveActivePreview(elementId: string, committed: PreparedElementState): PreparedElementState | undefined {
    const activePreview = this.#activePreviews.get(elementId);
    if (activePreview === undefined) return undefined;
    const preview = this.#preparePreview(activePreview, committed);
    this.#previews.set(elementId, preview);
    return preview;
  }

  /** 校验并冻结交互预览的动画帧输入，不改变 active preview 所有权。 */
  #preparePreview(activePreview: ActivePreviewState, committed: PreparedElementState): PreparedElementState {
    const { state, geometry } = activePreview;
    if (committed.state.type !== state.type) throw new InvalidArgumentError('Animation preview cannot change Element type');
    const existing = this.#previews.get(state.id);
    if (
      existing?.sourceIdentity === state &&
      existing.geometry === geometry &&
      existing.generation === committed.generation &&
      existing.revision === committed.revision
    ) {
      return existing;
    }
    const trusted = isElementSnapshot(state);
    const snapshot = trusted ? state : cloneElementSnapshot(this.#shapes, state);
    if (isNativeStyleRef(snapshot.style)) throw new UnsupportedOperationError('Native styles cannot use structured animations');
    const frozenGeometry = freezeRenderGeometry(geometry);
    const shape = committed.target.shape;
    const viewShape = this.#shapeProjection.toViewState(snapshot.geometry);
    return Object.freeze({
      state: snapshot,
      geometry: frozenGeometry,
      bounds: renderGeometryBounds(frozenGeometry),
      baseVisualOutsetPx: styleVisualOutsetPx(snapshot.style as StyleSpec),
      target: Object.freeze({ state: snapshot, viewShape, geometry: frozenGeometry, style: snapshot.style as StyleSpec, shape }),
      generation: committed.generation,
      revision: committed.revision,
      ...(trusted ? { sourceIdentity: state } : {})
    });
  }

  /** 请求指定图层重新渲染。 */
  #requestLayers(layerIds: ReadonlySet<string>): void {
    for (const layerId of layerIds) this.#passes.get(layerId)?.requestRender();
  }

  /** 安全销毁图层渲染循环。 */
  #destroyPass(pass: LayerRenderLoopHandle, flushCurrentFrame = false): boolean {
    try {
      pass.destroy({ flushCurrentFrame });
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

/** 深冻结动画渲染几何，确保按对象身份命中的帧缓存不会被外部改写。 */
function normalizeAnimationOpacity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new InvalidArgumentError('Animation opacity must be a finite number between zero and one');
  }
  return value;
}

function nextWakeElapsed(sample: AnimationSample): number | undefined {
  const scheduleDeadline = sample.schedule.kind === 'deadline' ? sample.schedule.atElapsedMs : undefined;
  const completionDeadline = sample.wakeAtElapsedMs;
  for (const value of [scheduleDeadline, completionDeadline]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new InvalidArgumentError('Animation wake elapsed time must be a finite non-negative number');
    }
  }
  if (scheduleDeadline === undefined) return completionDeadline;
  if (completionDeadline === undefined) return scheduleDeadline;
  return Math.min(scheduleDeadline, completionDeadline);
}

function assertDynamicParameters(allowed: readonly AnimationStyleParameter[] | undefined, value: AnimationOverlaySlotBuffer): void {
  const accepted = new Set(allowed ?? []);
  const parameters: ReadonlyArray<readonly [AnimationStyleParameter, number | undefined]> = [
    ['lineDashOffset', value.lineDashOffset],
    ['symbolRadius', value.symbolRadius],
    ['strokeWidth', value.strokeWidth],
    ['rotation', value.rotation]
  ];
  for (const [parameter, candidate] of parameters) {
    if (candidate === undefined) continue;
    if (!Number.isFinite(candidate)) throw new InvalidArgumentError(`Animation dynamic parameter must be finite: ${parameter}`);
    if (!accepted.has(parameter)) throw new InvalidArgumentError(`Animation slot did not declare dynamic parameter: ${parameter}`);
  }
  if (value.lineDashOffsetStrokeIndex !== undefined) {
    if (!Number.isSafeInteger(value.lineDashOffsetStrokeIndex) || value.lineDashOffsetStrokeIndex < 0) {
      throw new InvalidArgumentError('Animation lineDashOffset stroke index must be a non-negative safe integer');
    }
    if (value.lineDashOffset === undefined) throw new InvalidArgumentError('Animation lineDashOffset stroke index requires lineDashOffset');
  }
}

function dynamicStyleValue(value: AnimationOverlaySlotBuffer): LayerRenderDynamicStyle | undefined {
  if (
    value.lineDashOffset === undefined &&
    value.lineDashOffsetStrokeIndex === undefined &&
    value.symbolRadius === undefined &&
    value.strokeWidth === undefined &&
    value.rotation === undefined
  ) {
    return undefined;
  }
  return Object.freeze({
    ...(value.lineDashOffset === undefined ? {} : { lineDashOffset: value.lineDashOffset }),
    ...(value.lineDashOffsetStrokeIndex === undefined ? {} : { lineDashOffsetStrokeIndex: value.lineDashOffsetStrokeIndex }),
    ...(value.symbolRadius === undefined ? {} : { symbolRadius: value.symbolRadius }),
    ...(value.strokeWidth === undefined ? {} : { strokeWidth: value.strokeWidth }),
    ...(value.rotation === undefined ? {} : { rotation: value.rotation })
  });
}

/** 在 Runtime create/rebind 边界固定 slot 声明和视觉范围，稳定帧不重复遍历 StyleSpec。 */
function createAnimationRecordRenderProfile(
  elementId: string,
  channel: string,
  definition: AnimationDefinition,
  runtime: AnimationRuntime,
  slots: readonly AnimationSlotDefinition[]
): AnimationRecordRenderProfile {
  const slotReservations = Object.freeze(
    slots.map(({ slotKey }) =>
      Object.freeze({
        kind: 'overlay' as const,
        targetId: elementId,
        channel: ANIMATION_RENDER_CHANNEL,
        slotKey: `${channel}/${slotKey}`
      })
    )
  );
  const hasPresentation = definition.writeDomains.has('target-opacity') || definition.writeDomains.has('target-geometry');
  const presentationReservation = hasPresentation ? Object.freeze({ kind: 'presentation' as const, targetId: elementId }) : undefined;
  let disableViewportCulling = runtime.disableViewportCulling === true;
  let visualOutsetPx = 0;
  if (!disableViewportCulling && runtime.visualOutsetPx !== undefined) {
    if (!Number.isFinite(runtime.visualOutsetPx) || runtime.visualOutsetPx < 0) disableViewportCulling = true;
    else visualOutsetPx = runtime.visualOutsetPx;
  }
  if (!disableViewportCulling) {
    for (const { style } of slots) {
      const slotOutset = styleVisualOutsetPx(style);
      if (slotOutset === undefined) {
        disableViewportCulling = true;
        break;
      }
      visualOutsetPx = Math.max(visualOutsetPx, slotOutset);
    }
  }
  return Object.freeze({ slots, slotReservations, presentationReservation, disableViewportCulling, visualOutsetPx });
}

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

/** 计算规范渲染几何的 View 坐标范围；非法输入按不可裁剪处理。 */
function renderGeometryBounds(geometry: RenderGeometryState): RenderBounds | undefined {
  try {
    return calculateRenderGeometryExtent(geometry);
  } catch {
    return undefined;
  }
}

/** 使用可证明安全的视觉外扩裁剪离屏目标；无法估算时保守保留。 */
function animationTargetIntersectsFrame(prepared: PreparedElementState, records: readonly ElementRecord[], frame: LayerRenderFrame): boolean {
  const bounds = prepared.bounds;
  if (bounds === undefined || records.some(({ renderProfile }) => renderProfile.disableViewportCulling)) return true;
  if (!Number.isFinite(frame.resolution) || frame.resolution <= 0 || frame.extent.some((value) => !Number.isFinite(value))) return true;
  let outsetPx = 0;
  if (records.some(({ definition }) => definition.writeDomains.has('target-opacity') || definition.writeDomains.has('target-geometry'))) {
    const baseOutset = prepared.baseVisualOutsetPx;
    if (baseOutset === undefined) return true;
    outsetPx = baseOutset;
  }
  for (const { renderProfile } of records) outsetPx = Math.max(outsetPx, renderProfile.visualOutsetPx);
  const padding = outsetPx * frame.resolution;
  const minX = bounds[0] - padding;
  const minY = bounds[1] - padding;
  const maxX = bounds[2] + padding;
  const maxY = bounds[3] + padding;
  const [frameMinX, frameMinY, frameMaxX, frameMaxY] = frame.extent;
  if (maxY < frameMinY || minY > frameMaxY) return false;
  if (frame.worldWidth !== undefined) {
    if (!Number.isFinite(frame.worldWidth) || frame.worldWidth <= 0) return true;
    const firstWorld = Math.ceil((frameMinX - maxX) / frame.worldWidth);
    const lastWorld = Math.floor((frameMaxX - minX) / frame.worldWidth);
    return !Number.isFinite(firstWorld) || !Number.isFinite(lastWorld) || firstWorld <= lastWorld;
  }
  return maxX >= frameMinX && minX <= frameMaxX;
}

/** 为批量播放的首个失败目标补充可定位上下文，同时保留既有错误类别。 */
function animationTargetFailure(elementId: string, error: unknown): Error {
  if (error instanceof Error && error.message.includes(elementId)) return error;
  const reason = error instanceof Error ? error.message : String(error);
  const message = `Animation target ${elementId} failed: ${reason}`;
  if (error instanceof CapabilityError) return new CapabilityError(message);
  if (error instanceof UnsupportedOperationError) return new UnsupportedOperationError(message);
  if (error instanceof ObjectDisposedError) return new ObjectDisposedError(message);
  if (error instanceof InvalidArgumentError) return new InvalidArgumentError(message);
  const wrapped = new Error(message);
  if (error instanceof Error) wrapped.name = error.name;
  return wrapped;
}

/** 从不可信输入中解析动画类型。 */
function animationType(input: AnimationSpec): AnimationSpec['type'] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Animation spec must be a plain object');
  const descriptor = Object.getOwnPropertyDescriptor(input, 'type');
  if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Animation type must be a data property');
  return nonEmptyString(descriptor.value, 'Animation type') as AnimationSpec['type'];
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
