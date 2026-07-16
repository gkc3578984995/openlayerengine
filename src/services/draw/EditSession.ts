import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import { canonicalizeWorldEdit, placeCoordinateInEditWorld } from '../../core/common/worldWrap.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { InputEventMap } from '../../core/ports/InputPort.js';
import type { CursorPort, CursorViewHandle } from '../../core/ports/CursorPort.js';
import type {
  EditControlAnchor,
  EditInteractionAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState
} from '../../core/ports/EditInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { TooltipPort, TooltipViewHandle } from '../../core/ports/TooltipPort.js';
import type { ControlPointTopology, RenderGeometryState, ShapeDefinition, ShapeEditTopology, ShapeState } from '../../core/shape/types.js';
import { moveTrustedShapeState, renderTrustedShapeState } from '../../core/shape/trustedRender.js';
import type { ElementChangeSet, ElementGeneration, ElementRevision } from '../../core/transaction/types.js';
import type { InteractionCoordinator } from '../events/InteractionCoordinator.js';
import type { ContextMenuDecision, ExclusiveInteractionSession, InteractionCancelReason, InteractionStatus } from '../events/types.js';
import type { EditCancelReason, InternalEditOptions, InternalEditSession, InternalEditSessionEventMap, SessionKeyboardInput } from './types.js';

/**
 * 内部编辑状态机的装配依赖。
 *
 * @internal
 */
export interface EditSessionDependencies {
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 当前图形类型定义。 */
  readonly definition: ShapeDefinition;
  /** 互斥交互协调器。 */
  readonly coordinator: InteractionCoordinator;
  /** 底层编辑交互端口。 */
  readonly port: EditInteractionPort;
  /** 目标元素 ID。 */
  readonly elementId: string;
  /** 目标元素预期代次。 */
  readonly expectedGeneration?: ElementGeneration;
  /** 编辑会话配置。 */
  readonly options: Readonly<InternalEditOptions>;
  /** 可选的键盘输入。 */
  readonly input?: SessionKeyboardInput;
  /** 可选的跟随鼠标交互提示端口。 */
  readonly tooltipPort?: TooltipPort;
  /** 可选的地图交互光标端口。 */
  readonly cursorPort?: CursorPort;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
  /** 会话进入终态后的回调。 */
  readonly onTerminal: () => void;
}

/**
 * 独立于 OpenLayers 的语义动态编辑状态机。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export class EditSession<T = unknown> implements InternalEditSession<T>, ExclusiveInteractionSession {
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 当前图形类型定义。 */
  readonly #definition: ShapeDefinition;
  /** 互斥交互协调器。 */
  readonly #coordinator: InteractionCoordinator;
  /** 底层编辑交互端口。 */
  readonly #port: EditInteractionPort;
  /** 目标元素预期代次。 */
  readonly #expectedGeneration: ElementGeneration;
  /** 编辑会话配置。 */
  readonly #options: Readonly<InternalEditOptions>;
  /** 可选的键盘输入。 */
  readonly #input: SessionKeyboardInput | undefined;
  /** 可选的跟随鼠标交互提示端口。 */
  readonly #tooltipPort: TooltipPort | undefined;
  /** 可选的地图交互光标端口。 */
  readonly #cursorPort: CursorPort | undefined;
  /** 会话错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 会话终止回调。 */
  readonly #onTerminal: () => void;
  /** 按事件类型保存的监听器。 */
  readonly #listeners = new Map<keyof InternalEditSessionEventMap<T>, Map<number, (event: never) => void>>();
  /** 用于结束 finished Promise。 */
  #resolveFinished!: (state: Readonly<ElementState<T>> | undefined) => void;
  /** 会话结束后完成的 Promise。 */
  readonly finished: Promise<Readonly<ElementState<T>> | undefined>;
  /** 下一个监听器 ID。 */
  #nextListenerId = 0;
  /** 会话当前状态。 */
  #status: InteractionStatus = 'active';
  /** 底层编辑交互句柄。 */
  #handle: EditInteractionHandle | undefined;
  /** 元素仓库订阅释放函数。 */
  #unsubscribeStore: (() => void) | undefined;
  /** 键盘输入订阅释放函数。 */
  #unsubscribeInput: (() => void) | undefined;
  /** 当前编辑提示框句柄。 */
  #tooltip: TooltipViewHandle | undefined;
  /** 当前编辑光标句柄。 */
  #cursor: CursorViewHandle | undefined;
  /** 最近一次命中的编辑锚点。 */
  #hoverAnchor: EditInteractionAnchor | undefined;
  /** 会话开始时的元素状态。 */
  #entryState: Readonly<ElementState<T>> | undefined;
  /** 会话开始时的元素修订号。 */
  #entryRevision: ElementRevision | undefined;
  /** 当前编辑中的图形状态。 */
  #workingState: ShapeState | undefined;
  /** 最近一次成功渲染对应的控制点拓扑。 */
  #renderedTopology: ControlPointTopology | undefined;
  /** 拖动开始时的图形状态。 */
  #dragOrigin: ShapeState | undefined;
  /** 当前拖动控制点索引。 */
  #dragIndex: number | undefined;
  /** 当前拖拽控制点最近一次完成世界放置的坐标。 */
  #dragCoordinate: Coordinate | undefined;
  /** 编辑历史快照。 */
  #history: ShapeState[] = [];
  /** 当前历史索引。 */
  #historyIndex = 0;
  /** 是否正在提交仓库事务。 */
  #committing = false;
  /** 是否等待自身提交产生的仓库通知。 */
  #ownCommitNotificationPending = false;
  /** 是否正在打开底层交互。 */
  #opening = false;
  /** 是否正在清理资源。 */
  #cleanupRunning = false;
  /** 是否已释放交互协调器。 */
  #coordinatorReleased = false;
  /** 是否已通知会话终止。 */
  #terminalNotified = false;

  /**
   * 创建动态编辑会话。
   *
   * @param dependencies 元素事务、图形定义、原生端口、目标实例身份和生命周期回调。
   * @throws `InvalidArgumentError` 目标元素不存在或实例身份无效时抛出。
   */
  constructor(dependencies: EditSessionDependencies) {
    this.#store = dependencies.store;
    this.#definition = dependencies.definition;
    this.#coordinator = dependencies.coordinator;
    this.#port = dependencies.port;
    this.elementId = requireElementId(dependencies.elementId);
    const expectedGeneration = dependencies.expectedGeneration ?? dependencies.store.generationOf(this.elementId);
    if (expectedGeneration === undefined) throw new InvalidArgumentError(`Element does not exist: ${this.elementId}`);
    this.#expectedGeneration = expectedGeneration;
    this.#options = dependencies.options;
    this.#input = dependencies.input;
    this.#tooltipPort = dependencies.tooltipPort;
    this.#cursorPort = dependencies.cursorPort;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#onTerminal = dependencies.onTerminal;
    this.finished = new Promise((resolve) => {
      this.#resolveFinished = resolve;
    });
  }

  /** 正在编辑的元素 ID。 */
  readonly elementId: string;

  /** 返回会话当前状态。 */
  get status(): InteractionStatus {
    return this.#status;
  }

  /** 读取目标并打开底层编辑交互。 */
  open(): void {
    this.#assertActive();
    if (this.#handle !== undefined || this.#opening) throw new InvalidArgumentError('Edit session is already open');
    if (!this.#store.isGenerationCurrent(this.elementId, this.#expectedGeneration)) {
      throw new InvalidArgumentError(`Edit target generation changed before open: ${this.elementId}`);
    }
    const entryRevision = this.#store.revisionOf(this.elementId);
    if (entryRevision === undefined) throw new InvalidArgumentError(`Element does not exist: ${this.elementId}`);
    const entry = this.#store.resolve<T>(this.elementId);
    if (entry === undefined) throw new InvalidArgumentError(`Element does not exist: ${this.elementId}`);
    if (entry.type !== this.#definition.type) throw new InvalidArgumentError('Edit shape definition does not match the target element');
    const topology = this.#topology();
    const controlPoints = topology.describe(entry.geometry as never).handles.map(({ coordinate }) => cloneCoordinate(coordinate));
    this.#entryState = entry;
    this.#entryRevision = entryRevision;
    this.#opening = true;
    try {
      this.#unsubscribeStore = this.#store.subscribe((changes) => this.#handleStoreChanges(changes));
      const handle = this.#port.open(
        {
          elementId: this.elementId,
          controlPoints,
          underlay: this.#options.underlay ?? false
        },
        (event) => this.#handlePortEvent(event)
      );
      this.#handle = handle;
      this.#cursor = this.#cursorPort?.open();
      if (this.#status !== 'active') throw new ObjectDisposedError('Edit session was cancelled while opening');
      this.#workingState = freezeShapeState(this.#stateFromControlPoints(handle.placement.controlPoints));
      this.#history = [this.#workingState];
      this.#historyIndex = 0;
      this.#render();
      if (this.#status !== 'active') throw new ObjectDisposedError('Edit session was cancelled while opening');
      const unsubscribeInput = this.#input?.on('keydown', (event) => this.#handleKeydown(event));
      if (unsubscribeInput !== undefined && typeof unsubscribeInput !== 'function') {
        throw new InvalidArgumentError('Edit keyboard input must return a disposer');
      }
      this.#unsubscribeInput = unsubscribeInput;
      if (this.#status !== 'active') throw new ObjectDisposedError('Edit session was cancelled while opening');
    } finally {
      this.#opening = false;
      if (this.#status !== 'active') this.#cleanup();
    }
  }

  /** 在打开失败后取消并清理会话。 */
  abortOpen(): void {
    const wasActive = this.#status === 'active';
    if (wasActive) this.#status = 'cancelled';
    this.#cleanup();
    if (wasActive) {
      this.#resolveFinished(undefined);
      this.#listeners.clear();
    }
  }

  /** 提交当前编辑结果并结束会话。 */
  finish(): void {
    if (this.#status !== 'active' || this.#committing) return;
    let committed: Readonly<ElementState<T>>;
    try {
      const working = this.#requireWorkingState();
      const canonicalControlPoints = canonicalizeWorldEdit(this.#controlPoints(working), this.#requireHandle().placement.handoff);
      const completed = this.#stateFromControlPoints(canonicalControlPoints);
      const entryRevision = this.#entryRevision;
      if (entryRevision === undefined) throw new ObjectDisposedError('Edit interaction is not open');
      if (!this.#store.isGenerationCurrent(this.elementId, this.#expectedGeneration) || !this.#store.isRevisionCurrent(this.elementId, entryRevision)) {
        this.#terminate('cancelled', this.#store.get(this.elementId) === undefined ? 'external-remove' : 'external-change');
        return;
      }
      this.#committing = true;
      this.#ownCommitNotificationPending = true;
      committed = this.#store.transaction((transaction) => {
        const current = transaction.get<T>(this.elementId);
        if (current === undefined) throw new InvalidArgumentError(`Element does not exist: ${this.elementId}`);
        if (current.type !== this.#definition.type) throw new InvalidArgumentError('Edit target type changed during the session');
        const updated = transaction.update<T>({ id: this.elementId }, { geometry: completed });
        const result = updated[0];
        if (result === undefined) throw new InvalidArgumentError(`Element does not exist: ${this.elementId}`);
        return result;
      }).value;
    } catch (error) {
      this.#report(error, 'commit');
      if (this.#status === 'active') this.#terminate('cancelled', 'error');
      return;
    } finally {
      this.#committing = false;
      this.#ownCommitNotificationPending = false;
    }
    if (this.#status !== 'active') return;
    this.#status = 'finished';
    this.#cleanup();
    this.#emit('complete', freeze({ type: 'complete', state: committed }));
    this.#resolveFinished(committed);
    this.#listeners.clear();
  }

  /** 按指定原因取消会话。 */
  cancel(reason: InteractionCancelReason = 'cancelled'): void {
    if (this.#status !== 'active' || this.#committing) return;
    this.#terminate('cancelled', reason);
  }

  /** 销毁当前编辑会话。 */
  destroy(): void {
    if (this.#committing) return;
    if (this.#status === 'active') this.cancel('destroyed');
    else this.#cleanup();
  }

  /** 撤销最近一次编辑操作。 */
  undo(): boolean {
    if (this.#status !== 'active' || this.#historyIndex === 0) return false;
    const nextIndex = this.#historyIndex - 1;
    const nextState = this.#history[nextIndex];
    const previousIndex = this.#historyIndex;
    const previousState = this.#workingState;
    const previousDragOrigin = this.#dragOrigin;
    const previousDragIndex = this.#dragIndex;
    this.#historyIndex = nextIndex;
    this.#workingState = nextState;
    this.#clearDrag();
    try {
      this.#render();
    } catch (error) {
      this.#historyIndex = previousIndex;
      this.#workingState = previousState;
      this.#dragOrigin = previousDragOrigin;
      this.#dragIndex = previousDragIndex;
      throw error;
    }
    this.#emit('modifying', modifyingEvent(this.#workingState, 'undo'));
    this.#clearHover();
    return true;
  }

  /** 重做最近一次撤销操作。 */
  redo(): boolean {
    if (this.#status !== 'active' || this.#historyIndex >= this.#history.length - 1) return false;
    const nextIndex = this.#historyIndex + 1;
    const nextState = this.#history[nextIndex];
    const previousIndex = this.#historyIndex;
    const previousState = this.#workingState;
    const previousDragOrigin = this.#dragOrigin;
    const previousDragIndex = this.#dragIndex;
    this.#historyIndex = nextIndex;
    this.#workingState = nextState;
    this.#clearDrag();
    try {
      this.#render();
    } catch (error) {
      this.#historyIndex = previousIndex;
      this.#workingState = previousState;
      this.#dragOrigin = previousDragOrigin;
      this.#dragIndex = previousDragIndex;
      throw error;
    }
    this.#emit('modifying', modifyingEvent(this.#workingState, 'redo'));
    this.#clearHover();
    return true;
  }

  /** 订阅编辑会话事件。 */
  on<K extends keyof InternalEditSessionEventMap<T>>(type: K, listener: (event: InternalEditSessionEventMap<T>[K]) => void): () => void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Edit session has finished');
    if (!['modifying', 'complete', 'cancel'].includes(type)) throw new InvalidArgumentError(`Unknown Edit session event: ${String(type)}`);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Edit session listener must be a function');
    let listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      listeners = new Map();
      this.#listeners.set(type, listeners);
    }
    const id = ++this.#nextListenerId;
    listeners.set(id, listener as (event: never) => void);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#listeners.get(type);
      current?.delete(id);
      if (current?.size === 0) this.#listeners.delete(type);
    };
  }

  /** 消费右键事件以避免浏览器菜单干扰编辑。 */
  handleContextMenu(): ContextMenuDecision {
    if (this.#status === 'active') this.finish();
    return 'consume';
  }

  /** 将底层编辑事件分派到语义操作。 */
  #handlePortEvent(event: Readonly<EditInteractionEvent>): void {
    if (this.#status !== 'active') return;
    try {
      if (event.type === 'pointer-move') {
        this.#hoverAnchor = event.anchor;
        if (event.anchor === undefined) this.#cursor?.reset();
        else this.#cursor?.set('move');
        this.#updateTooltip(event.coordinate, this.#tooltipLines(event.anchor));
      } else if (event.type === 'move-start') {
        this.#startMove(event.anchor);
        this.#hoverAnchor = event.anchor;
        this.#cursor?.set('grabbing');
        this.#updateTooltip(event.coordinate, ['拖拽中…']);
      } else if (event.type === 'move') {
        this.#move(event.anchor, event.coordinate, false);
        this.#updateTooltip(event.coordinate, ['拖拽中…']);
      } else if (event.type === 'move-end') {
        this.#move(event.anchor, event.coordinate, true);
        this.#hoverAnchor = event.anchor;
        this.#cursor?.set('move');
        this.#updateTooltip(event.coordinate, this.#tooltipLines(event.anchor));
      } else if (event.type === 'move-cancel') {
        this.#cancelMove();
        this.#clearHover();
      } else if (event.type === 'insert') {
        this.#insert(event.anchor.index, event.anchor.coordinate);
        this.#clearHover();
      } else if (event.type === 'remove') {
        this.#remove(event.anchor);
        this.#clearHover();
      }
    } catch (error) {
      this.#report(error, 'port-event');
      if (this.#status === 'active') this.#terminate('cancelled', 'error');
    }
  }

  /** 处理撤销、重做、完成和取消快捷键。 */
  #handleKeydown(event: InputEventMap['keydown']): void {
    if (this.#status !== 'active' || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
    const key = event.key.toLowerCase();
    try {
      if (key === 'z') {
        if (event.shiftKey) this.redo();
        else this.undo();
      } else if (key === 'y' && !event.shiftKey) {
        this.redo();
      }
    } catch (error) {
      this.#report(error, 'keyboard');
      if (this.#status === 'active') this.#terminate('cancelled', 'error');
    }
  }

  /** 监测目标元素的外部修改或删除。 */
  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#status !== 'active') return;
    const target = changes.changes.find(({ id }) => id === this.elementId);
    if (target === undefined) return;
    if (this.#committing && this.#ownCommitNotificationPending && target.kind === 'update') {
      this.#ownCommitNotificationPending = false;
      return;
    }
    this.#terminate('cancelled', target.kind === 'remove' ? 'external-remove' : 'external-change');
  }

  /** 保存控制点拖动的起始状态。 */
  #startMove(anchor: EditControlAnchor): void {
    const working = this.#requireWorkingState();
    this.#dragOrigin = working;
    this.#dragIndex = anchor.index;
    this.#dragCoordinate = anchor.coordinate;
  }

  /** 根据拖动坐标更新控制点。 */
  #move(anchor: EditControlAnchor, input: Coordinate, end: boolean): void {
    if (this.#dragOrigin === undefined || this.#dragIndex !== anchor.index) throw new InvalidArgumentError('Edit move sequence is not active');
    const state = this.#requireWorkingState();
    const coordinate = this.#placeCoordinate(input, anchor.index);
    this.#workingState = freezeShapeState(moveTrustedShapeState(this.#definition, state as never, anchor.index, coordinate) as ShapeState);
    this.#dragCoordinate = coordinate;
    this.#render(end ? undefined : { anchor, coordinate });
    if (end) {
      this.#recordHistory();
      this.#clearDrag();
    }
    this.#emit('modifying', modifyingEvent(this.#workingState, 'move', coordinate));
  }

  /** 放弃当前未完成的拖动。 */
  #cancelMove(): void {
    if (this.#dragOrigin === undefined) return;
    this.#workingState = this.#dragOrigin;
    this.#dragOrigin = undefined;
    this.#dragIndex = undefined;
    this.#dragCoordinate = undefined;
    this.#render();
  }

  /** 在指定位置插入控制点。 */
  #insert(index: number, input: Coordinate): void {
    const topology = this.#topology();
    if (topology.insert === undefined) throw new InvalidArgumentError(`Shape does not support control-point insertion: ${this.#definition.type}`);
    const coordinate = this.#placeCoordinate(input, Math.max(0, index - 1));
    this.#workingState = freezeShapeState(topology.insert(this.#requireWorkingState() as never, index, coordinate) as ShapeState);
    this.#recordHistory();
    this.#render();
    this.#emit('modifying', modifyingEvent(this.#workingState, 'insert', coordinate));
  }

  /** 移除指定控制点。 */
  #remove(anchor: EditControlAnchor): void {
    const topology = this.#topology();
    if (!anchor.removable || topology.remove === undefined) throw new InvalidArgumentError(`Shape does not support removing control point ${anchor.index}`);
    this.#workingState = freezeShapeState(topology.remove(this.#requireWorkingState() as never, anchor.index) as ShapeState);
    this.#recordHistory();
    this.#render();
    this.#emit('modifying', modifyingEvent(this.#workingState, 'remove', cloneCoordinate(anchor.coordinate)));
  }

  /** 将当前编辑状态发送到底层端口。 */
  #render(activeMove?: Readonly<{ anchor: EditControlAnchor; coordinate: Coordinate }>): void {
    const handle = this.#handle;
    const state = this.#requireWorkingState();
    const entry = this.#entryState;
    if (handle === undefined || entry === undefined) throw new ObjectDisposedError('Edit interaction is not open');
    const description = activeMove === undefined ? this.#topology().describe(state as never) : undefined;
    const preview: EditInteractionRenderState = Object.freeze({
      geometry: freezeRenderGeometry(renderTrustedShapeState(this.#definition, state as never)),
      style: entry.style,
      anchors: activeMove === undefined ? freezeAnchors(description as ControlPointTopology) : freezeActiveAnchor(activeMove)
    });
    handle.render(preview);
    if (description !== undefined) this.#renderedTopology = this.#status === 'active' ? description : undefined;
  }

  /** 将输入坐标放置到连续的编辑世界。 */
  #placeCoordinate(coordinate: Coordinate, index: number): Coordinate {
    const state = this.#requireWorkingState();
    const movingReference = this.#dragIndex === index ? this.#dragCoordinate : undefined;
    const handles = movingReference === undefined ? (this.#renderedTopology?.handles ?? this.#topology().describe(state as never).handles) : undefined;
    const indexed = handles?.[index];
    const reference = movingReference ?? (indexed?.index === index ? indexed : handles?.find((handle) => handle.index === index))?.coordinate;
    return placeCoordinateInEditWorld(coordinate, reference?.[0] ?? coordinate[0], this.#requireHandle().placement.handoff);
  }

  /** 从控制点构建当前图形状态。 */
  #stateFromControlPoints(controlPoints: readonly Coordinate[]): ShapeState {
    const draft = this.#definition.createDraft(controlPoints);
    if (draft === undefined) throw new InvalidArgumentError(`Edit placement is incomplete for shape: ${this.#definition.type}`);
    const completion = this.#definition.tryComplete(draft as never);
    if (completion.status === 'incomplete') throw new InvalidArgumentError(`Edit placement is incomplete for shape: ${this.#definition.type}`);
    return this.#definition.clone(completion.state as never) as ShapeState;
  }

  /** 从图形状态提取可编辑控制点。 */
  #controlPoints(state: ShapeState): readonly Coordinate[] {
    const handles = [...this.#topology().describe(state as never).handles].sort((left, right) => left.index - right.index);
    for (let index = 0; index < handles.length; index += 1) {
      if (handles[index].index !== index) throw new InvalidArgumentError(`Shape edit topology has a non-contiguous handle index: ${handles[index].index}`);
    }
    return handles.map(({ coordinate }) => cloneCoordinate(coordinate));
  }

  /** 将当前图形状态写入编辑历史。 */
  #recordHistory(): void {
    this.#history.splice(this.#historyIndex + 1);
    this.#history.push(this.#requireWorkingState());
    this.#historyIndex = this.#history.length - 1;
  }

  /** 创建或更新编辑提示框，并让它跟随当前指针。 */
  #updateTooltip(input: Coordinate, lines: readonly string[]): void {
    const position = cloneCoordinate(input);
    if (this.#tooltip === undefined) {
      if (this.#tooltipPort === undefined) return;
      this.#tooltip = this.#tooltipPort.open({
        ownerId: `edit:${this.elementId}`,
        variant: 'edit',
        position,
        lines,
        offset: [15, -11],
        visible: true
      });
      return;
    }
    this.#tooltip.update({ position, lines });
  }

  /** 生成基础、悬停控制点和悬停中点对应的提示文字。 */
  #tooltipLines(anchor: EditInteractionAnchor | undefined = this.#hoverAnchor): readonly string[] {
    if (anchor?.kind === 'insertion') return Object.freeze(['按住 Alt 单击添加点']);
    if (anchor?.kind === 'control') {
      return anchor.removable ? Object.freeze(['拖拽控制点编辑图形', '按住 Alt 单击删除点']) : Object.freeze(['拖拽控制点编辑图形']);
    }

    const topology = this.#renderedTopology;
    const canInsert = (topology?.insertions.length ?? 0) > 0;
    const canRemove = topology?.handles.some(({ removable }) => removable) ?? false;
    const lines = ['拖拽控制点进行编辑'];
    if (canInsert && canRemove) lines.push('按住 Alt 单击中点添加点 | 按住 Alt 单击可删除控制点');
    else if (canInsert) lines.push('按住 Alt 单击中点添加点');
    else if (canRemove) lines.push('按住 Alt 单击可删除控制点');
    lines.push('右击退出编辑');
    if (this.#historyIndex > 0) lines.push(`Ctrl+Z 撤销 (${this.#historyIndex})`);
    const redoCount = this.#history.length - this.#historyIndex - 1;
    if (redoCount > 0) lines.push(`Ctrl+Y 重做 (${redoCount})`);
    return Object.freeze(lines);
  }

  /** 刷新当前编辑提示文字。 */
  #refreshTooltip(): void {
    this.#tooltip?.update({ lines: this.#tooltipLines() });
  }

  /** 清除可能已经失效的悬停锚点并恢复基础提示。 */
  #clearHover(): void {
    this.#hoverAnchor = undefined;
    this.#cursor?.reset();
    this.#refreshTooltip();
  }

  /** 清除当前拖动状态。 */
  #clearDrag(): void {
    this.#dragOrigin = undefined;
    this.#dragIndex = undefined;
    this.#dragCoordinate = undefined;
  }

  /** 获取并校验当前图形的编辑拓扑。 */
  #topology(): ShapeEditTopology {
    const topology = this.#definition.editTopology;
    if (topology === undefined) throw new InvalidArgumentError(`Shape does not support editing: ${this.#definition.type}`);
    return topology as ShapeEditTopology;
  }

  /** 获取当前编辑状态。 */
  #requireWorkingState(): ShapeState {
    if (this.#workingState === undefined) throw new ObjectDisposedError('Edit interaction is not open');
    return this.#workingState;
  }

  /** 获取当前底层编辑句柄。 */
  #requireHandle(): EditInteractionHandle {
    if (this.#handle === undefined) throw new ObjectDisposedError('Edit interaction is not open');
    return this.#handle;
  }

  /** 将会话置为终态并发出取消事件。 */
  #terminate(status: Extract<InteractionStatus, 'finished' | 'cancelled'>, reason?: EditCancelReason): void {
    if (this.#status !== 'active') return;
    this.#status = status;
    this.#cleanup();
    if (reason !== undefined) this.#emit('cancel', freeze({ type: 'cancel', reason }));
    this.#resolveFinished(undefined);
    this.#listeners.clear();
  }

  /** 释放底层交互、订阅和协调器。 */
  #cleanup(): void {
    if (this.#cleanupRunning) return;
    this.#cleanupRunning = true;
    try {
      const handle = this.#handle;
      const unsubscribeStore = this.#unsubscribeStore;
      const unsubscribeInput = this.#unsubscribeInput;
      const tooltip = this.#tooltip;
      const cursor = this.#cursor;
      try {
        runFinalizers([
          ...(handle === undefined
            ? []
            : [
                () => {
                  handle.destroy();
                  if (this.#handle === handle) {
                    this.#handle = undefined;
                    this.#renderedTopology = undefined;
                  }
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
          ...(tooltip === undefined
            ? []
            : [
                () => {
                  tooltip.destroy();
                  if (this.#tooltip === tooltip) {
                    this.#tooltip = undefined;
                    this.#hoverAnchor = undefined;
                  }
                }
              ]),
          ...(cursor === undefined
            ? []
            : [
                () => {
                  cursor.destroy();
                  if (this.#cursor === cursor) this.#cursor = undefined;
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
        this.#tooltip === undefined &&
        this.#cursor === undefined &&
        this.#coordinatorReleased &&
        !this.#terminalNotified
      ) {
        try {
          this.#onTerminal();
          this.#terminalNotified = true;
        } catch (error) {
          this.#report(error, 'terminal-notification');
        }
      }
    } finally {
      this.#cleanupRunning = false;
    }
  }

  /** 向当前监听器分发会话事件。 */
  #emit<K extends keyof InternalEditSessionEventMap<T>>(type: K, event: InternalEditSessionEventMap<T>[K]): void {
    const listeners = [...(this.#listeners.get(type)?.values() ?? [])];
    for (const listener of listeners) {
      try {
        const result = (listener as (value: InternalEditSessionEventMap<T>[K]) => unknown)(event);
        void Promise.resolve(result).catch((error: unknown) => this.#report(error, `listener:${String(type)}`));
      } catch (error) {
        this.#report(error, `listener:${String(type)}`);
      }
    }
  }

  /** 隔离并上报会话错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'EditSession',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误报告器自身失败时不能影响会话生命周期。
    }
  }

  /** 确保编辑会话仍处于活动状态。 */
  #assertActive(): void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Edit session has finished');
  }
}

/** 校验目标元素 ID。 */
function requireElementId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Edit element id must be a non-empty string');
  return value;
}

/** 校验并复制地图坐标。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || !coordinate.every(Number.isFinite)) {
    throw new InvalidArgumentError('Edit coordinates must contain two or three finite numbers');
  }
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

/** 冻结事件或状态对象。 */
function freezeShapeState(state: ShapeState): ShapeState {
  if (Object.isFrozen(state)) return state;
  if ('controlPoints' in state) {
    for (const coordinate of state.controlPoints) Object.freeze(coordinate);
    Object.freeze(state.controlPoints);
  } else {
    Object.freeze(state.center);
  }
  return Object.freeze(state);
}

function freezeRenderGeometry(geometry: RenderGeometryState): RenderGeometryState {
  if (Object.isFrozen(geometry)) return geometry;
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

function freezeActiveAnchor(activeMove: Readonly<{ anchor: EditControlAnchor; coordinate: Coordinate }>): readonly EditInteractionAnchor[] {
  Object.freeze(activeMove.coordinate);
  return Object.freeze([Object.freeze({ ...activeMove.anchor, coordinate: activeMove.coordinate })]);
}

function freezeAnchors(topology: ControlPointTopology): readonly EditInteractionAnchor[] {
  const anchors = new Array<EditInteractionAnchor>(topology.handles.length + topology.insertions.length);
  let offset = 0;
  for (const anchor of topology.handles) {
    Object.freeze(anchor.coordinate);
    anchors[offset++] = Object.freeze({ ...anchor, kind: 'control' as const });
  }
  for (const anchor of topology.insertions) {
    Object.freeze(anchor.coordinate);
    anchors[offset++] = Object.freeze({ ...anchor, kind: 'insertion' as const });
  }
  return Object.freeze(anchors);
}

function modifyingEvent(
  state: ShapeState,
  operation: InternalEditSessionEventMap['modifying']['operation'],
  coordinate?: Coordinate
): InternalEditSessionEventMap['modifying'] {
  return Object.freeze({
    type: 'modifying',
    state: freezeShapeState(state),
    operation,
    ...(coordinate === undefined ? {} : { coordinate: Object.freeze(coordinate) })
  });
}

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
