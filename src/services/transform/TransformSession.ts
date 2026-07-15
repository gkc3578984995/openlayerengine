import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import { cloneElementSnapshot, createElementSnapshot, type ElementSnapshot } from '../../core/element/snapshot.js';
import type { ElementCopyOptions, ElementState } from '../../core/element/types.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError, UnsupportedOperationError } from '../../core/errors.js';
import type { TransformAnimationPort } from '../../core/ports/AnimationControlPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type {
  TransformDelta,
  TransformInteractionEvent,
  TransformInteractionHandle,
  TransformInteractionOptions,
  TransformInteractionPort,
  TransformInteractionTarget,
  TransformOperation
} from '../../core/ports/TransformInteractionPort.js';
import type {
  TransformToolbarPort,
  TransformToolbarViewEvent,
  TransformToolbarViewHandle,
  TransformToolbarViewSpec
} from '../../core/ports/TransformToolbarPort.js';
import type { TransformTooltipPort, TransformTooltipViewHandle } from '../../core/ports/TransformTooltipPort.js';
import type { TransientAnimationHandle, TransientAnimationPort } from '../../core/ports/TransientAnimationPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import { isNativeStyleRef, type IconSymbolSpec, type StyleSpec, type TextSpec } from '../../core/style/types.js';
import type { ElementChangeSet, ElementGeneration, ElementRevision } from '../../core/transaction/types.js';
import type { InteractionCoordinator } from '../events/InteractionCoordinator.js';
import type { ContextMenuDecision, InteractionCancelReason, InteractionStatus, RoutedPointerEvent } from '../events/types.js';
import type { StyleService } from '../style/StyleService.js';
import { TransformHistory, metadata } from './TransformHistory.js';
import type { TransformKeyboardInput } from './TransformService.js';
import type {
  InternalTransformEventMap,
  InternalTransformReplaceOptions,
  InternalTransformSession,
  InternalTransformToolbarItemSpec,
  TransformMode,
  NormalizedTransformOptions
} from './types.js';

/** 构造 Transform 会话所需的依赖。 */
export interface TransformSessionDependencies {
  /** 会话 ID。 */
  readonly id: string;
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 图形定义注册表。 */
  readonly shapes: ShapeRegistry;
  /** 内部样式服务。 */
  readonly styles: StyleService;
  /** 互斥交互协调器。 */
  readonly coordinator: InteractionCoordinator;
  /** 底层变换交互端口。 */
  readonly interaction: TransformInteractionPort;
  /** 元素动画控制端口。 */
  readonly animations: TransformAnimationPort;
  /** 临时动画端口。 */
  readonly transients: TransientAnimationPort;
  /** 可选的工具栏端口。 */
  readonly toolbarPort?: TransformToolbarPort;
  /** 可选的鼠标提示端口。 */
  readonly tooltipPort?: TransformTooltipPort;
  /** 可选的键盘输入。 */
  readonly input?: TransformKeyboardInput;
  /** 规范化后的 Transform 配置。 */
  readonly options: NormalizedTransformOptions;
  /** 复制元素 ID 生成器。 */
  readonly createId: () => string;
  /** 读取共享剪贴板的函数。 */
  readonly readClipboard: () => Readonly<ElementState> | undefined;
  /** 更新共享剪贴板的函数。 */
  readonly writeClipboard: (snapshot: Readonly<ElementState> | undefined) => void;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
  /** 会话进入终态后的回调。 */
  readonly onTerminal: () => void;
}

/** Transform 内部事件监听函数。 */
type Listener = (event: never) => void;

/** 管理元素选择、变换、历史、复制和交互视图的状态机。 */
export class TransformSession<T = unknown> implements InternalTransformSession<T> {
  /** 会话 ID。 */
  readonly id: string;
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 图形定义注册表。 */
  readonly #shapes: ShapeRegistry;
  /** 内部样式服务。 */
  readonly #styles: StyleService;
  /** 互斥交互协调器。 */
  readonly #coordinator: InteractionCoordinator;
  /** 底层变换交互端口。 */
  readonly #interaction: TransformInteractionPort;
  /** 元素动画控制端口。 */
  readonly #animations: TransformAnimationPort;
  /** 临时动画端口。 */
  readonly #transients: TransientAnimationPort;
  /** 可选的工具栏端口。 */
  readonly #toolbarPort: TransformToolbarPort | undefined;
  /** 可选的鼠标提示端口。 */
  readonly #tooltipPort: TransformTooltipPort | undefined;
  /** 可选的键盘输入。 */
  readonly #input: TransformKeyboardInput | undefined;
  /** 规范化后的 Transform 配置。 */
  readonly #options: NormalizedTransformOptions;
  /** 复制元素 ID 生成器。 */
  readonly #createId: () => string;
  /** 共享剪贴板读取函数。 */
  readonly #readClipboard: () => Readonly<ElementState> | undefined;
  /** 共享剪贴板写入函数。 */
  readonly #writeClipboard: (snapshot: Readonly<ElementState> | undefined) => void;
  /** Transform 错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 会话终止回调。 */
  readonly #onTerminal: () => void;
  /** 当前元素的撤销重做历史。 */
  readonly #history: TransformHistory<T>;
  /** 判断元素是否处于会话选择范围的函数。 */
  readonly #matches: (state: Readonly<ElementState>) => boolean;
  /** 按事件类型保存的监听器。 */
  readonly #listeners = new Map<keyof InternalTransformEventMap<T>, Map<number, Listener>>();
  /** 等待重试销毁的工具栏句柄。 */
  readonly #toolbarCleanup = new Set<TransformToolbarViewHandle>();
  /** 会话当前状态。 */
  #status: InteractionStatus = 'active';
  /** 底层变换交互句柄。 */
  #handle: TransformInteractionHandle | undefined;
  /** 当前工具栏句柄。 */
  #toolbar: TransformToolbarViewHandle | undefined;
  /** 当前鼠标提示句柄。 */
  #tooltip: TransformTooltipViewHandle | undefined;
  /** 已确认选中的元素快照。 */
  #selected: ElementSnapshot<T> | undefined;
  /** 当前预览中的工作快照。 */
  #working: ElementSnapshot<T> | undefined;
  /** 当前变换开始时的快照。 */
  #operationOrigin: ElementSnapshot<T> | undefined;
  /** 目标元素预期代次。 */
  #expectedGeneration: ElementGeneration | undefined;
  /** 目标元素预期修订号。 */
  #expectedRevision: ElementRevision | undefined;
  /** 当前操作的临时动画句柄。 */
  #transient: TransientAnimationHandle | undefined;
  /** 会话当前操作模式。 */
  #mode: TransformMode = 'transform';
  /** 最近一次指针地图坐标。 */
  #lastPointerCoordinate: Coordinate | undefined;
  /** 当前元素动画是否已暂停。 */
  #animationsPaused = false;
  /** 是否正在显示复制预览。 */
  #copyPreview = false;
  /** 元素仓库订阅释放函数。 */
  #unsubscribeStore: (() => void) | undefined;
  /** 键盘输入订阅释放函数。 */
  #unsubscribeInput: (() => void) | undefined;
  /** 下一个监听器 ID。 */
  #nextListenerId = 0;
  /** 是否正在打开底层交互。 */
  #opening = false;
  /** 是否正在提交自身变换。 */
  #ownCommit = false;
  /** 是否正在删除自身目标。 */
  #ownRemove = false;
  /** 是否正在清理会话资源。 */
  #cleanupRunning = false;
  /** 是否正在清理工具栏资源。 */
  #toolbarCleanupRunning = false;
  /** 是否已释放交互协调器。 */
  #coordinatorReleased = false;
  /** 是否已通知会话终止。 */
  #terminalNotified = false;
  /** 是否正在执行完成流程。 */
  #finishing = false;

  /** 创建 Transform 会话并初始化选择条件与历史。 */
  constructor(dependencies: TransformSessionDependencies) {
    this.id = dependencies.id;
    this.#store = dependencies.store;
    this.#shapes = dependencies.shapes;
    this.#styles = dependencies.styles;
    this.#coordinator = dependencies.coordinator;
    this.#interaction = dependencies.interaction;
    this.#animations = dependencies.animations;
    this.#transients = dependencies.transients;
    this.#toolbarPort = dependencies.toolbarPort;
    this.#tooltipPort = dependencies.tooltipPort;
    this.#input = dependencies.input;
    this.#options = dependencies.options;
    this.#createId = dependencies.createId;
    this.#readClipboard = dependencies.readClipboard;
    this.#writeClipboard = dependencies.writeClipboard;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#onTerminal = dependencies.onTerminal;
    this.#history = new TransformHistory<T>(dependencies.shapes, dependencies.options.historyLimit);
    const selectorMatch = dependencies.options.selector === undefined ? () => true : compileSelector(dependencies.options.selector);
    const layers = dependencies.options.layerIds === undefined ? undefined : new Set(dependencies.options.layerIds);
    this.#matches = (state) => selectorMatch(state) && (layers === undefined || layers.has(state.layerId));
  }

  /** 返回当前选中元素 ID。 */
  get selectedId(): string | undefined {
    return this.#selected?.id;
  }

  /** 返回会话当前状态。 */
  get status(): InteractionStatus {
    return this.#status;
  }

  /** 返回会话当前操作模式。 */
  get mode(): TransformMode {
    return this.#mode;
  }

  /** 返回当前工具栏句柄。 */
  get toolbar(): TransformToolbarViewHandle | undefined {
    return this.#toolbar;
  }

  /** 打开底层变换交互并订阅仓库和键盘事件。 */
  open(): void {
    this.#assertActive();
    if (this.#handle !== undefined || this.#opening) throw new InvalidArgumentError('Transform session is already open');
    this.#opening = true;
    try {
      this.#unsubscribeStore = this.#store.subscribe((changes) => this.#handleStoreChanges(changes));
      this.#handle = this.#interaction.open(this.id, this.#interactionOptions(), (event) => this.#handleInteractionEvent(event));
      const unsubscribeInput = this.#input?.on('keydown', (event) => this.#handleKeydown(event));
      if (unsubscribeInput !== undefined && typeof unsubscribeInput !== 'function') throw new InvalidArgumentError('Transform input must return a disposer');
      this.#unsubscribeInput = unsubscribeInput;
      if (this.#status !== 'active') throw new ObjectDisposedError('Transform session was cancelled while opening');
    } finally {
      this.#opening = false;
      if (this.#status !== 'active') this.#cleanupSession();
    }
  }

  /** 在打开失败后取消并清理会话。 */
  abortOpen(): void {
    if (this.#status === 'active') this.#status = 'cancelled';
    this.#cleanupSession();
    this.#listeners.clear();
  }

  /** 选择指定元素并建立变换快照。 */
  select(elementId: string): void {
    this.#assertMutable();
    const state = this.#requireSelectable(elementId);
    this.#activateSnapshot(state, true, true);
  }

  /** 切换 Transform 操作模式。 */
  setMode(mode: TransformMode): void {
    this.#assertMutable();
    if (mode !== 'transform' && mode !== 'edit') throw new InvalidArgumentError('Transform mode must be transform or edit');
    const working = this.#requireWorking();
    if (this.#operationOrigin !== undefined) throw new InvalidArgumentError('Transform mode cannot change while an operation is active');
    if (mode === 'edit') {
      const definition = this.#shapes.get(working.type);
      if (!definition.capabilities.has('vertexEdit') || definition.editTopology === undefined) {
        throw new CapabilityError(`Shape does not support vertex editing: ${working.type}`);
      }
    }
    if (this.#mode === mode) return;
    this.#stopTransient();
    this.#mode = mode;
    this.#requireHandle().setTarget(this.#presentation(working));
    this.#toolbar?.setActive(mode === 'edit' ? 'edit' : '');
    this.#setTooltipLines(this.#baseTooltipLines());
  }

  /** 提交当前工作状态并结束会话。 */
  finish(): void {
    if (this.#status !== 'active' || this.#finishing) return;
    this.#finishing = true;
    try {
      const working = this.#working;
      if (working !== undefined) {
        this.#assertTargetCurrent();
        this.#ownCommit = true;
        const committed = this.#store.transaction((transaction) => {
          const current = transaction.get<T>(working.id);
          if (current === undefined) throw new InvalidArgumentError(`Element does not exist: ${working.id}`);
          const updated = transaction.update<T>({ id: working.id }, { geometry: working.geometry, style: working.style });
          if (updated[0] === undefined) throw new InvalidArgumentError(`Element does not exist: ${working.id}`);
          return updated[0];
        }).value;
        this.#working = cloneElementSnapshot(this.#shapes, committed);
      }
      this.#status = 'finished';
    } catch (error) {
      this.#emitError(error);
      this.#status = 'cancelled';
    } finally {
      this.#ownCommit = false;
      this.#finishing = false;
    }
    this.#cleanupSession();
    this.#listeners.clear();
  }

  /** 按指定原因取消会话。 */
  cancel(reason: InteractionCancelReason = 'cancelled'): void {
    if (this.#status !== 'active' || this.#finishing) return;
    void reason;
    this.#status = 'cancelled';
    this.#cleanupSession();
    this.#listeners.clear();
  }

  /** 销毁当前 Transform 会话。 */
  destroy(): void {
    if (this.#status === 'active') this.cancel('destroyed');
    else this.#cleanupSession();
  }

  /** 撤销最近一次变换。 */
  undo(): boolean {
    this.#assertMutable();
    const snapshot = this.#history.undo();
    if (snapshot === undefined) return false;
    this.#applyHistory(snapshot);
    this.#syncToolbarState();
    return true;
  }

  /** 重做最近一次撤销操作。 */
  redo(): boolean {
    this.#assertMutable();
    const snapshot = this.#history.redo();
    if (snapshot === undefined) return false;
    this.#applyHistory(snapshot);
    this.#syncToolbarState();
    return true;
  }

  /** 复制当前选中元素。 */
  copy(options?: ElementCopyOptions<T>): Readonly<ElementState<T>> {
    this.#assertMutable();
    const state = this.#requireWorking();
    const copied = this.#commitCopy(state, options);
    this.#writeClipboard(cloneElementSnapshot(this.#shapes, state));
    this.#emit('copyPreviewConfirm', freeze({ type: 'copyPreviewConfirm', state: copied }));
    return copied;
  }

  /** 用指定元素替换当前选择。 */
  replaceSelected(elementId: string, options: InternalTransformReplaceOptions = {}): void {
    this.#assertMutable();
    const retainHistory = options.retainHistory ?? false;
    if (typeof retainHistory !== 'boolean') throw new InvalidArgumentError('Transform retainHistory must be a boolean');
    const state = this.#requireSelectable(elementId);
    this.#activateSnapshot(state, !retainHistory, true);
    if (retainHistory) this.#history.record(state, metadata('replace'));
    this.#syncToolbarState();
  }

  /** 删除当前选中元素。 */
  remove(): void {
    this.#assertMutable();
    const state = this.#requireWorking();
    this.#assertTargetCurrent();
    this.#ownRemove = true;
    try {
      const removed = this.#store.remove({ id: state.id });
      if (!removed.changes.some((change) => change.kind === 'remove' && change.id === state.id)) {
        throw new InvalidArgumentError(`Element does not exist: ${state.id}`);
      }
      this.#history.clear();
      this.#clearSelection(false, true);
      this.#emit('remove', freeze({ type: 'remove', state }));
    } finally {
      this.#ownRemove = false;
    }
  }

  /** 订阅 Transform 会话事件。 */
  on<K extends keyof InternalTransformEventMap<T>>(type: K, listener: (event: InternalTransformEventMap<T>[K]) => void): () => void {
    this.#assertActive();
    if (!eventTypes.has(type)) throw new InvalidArgumentError(`Unknown Transform event: ${String(type)}`);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Transform listener must be a function');
    let group = this.#listeners.get(type);
    if (group === undefined) {
      group = new Map();
      this.#listeners.set(type, group);
    }
    const id = ++this.#nextListenerId;
    group.set(id, listener as Listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#listeners.get(type);
      current?.delete(id);
      if (current?.size === 0) this.#listeners.delete(type);
    };
  }

  /** 消费右键事件；有复制预览时取消预览，否则结束会话。 */
  handleContextMenu(event?: RoutedPointerEvent<'rightclick'>): ContextMenuDecision {
    void event;
    if (this.#copyPreview) {
      this.#handle?.cancelCopyPreview();
      this.#copyPreview = false;
      this.#setTooltipLines(this.#baseTooltipLines());
      this.#emit('copyPreviewCancel', freeze({ type: 'copyPreviewCancel' }));
    } else {
      this.finish();
    }
    return 'consume';
  }

  /** 将会话配置转换为底层交互配置。 */
  #interactionOptions(): TransformInteractionOptions {
    return Object.freeze({
      hitTolerance: this.#options.hitTolerance,
      translate: this.#options.translate,
      scale: this.#options.scale,
      stretch: this.#options.stretch,
      rotate: this.#options.rotate,
      translateBBox: this.#options.translateBBox,
      noFlip: this.#options.noFlip,
      keepRectangle: this.#options.keepRectangle,
      buffer: this.#options.buffer,
      pointRadius: this.#options.pointRadius,
      ...(this.#options.handleStyle === undefined ? {} : { handleStyle: this.#options.handleStyle }),
      ...(this.#options.handleCenter === undefined ? {} : { handleCenter: this.#options.handleCenter })
    });
  }

  /** 读取并校验可选择的元素快照。 */
  #requireSelectable(elementId: string): ElementSnapshot<T> {
    if (typeof elementId !== 'string' || elementId.trim().length === 0) throw new InvalidArgumentError('Transform element id must be a non-empty string');
    const state = this.#store.get<T>(elementId);
    if (state === undefined) throw new InvalidArgumentError(`Element does not exist: ${elementId}`);
    if (!this.#matches(state)) throw new CapabilityError(`Element is outside the Transform target filter: ${elementId}`);
    const definition = this.#shapes.get(state.type);
    const enabled =
      (this.#options.translate !== 'none' && definition.capabilities.has('translate')) ||
      (this.#options.rotate && definition.capabilities.has('rotate')) ||
      (this.#options.scale && definition.capabilities.has('scale')) ||
      (this.#options.stretch && definition.capabilities.has('scale')) ||
      definition.capabilities.has('vertexEdit');
    if (!enabled) throw new CapabilityError(`Shape has no enabled Transform capability: ${state.type}`);
    return cloneElementSnapshot(this.#shapes, state);
  }

  /** 激活元素快照并同步交互视图。 */
  #activateSnapshot(snapshot: ElementSnapshot<T>, resetHistory: boolean, emitSelect: boolean): void {
    const generation = this.#store.generationOf(snapshot.id);
    const revision = this.#store.revisionOf(snapshot.id);
    if (generation === undefined || revision === undefined) throw new InvalidArgumentError(`Element does not exist: ${snapshot.id}`);
    if (this.#selected !== undefined) this.#clearSelection(true, true);
    this.#selected = cloneElementSnapshot(this.#shapes, snapshot);
    this.#working = cloneElementSnapshot(this.#shapes, snapshot);
    this.#mode = 'transform';
    this.#expectedGeneration = generation;
    this.#expectedRevision = revision;
    this.#operationOrigin = undefined;
    const handle = this.#requireHandle();
    try {
      handle.setTarget(this.#presentation(this.#working));
      this.#animations.setPreview(this.#working);
      if (resetHistory) this.#history.reset(this.#working);
      this.#createToolbar();
      this.#createTooltip();
      if (emitSelect) this.#emit('select', freeze({ type: 'select', state: this.#working }));
    } catch (error) {
      this.#destroyTooltip();
      this.#destroyToolbar();
      this.#stopTransient();
      try {
        if (this.#animationsPaused) this.#animations.resume({ id: snapshot.id });
      } catch (cleanupError) {
        this.#report(cleanupError, 'selection-rollback-resume-animations');
      }
      try {
        this.#animations.clearPreview(snapshot.id);
      } catch (cleanupError) {
        this.#report(cleanupError, 'selection-rollback-clear-preview');
      }
      this.#animationsPaused = false;
      this.#selected = undefined;
      this.#working = undefined;
      this.#expectedGeneration = undefined;
      this.#expectedRevision = undefined;
      try {
        handle.clearTarget();
      } catch (cleanupError) {
        this.#report(cleanupError, 'selection-rollback');
      }
      throw error;
    }
  }

  /** 将元素快照转换为底层交互目标。 */
  #presentation(state: ElementSnapshot<T>): TransformInteractionTarget {
    const definition = this.#shapes.get(state.type);
    const topology = definition.editTopology;
    const editing = this.#mode === 'edit' && definition.capabilities.has('vertexEdit') && topology !== undefined;
    const controlPoints = editing ? topology.describe(state.geometry as never).handles.map(({ coordinate }) => cloneCoordinate(coordinate)) : [];
    const transforming = this.#mode === 'transform';
    return Object.freeze({
      elementId: state.id,
      type: state.type,
      layerId: state.layerId,
      geometry: definition.toRenderGeometry(state.geometry as never),
      style: state.style,
      mode: this.#mode,
      controlPoints: Object.freeze(controlPoints),
      canTranslate: transforming && this.#options.translate !== 'none' && definition.capabilities.has('translate'),
      canRotate: transforming && this.#options.rotate && definition.capabilities.has('rotate'),
      canScale: transforming && this.#options.scale && definition.capabilities.has('scale'),
      canStretch: transforming && this.#options.stretch && definition.capabilities.has('scale'),
      canEditVertices: editing
    });
  }

  /** 将底层变换事件分派到会话操作。 */
  #handleInteractionEvent(event: TransformInteractionEvent): void {
    if (this.#status !== 'active' || this.#finishing) return;
    try {
      if (event.type === 'select-request') {
        if (event.coordinate !== undefined) this.#lastPointerCoordinate = cloneCoordinate(event.coordinate);
        for (const candidateId of event.candidateIds) {
          try {
            this.select(candidateId);
            break;
          } catch (error) {
            if (!(error instanceof CapabilityError)) throw error;
          }
        }
      } else if (event.type === 'pointer-move') {
        this.#lastPointerCoordinate = cloneCoordinate(event.coordinate);
        this.#tooltip?.update({ position: this.#lastPointerCoordinate });
      } else if (event.type === 'enter-handle' || event.type === 'leave-handle') {
        if (event.coordinate !== undefined) {
          this.#lastPointerCoordinate = cloneCoordinate(event.coordinate);
          this.#tooltip?.update({ position: this.#lastPointerCoordinate });
        }
        const state = this.#requireWorking();
        const type = event.type === 'enter-handle' ? 'enterHandle' : 'leaveHandle';
        this.#setTooltipLines(event.type === 'enter-handle' ? this.#handleTooltipLines(event.operation, event.axis) : this.#baseTooltipLines());
        this.#emit(type, freeze({ type, state, key: event.key, ...(event.cursor === undefined ? {} : { cursor: event.cursor }) }) as never);
      } else if (event.type === 'operation-start') {
        this.#updatePointerFromEvent(event);
        this.#assertOperationAllowed(event.operation);
        this.#operationOrigin = cloneElementSnapshot(this.#shapes, this.#requireWorking());
        this.#startOperationVisual(event.operation);
        this.#pauseAnimationsFor(event.operation);
        this.#setTooltipLines(this.#operationTooltipLines(event.operation, event.delta));
        this.#emitOperation('start', event.operation, event.delta);
      } else if (event.type === 'operation-change') {
        this.#updatePointerFromEvent(event);
        this.#setTooltipLines(this.#operationTooltipLines(event.operation, event.delta));
        this.#applyOperation(event.operation, event.delta, false);
      } else if (event.type === 'operation-end') {
        this.#updatePointerFromEvent(event);
        try {
          this.#applyOperation(event.operation, event.delta, true);
        } finally {
          this.#stopOperationVisual();
          this.#setTooltipLines(this.#handleTooltipLines(event.operation, undefined));
        }
      } else if (event.type === 'copy-preview-confirm') {
        this.#confirmCopyPreview(event.delta);
      } else {
        this.#copyPreview = false;
        this.#setTooltipLines(this.#baseTooltipLines());
        this.#emit('copyPreviewCancel', freeze({ type: 'copyPreviewCancel' }));
      }
    } catch (error) {
      this.#emitError(error);
      if (this.#status === 'active') this.cancel('cancelled');
    }
  }

  /** 将变换增量应用到工作快照。 */
  #applyOperation(operation: TransformOperation, delta: TransformDelta, end: boolean): void {
    const origin = this.#operationOrigin;
    if (origin === undefined) throw new InvalidArgumentError('Transform operation did not start');
    if (delta.type !== operation && !(operation === 'stretch' && delta.type === 'stretch')) {
      throw new InvalidArgumentError('Transform operation and delta do not match');
    }
    this.#working = transformSnapshot(this.#shapes, this.#styles, origin, delta);
    this.#requireHandle().setTarget(this.#presentation(this.#working));
    this.#animations.setPreview(this.#working);
    this.#updateToolbarPosition();
    this.#emitOperation(end ? 'end' : 'change', operation, delta);
    if (operation === 'vertex') this.#emit('edit', freeze({ type: 'edit', state: this.#working, operation }));
    if (end) {
      this.#history.record(this.#working, metadata(operation));
      this.#operationOrigin = undefined;
      this.#syncToolbarState();
      this.#resumePausedAnimations();
    }
  }

  /** 按变换阶段发出对应会话事件。 */
  #emitOperation(phase: 'start' | 'change' | 'end', operation: TransformOperation, delta: TransformDelta): void {
    const state = this.#requireWorking();
    if (operation === 'translate') {
      const type = phase === 'start' ? 'translateStart' : phase === 'change' ? 'translating' : 'translateEnd';
      this.#emit(type, freeze({ type, state, delta }) as never);
    } else if (operation === 'rotate') {
      const type = phase === 'start' ? 'rotateStart' : phase === 'change' ? 'rotating' : 'rotateEnd';
      this.#emit(type, freeze({ type, state, delta }) as never);
    } else if (operation === 'scale' || operation === 'stretch') {
      const type = phase === 'start' ? 'scaleStart' : phase === 'change' ? 'scaling' : 'scaleEnd';
      this.#emit(type, freeze({ type, state, delta }) as never);
    }
  }

  /** 应用撤销或重做得到的历史快照。 */
  #applyHistory(snapshot: ElementSnapshot<T>): void {
    if (snapshot.id !== this.#selected?.id) {
      const current = this.#requireSelectable(snapshot.id);
      this.#activateSnapshot({ ...current, geometry: snapshot.geometry, style: snapshot.style }, false, true);
    } else {
      this.#working = cloneElementSnapshot(this.#shapes, snapshot);
      this.#requireHandle().setTarget(this.#presentation(this.#working));
      this.#animations.setPreview(this.#working);
      this.#updateToolbarPosition();
    }
    this.#emit('edit', freeze({ type: 'edit', state: this.#requireWorking(), operation: 'vertex' }));
  }

  /** 将源快照复制为新的元素快照。 */
  #commitCopy(source: ElementSnapshot<T>, options?: ElementCopyOptions<T>): ElementSnapshot<T> {
    const overrides = options === undefined ? {} : (cloneCoreState(options) as ElementCopyOptions<T>);
    const id = this.#createId();
    return this.#store.transaction((transaction) =>
      transaction.add<T>({
        ...source,
        ...overrides,
        id,
        type: source.type
      })
    ).value;
  }

  /** 开始可由指针确认的复制预览。 */
  #beginCopyPreview(): void {
    const clipboard = this.#readClipboard();
    if (clipboard === undefined) return;
    const definition = this.#shapes.get(clipboard.type);
    this.#requireHandle().startCopyPreview({
      geometry: definition.toRenderGeometry(clipboard.geometry as never),
      style: clipboard.style
    });
    this.#copyPreview = true;
    this.#setTooltipLines(['点击地图完成复制，右键地图退出复制']);
  }

  /** 按位移确认并提交复制预览。 */
  #confirmCopyPreview(delta: Readonly<{ x: number; y: number }>): void {
    const clipboard = this.#readClipboard();
    if (!this.#copyPreview || clipboard === undefined) return;
    this.#copyPreview = false;
    const translated = transformSnapshot(this.#shapes, this.#styles, clipboard, { type: 'translate', x: delta.x, y: delta.y });
    const copied = this.#commitCopy(translated as ElementSnapshot<T>);
    this.#emit('copyPreviewConfirm', freeze({ type: 'copyPreviewConfirm', state: copied }));
    this.#activateSnapshot(copied, true, true);
  }

  /** 处理会话快捷键。 */
  #handleKeydown(event: Readonly<{ key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void }>): void {
    if (this.#status !== 'active' || event.altKey) return;
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (command && key === 'z') {
      if (event.shiftKey) this.redo();
      else this.undo();
      event.preventDefault();
    } else if (command && key === 'y' && !event.shiftKey) {
      this.redo();
      event.preventDefault();
    } else if (command && key === 'c' && this.#working !== undefined) {
      this.#writeClipboard(cloneElementSnapshot(this.#shapes, this.#working));
      event.preventDefault();
    } else if (command && key === 'v') {
      this.#beginCopyPreview();
      event.preventDefault();
    } else if (command && key === 'x' && this.#working !== undefined) {
      this.#writeClipboard(cloneElementSnapshot(this.#shapes, this.#working));
      this.remove();
      event.preventDefault();
    } else if (key === 'delete' && this.#working !== undefined) {
      this.remove();
      event.preventDefault();
    } else if (key === 'escape') {
      if (this.#copyPreview) {
        this.#handle?.cancelCopyPreview();
        this.#copyPreview = false;
        this.#setTooltipLines(this.#baseTooltipLines());
        this.#emit('copyPreviewCancel', freeze({ type: 'copyPreviewCancel' }));
      } else this.cancel();
      event.preventDefault();
    }
  }

  /** 监测目标元素的外部修改或删除。 */
  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#status !== 'active' || this.#selected === undefined) return;
    const change = changes.changes.find(({ id }) => id === this.#selected?.id);
    if (change === undefined || this.#ownCommit || this.#ownRemove) return;
    this.#emitError(new InvalidArgumentError(`Transform target changed externally: ${change.id}`));
    this.cancel('cancelled');
  }

  /** 断言目标元素代次和修订号仍然有效。 */
  #assertTargetCurrent(): void {
    const selected = this.#selected;
    if (selected === undefined || this.#expectedGeneration === undefined || this.#expectedRevision === undefined) {
      throw new ObjectDisposedError('Transform has no selected Element');
    }
    if (!this.#store.isGenerationCurrent(selected.id, this.#expectedGeneration) || !this.#store.isRevisionCurrent(selected.id, this.#expectedRevision)) {
      throw new InvalidArgumentError(`Transform target changed externally: ${selected.id}`);
    }
  }

  /** 为当前选择创建工具栏。 */
  #createToolbar(): void {
    this.#destroyToolbar();
    if (this.#options.toolbar === false || this.#toolbarPort === undefined || this.#working === undefined) return;
    const options = this.#options.toolbar;
    const items = options.items ?? defaultToolbarItems;
    const defaultItems = options.items === undefined;
    const spec: TransformToolbarViewSpec = Object.freeze({
      ownerId: this.id,
      items: Object.freeze(
        items.map((item) =>
          Object.freeze({
            key: item.key,
            title: item.title,
            ...(item.icon === undefined ? {} : { icon: item.icon }),
            ...(item.iconClass === undefined ? {} : { iconClass: item.iconClass }),
            visible: item.visible ?? !(defaultItems && item.key === 'edit' && (this.#working?.type === 'point' || this.#working?.type === 'circle')),
            disabled: item.disabled ?? false,
            active: item.active ?? false
          })
        )
      ),
      options: Object.freeze({
        position: toolbarPosition(this.#shapes.get(this.#working.type), this.#working.geometry, this.#options.handleCenter),
        offset: options.offset ?? ([15, 0] as const),
        ...(options.className === undefined ? {} : { className: options.className }),
        visible: options.visible ?? true
      })
    });
    this.#toolbar = this.#toolbarPort.open(spec, (event) => this.#handleToolbarEvent(event));
    this.#syncToolbarState();
  }

  /** 处理工具栏发出的命令或状态事件。 */
  #handleToolbarEvent(event: TransformToolbarViewEvent): void {
    if (event.type === 'command') {
      this.#toolbarCommand(event.key);
      return;
    }
    if (event.type === 'leave') {
      this.#setTooltipLines(this.#baseTooltipLines());
      return;
    }
    const item =
      (this.#options.toolbar === false ? undefined : this.#options.toolbar.items)?.find(({ key }) => key === event.key) ??
      defaultToolbarItems.find(({ key }) => key === event.key);
    if (item !== undefined) this.#setTooltipLines([item.title]);
  }

  /** 执行指定工具栏命令。 */
  #toolbarCommand(key: string): void {
    if (key === 'exit' || key === 'save') this.finish();
    else if (key === 'undo') this.undo();
    else if (key === 'redo') this.redo();
    else if (key === 'copy') {
      const working = this.#requireWorking();
      this.#writeClipboard(cloneElementSnapshot(this.#shapes, working));
      this.#beginCopyPreview();
    } else if (key === 'remove') this.remove();
    else if (key === 'edit') this.setMode(this.#mode === 'edit' ? 'transform' : 'edit');
  }

  /** 同步工具栏撤销、重做和模式状态。 */
  #syncToolbarState(): void {
    this.#toolbar?.updateItem('undo', { disabled: !this.#history.canUndo });
    this.#toolbar?.updateItem('redo', { disabled: !this.#history.canRedo });
    this.#setTooltipLines(this.#baseTooltipLines());
  }

  /** 将工具栏移动到当前图形锚点。 */
  #updateToolbarPosition(): void {
    const working = this.#working;
    if (working === undefined) return;
    this.#toolbar?.updateOptions({ position: toolbarPosition(this.#shapes.get(working.type), working.geometry, this.#options.handleCenter) });
  }

  /** 为当前会话创建鼠标提示。 */
  #createTooltip(): void {
    this.#destroyTooltip();
    if (this.#tooltipPort === undefined || this.#working === undefined) return;
    const position = this.#lastPointerCoordinate ?? toolbarPosition(this.#shapes.get(this.#working.type), this.#working.geometry, this.#options.handleCenter);
    this.#tooltip = this.#tooltipPort.open({
      ownerId: this.id,
      position,
      lines: this.#baseTooltipLines(),
      offset: [15, -11],
      visible: true
    });
  }

  /** 销毁当前鼠标提示。 */
  #destroyTooltip(): void {
    const tooltip = this.#tooltip;
    this.#tooltip = undefined;
    if (tooltip === undefined) return;
    try {
      tooltip.destroy();
    } catch (error) {
      this.#report(error, 'destroy-tooltip');
    }
  }

  /** 更新鼠标提示的文本行。 */
  #setTooltipLines(lines: readonly string[]): void {
    this.#tooltip?.update({ lines });
  }

  /** 生成当前模式的基础提示行。 */
  #baseTooltipLines(): readonly string[] {
    if (this.#mode === 'edit') return Object.freeze(['拖拽控制点编辑图形', '右键完成 | Esc 退出']);
    const history: string[] = [];
    if (this.#history.undoCount > 0) history.push(`Ctrl+Z 撤销 (${this.#history.undoCount})`);
    if (this.#history.redoCount > 0) history.push(`Ctrl+Y 重做 (${this.#history.redoCount})`);
    return Object.freeze(['选择控制点进行变换操作', 'Ctrl+C 复制 | Ctrl+V 粘贴 | Ctrl+X 剪切 | Delete 删除 | Esc 退出', ...history]);
  }

  /** 生成控制手柄悬停提示行。 */
  #handleTooltipLines(operation: TransformOperation | undefined, axis: 'x' | 'y' | 'xy' | undefined): readonly string[] {
    if (operation === 'translate') return Object.freeze(['鼠标左键按下平移']);
    if (operation === 'rotate') return Object.freeze(['鼠标左键按下旋转']);
    if (operation === 'stretch') return Object.freeze([axis === 'x' ? '鼠标左键按下水平拉伸' : axis === 'y' ? '鼠标左键按下垂直拉伸' : '鼠标左键按下拉伸']);
    if (operation === 'scale') return Object.freeze(['鼠标左键按下缩放，Shift 键保持比例缩放']);
    if (operation === 'vertex') return Object.freeze(['拖拽控制点编辑图形']);
    return this.#baseTooltipLines();
  }

  /** 生成变换过程中的数值提示行。 */
  #operationTooltipLines(operation: TransformOperation, delta: TransformDelta): readonly string[] {
    if (operation === 'translate') return Object.freeze(['平移中…']);
    if (operation === 'rotate' && delta.type === 'rotate') return Object.freeze([`旋转中…当前：${Math.round((-delta.angle * 180) / Math.PI)}°`]);
    if (operation === 'scale' || operation === 'stretch') return Object.freeze([operation === 'stretch' ? '拉伸中…' : '缩放中…']);
    return Object.freeze(['编辑中…']);
  }

  /** 从交互事件更新最近指针坐标和提示位置。 */
  #updatePointerFromEvent(event: { readonly coordinate?: Coordinate }): void {
    if (event.coordinate === undefined) return;
    this.#lastPointerCoordinate = cloneCoordinate(event.coordinate);
    this.#tooltip?.update({ position: this.#lastPointerCoordinate });
  }

  /** 清除当前元素选择及关联视图。 */
  #clearSelection(resumeAnimations: boolean, emitSelectEnd: boolean): void {
    const state = this.#working;
    const id = this.#selected?.id;
    this.#stopTransient();
    if (id !== undefined) {
      try {
        this.#animations.clearPreview(id);
      } catch (error) {
        this.#report(error, 'clear-animation-preview');
      }
    }
    if (id !== undefined && this.#animationsPaused) {
      try {
        if (resumeAnimations) this.#animations.resume({ id });
        else this.#animations.stop({ id });
      } catch (error) {
        this.#report(error, resumeAnimations ? 'resume-animations' : 'stop-animations');
      }
    }
    this.#animationsPaused = false;
    this.#destroyTooltip();
    this.#destroyToolbar();
    try {
      this.#handle?.clearTarget();
    } catch (error) {
      this.#report(error, 'clear-target');
    }
    this.#selected = undefined;
    this.#working = undefined;
    this.#mode = 'transform';
    this.#operationOrigin = undefined;
    this.#expectedGeneration = undefined;
    this.#expectedRevision = undefined;
    this.#copyPreview = false;
    if (emitSelectEnd && state !== undefined) this.#emit('selectEnd', freeze({ type: 'selectEnd', state }));
  }

  /** 在会改变几何的操作期间暂停元素动画。 */
  #pauseAnimationsFor(operation: TransformOperation): void {
    if (this.#animationsPaused || (operation !== 'translate' && operation !== 'scale' && operation !== 'stretch')) return;
    const working = this.#requireWorking();
    if (this.#shapes.get(working.type).toRenderGeometry(working.geometry as never).type !== 'point') return;
    this.#animationsPaused = this.#animations.pause({ id: working.id }) > 0;
  }

  /** 断言当前图形支持指定变换操作。 */
  #assertOperationAllowed(operation: TransformOperation): void {
    const working = this.#requireWorking();
    const definition = this.#shapes.get(working.type);
    if (operation === 'vertex') {
      if (this.#mode !== 'edit' || !definition.capabilities.has('vertexEdit') || definition.editTopology === undefined) {
        throw new InvalidArgumentError('Transform vertex operation requires edit mode');
      }
      return;
    }
    if (this.#mode !== 'transform') throw new InvalidArgumentError('Transform geometry operation requires transform mode');
    if (operation === 'translate' && (this.#options.translate === 'none' || !definition.capabilities.has('translate'))) {
      throw new CapabilityError(`Shape does not support enabled translation: ${working.type}`);
    }
    if (operation === 'rotate' && (!this.#options.rotate || !definition.capabilities.has('rotate'))) {
      throw new CapabilityError(`Shape does not support enabled rotation: ${working.type}`);
    }
    if (operation === 'scale' && (!this.#options.scale || !definition.capabilities.has('scale'))) {
      throw new CapabilityError(`Shape does not support enabled scaling: ${working.type}`);
    }
    if (operation === 'stretch' && (!this.#options.stretch || !definition.capabilities.has('scale'))) {
      throw new CapabilityError(`Shape does not support enabled stretching: ${working.type}`);
    }
  }

  /** 启动变换操作的临时视觉动画。 */
  #startOperationVisual(operation: TransformOperation): void {
    if (operation === 'vertex') return;
    const handle = this.#requireHandle();
    handle.setOperationActive(true, operation);
    try {
      this.#transient = this.#transients.playTransient({
        ownerId: this.id,
        renderLayerId: handle.renderLayerId,
        renderTargetId: handle.renderTargetId,
        channel: 'transform-bbox',
        animation: { type: 'blink', periodMs: 420 }
      });
    } catch (error) {
      handle.setOperationActive(false);
      throw error;
    }
  }

  /** 停止当前变换操作的临时视觉效果。 */
  #stopOperationVisual(): void {
    this.#stopTransient();
  }

  /** 恢复此前暂停的元素动画。 */
  #resumePausedAnimations(): void {
    if (!this.#animationsPaused) return;
    const id = this.#selected?.id;
    if (id !== undefined) this.#animations.resume({ id });
    this.#animationsPaused = false;
  }

  /** 停止当前临时动画。 */
  #stopTransient(): void {
    const transient = this.#transient;
    this.#transient = undefined;
    if (transient !== undefined) {
      try {
        transient.stop();
      } catch (error) {
        this.#report(error, 'stop-transient-handle');
      }
    }
    try {
      this.#transients.stopTransient(this.id);
    } catch (error) {
      this.#report(error, 'stop-transient-owner');
    }
    try {
      this.#handle?.setOperationActive(false);
    } catch (error) {
      this.#report(error, 'reset-operation-visual');
    }
  }

  /** 销毁当前及待清理的工具栏句柄。 */
  #destroyToolbar(): void {
    const toolbar = this.#toolbar;
    if (toolbar !== undefined) {
      this.#toolbar = undefined;
      this.#toolbarCleanup.add(toolbar);
    }
    if (this.#toolbarCleanupRunning) return;
    this.#toolbarCleanupRunning = true;
    try {
      for (const pending of [...this.#toolbarCleanup]) {
        try {
          pending.destroy();
          this.#toolbarCleanup.delete(pending);
        } catch (error) {
          this.#report(error, 'destroy-toolbar');
        }
      }
    } finally {
      this.#toolbarCleanupRunning = false;
    }
  }

  /** 释放会话交互、订阅、视图和动画资源。 */
  #cleanupSession(): void {
    if (this.#cleanupRunning) return;
    this.#cleanupRunning = true;
    try {
      if (this.#selected !== undefined) this.#clearSelection(this.#status !== 'cancelled' || this.#store.get(this.#selected.id) !== undefined, true);
      else {
        this.#stopTransient();
        this.#destroyTooltip();
        this.#destroyToolbar();
      }
      const handle = this.#handle;
      const unsubscribeStore = this.#unsubscribeStore;
      const unsubscribeInput = this.#unsubscribeInput;
      try {
        runFinalizers([
          ...(handle === undefined
            ? []
            : [
                () => {
                  handle.destroy();
                  if (this.#handle === handle) this.#handle = undefined;
                }
              ]),
          ...(unsubscribeStore === undefined
            ? []
            : [
                () => {
                  unsubscribeStore();
                  if (this.#unsubscribeStore === unsubscribeStore) this.#unsubscribeStore = undefined;
                }
              ]),
          ...(unsubscribeInput === undefined
            ? []
            : [
                () => {
                  unsubscribeInput();
                  if (this.#unsubscribeInput === unsubscribeInput) this.#unsubscribeInput = undefined;
                }
              ]),
          ...(!this.#coordinatorReleased
            ? [
                () => {
                  this.#coordinator.release(this);
                  this.#coordinatorReleased = true;
                }
              ]
            : [])
        ]);
      } catch (error) {
        this.#report(error, 'cleanup');
      }
      if (
        !this.#opening &&
        this.#handle === undefined &&
        this.#unsubscribeStore === undefined &&
        this.#unsubscribeInput === undefined &&
        this.#toolbarCleanup.size === 0 &&
        !this.#terminalNotified
      ) {
        this.#onTerminal();
        this.#terminalNotified = true;
      }
    } finally {
      this.#cleanupRunning = false;
    }
  }

  /** 获取当前底层变换交互句柄。 */
  #requireHandle(): TransformInteractionHandle {
    if (this.#handle === undefined) throw new ObjectDisposedError('Transform interaction is not open');
    return this.#handle;
  }

  /** 获取当前工作快照。 */
  #requireWorking(): ElementSnapshot<T> {
    if (this.#working === undefined) throw new ObjectDisposedError('Transform has no selected Element');
    return this.#working;
  }

  /** 向当前监听器分发 Transform 事件。 */
  #emit<K extends keyof InternalTransformEventMap<T>>(type: K, event: InternalTransformEventMap<T>[K]): void {
    for (const listener of [...(this.#listeners.get(type)?.values() ?? [])]) {
      try {
        const result = (listener as (value: InternalTransformEventMap<T>[K]) => unknown)(event);
        void Promise.resolve(result).catch((error: unknown) => this.#report(error, `listener:${String(type)}`));
      } catch (error) {
        this.#report(error, `listener:${String(type)}`);
      }
    }
  }

  /** 发出错误事件并上报错误。 */
  #emitError(error: unknown): void {
    this.#report(error, 'session');
    this.#emit('error', Object.freeze({ type: 'error', error }));
  }

  /** 隔离并上报 Transform 错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'TransformSession',
        operation,
        ownerId: this.id
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      return;
    }
  }

  /** 确保 Transform 会话仍处于活动状态。 */
  #assertActive(): void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Transform session has finished');
  }

  /** 确保会话当前允许修改元素。 */
  #assertMutable(): void {
    this.#assertActive();
    if (this.#finishing) throw new InvalidArgumentError('Transform session is finishing');
  }
}

/** Transform 会话允许订阅的事件类型。 */
const eventTypes = new Set<keyof InternalTransformEventMap>([
  'select',
  'selectEnd',
  'enterHandle',
  'leaveHandle',
  'translateStart',
  'translating',
  'translateEnd',
  'rotateStart',
  'rotating',
  'rotateEnd',
  'scaleStart',
  'scaling',
  'scaleEnd',
  'edit',
  'copyPreviewConfirm',
  'copyPreviewCancel',
  'remove',
  'error'
]);

/** 未自定义时使用的中文工具栏项目。 */
const defaultToolbarItems: readonly InternalTransformToolbarItemSpec[] = Object.freeze([
  Object.freeze({ key: 'exit', title: '确认', iconClass: 'ol-toolbar-exit' }),
  Object.freeze({ key: 'undo', title: '撤销 Ctrl+Z', iconClass: 'ol-toolbar-undo', disabled: true }),
  Object.freeze({ key: 'redo', title: '重做 Ctrl+Y', iconClass: 'ol-toolbar-redo', disabled: true }),
  Object.freeze({ key: 'copy', title: '复制 Ctrl+C', iconClass: 'ol-toolbar-copy' }),
  Object.freeze({ key: 'edit', title: '编辑', iconClass: 'ol-toolbar-edit' }),
  Object.freeze({ key: 'remove', title: '删除', iconClass: 'ol-toolbar-remove' })
]);

/** 将变换增量应用到完整元素快照。 */
function transformSnapshot<T>(shapes: ShapeRegistry, styles: StyleService, snapshot: Readonly<ElementState<T>>, delta: TransformDelta): ElementSnapshot<T> {
  const definition = shapes.get(snapshot.type);
  const pointVisualTransform = snapshot.geometry.type === 'point' && delta.type !== 'translate' && delta.type !== 'vertex';
  const geometry = pointVisualTransform ? definition.clone(snapshot.geometry as never) : transformShape(definition, snapshot.geometry, delta);
  const style = pointVisualTransform ? transformPointStyle(styles, snapshot.style, delta) : styles.clone(snapshot.style);
  return createElementSnapshot(shapes, { ...snapshot, geometry, style });
}

/** 将变换增量应用到图形状态。 */
function transformShape(definition: ShapeDefinition, state: ShapeState, delta: TransformDelta): ShapeState {
  if (delta.type === 'vertex') {
    const topology = definition.editTopology;
    if (topology === undefined || !definition.capabilities.has('vertexEdit')) throw new CapabilityError(`Shape does not support vertex editing: ${state.type}`);
    return topology.move(state as never, delta.index, cloneCoordinate(delta.coordinate)) as ShapeState;
  }
  if (delta.type === 'translate') {
    if (!definition.capabilities.has('translate')) throw new CapabilityError(`Shape does not support translation: ${state.type}`);
    if (state.type === 'circle') return { type: 'circle', center: translateCoordinate(state.center, delta.x, delta.y), radius: state.radius };
    return { type: state.type, controlPoints: state.controlPoints.map((coordinate) => translateCoordinate(coordinate, delta.x, delta.y)) } as ShapeState;
  }
  if (delta.type === 'rotate') {
    if (!definition.capabilities.has('rotate')) throw new CapabilityError(`Shape does not support rotation: ${state.type}`);
    if (state.type === 'circle') return definition.clone(state as never) as ShapeState;
    return { type: state.type, controlPoints: state.controlPoints.map((coordinate) => rotateCoordinate(coordinate, delta.center, delta.angle)) } as ShapeState;
  }
  if (!definition.capabilities.has('scale')) throw new CapabilityError(`Shape does not support scaling: ${state.type}`);
  if (state.type === 'circle') {
    const magnitude = (Math.abs(delta.scaleX) + Math.abs(delta.scaleY)) / 2;
    return {
      type: 'circle',
      center: scaleCoordinate(state.center, delta.center, delta.scaleX, delta.scaleY),
      radius: state.radius * magnitude
    };
  }
  return {
    type: state.type,
    controlPoints: state.controlPoints.map((coordinate) => scaleCoordinate(coordinate, delta.center, delta.scaleX, delta.scaleY))
  } as ShapeState;
}

/** 对点元素的符号样式应用旋转或缩放。 */
function transformPointStyle(
  styles: StyleService,
  input: Readonly<ElementState>['style'],
  delta: Exclude<TransformDelta, { type: 'translate' | 'vertex' }>
): StyleSpec {
  if (isNativeStyleRef(input)) throw new UnsupportedOperationError('Native styles cannot be structurally transformed');
  const result = styles.serialize(input);
  if (result.symbol === undefined) return result;
  if (delta.type === 'rotate') {
    if (result.symbol.type === 'icon') result.symbol.rotation = (result.symbol.rotation ?? 0) + delta.angle;
    return result;
  }
  if (result.symbol.type === 'icon') result.symbol.scale = multiplyScale(result.symbol.scale, delta.scaleX, delta.scaleY);
  else result.symbol.radius *= (Math.abs(delta.scaleX) + Math.abs(delta.scaleY)) / 2;
  return result;
}

/** 将现有缩放值与二维缩放系数相乘。 */
function multiplyScale(value: IconSymbolSpec['scale'] | TextSpec['scale'] | undefined, x: number, y: number): number | [number, number] {
  if (Array.isArray(value)) return [value[0] * x, value[1] * y];
  const scalar = value ?? 1;
  return x === y ? scalar * x : [scalar * x, scalar * y];
}

/** 计算工具栏默认锚点位置。 */
function toolbarPosition(definition: ShapeDefinition, state: ShapeState, override: Coordinate | undefined): Coordinate {
  if (override !== undefined) return cloneCoordinate(override);
  const geometry = definition.toRenderGeometry(state as never);
  if (geometry.type === 'point') return cloneCoordinate(geometry.coordinates);
  if (geometry.type === 'circle') return [geometry.center[0] + geometry.radius, geometry.center[1] + geometry.radius];
  const coordinates = geometry.type === 'polyline' ? geometry.coordinates : geometry.coordinates.flat();
  return [Math.max(...coordinates.map((coordinate) => coordinate[0])), Math.max(...coordinates.map((coordinate) => coordinate[1]))];
}

/** 复制地图坐标。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

/** 平移地图坐标。 */
function translateCoordinate(coordinate: Coordinate, x: number, y: number): Coordinate {
  return coordinate.length === 3 ? [coordinate[0] + x, coordinate[1] + y, coordinate[2]] : [coordinate[0] + x, coordinate[1] + y];
}

/** 围绕中心旋转地图坐标。 */
function rotateCoordinate(coordinate: Coordinate, center: Coordinate, angle: number): Coordinate {
  const x = coordinate[0] - center[0];
  const y = coordinate[1] - center[1];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotated: Coordinate = [center[0] + x * cosine - y * sine, center[1] + x * sine + y * cosine];
  return coordinate.length === 3 ? [rotated[0], rotated[1], coordinate[2]] : rotated;
}

/** 围绕中心缩放地图坐标。 */
function scaleCoordinate(coordinate: Coordinate, center: Coordinate, x: number, y: number): Coordinate {
  const scaled: Coordinate = [center[0] + (coordinate[0] - center[0]) * x, center[1] + (coordinate[1] - center[1]) * y];
  return coordinate.length === 3 ? [scaled[0], scaled[1], coordinate[2]] : scaled;
}

/** 克隆并递归冻结状态值。 */
function freeze<T>(value: T): T {
  return deepFreeze(cloneCoreState(value));
}

/** 递归冻结普通数据对象。 */
function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || visited.has(value)) return value;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, visited);
  }
  return Object.freeze(value);
}
