import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import { canonicalizeWorldEdit, placeCoordinateInEditWorld, type WorldEditHandoff } from '../../core/common/worldWrap.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { InputEventMap } from '../../core/ports/InputPort.js';
import type { DrawInteractionEvent, DrawInteractionHandle, DrawInteractionPort, DrawInteractionRenderState } from '../../core/ports/DrawInteractionPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
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
  readonly store: ElementStore;
  readonly definition: ShapeDefinition;
  readonly styles: StyleService;
  readonly coordinator: InteractionCoordinator;
  readonly port: DrawInteractionPort;
  readonly options: Readonly<Required<Pick<InternalDrawOptions<T>, 'type' | 'layerId' | 'limit' | 'keepGraphics'>> & InternalDrawOptions<T>>;
  readonly input?: SessionKeyboardInput;
  readonly defaultStyle: (state: ShapeState) => ElementStyleState;
  readonly createId: () => string;
  readonly errorReporter?: ErrorReporter;
  readonly onCommitted: (state: Readonly<ElementState<T>>) => void;
  readonly onTerminal: () => void;
}

type CompletionOutcome = 'committed' | 'incomplete' | 'failed';

/**
 * 独立于 OpenLayers 的语义绘制状态机。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export class DrawSession<T = unknown> implements InternalDrawSession<T>, ExclusiveInteractionSession {
  readonly #store: ElementStore;
  readonly #definition: ShapeDefinition;
  readonly #styles: StyleService;
  readonly #coordinator: InteractionCoordinator;
  readonly #port: DrawInteractionPort;
  readonly #options: DrawSessionDependencies<T>['options'];
  readonly #input: SessionKeyboardInput | undefined;
  readonly #defaultStyle: DrawSessionDependencies<T>['defaultStyle'];
  readonly #createId: () => string;
  readonly #errorReporter: ErrorReporter;
  readonly #onCommitted: DrawSessionDependencies<T>['onCommitted'];
  readonly #onTerminal: () => void;
  readonly #listeners = new Map<keyof InternalDrawSessionEventMap<T>, Map<number, (event: never) => void>>();
  readonly #results: Array<Readonly<{ id: string; generation: ElementGeneration }>> = [];
  #resolveFinished!: (states: readonly Readonly<ElementState<T>>[]) => void;
  readonly finished: Promise<readonly Readonly<ElementState<T>>[]>;
  #nextListenerId = 0;
  #status: InteractionStatus = 'active';
  #handle: DrawInteractionHandle | undefined;
  #unsubscribeInput: (() => void) | undefined;
  #controlPoints: Coordinate[] = [];
  #pointer: Coordinate | undefined;
  #history: Coordinate[][] = [[]];
  #historyIndex = 0;
  #completionCount = 0;
  #freehandActive = false;
  #completionActive = false;
  #finishActive = false;
  #finishRequested = false;
  #opening = false;
  #cleanupRunning = false;
  #coordinatorReleased = false;
  #terminalNotified = false;
  #resolvedStyle: ElementStyleState | undefined;
  #resolvedStyleSet = false;

  /**
   * @param dependencies 元素事务、图形定义、样式、交互端口、输入和生命周期回调。
   */
  constructor(dependencies: DrawSessionDependencies<T>) {
    this.#store = dependencies.store;
    this.#definition = dependencies.definition;
    this.#styles = dependencies.styles;
    this.#coordinator = dependencies.coordinator;
    this.#port = dependencies.port;
    this.#options = dependencies.options;
    this.#input = dependencies.input;
    this.#defaultStyle = dependencies.defaultStyle;
    this.#createId = dependencies.createId;
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#onCommitted = dependencies.onCommitted;
    this.#onTerminal = dependencies.onTerminal;
    this.finished = new Promise((resolve) => {
      this.#resolveFinished = resolve;
    });
  }

  get status(): InteractionStatus {
    return this.#status;
  }

  get results(): readonly Readonly<ElementState<T>>[] {
    return Object.freeze(
      this.#results.flatMap(({ id, generation }) => {
        if (!this.#store.isGenerationCurrent(id, generation)) return [];
        const state = this.#store.get<T>(id);
        return state === undefined ? [] : [state];
      })
    );
  }

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

  abortOpen(): void {
    const wasActive = this.#status === 'active';
    if (wasActive) this.#status = 'cancelled';
    this.#cleanup();
    if (wasActive) {
      this.#resolveFinished(this.results);
      this.#listeners.clear();
    }
  }

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

  cancel(reason: InteractionCancelReason = 'cancelled'): void {
    if (this.#status !== 'active') return;
    this.#terminate('cancelled', reason);
  }

  destroy(): void {
    if (this.#status === 'active') this.cancel('destroyed');
    else this.#cleanup();
  }

  undo(): boolean {
    if (this.#status !== 'active' || this.#completionActive || this.#historyIndex === 0) return false;
    const nextIndex = this.#historyIndex - 1;
    const nextControlPoints = cloneCoordinates(this.#history[nextIndex]);
    const previousIndex = this.#historyIndex;
    const previousControlPoints = this.#controlPoints;
    const previousPointer = this.#pointer;
    this.#historyIndex = nextIndex;
    this.#controlPoints = nextControlPoints;
    this.#pointer = undefined;
    try {
      this.#renderPreview(undefined);
    } catch (error) {
      this.#historyIndex = previousIndex;
      this.#controlPoints = previousControlPoints;
      this.#pointer = previousPointer;
      throw error;
    }
    return true;
  }

  redo(): boolean {
    if (this.#status !== 'active' || this.#completionActive || this.#historyIndex >= this.#history.length - 1) return false;
    const nextIndex = this.#historyIndex + 1;
    const nextControlPoints = cloneCoordinates(this.#history[nextIndex]);
    const previousIndex = this.#historyIndex;
    const previousControlPoints = this.#controlPoints;
    const previousPointer = this.#pointer;
    this.#historyIndex = nextIndex;
    this.#controlPoints = nextControlPoints;
    this.#pointer = undefined;
    try {
      this.#renderPreview(undefined);
    } catch (error) {
      this.#historyIndex = previousIndex;
      this.#controlPoints = previousControlPoints;
      this.#pointer = previousPointer;
      throw error;
    }
    return true;
  }

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

  handleContextMenu(): ContextMenuDecision {
    if (this.#status === 'active') this.finish();
    return 'consume';
  }

  #handlePortEvent(event: Readonly<DrawInteractionEvent>): void {
    if (this.#status !== 'active' || this.#completionActive) return;
    try {
      if (event.type === 'move') this.#movePointer(event.coordinate);
      else if (event.type === 'click') this.#addControlPoint(event.coordinate);
      else if (event.type === 'freehand-start') this.#startFreehand(event.coordinate);
      else if (event.type === 'freehand-sample') this.#sampleFreehand(event.coordinate);
      else if (event.type === 'freehand-complete') this.#completeFreehand(event.coordinate);
      else this.#cancelFreehand();
    } catch (error) {
      this.#report(error, 'port-event');
      if (this.#status === 'active') this.#terminate('cancelled', 'error');
    }
  }

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

  #movePointer(input: Coordinate): void {
    if (this.#controlPoints.length === 0) return;
    this.#pointer = this.#placeCoordinate(input);
    this.#renderPreview(this.#pointer);
  }

  #startFreehand(input: Coordinate): void {
    const policy = this.#definition.freehand;
    if (policy === undefined) throw new InvalidArgumentError(`Shape does not support freehand drawing: ${this.#definition.type}`);
    this.#resetDraft();
    this.#freehandActive = true;
    this.#controlPoints = cloneCoordinates(policy.appendSample([], cloneCoordinate(input)));
    this.#emit('start', freeze({ type: 'start', coordinate: cloneCoordinate(this.#controlPoints[0]) }));
    if (this.#status !== 'active') return;
    this.#renderFreehand('preview');
  }

  #sampleFreehand(input: Coordinate): void {
    if (!this.#freehandActive) return;
    const policy = this.#definition.freehand;
    if (policy === undefined) throw new InvalidArgumentError(`Shape does not support freehand drawing: ${this.#definition.type}`);
    const coordinate = this.#placeCoordinate(input);
    this.#controlPoints = cloneCoordinates(policy.appendSample(this.#controlPoints, coordinate));
    this.#renderFreehand('preview');
  }

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

  #cancelFreehand(): void {
    if (!this.#freehandActive) return;
    this.#freehandActive = false;
    this.#emit('cancel', freeze({ type: 'cancel', reason: 'native' }));
    if (this.#status === 'active') this.#resetDraft();
  }

  #renderFreehand(phase: 'preview' | 'complete'): void {
    const policy = this.#definition.freehand;
    if (policy === undefined) return;
    const draft = policy.normalizeSamples(this.#controlPoints, phase);
    if (draft === undefined) this.#setPreview(undefined);
    else this.#showPreview(draft, this.#controlPoints.at(-1));
  }

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
        const id = requireId(this.#createId());
        const committed = this.#store.transaction((transaction) =>
          transaction.add<T>({
            id,
            type: completed.type,
            geometry: completed,
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

  #failCompletion(error: unknown, operation: string): CompletionOutcome {
    this.#report(error, operation);
    if (this.#status === 'active') this.#terminate('cancelled', 'error');
    return 'failed';
  }

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

  #showPreview(draft: ShapeState, coordinate: Coordinate | undefined): void {
    const geometry = this.#definition.clone(draft as never) as ShapeState;
    const renderGeometry = this.#definition.toRenderGeometry(geometry as never);
    this.#setPreview(freeze({ geometry: renderGeometry, style: this.#styleFor(geometry) }));
    this.#emit('change', freeze({ type: 'change', geometry: freeze(cloneCoreState(geometry)), ...(coordinate === undefined ? {} : { coordinate }) }));
  }

  #setPreview(preview: Readonly<DrawInteractionRenderState> | undefined): void {
    const handle = this.#handle;
    if (handle === undefined) throw new ObjectDisposedError('Draw interaction is not open');
    handle.render(preview);
  }

  #styleFor(state: ShapeState): ElementStyleState {
    if (!this.#resolvedStyleSet) {
      this.#resolvedStyle = this.#styles.clone(this.#options.style ?? this.#defaultStyle(state));
      this.#resolvedStyleSet = true;
    }
    return this.#resolvedStyle as ElementStyleState;
  }

  #canonicalControlPoints(): readonly Coordinate[] {
    const world = this.#handle?.world;
    return world === undefined ? cloneCoordinates(this.#controlPoints) : canonicalizeWorldEdit(this.#controlPoints, { kind: 'wrapped', world });
  }

  #placeCoordinate(coordinate: Coordinate): Coordinate {
    const reference = this.#controlPoints.at(-1);
    return reference === undefined ? cloneCoordinate(coordinate) : this.#placeCoordinateFrom(coordinate, reference);
  }

  #placeCoordinateFrom(coordinate: Coordinate, reference: Coordinate): Coordinate {
    const world = this.#handle?.world;
    const handoff: WorldEditHandoff = world === undefined ? { kind: 'identity' } : { kind: 'wrapped', world };
    return placeCoordinateInEditWorld(coordinate, reference[0], handoff);
  }

  #recordHistory(): void {
    this.#history.splice(this.#historyIndex + 1);
    this.#history.push(cloneCoordinates(this.#controlPoints));
    this.#historyIndex = this.#history.length - 1;
  }

  #resetDraft(): void {
    this.#controlPoints = [];
    this.#pointer = undefined;
    this.#history = [[]];
    this.#historyIndex = 0;
    this.#freehandActive = false;
    this.#setPreview(undefined);
  }

  #terminate(status: Extract<InteractionStatus, 'finished' | 'cancelled'>, reason?: DrawCancelReason): void {
    if (this.#status !== 'active') return;
    this.#status = status;
    this.#cleanup();
    if (reason !== undefined) this.#emit('cancel', freeze({ type: 'cancel', reason }));
    const results = this.results;
    this.#resolveFinished(results);
    this.#listeners.clear();
  }

  #cleanup(): void {
    if (this.#cleanupRunning) return;
    this.#cleanupRunning = true;
    try {
      const handle = this.#handle;
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
      if (!this.#opening && this.#handle === undefined && this.#unsubscribeInput === undefined && this.#coordinatorReleased && !this.#terminalNotified) {
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

  #assertActive(): void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Draw session has finished');
  }
}

function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Generated draw element id must be a non-empty string');
  return value;
}

function cloneCoordinates(coordinates: readonly Coordinate[]): Coordinate[] {
  return coordinates.map(cloneCoordinate);
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  if ((coordinate.length !== 2 && coordinate.length !== 3) || !coordinate.every(Number.isFinite)) {
    throw new InvalidArgumentError('Draw coordinates must contain two or three finite numbers');
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
