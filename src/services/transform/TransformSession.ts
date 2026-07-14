import { cloneCoreState } from '../../core/common/clone.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { compileSelector } from '../../core/element/selector.js';
import { cloneElementSnapshot, createElementSnapshot, type ElementSnapshot } from '../../core/element/snapshot.js';
import type { ElementCopyOptions, ElementState } from '../../core/element/types.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError, UnsupportedOperationError } from '../../core/errors.js';
import type { AnimationControlPort } from '../../core/ports/AnimationControlPort.js';
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
import type { TransformToolbarPort, TransformToolbarViewHandle, TransformToolbarViewSpec } from '../../core/ports/TransformToolbarPort.js';
import type { TransientAnimationHandle, TransientAnimationPort } from '../../core/ports/TransientAnimationPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeState } from '../../core/shape/types.js';
import { isNativeStyleRef, type IconSymbolSpec, type StrokeSpec, type StyleSpec, type TextSpec } from '../../core/style/types.js';
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
  NormalizedTransformOptions
} from './types.js';

export interface TransformSessionDependencies {
  readonly id: string;
  readonly store: ElementStore;
  readonly shapes: ShapeRegistry;
  readonly styles: StyleService;
  readonly coordinator: InteractionCoordinator;
  readonly interaction: TransformInteractionPort;
  readonly animations: AnimationControlPort;
  readonly transients: TransientAnimationPort;
  readonly toolbarPort?: TransformToolbarPort;
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
  readonly #animations: AnimationControlPort;
  readonly #transients: TransientAnimationPort;
  readonly #toolbarPort: TransformToolbarPort | undefined;
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
  #status: InteractionStatus = 'active';
  #handle: TransformInteractionHandle | undefined;
  #toolbar: TransformToolbarViewHandle | undefined;
  #selected: ElementSnapshot<T> | undefined;
  #working: ElementSnapshot<T> | undefined;
  #operationOrigin: ElementSnapshot<T> | undefined;
  #expectedGeneration: ElementGeneration | undefined;
  #expectedRevision: ElementRevision | undefined;
  #transient: TransientAnimationHandle | undefined;
  #animationsPaused = false;
  #copyPreview = false;
  #unsubscribeStore: (() => void) | undefined;
  #unsubscribeInput: (() => void) | undefined;
  #nextListenerId = 0;
  #opening = false;
  #ownCommit = false;
  #ownRemove = false;
  #cleanupRunning = false;
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
    this.#expectedGeneration = generation;
    this.#expectedRevision = revision;
    this.#operationOrigin = undefined;
    const handle = this.#requireHandle();
    try {
      handle.setTarget(this.#presentation(this.#working));
      this.#animationsPaused = this.#animations.pause({ id: snapshot.id }) > 0;
      this.#transient = this.#transients.playTransient({
        ownerId: this.id,
        renderLayerId: handle.renderLayerId,
        renderTargetId: handle.renderTargetId,
        channel: 'transform-bbox',
        animation: { type: 'blink', periodMs: 420 }
      });
      if (resetHistory) this.#history.reset(this.#working);
      this.#createToolbar();
      if (emitSelect) this.#emit('select', freeze({ type: 'select', state: this.#working }));
    } catch (error) {
      this.#stopTransient();
      if (this.#animationsPaused) this.#animations.resume({ id: snapshot.id });
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
    const controlPoints = topology === undefined ? [] : topology.describe(state.geometry as never).handles.map(({ coordinate }) => cloneCoordinate(coordinate));
    return Object.freeze({
      elementId: state.id,
      type: state.type,
      layerId: state.layerId,
      geometry: definition.toRenderGeometry(state.geometry as never),
      style: state.style,
      controlPoints: Object.freeze(controlPoints),
      canTranslate: this.#options.translate !== 'none' && definition.capabilities.has('translate'),
      canRotate: this.#options.rotate && definition.capabilities.has('rotate'),
      canScale: this.#options.scale && definition.capabilities.has('scale'),
      canStretch: this.#options.stretch && definition.capabilities.has('scale'),
      canEditVertices: definition.capabilities.has('vertexEdit') && topology !== undefined
    });
  }

  #handleInteractionEvent(event: TransformInteractionEvent): void {
    if (this.#status !== 'active' || this.#finishing) return;
    try {
      if (event.type === 'select-request') {
        for (const candidateId of event.candidateIds) {
          try {
            this.select(candidateId);
            break;
          } catch (error) {
            if (!(error instanceof CapabilityError)) throw error;
          }
        }
      } else if (event.type === 'enter-handle' || event.type === 'leave-handle') {
        const state = this.#requireWorking();
        const type = event.type === 'enter-handle' ? 'enterHandle' : 'leaveHandle';
        this.#emit(type, freeze({ type, state, key: event.key, ...(event.cursor === undefined ? {} : { cursor: event.cursor }) }) as never);
      } else if (event.type === 'operation-start') {
        this.#operationOrigin = cloneElementSnapshot(this.#shapes, this.#requireWorking());
        this.#emitOperation('start', event.operation, event.delta);
      } else if (event.type === 'operation-change') {
        this.#applyOperation(event.operation, event.delta, false);
      } else if (event.type === 'operation-end') {
        this.#applyOperation(event.operation, event.delta, true);
      } else if (event.type === 'copy-preview-confirm') {
        this.#confirmCopyPreview(event.delta);
      } else {
        this.#copyPreview = false;
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
    this.#updateToolbarPosition();
    this.#emitOperation(end ? 'end' : 'change', operation, delta);
    if (operation === 'vertex') this.#emit('edit', freeze({ type: 'edit', state: this.#working, operation }));
    if (end) {
      this.#history.record(this.#working, metadata(operation));
      this.#operationOrigin = undefined;
      this.#syncToolbarState();
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
    const spec: TransformToolbarViewSpec = Object.freeze({
      ownerId: this.id,
      items: Object.freeze(
        items.map((item) =>
          Object.freeze({
            key: item.key,
            title: item.title,
            ...(item.icon === undefined ? {} : { icon: item.icon }),
            ...(item.iconClass === undefined ? {} : { iconClass: item.iconClass }),
            visible: item.visible ?? true,
            disabled: item.disabled ?? false,
            active: item.active ?? false
          })
        )
      ),
      options: Object.freeze({
        position: toolbarPosition(this.#shapes.get(this.#working.type), this.#working.geometry, this.#options.handleCenter),
        offset: options.offset ?? ([15, -10] as const),
        ...(options.className === undefined ? {} : { className: options.className }),
        visible: options.visible ?? true
      })
    });
    this.#toolbar = this.#toolbarPort.open(spec, (key) => this.#toolbarCommand(key));
    this.#syncToolbarState();
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
    else if (key === 'edit') this.#toolbar?.setActive('edit');
  }

  #syncToolbarState(): void {
    this.#toolbar?.updateItem('undo', { disabled: !this.#history.canUndo });
    this.#toolbar?.updateItem('redo', { disabled: !this.#history.canRedo });
  }

  #updateToolbarPosition(): void {
    const working = this.#working;
    if (working === undefined) return;
    this.#toolbar?.updateOptions({ position: toolbarPosition(this.#shapes.get(working.type), working.geometry, this.#options.handleCenter) });
  }

  #clearSelection(resumeAnimations: boolean, emitSelectEnd: boolean): void {
    const state = this.#working;
    const id = this.#selected?.id;
    this.#stopTransient();
    if (id !== undefined && this.#animationsPaused) {
      try {
        if (resumeAnimations) this.#animations.resume({ id });
        else this.#animations.stop({ id });
      } catch (error) {
        this.#report(error, resumeAnimations ? 'resume-animations' : 'stop-animations');
      }
    }
    this.#animationsPaused = false;
    this.#destroyToolbar();
    try {
      this.#handle?.clearTarget();
    } catch (error) {
      this.#report(error, 'clear-target');
    }
    this.#selected = undefined;
    this.#working = undefined;
    this.#operationOrigin = undefined;
    this.#expectedGeneration = undefined;
    this.#expectedRevision = undefined;
    this.#copyPreview = false;
    if (emitSelectEnd && state !== undefined) this.#emit('selectEnd', freeze({ type: 'selectEnd', state }));
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
  }

  #destroyToolbar(): void {
    const toolbar = this.#toolbar;
    this.#toolbar = undefined;
    if (toolbar === undefined) return;
    try {
      toolbar.destroy();
    } catch (error) {
      this.#report(error, 'destroy-toolbar');
    }
  }

  #cleanupSession(): void {
    if (this.#cleanupRunning) return;
    this.#cleanupRunning = true;
    try {
      if (this.#selected !== undefined) this.#clearSelection(this.#status !== 'cancelled' || this.#store.get(this.#selected.id) !== undefined, true);
      else this.#stopTransient();
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
  const geometry = transformShape(definition, snapshot.geometry, delta);
  const style = delta.type === 'translate' || delta.type === 'vertex' ? styles.clone(snapshot.style) : transformStyle(styles, snapshot.style, delta);
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

function transformStyle(
  styles: StyleService,
  input: Readonly<ElementState>['style'],
  delta: Exclude<TransformDelta, { type: 'translate' | 'vertex' }>
): StyleSpec {
  if (isNativeStyleRef(input)) throw new UnsupportedOperationError('Native styles cannot be structurally transformed');
  const style = styles.serialize(input);
  if (delta.type === 'rotate') return rotateStyle(style, delta.angle);
  const x = Math.abs(delta.scaleX);
  const y = Math.abs(delta.scaleY);
  return scaleStyle(style, x, y);
}

function rotateStyle(style: StyleSpec, angle: number): StyleSpec {
  const result = cloneCoreState(style);
  if (result.symbol?.type === 'icon') {
    result.symbol.rotation = (result.symbol.rotation ?? 0) + angle;
    if (result.symbol.displacement !== undefined) result.symbol.displacement = rotatePair(result.symbol.displacement, angle);
  }
  if (result.text !== undefined) {
    result.text.rotation = (result.text.rotation ?? 0) + angle;
    const offset = rotatePair([result.text.offsetX ?? 0, result.text.offsetY ?? 0], angle);
    result.text.offsetX = offset[0];
    result.text.offsetY = offset[1];
  }
  if (result.decorations !== undefined) {
    for (const decoration of result.decorations) {
      if (decoration.symbol !== undefined) decoration.symbol.rotation = (decoration.symbol.rotation ?? 0) + angle;
    }
  }
  return result;
}

function scaleStyle(style: StyleSpec, scaleX: number, scaleY: number): StyleSpec {
  const result = cloneCoreState(style);
  const average = (scaleX + scaleY) / 2;
  if (result.symbol?.type === 'icon') {
    result.symbol.scale = multiplyScale(result.symbol.scale, scaleX, scaleY);
    if (result.symbol.displacement !== undefined) result.symbol.displacement = [result.symbol.displacement[0] * scaleX, result.symbol.displacement[1] * scaleY];
  } else if (result.symbol?.type === 'circle') {
    result.symbol.radius *= average;
    scaleStroke(result.symbol.stroke, average);
  }
  result.strokes?.forEach((stroke) => scaleStroke(stroke, average));
  scalePattern(result.fill, average);
  if (result.text !== undefined) scaleText(result.text, scaleX, scaleY, average);
  for (const decoration of result.decorations ?? []) {
    if (decoration.symbol !== undefined) decoration.symbol.scale = multiplyScale(decoration.symbol.scale, scaleX, scaleY);
    if (decoration.offset !== undefined) decoration.offset *= average;
    if (decoration.spacing !== undefined) decoration.spacing *= average;
  }
  return result;
}

function scaleText(text: TextSpec, scaleX: number, scaleY: number, average: number): void {
  text.scale = multiplyScale(text.scale, scaleX, scaleY);
  text.offsetX = (text.offsetX ?? 0) * scaleX;
  text.offsetY = (text.offsetY ?? 0) * scaleY;
  if (typeof text.fontSize === 'number') text.fontSize *= average;
  else if (typeof text.fontSize === 'string') text.fontSize = scaleFontSize(text.fontSize, average);
  scaleStroke(text.stroke, average);
  scaleStroke(text.backgroundStroke, average);
  scalePattern(text.fill, average);
  scalePattern(text.backgroundFill, average);
  if (text.padding !== undefined) text.padding = text.padding.map((value) => value * average);
}

function scaleStroke(stroke: StrokeSpec | undefined, scale: number): void {
  if (stroke === undefined) return;
  if (stroke.width !== undefined) stroke.width *= scale;
  if (stroke.lineDash !== undefined) stroke.lineDash = stroke.lineDash.map((value) => value * scale);
  if (stroke.lineDashOffset !== undefined) stroke.lineDashOffset *= scale;
}

function scalePattern(fill: StyleSpec['fill'] | TextSpec['fill'] | undefined, scale: number): void {
  if (fill?.type !== 'pattern') return;
  if (fill.size !== undefined) fill.size *= scale;
  if (fill.lineWidth !== undefined) fill.lineWidth *= scale;
  if (fill.dotRadius !== undefined) fill.dotRadius *= scale;
}

function multiplyScale(value: IconSymbolSpec['scale'] | TextSpec['scale'] | undefined, x: number, y: number): number | [number, number] {
  if (Array.isArray(value)) return [value[0] * x, value[1] * y];
  const scalar = value ?? 1;
  return x === y ? scalar * x : [scalar * x, scalar * y];
}

function scaleFontSize(value: string, scale: number): string {
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)(.*)$/u);
  if (match === null) return value;
  return `${Number(match[1]) * scale}${match[2]}`;
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

function rotatePair(value: readonly [number, number], angle: number): [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [value[0] * cosine - value[1] * sine, value[0] * sine + value[1] * cosine];
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
