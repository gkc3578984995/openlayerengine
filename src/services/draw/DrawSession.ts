import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import { canonicalizeWorldEdit, placeCoordinateInEditWorld, type WorldEditHandoff } from '../../core/common/worldWrap.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { InputEventMap } from '../../core/ports/InputPort.js';
import type { CursorPort, CursorViewHandle } from '../../core/ports/CursorPort.js';
import type { DrawInteractionEvent, DrawInteractionHandle, DrawInteractionPort, DrawInteractionRenderState } from '../../core/ports/DrawInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { TooltipPort, TooltipViewHandle } from '../../core/ports/TooltipPort.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import { shapeFreehandAccumulatorFor, type ShapeFreehandAccumulator } from '../../core/shape/freehandAccumulator.js';
import type { ElementStyleState } from '../../core/style/types.js';
import type { ElementGeneration } from '../../core/transaction/types.js';
import type { StyleService } from '../style/StyleService.js';
import type { InteractionCoordinator } from '../events/InteractionCoordinator.js';
import type { ContextMenuDecision, ExclusiveInteractionSession, InteractionCancelReason, InteractionStatus } from '../events/types.js';
import type { DrawCancelReason, InternalDrawOptions, InternalDrawSession, InternalDrawSessionEventMap, SessionKeyboardInput } from './types.js';

/**
 * 内部绘制状态机的装配依赖。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export interface DrawSessionDependencies<T> {
  /** 元素状态仓库。 */
  readonly store: ElementStore;
  /** 当前图形类型定义。 */
  readonly definition: ShapeDefinition;
  /** 内部样式服务。 */
  readonly styles: StyleService;
  /** 互斥交互协调器。 */
  readonly coordinator: InteractionCoordinator;
  /** 底层绘制交互端口。 */
  readonly port: DrawInteractionPort;
  /** 在元素规范状态和 View 工作状态之间转换图形。 */
  readonly shapeProjection: ShapeProjectionPort;
  /** 规范化后的绘制配置。 */
  readonly options: Readonly<Required<Pick<InternalDrawOptions<T>, 'type' | 'layerId' | 'limit' | 'keepGraphics'>> & InternalDrawOptions<T>>;
  /** 可选的键盘输入。 */
  readonly input?: SessionKeyboardInput;
  /** 可选的跟随鼠标交互提示端口。 */
  readonly tooltipPort?: TooltipPort;
  /** 可选的地图交互光标端口。 */
  readonly cursorPort?: CursorPort;
  /** 默认样式解析函数。 */
  readonly defaultStyle: (state: ShapeState) => ElementStyleState;
  /** 元素 ID 生成器。 */
  readonly createId: () => string;
  /** 可选的错误报告器。 */
  readonly errorReporter?: ErrorReporter;
  /** 绘制结果提交后的回调。 */
  readonly onCommitted: (state: Readonly<ElementState<T>>) => void;
  /** 会话进入终态后的回调。 */
  readonly onTerminal: () => void;
}

/** 一次草稿完成操作的结果。 */
type CompletionOutcome = 'committed' | 'incomplete' | 'failed';

/**
 * 独立于 OpenLayers 的语义绘制状态机。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export class DrawSession<T = unknown> implements InternalDrawSession<T>, ExclusiveInteractionSession {
  /** 元素状态仓库。 */
  readonly #store: ElementStore;
  /** 当前图形类型定义。 */
  readonly #definition: ShapeDefinition;
  /** 内部样式服务。 */
  readonly #styles: StyleService;
  /** 互斥交互协调器。 */
  readonly #coordinator: InteractionCoordinator;
  /** 底层绘制交互端口。 */
  readonly #port: DrawInteractionPort;
  /** 在元素规范状态和 View 工作状态之间转换图形。 */
  readonly #shapeProjection: ShapeProjectionPort;
  /** 规范化后的绘制配置。 */
  readonly #options: DrawSessionDependencies<T>['options'];
  /** 可选的键盘输入。 */
  readonly #input: SessionKeyboardInput | undefined;
  /** 可选的跟随鼠标交互提示端口。 */
  readonly #tooltipPort: TooltipPort | undefined;
  /** 可选的地图交互光标端口。 */
  readonly #cursorPort: CursorPort | undefined;
  /** 默认样式解析函数。 */
  readonly #defaultStyle: DrawSessionDependencies<T>['defaultStyle'];
  /** 元素 ID 生成器。 */
  readonly #createId: () => string;
  /** 会话错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 绘制结果提交回调。 */
  readonly #onCommitted: DrawSessionDependencies<T>['onCommitted'];
  /** 会话终止回调。 */
  readonly #onTerminal: () => void;
  /** 按事件类型保存的监听器。 */
  readonly #listeners = new Map<keyof InternalDrawSessionEventMap<T>, Map<number, (event: never) => void>>();
  /** 已提交结果的 ID 与代次。 */
  readonly #results: Array<Readonly<{ id: string; generation: ElementGeneration }>> = [];
  /** 用于结束 finished Promise。 */
  #resolveFinished!: (states: readonly Readonly<ElementState<T>>[]) => void;
  /** 会话结束后完成的 Promise。 */
  readonly finished: Promise<readonly Readonly<ElementState<T>>[]>;
  /** 下一个监听器 ID。 */
  #nextListenerId = 0;
  /** 会话当前状态。 */
  #status: InteractionStatus = 'active';
  /** 底层绘制交互句柄。 */
  #handle: DrawInteractionHandle | undefined;
  /** 键盘输入订阅释放函数。 */
  #unsubscribeInput: (() => void) | undefined;
  /** 当前绘制提示框句柄。 */
  #tooltip: TooltipViewHandle | undefined;
  /** 当前绘制光标句柄。 */
  #cursor: CursorViewHandle | undefined;
  /** 当前草稿控制点。 */
  #controlPoints: Coordinate[] = [];
  /** 当前指针坐标。 */
  #pointer: Coordinate | undefined;
  /** 控制点历史快照。 */
  #redoControlPoints: Coordinate[] = [];
  /** 当前历史索引。 */
  /** 正在执行的完成操作数量。 */
  #completionCount = 0;
  /** 是否正在自由绘制。 */
  #freehandActive = false;
  /** 仅供可信 built-in policy 使用的会话私有 O(1) 采样累加器。 */
  #freehandAccumulator: ShapeFreehandAccumulator | undefined;
  /** 是否正在提交草稿。 */
  #completionActive = false;
  /** 是否正在执行 finish。 */
  #finishActive = false;
  /** 是否在完成草稿后结束会话。 */
  #finishRequested = false;
  /** 是否正在打开底层交互。 */
  #opening = false;
  /** 是否正在清理资源。 */
  #cleanupRunning = false;
  /** 是否已释放交互协调器。 */
  #coordinatorReleased = false;
  /** 是否已通知会话终止。 */
  #terminalNotified = false;
  /** 本会话解析后的绘制样式。 */
  #resolvedStyle: ElementStyleState | undefined;
  /** 绘制样式是否已经解析。 */
  #resolvedStyleSet = false;

  /**
   * 创建语义绘制会话。
   *
   * @param dependencies 元素事务、图形定义、样式、交互端口、输入和生命周期回调。
   */
  constructor(dependencies: DrawSessionDependencies<T>) {
    this.#store = dependencies.store;
    this.#definition = dependencies.definition;
    this.#styles = dependencies.styles;
    this.#coordinator = dependencies.coordinator;
    this.#port = dependencies.port;
    this.#shapeProjection = dependencies.shapeProjection;
    this.#options = dependencies.options;
    this.#input = dependencies.input;
    this.#tooltipPort = dependencies.tooltipPort;
    this.#cursorPort = dependencies.cursorPort;
    this.#defaultStyle = dependencies.defaultStyle;
    this.#createId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#onCommitted = dependencies.onCommitted;
    this.#onTerminal = dependencies.onTerminal;
    this.finished = new Promise((resolve) => {
      this.#resolveFinished = resolve;
    });
  }

  /** 返回会话当前状态。 */
  get status(): InteractionStatus {
    return this.#status;
  }

  /** 返回仍与原代次一致的绘制结果。 */
  get results(): readonly Readonly<ElementState<T>>[] {
    return Object.freeze(
      this.#results.flatMap(({ id, generation }) => {
        if (!this.#store.isGenerationCurrent(id, generation)) return [];
        const state = this.#store.get<T>(id);
        return state === undefined ? [] : [state];
      })
    );
  }

  /** 打开底层绘制交互和键盘订阅。 */
  open(): void {
    this.#assertActive();
    if (this.#handle !== undefined || this.#opening) throw new InvalidArgumentError('Draw session is already open');
    const policy = this.#definition.controlPointPolicy;
    this.#opening = true;
    try {
      this.#handle = this.#port.open(
        {
          mode: policy?.autoFinish === 1 && policy.completeMax === 1 ? 'point' : 'vertices',
          freehand: this.#definition.freehand !== undefined,
          layerId: this.#options.layerId
        },
        (event) => this.#handlePortEvent(event)
      );
      this.#cursor = this.#cursorPort?.open();
      this.#cursor?.set('pointer');
      if (this.#status !== 'active') throw new ObjectDisposedError('Draw session was cancelled while opening');
      const unsubscribeInput = this.#input?.on('keydown', (event) => this.#handleKeydown(event));
      if (unsubscribeInput !== undefined && typeof unsubscribeInput !== 'function') {
        throw new InvalidArgumentError('Draw keyboard input must return a disposer');
      }
      this.#unsubscribeInput = unsubscribeInput;
      if (this.#status !== 'active') throw new ObjectDisposedError('Draw session was cancelled while opening');
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
      this.#resolveFinished(this.results);
      this.#listeners.clear();
    }
  }

  /** 完成当前草稿并结束会话。 */
  finish(): void {
    if (this.#status !== 'active') return;
    if (this.#completionActive) {
      this.#finishRequested = true;
      return;
    }
    if (this.#finishActive) return;
    this.#finishActive = true;
    try {
      const outcome = this.#completeCurrent(false);
      if (outcome === 'incomplete') this.#emit('cancel', freeze({ type: 'cancel', reason: 'incomplete' }));
      if (this.#status === 'active') this.#terminate('finished');
    } finally {
      this.#finishActive = false;
    }
  }

  /** 按指定原因取消会话。 */
  cancel(reason: InteractionCancelReason = 'cancelled'): void {
    if (this.#status !== 'active') return;
    this.#terminate('cancelled', reason);
  }

  /** 销毁当前会话。 */
  destroy(): void {
    if (this.#status === 'active') this.cancel('destroyed');
    else this.#cleanup();
  }

  /** 撤销最近一次控制点操作。 */
  undo(): boolean {
    if (this.#status !== 'active' || this.#completionActive || this.#controlPoints.length === 0) return false;
    const previousPointer = this.#pointer;
    const removed = this.#controlPoints.pop() as Coordinate;
    this.#redoControlPoints.push(removed);
    this.#pointer = undefined;
    try {
      this.#renderPreview(undefined);
    } catch (error) {
      this.#redoControlPoints.pop();
      this.#controlPoints.push(removed);
      this.#pointer = previousPointer;
      throw error;
    }
    this.#refreshTooltip();
    return true;
  }

  /** 重做最近一次撤销操作。 */
  redo(): boolean {
    if (this.#status !== 'active' || this.#completionActive || this.#redoControlPoints.length === 0) return false;
    const previousPointer = this.#pointer;
    const restored = this.#redoControlPoints.pop() as Coordinate;
    this.#controlPoints.push(restored);
    this.#pointer = undefined;
    try {
      this.#renderPreview(undefined);
    } catch (error) {
      this.#controlPoints.pop();
      this.#redoControlPoints.push(restored);
      this.#pointer = previousPointer;
      throw error;
    }
    this.#refreshTooltip();
    return true;
  }

  /** 订阅绘制会话事件。 */
  on<K extends keyof InternalDrawSessionEventMap<T>>(type: K, listener: (event: InternalDrawSessionEventMap<T>[K]) => void): () => void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Draw session has finished');
    if (!['start', 'change', 'click', 'complete', 'cancel'].includes(type)) throw new InvalidArgumentError(`Unknown Draw session event: ${String(type)}`);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Draw session listener must be a function');
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

  /** 消费右键事件以避免浏览器菜单干扰绘制。 */
  handleContextMenu(): ContextMenuDecision {
    if (this.#status === 'active') this.finish();
    return 'consume';
  }

  /** 将底层绘制事件分派到语义操作。 */
  #handlePortEvent(event: Readonly<DrawInteractionEvent>): void {
    if (this.#status !== 'active' || this.#completionActive) return;
    try {
      const tooltipPosition = 'coordinate' in event ? event.coordinate : event.type === 'freehand-samples' ? event.coordinates.at(-1) : undefined;
      if (tooltipPosition !== undefined) this.#updateTooltipPosition(tooltipPosition);
      if (event.type === 'move') this.#movePointer(event.coordinate);
      else if (event.type === 'click') this.#addControlPoint(event.coordinate);
      else if (event.type === 'freehand-start') this.#startFreehand(event.coordinate);
      else if (event.type === 'freehand-sample') this.#sampleFreehand(event.coordinate);
      else if (event.type === 'freehand-samples') this.#sampleFreehandBatch(event.coordinates);
      else if (event.type === 'freehand-complete') this.#completeFreehand(event.coordinate);
      else this.#cancelFreehand();
    } catch (error) {
      this.#report(error, 'port-event');
      if (this.#status === 'active') this.#terminate('cancelled', 'error');
    }
  }

  /** 处理撤销、重做、完成和取消快捷键。 */
  #handleKeydown(event: InputEventMap['keydown']): void {
    if (this.#status !== 'active' || this.#completionActive || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
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

  /** 添加控制点并更新草稿历史。 */
  #addControlPoint(input: Coordinate): void {
    const coordinate = this.#placeCoordinate(input);
    const first = this.#controlPoints.length === 0;
    this.#controlPoints.push(coordinate);
    this.#pointer = undefined;
    this.#recordHistory();
    if (first) {
      this.#emit('start', freeze({ type: 'start', coordinate: cloneCoordinate(coordinate) }));
      if (this.#status !== 'active') return;
    }
    this.#emit('click', freeze({ type: 'click', coordinate: cloneCoordinate(coordinate), controlPointCount: this.#controlPoints.length }));
    if (this.#status !== 'active') return;
    this.#renderPreview(coordinate);
    if (this.#status !== 'active') return;
    const threshold = this.#definition.controlPointPolicy?.autoFinish ?? this.#definition.controlPointPolicy?.completeMax;
    if (threshold !== undefined && this.#controlPoints.length >= threshold) void this.#completeCurrent(true);
  }

  /** 更新指针坐标和绘制预览。 */
  #movePointer(input: Coordinate): void {
    if (this.#controlPoints.length === 0) return;
    this.#pointer = this.#placeCoordinate(input);
    this.#renderPreview(this.#pointer);
  }

  /** 开始自由绘制轨迹。 */
  #startFreehand(input: Coordinate): void {
    const policy = this.#definition.freehand;
    if (policy === undefined) throw new InvalidArgumentError(`Shape does not support freehand drawing: ${this.#definition.type}`);
    this.#resetDraft();
    this.#freehandActive = true;
    this.#freehandAccumulator = shapeFreehandAccumulatorFor(policy.appendSample);
    this.#appendFreehandSample(policy, cloneCoordinate(input));
    this.#emit('start', freeze({ type: 'start', coordinate: cloneCoordinate(this.#controlPoints[0]) }));
    if (this.#status !== 'active') return;
    this.#renderFreehand('preview');
  }

  /** 向自由绘制轨迹追加采样点。 */
  #sampleFreehand(input: Coordinate): void {
    this.#sampleFreehandBatch([input]);
  }

  /** 按输入顺序累积一帧内的全部采样，并且最多发布一次完整预览。 */
  #sampleFreehandBatch(inputs: readonly Coordinate[]): void {
    if (!this.#freehandActive) return;
    const policy = this.#definition.freehand;
    if (policy === undefined) throw new InvalidArgumentError(`Shape does not support freehand drawing: ${this.#definition.type}`);
    for (const input of inputs) {
      const coordinate = this.#placeCoordinate(input);
      this.#appendFreehandSample(policy, coordinate);
    }
    this.#renderFreehand('preview');
  }

  /** 使用 trusted built-in 快路或保持 custom policy 的逐点快照语义。 */
  #appendFreehandSample(policy: NonNullable<ShapeDefinition['freehand']>, coordinate: Coordinate): void {
    if (this.#freehandAccumulator !== undefined) {
      this.#freehandAccumulator.append(this.#controlPoints, coordinate);
      return;
    }
    this.#controlPoints = cloneCoordinates(policy.appendSample(this.#controlPoints, coordinate));
  }

  /** 完成自由绘制草稿。 */
  #completeFreehand(input: Coordinate): void {
    if (!this.#freehandActive) return;
    this.#sampleFreehand(input);
    if (this.#status !== 'active') return;
    this.#freehandActive = false;
    const policy = this.#definition.freehand;
    if (policy === undefined) throw new InvalidArgumentError(`Shape does not support freehand drawing: ${this.#definition.type}`);
    const draft = policy.normalizeSamples(this.#canonicalControlPoints(), 'complete');
    if (draft === undefined) {
      this.#setPreview(undefined);
      this.#emit('cancel', freeze({ type: 'cancel', reason: 'incomplete' }));
      this.#resetDraft();
      return;
    }
    this.#recordHistory();
    void this.#completeDraft(draft, true);
  }

  /** 取消当前自由绘制轨迹。 */
  #cancelFreehand(): void {
    if (!this.#freehandActive) return;
    this.#freehandActive = false;
    this.#emit('cancel', freeze({ type: 'cancel', reason: 'native' }));
    if (this.#status === 'active') this.#resetDraft();
  }

  /** 根据自由绘制轨迹更新预览。 */
  #renderFreehand(phase: 'preview' | 'complete'): void {
    const policy = this.#definition.freehand;
    if (policy === undefined) return;
    const draft = policy.normalizeSamples(this.#controlPoints, phase);
    if (draft === undefined) this.#setPreview(undefined);
    else this.#showPreview(draft, this.#controlPoints.at(-1));
  }

  /** 从当前控制点生成并提交草稿。 */
  #completeCurrent(continueSession: boolean): CompletionOutcome {
    if (this.#controlPoints.length === 0) return 'incomplete';
    const controlPoints = this.#canonicalControlPoints();
    let draft: ShapeState | undefined;
    try {
      draft = this.#definition.createDraft(controlPoints);
    } catch (error) {
      if (error instanceof InvalidArgumentError) return 'incomplete';
      return this.#failCompletion(error, 'create-draft');
    }
    return draft === undefined ? 'incomplete' : this.#completeDraft(draft, continueSession);
  }

  /** 将有效图形草稿提交到元素仓库。 */
  #completeDraft(draft: ShapeState, continueSession: boolean): CompletionOutcome {
    if (this.#completionActive) return 'failed';
    this.#completionActive = true;
    try {
      let completed: ShapeState;
      try {
        const completion = this.#definition.tryComplete(draft as never);
        if (completion.status === 'incomplete') return 'incomplete';
        completed = completion.state;
      } catch (error) {
        return this.#failCompletion(error, 'complete-shape');
      }

      let state: Readonly<ElementState<T>>;
      let generation: ElementGeneration;
      try {
        const style = this.#styleFor(completed);
        const elementGeometry = this.#shapeProjection.toElementState(completed);
        const id = requireId(this.#createId());
        const committed = this.#store.transaction((transaction) =>
          transaction.add<T>({
            id,
            type: elementGeometry.type,
            geometry: elementGeometry,
            style,
            ...(this.#options.data === undefined ? {} : { data: this.#options.data }),
            ...(this.#options.module === undefined ? {} : { module: this.#options.module }),
            layerId: this.#options.layerId,
            visible: true
          })
        );
        const committedGeneration = committed.generation(id);
        if (committedGeneration === undefined || !this.#store.isGenerationCurrent(id, committedGeneration)) {
          throw new ObjectDisposedError(`Committed draw Element was replaced during Store notification: ${id}`);
        }
        const current = this.#store.get<T>(id);
        if (current === undefined) throw new ObjectDisposedError(`Committed draw Element is unavailable: ${id}`);
        state = current;
        generation = committedGeneration;
        this.#onCommitted(state);
      } catch (error) {
        return this.#failCompletion(error, 'commit');
      }

      this.#completionCount += 1;
      if (this.#options.keepGraphics) this.#results.push(Object.freeze({ id: state.id, generation }));
      this.#emit('complete', freeze({ type: 'complete', state }));
      if (!this.#options.keepGraphics) {
        try {
          this.#store.removeIfGeneration(state.id, generation);
        } catch (error) {
          this.#report(error, 'remove-transient-result');
        }
      }
      if (this.#status !== 'active') return 'committed';
      const finishRequested = this.#finishRequested;
      this.#finishRequested = false;
      if (finishRequested || (continueSession && this.#options.limit > 0 && this.#completionCount >= this.#options.limit)) {
        this.#terminate('finished');
      } else if (continueSession) {
        this.#resetDraft();
      }
      return 'committed';
    } finally {
      this.#completionActive = false;
      this.#finishRequested = false;
    }
  }

  /** 处理草稿提交失败并上报错误。 */
  #failCompletion(error: unknown, operation: string): CompletionOutcome {
    this.#report(error, operation);
    if (this.#status === 'active') this.#terminate('cancelled', 'error');
    return 'failed';
  }

  /** 根据当前控制点渲染普通绘制预览。 */
  #renderPreview(coordinate: Coordinate | undefined): void {
    const points = this.#pointer === undefined ? this.#controlPoints : [...this.#controlPoints, this.#pointer];
    let draft: ShapeState | undefined;
    try {
      draft = this.#definition.createDraft(points);
    } catch (error) {
      if (error instanceof InvalidArgumentError) {
        this.#setPreview(undefined);
        return;
      }
      throw error;
    }
    if (draft === undefined) {
      this.#setPreview(undefined);
      return;
    }
    this.#showPreview(draft, coordinate);
  }

  /** 将草稿、样式和光标位置发送到底层端口。 */
  #showPreview(draft: ShapeState, coordinate: Coordinate | undefined): void {
    const geometry = this.#definition.clone(draft as never) as ShapeState;
    const renderGeometry = this.#definition.toRenderGeometry(geometry as never);
    this.#setPreview(Object.freeze({ geometry: deepFreeze(cloneCoreState(renderGeometry)), style: this.#styleFor(geometry) }));
    if ((this.#listeners.get('change')?.size ?? 0) > 0) {
      this.#emit(
        'change',
        freeze({ type: 'change', geometry: this.#shapeProjection.toElementState(geometry), ...(coordinate === undefined ? {} : { coordinate }) })
      );
    }
  }

  /** 安全更新底层绘制预览。 */
  #setPreview(preview: Readonly<DrawInteractionRenderState> | undefined): void {
    const handle = this.#handle;
    if (handle === undefined) throw new ObjectDisposedError('Draw interaction is not open');
    handle.render(preview);
  }

  /** 解析并缓存本会话使用的绘制样式。 */
  #styleFor(state: ShapeState): ElementStyleState {
    if (!this.#resolvedStyleSet) {
      this.#resolvedStyle = this.#styles.clone(this.#options.style ?? this.#defaultStyle(state));
      this.#resolvedStyleSet = true;
    }
    return this.#resolvedStyle as ElementStyleState;
  }

  /** 将控制点归一到连续的世界副本。 */
  #canonicalControlPoints(): readonly Coordinate[] {
    const world = this.#handle?.world;
    return world === undefined ? cloneCoordinates(this.#controlPoints) : canonicalizeWorldEdit(this.#controlPoints, { kind: 'wrapped', world });
  }

  /** 将坐标放入当前编辑世界。 */
  #placeCoordinate(coordinate: Coordinate): Coordinate {
    const reference = this.#controlPoints.at(-1);
    return reference === undefined ? cloneCoordinate(coordinate) : this.#placeCoordinateFrom(coordinate, reference);
  }

  /** 以指定参考点放置世界环绕坐标。 */
  #placeCoordinateFrom(coordinate: Coordinate, reference: Coordinate): Coordinate {
    const world = this.#handle?.world;
    const handoff: WorldEditHandoff = world === undefined ? { kind: 'identity' } : { kind: 'wrapped', world };
    return placeCoordinateInEditWorld(coordinate, reference[0], handoff);
  }

  /** 记录当前控制点历史。 */
  #recordHistory(): void {
    this.#redoControlPoints = [];
    this.#refreshTooltip();
  }

  /** 清空当前草稿并重置预览。 */
  #resetDraft(): void {
    this.#controlPoints = [];
    this.#redoControlPoints = [];
    this.#pointer = undefined;
    this.#freehandActive = false;
    this.#freehandAccumulator = undefined;
    this.#setPreview(undefined);
    this.#refreshTooltip();
  }

  /** 创建或移动绘制提示框。 */
  #updateTooltipPosition(input: Coordinate): void {
    const position = cloneCoordinate(input);
    if (this.#tooltip === undefined) {
      if (this.#tooltipPort === undefined) return;
      this.#tooltip = this.#tooltipPort.open({
        ownerId: `draw:${this.#options.layerId}`,
        variant: 'draw',
        position,
        lines: this.#tooltipLines(),
        offset: [15, -11],
        visible: true
      });
      return;
    }
    this.#tooltip.update({ position });
  }

  /** 根据绘制方式和历史状态生成提示文字。 */
  #tooltipLines(): readonly string[] {
    const lines = ['左击开始绘制，右击退出绘制'];
    if (this.#definition.freehand !== undefined) lines.push('按住 Shift 拖动可自由绘制');
    if (this.#controlPoints.length > 0) lines.push(`Ctrl+Z 撤销 (${this.#controlPoints.length})`);
    if (this.#redoControlPoints.length > 0) lines.push(`Ctrl+Y 重做 (${this.#redoControlPoints.length})`);
    return Object.freeze(lines);
  }

  /** 刷新当前绘制提示文字。 */
  #refreshTooltip(): void {
    this.#tooltip?.update({ lines: this.#tooltipLines() });
  }

  /** 将会话置为终态并发出取消事件。 */
  #terminate(status: Extract<InteractionStatus, 'finished' | 'cancelled'>, reason?: DrawCancelReason): void {
    if (this.#status !== 'active') return;
    this.#status = status;
    this.#cleanup();
    if (reason !== undefined) this.#emit('cancel', freeze({ type: 'cancel', reason }));
    const results = this.results;
    this.#resolveFinished(results);
    this.#listeners.clear();
  }

  /** 释放底层交互、输入订阅和协调器。 */
  #cleanup(): void {
    if (this.#cleanupRunning) return;
    this.#cleanupRunning = true;
    try {
      const handle = this.#handle;
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
                  if (this.#handle === handle) this.#handle = undefined;
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
                  if (this.#tooltip === tooltip) this.#tooltip = undefined;
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
  #emit<K extends keyof InternalDrawSessionEventMap<T>>(type: K, event: InternalDrawSessionEventMap<T>[K]): void {
    const listeners = [...(this.#listeners.get(type)?.values() ?? [])];
    for (const listener of listeners) {
      try {
        const result = (listener as (value: InternalDrawSessionEventMap<T>[K]) => unknown)(event);
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
        source: 'DrawSession',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误报告器自身失败时不能影响会话生命周期。
    }
  }

  /** 确保绘制会话仍处于活动状态。 */
  #assertActive(): void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Draw session has finished');
  }
}

/** 校验绘制结果 ID。 */
function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Generated draw element id must be a non-empty string');
  return value;
}

/** 深度复制一组地图坐标。 */
function cloneCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  return coordinates.map(cloneCoordinate);
}

/** 校验并复制单个地图坐标。 */
function cloneCoordinate(coordinate: Coordinate): Coordinate {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || !coordinate.every(Number.isFinite)) {
    throw new InvalidArgumentError('Draw coordinates must contain two or three finite numbers');
  }
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

/** 冻结事件或状态对象。 */
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
