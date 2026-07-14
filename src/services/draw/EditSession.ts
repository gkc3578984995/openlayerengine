import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import { canonicalizeWorldEdit, placeCoordinateInEditWorld } from '../../core/common/worldWrap.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { InputEventMap } from '../../core/ports/InputPort.js';
import type {
  EditControlAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState
} from '../../core/ports/EditInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ShapeDefinition, ShapeEditTopology, ShapeState } from '../../core/shape/types.js';
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
  readonly store: ElementStore;
  readonly definition: ShapeDefinition;
  readonly coordinator: InteractionCoordinator;
  readonly port: EditInteractionPort;
  readonly elementId: string;
  readonly expectedGeneration?: ElementGeneration;
  readonly options: Readonly<InternalEditOptions>;
  readonly input?: SessionKeyboardInput;
  readonly errorReporter?: ErrorReporter;
  readonly onTerminal: () => void;
}

/**
 * 独立于 OpenLayers 的语义动态编辑状态机。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export class EditSession<T = unknown> implements InternalEditSession<T>, ExclusiveInteractionSession {
  readonly #store: ElementStore;
  readonly #definition: ShapeDefinition;
  readonly #coordinator: InteractionCoordinator;
  readonly #port: EditInteractionPort;
  readonly #expectedGeneration: ElementGeneration;
  readonly #options: Readonly<InternalEditOptions>;
  readonly #input: SessionKeyboardInput | undefined;
  readonly #errorReporter: ErrorReporter;
  readonly #onTerminal: () => void;
  readonly #listeners = new Map<keyof InternalEditSessionEventMap<T>, Map<number, (event: never) => void>>();
  #resolveFinished!: (state: Readonly<ElementState<T>> | undefined) => void;
  readonly finished: Promise<Readonly<ElementState<T>> | undefined>;
  #nextListenerId = 0;
  #status: InteractionStatus = 'active';
  #handle: EditInteractionHandle | undefined;
  #unsubscribeStore: (() => void) | undefined;
  #unsubscribeInput: (() => void) | undefined;
  #entryState: Readonly<ElementState<T>> | undefined;
  #entryRevision: ElementRevision | undefined;
  #workingState: ShapeState | undefined;
  #dragOrigin: ShapeState | undefined;
  #dragIndex: number | undefined;
  #history: ShapeState[] = [];
  #historyIndex = 0;
  #committing = false;
  #ownCommitNotificationPending = false;
  #opening = false;
  #cleanupRunning = false;
  #coordinatorReleased = false;
  #terminalNotified = false;

  /**
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
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#onTerminal = dependencies.onTerminal;
    this.finished = new Promise((resolve) => {
      this.#resolveFinished = resolve;
    });
  }

  readonly elementId: string;

  get status(): InteractionStatus {
    return this.#status;
  }

  open(): void {
    this.#assertActive();
    if (this.#handle !== undefined || this.#opening) throw new InvalidArgumentError('Edit session is already open');
    if (!this.#store.isGenerationCurrent(this.elementId, this.#expectedGeneration)) {
      throw new InvalidArgumentError(`Edit target generation changed before open: ${this.elementId}`);
    }
    const entryRevision = this.#store.revisionOf(this.elementId);
    if (entryRevision === undefined) throw new InvalidArgumentError(`Element does not exist: ${this.elementId}`);
    const entry = this.#store.get<T>(this.elementId);
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
      if (this.#status !== 'active') throw new ObjectDisposedError('Edit session was cancelled while opening');
      this.#workingState = this.#stateFromControlPoints(handle.placement.controlPoints);
      this.#history = [this.#cloneShape(this.#workingState)];
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

  abortOpen(): void {
    const wasActive = this.#status === 'active';
    if (wasActive) this.#status = 'cancelled';
    this.#cleanup();
    if (wasActive) {
      this.#resolveFinished(undefined);
      this.#listeners.clear();
    }
  }

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

  cancel(reason: InteractionCancelReason = 'cancelled'): void {
    if (this.#status !== 'active' || this.#committing) return;
    this.#terminate('cancelled', reason);
  }

  destroy(): void {
    if (this.#committing) return;
    if (this.#status === 'active') this.cancel('destroyed');
    else this.#cleanup();
  }

  undo(): boolean {
    if (this.#status !== 'active' || this.#historyIndex === 0) return false;
    const nextIndex = this.#historyIndex - 1;
    const nextState = this.#cloneShape(this.#history[nextIndex]);
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
    this.#emit('modifying', freeze({ type: 'modifying', state: this.#workingState, operation: 'undo' }));
    return true;
  }

  redo(): boolean {
    if (this.#status !== 'active' || this.#historyIndex >= this.#history.length - 1) return false;
    const nextIndex = this.#historyIndex + 1;
    const nextState = this.#cloneShape(this.#history[nextIndex]);
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
    this.#emit('modifying', freeze({ type: 'modifying', state: this.#workingState, operation: 'redo' }));
    return true;
  }

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

  handleContextMenu(): ContextMenuDecision {
    if (this.#status === 'active') this.finish();
    return 'consume';
  }

  #handlePortEvent(event: Readonly<EditInteractionEvent>): void {
    if (this.#status !== 'active') return;
    try {
      if (event.type === 'move-start') this.#startMove(event.anchor);
      else if (event.type === 'move') this.#move(event.anchor, event.coordinate, false);
      else if (event.type === 'move-end') this.#move(event.anchor, event.coordinate, true);
      else if (event.type === 'move-cancel') this.#cancelMove();
      else if (event.type === 'insert') this.#insert(event.anchor.index, event.anchor.coordinate);
      else this.#remove(event.anchor);
    } catch (error) {
      this.#report(error, 'port-event');
      if (this.#status === 'active') this.#terminate('cancelled', 'error');
    }
  }

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

  #startMove(anchor: EditControlAnchor): void {
    const working = this.#requireWorkingState();
    this.#dragOrigin = this.#definition.clone(working as never) as ShapeState;
    this.#dragIndex = anchor.index;
  }

  #move(anchor: EditControlAnchor, input: Coordinate, end: boolean): void {
    if (this.#dragOrigin === undefined || this.#dragIndex !== anchor.index) throw new InvalidArgumentError('Edit move sequence is not active');
    const state = this.#requireWorkingState();
    const coordinate = this.#placeCoordinate(input, anchor.index);
    this.#workingState = this.#topology().move(state as never, anchor.index, coordinate) as ShapeState;
    this.#render();
    if (end) {
      this.#recordHistory();
      this.#clearDrag();
    }
    this.#emit('modifying', freeze({ type: 'modifying', state: this.#workingState, operation: 'move', coordinate }));
  }

  #cancelMove(): void {
    if (this.#dragOrigin === undefined) return;
    this.#workingState = this.#dragOrigin;
    this.#dragOrigin = undefined;
    this.#dragIndex = undefined;
    this.#render();
  }

  #insert(index: number, input: Coordinate): void {
    const topology = this.#topology();
    if (topology.insert === undefined) throw new InvalidArgumentError(`Shape does not support control-point insertion: ${this.#definition.type}`);
    const coordinate = this.#placeCoordinate(input, Math.max(0, index - 1));
    this.#workingState = topology.insert(this.#requireWorkingState() as never, index, coordinate) as ShapeState;
    this.#recordHistory();
    this.#render();
    this.#emit('modifying', freeze({ type: 'modifying', state: this.#workingState, operation: 'insert', coordinate }));
  }

  #remove(anchor: EditControlAnchor): void {
    const topology = this.#topology();
    if (!anchor.removable || topology.remove === undefined) throw new InvalidArgumentError(`Shape does not support removing control point ${anchor.index}`);
    this.#workingState = topology.remove(this.#requireWorkingState() as never, anchor.index) as ShapeState;
    this.#recordHistory();
    this.#render();
    this.#emit('modifying', freeze({ type: 'modifying', state: this.#workingState, operation: 'remove', coordinate: cloneCoordinate(anchor.coordinate) }));
  }

  #render(): void {
    const handle = this.#handle;
    const state = this.#requireWorkingState();
    const entry = this.#entryState;
    if (handle === undefined || entry === undefined) throw new ObjectDisposedError('Edit interaction is not open');
    const description = this.#topology().describe(state as never);
    const preview: EditInteractionRenderState = freeze({
      geometry: this.#definition.toRenderGeometry(state as never),
      style: entry.style,
      anchors: [
        ...description.handles.map((anchor) => ({ ...anchor, kind: 'control' as const })),
        ...description.insertions.map((anchor) => ({ ...anchor, kind: 'insertion' as const }))
      ]
    });
    handle.render(preview);
  }

  #placeCoordinate(coordinate: Coordinate, index: number): Coordinate {
    const state = this.#requireWorkingState();
    const reference = this.#topology()
      .describe(state as never)
      .handles.find((handle) => handle.index === index)?.coordinate;
    return placeCoordinateInEditWorld(coordinate, reference?.[0] ?? coordinate[0], this.#requireHandle().placement.handoff);
  }

  #stateFromControlPoints(controlPoints: readonly Coordinate[]): ShapeState {
    const draft = this.#definition.createDraft(controlPoints);
    if (draft === undefined) throw new InvalidArgumentError(`Edit placement is incomplete for shape: ${this.#definition.type}`);
    const completion = this.#definition.tryComplete(draft as never);
    if (completion.status === 'incomplete') throw new InvalidArgumentError(`Edit placement is incomplete for shape: ${this.#definition.type}`);
    return this.#definition.clone(completion.state as never) as ShapeState;
  }

  #controlPoints(state: ShapeState): readonly Coordinate[] {
    const handles = [...this.#topology().describe(state as never).handles].sort((left, right) => left.index - right.index);
    for (let index = 0; index < handles.length; index += 1) {
      if (handles[index].index !== index) throw new InvalidArgumentError(`Shape edit topology has a non-contiguous handle index: ${handles[index].index}`);
    }
    return handles.map(({ coordinate }) => cloneCoordinate(coordinate));
  }

  #recordHistory(): void {
    this.#history.splice(this.#historyIndex + 1);
    this.#history.push(this.#cloneShape(this.#requireWorkingState()));
    this.#historyIndex = this.#history.length - 1;
  }

  #cloneShape(state: ShapeState): ShapeState {
    return this.#definition.clone(state as never) as ShapeState;
  }

  #clearDrag(): void {
    this.#dragOrigin = undefined;
    this.#dragIndex = undefined;
  }

  #topology(): ShapeEditTopology {
    const topology = this.#definition.editTopology;
    if (topology === undefined) throw new InvalidArgumentError(`Shape does not support editing: ${this.#definition.type}`);
    return topology as ShapeEditTopology;
  }

  #requireWorkingState(): ShapeState {
    if (this.#workingState === undefined) throw new ObjectDisposedError('Edit interaction is not open');
    return this.#workingState;
  }

  #requireHandle(): EditInteractionHandle {
    if (this.#handle === undefined) throw new ObjectDisposedError('Edit interaction is not open');
    return this.#handle;
  }

  #terminate(status: Extract<InteractionStatus, 'finished' | 'cancelled'>, reason?: EditCancelReason): void {
    if (this.#status !== 'active') return;
    this.#status = status;
    this.#cleanup();
    if (reason !== undefined) this.#emit('cancel', freeze({ type: 'cancel', reason }));
    this.#resolveFinished(undefined);
    this.#listeners.clear();
  }

  #cleanup(): void {
    if (this.#cleanupRunning) return;
    this.#cleanupRunning = true;
    try {
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

  #assertActive(): void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Edit session has finished');
  }
}

function requireElementId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Edit element id must be a non-empty string');
  return value;
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || !coordinate.every(Number.isFinite)) {
    throw new InvalidArgumentError('Edit coordinates must contain two or three finite numbers');
  }
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

function freeze<T>(value: T): T {
  return deepFreeze(cloneCoreState(value));
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || visited.has(value)) return value;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, visited);
  }
  return Object.freeze(value);
}
