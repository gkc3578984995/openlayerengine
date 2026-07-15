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

export interface TransformSessionDependencies {
  readonly id: string;
  readonly store: ElementStore;
  readonly shapes: ShapeRegistry;
  readonly styles: StyleService;
  readonly coordinator: InteractionCoordinator;
  readonly interaction: TransformInteractionPort;
  readonly animations: TransformAnimationPort;
  readonly transients: TransientAnimationPort;
  readonly toolbarPort?: TransformToolbarPort;
  readonly tooltipPort?: TransformTooltipPort;
  readonly input?: TransformKeyboardInput;
  readonly options: NormalizedTransformOptions;
  readonly createId: () => string;
  readonly readClipboard: () => Readonly<ElementState> | undefined;
  readonly writeClipboard: (snapshot: Readonly<ElementState> | undefined) => void;
  readonly errorReporter?: ErrorReporter;
  readonly onTerminal: () => void;
}

type Listener = (event: never) => void;

export class TransformSession<T = unknown> implements InternalTransformSession<T> {
  readonly id: string;
  readonly #store: ElementStore;
  readonly #shapes: ShapeRegistry;
  readonly #styles: StyleService;
  readonly #coordinator: InteractionCoordinator;
  readonly #interaction: TransformInteractionPort;
  readonly #animations: TransformAnimationPort;
  readonly #transients: TransientAnimationPort;
  readonly #toolbarPort: TransformToolbarPort | undefined;
  readonly #tooltipPort: TransformTooltipPort | undefined;
  readonly #input: TransformKeyboardInput | undefined;
  readonly #options: NormalizedTransformOptions;
  readonly #createId: () => string;
  readonly #readClipboard: () => Readonly<ElementState> | undefined;
  readonly #writeClipboard: (snapshot: Readonly<ElementState> | undefined) => void;
  readonly #errorReporter: ErrorReporter;
  readonly #onTerminal: () => void;
  readonly #history: TransformHistory<T>;
  readonly #matches: (state: Readonly<ElementState>) => boolean;
  readonly #listeners = new Map<keyof InternalTransformEventMap<T>, Map<number, Listener>>();
  readonly #toolbarCleanup = new Set<TransformToolbarViewHandle>();
  #status: InteractionStatus = 'active';
  #handle: TransformInteractionHandle | undefined;
  #toolbar: TransformToolbarViewHandle | undefined;
  #tooltip: TransformTooltipViewHandle | undefined;
  #selected: ElementSnapshot<T> | undefined;
  #working: ElementSnapshot<T> | undefined;
  #operationOrigin: ElementSnapshot<T> | undefined;
  #expectedGeneration: ElementGeneration | undefined;
  #expectedRevision: ElementRevision | undefined;
  #transient: TransientAnimationHandle | undefined;
  #mode: TransformMode = 'transform';
  #lastPointerCoordinate: Coordinate | undefined;
  #animationsPaused = false;
  #copyPreview = false;
  #unsubscribeStore: (() => void) | undefined;
  #unsubscribeInput: (() => void) | undefined;
  #nextListenerId = 0;
  #opening = false;
  #ownCommit = false;
  #ownRemove = false;
  #cleanupRunning = false;
  #toolbarCleanupRunning = false;
  #coordinatorReleased = false;
  #terminalNotified = false;
  #finishing = false;

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

  get selectedId(): string | undefined {
    return this.#selected?.id;
  }

  get status(): InteractionStatus {
    return this.#status;
  }

  get mode(): TransformMode {
    return this.#mode;
  }

  get toolbar(): TransformToolbarViewHandle | undefined {
    return this.#toolbar;
  }

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

  abortOpen(): void {
    if (this.#status === 'active') this.#status = 'cancelled';
    this.#cleanupSession();
    this.#listeners.clear();
  }

  select(elementId: string): void {
    this.#assertMutable();
    const state = this.#requireSelectable(elementId);
    this.#activateSnapshot(state, true, true);
  }

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

  cancel(reason: InteractionCancelReason = 'cancelled'): void {
    if (this.#status !== 'active' || this.#finishing) return;
    void reason;
    this.#status = 'cancelled';
    this.#cleanupSession();
    this.#listeners.clear();
  }

  destroy(): void {
    if (this.#status === 'active') this.cancel('destroyed');
    else this.#cleanupSession();
  }

  undo(): boolean {
    this.#assertMutable();
    const snapshot = this.#history.undo();
    if (snapshot === undefined) return false;
    this.#applyHistory(snapshot);
    this.#syncToolbarState();
    return true;
  }

  redo(): boolean {
    this.#assertMutable();
    const snapshot = this.#history.redo();
    if (snapshot === undefined) return false;
    this.#applyHistory(snapshot);
    this.#syncToolbarState();
    return true;
  }

  copy(options?: ElementCopyOptions<T>): Readonly<ElementState<T>> {
    this.#assertMutable();
    const state = this.#requireWorking();
    const copied = this.#commitCopy(state, options);
    this.#writeClipboard(cloneElementSnapshot(this.#shapes, state));
    this.#emit('copyPreviewConfirm', freeze({ type: 'copyPreviewConfirm', state: copied }));
    return copied;
  }

  replaceSelected(elementId: string, options: InternalTransformReplaceOptions = {}): void {
    this.#assertMutable();
    const retainHistory = options.retainHistory ?? false;
    if (typeof retainHistory !== 'boolean') throw new InvalidArgumentError('Transform retainHistory must be a boolean');
    const state = this.#requireSelectable(elementId);
    this.#activateSnapshot(state, !retainHistory, true);
    if (retainHistory) this.#history.record(state, metadata('replace'));
    this.#syncToolbarState();
  }

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

  #confirmCopyPreview(delta: Readonly<{ x: number; y: number }>): void {
    const clipboard = this.#readClipboard();
    if (!this.#copyPreview || clipboard === undefined) return;
    this.#copyPreview = false;
    const translated = transformSnapshot(this.#shapes, this.#styles, clipboard, { type: 'translate', x: delta.x, y: delta.y });
    const copied = this.#commitCopy(translated as ElementSnapshot<T>);
    this.#emit('copyPreviewConfirm', freeze({ type: 'copyPreviewConfirm', state: copied }));
    this.#activateSnapshot(copied, true, true);
  }

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

  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#status !== 'active' || this.#selected === undefined) return;
    const change = changes.changes.find(({ id }) => id === this.#selected?.id);
    if (change === undefined || this.#ownCommit || this.#ownRemove) return;
    this.#emitError(new InvalidArgumentError(`Transform target changed externally: ${change.id}`));
    this.cancel('cancelled');
  }

  #assertTargetCurrent(): void {
    const selected = this.#selected;
    if (selected === undefined || this.#expectedGeneration === undefined || this.#expectedRevision === undefined) {
      throw new ObjectDisposedError('Transform has no selected Element');
    }
    if (!this.#store.isGenerationCurrent(selected.id, this.#expectedGeneration) || !this.#store.isRevisionCurrent(selected.id, this.#expectedRevision)) {
      throw new InvalidArgumentError(`Transform target changed externally: ${selected.id}`);
    }
  }

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

  #syncToolbarState(): void {
    this.#toolbar?.updateItem('undo', { disabled: !this.#history.canUndo });
    this.#toolbar?.updateItem('redo', { disabled: !this.#history.canRedo });
    this.#setTooltipLines(this.#baseTooltipLines());
  }

  #updateToolbarPosition(): void {
    const working = this.#working;
    if (working === undefined) return;
    this.#toolbar?.updateOptions({ position: toolbarPosition(this.#shapes.get(working.type), working.geometry, this.#options.handleCenter) });
  }

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

  #setTooltipLines(lines: readonly string[]): void {
    this.#tooltip?.update({ lines });
  }

  #baseTooltipLines(): readonly string[] {
    if (this.#mode === 'edit') return Object.freeze(['拖拽控制点编辑图形', '右键完成 | Esc 退出']);
    const history: string[] = [];
    if (this.#history.undoCount > 0) history.push(`Ctrl+Z 撤销 (${this.#history.undoCount})`);
    if (this.#history.redoCount > 0) history.push(`Ctrl+Y 重做 (${this.#history.redoCount})`);
    return Object.freeze(['选择控制点进行变换操作', 'Ctrl+C 复制 | Ctrl+V 粘贴 | Ctrl+X 剪切 | Delete 删除 | Esc 退出', ...history]);
  }

  #handleTooltipLines(operation: TransformOperation | undefined, axis: 'x' | 'y' | 'xy' | undefined): readonly string[] {
    if (operation === 'translate') return Object.freeze(['鼠标左键按下平移']);
    if (operation === 'rotate') return Object.freeze(['鼠标左键按下旋转']);
    if (operation === 'stretch') return Object.freeze([axis === 'x' ? '鼠标左键按下水平拉伸' : axis === 'y' ? '鼠标左键按下垂直拉伸' : '鼠标左键按下拉伸']);
    if (operation === 'scale') return Object.freeze(['鼠标左键按下缩放，Shift 键保持比例缩放']);
    if (operation === 'vertex') return Object.freeze(['拖拽控制点编辑图形']);
    return this.#baseTooltipLines();
  }

  #operationTooltipLines(operation: TransformOperation, delta: TransformDelta): readonly string[] {
    if (operation === 'translate') return Object.freeze(['平移中…']);
    if (operation === 'rotate' && delta.type === 'rotate') return Object.freeze([`旋转中…当前：${Math.round((-delta.angle * 180) / Math.PI)}°`]);
    if (operation === 'scale' || operation === 'stretch') return Object.freeze([operation === 'stretch' ? '拉伸中…' : '缩放中…']);
    return Object.freeze(['编辑中…']);
  }

  #updatePointerFromEvent(event: { readonly coordinate?: Coordinate }): void {
    if (event.coordinate === undefined) return;
    this.#lastPointerCoordinate = cloneCoordinate(event.coordinate);
    this.#tooltip?.update({ position: this.#lastPointerCoordinate });
  }

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

  #pauseAnimationsFor(operation: TransformOperation): void {
    if (this.#animationsPaused || (operation !== 'translate' && operation !== 'scale' && operation !== 'stretch')) return;
    const working = this.#requireWorking();
    if (this.#shapes.get(working.type).toRenderGeometry(working.geometry as never).type !== 'point') return;
    this.#animationsPaused = this.#animations.pause({ id: working.id }) > 0;
  }

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

  #stopOperationVisual(): void {
    this.#stopTransient();
  }

  #resumePausedAnimations(): void {
    if (!this.#animationsPaused) return;
    const id = this.#selected?.id;
    if (id !== undefined) this.#animations.resume({ id });
    this.#animationsPaused = false;
  }

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

  #requireHandle(): TransformInteractionHandle {
    if (this.#handle === undefined) throw new ObjectDisposedError('Transform interaction is not open');
    return this.#handle;
  }

  #requireWorking(): ElementSnapshot<T> {
    if (this.#working === undefined) throw new ObjectDisposedError('Transform has no selected Element');
    return this.#working;
  }

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

  #emitError(error: unknown): void {
    this.#report(error, 'session');
    this.#emit('error', Object.freeze({ type: 'error', error }));
  }

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

  #assertActive(): void {
    if (this.#status !== 'active') throw new ObjectDisposedError('Transform session has finished');
  }

  #assertMutable(): void {
    this.#assertActive();
    if (this.#finishing) throw new InvalidArgumentError('Transform session is finishing');
  }
}

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

const defaultToolbarItems: readonly InternalTransformToolbarItemSpec[] = Object.freeze([
  Object.freeze({ key: 'exit', title: '确认', iconClass: 'ol-toolbar-exit' }),
  Object.freeze({ key: 'undo', title: '撤销 Ctrl+Z', iconClass: 'ol-toolbar-undo', disabled: true }),
  Object.freeze({ key: 'redo', title: '重做 Ctrl+Y', iconClass: 'ol-toolbar-redo', disabled: true }),
  Object.freeze({ key: 'copy', title: '复制 Ctrl+C', iconClass: 'ol-toolbar-copy' }),
  Object.freeze({ key: 'edit', title: '编辑', iconClass: 'ol-toolbar-edit' }),
  Object.freeze({ key: 'remove', title: '删除', iconClass: 'ol-toolbar-remove' })
]);

function transformSnapshot<T>(shapes: ShapeRegistry, styles: StyleService, snapshot: Readonly<ElementState<T>>, delta: TransformDelta): ElementSnapshot<T> {
  const definition = shapes.get(snapshot.type);
  const pointVisualTransform = snapshot.geometry.type === 'point' && delta.type !== 'translate' && delta.type !== 'vertex';
  const geometry = pointVisualTransform ? definition.clone(snapshot.geometry as never) : transformShape(definition, snapshot.geometry, delta);
  const style = pointVisualTransform ? transformPointStyle(styles, snapshot.style, delta) : styles.clone(snapshot.style);
  return createElementSnapshot(shapes, { ...snapshot, geometry, style });
}

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

function multiplyScale(value: IconSymbolSpec['scale'] | TextSpec['scale'] | undefined, x: number, y: number): number | [number, number] {
  if (Array.isArray(value)) return [value[0] * x, value[1] * y];
  const scalar = value ?? 1;
  return x === y ? scalar * x : [scalar * x, scalar * y];
}

function toolbarPosition(definition: ShapeDefinition, state: ShapeState, override: Coordinate | undefined): Coordinate {
  if (override !== undefined) return cloneCoordinate(override);
  const geometry = definition.toRenderGeometry(state as never);
  if (geometry.type === 'point') return cloneCoordinate(geometry.coordinates);
  if (geometry.type === 'circle') return [geometry.center[0] + geometry.radius, geometry.center[1] + geometry.radius];
  const coordinates = geometry.type === 'polyline' ? geometry.coordinates : geometry.coordinates.flat();
  return [Math.max(...coordinates.map((coordinate) => coordinate[0])), Math.max(...coordinates.map((coordinate) => coordinate[1]))];
}

function cloneCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

function translateCoordinate(coordinate: Coordinate, x: number, y: number): Coordinate {
  return coordinate.length === 3 ? [coordinate[0] + x, coordinate[1] + y, coordinate[2]] : [coordinate[0] + x, coordinate[1] + y];
}

function rotateCoordinate(coordinate: Coordinate, center: Coordinate, angle: number): Coordinate {
  const x = coordinate[0] - center[0];
  const y = coordinate[1] - center[1];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotated: Coordinate = [center[0] + x * cosine - y * sine, center[1] + x * sine + y * cosine];
  return coordinate.length === 3 ? [rotated[0], rotated[1], coordinate[2]] : rotated;
}

function scaleCoordinate(coordinate: Coordinate, center: Coordinate, x: number, y: number): Coordinate {
  const scaled: Coordinate = [center[0] + (coordinate[0] - center[0]) * x, center[1] + (coordinate[1] - center[1]) * y];
  return coordinate.length === 3 ? [scaled[0], scaled[1], coordinate[2]] : scaled;
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
