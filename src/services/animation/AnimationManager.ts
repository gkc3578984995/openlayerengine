import type { AnimationChannel, AnimationSpec, AnimationStatus } from '../../core/animation/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import { cloneElementSnapshot } from '../../core/element/snapshot.js';
import type { ElementSelector, ElementState } from '../../core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError, UnsupportedOperationError } from '../../core/errors.js';
import type { AnimationControlPort, AnimationPreviewPort } from '../../core/ports/AnimationControlPort.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { LayerRenderBatch, LayerRenderContribution, LayerRenderFrame, LayerRenderLoopHandle, LayerRenderPort } from '../../core/ports/LayerRenderPort.js';
import type { TransientAnimationHandle, TransientAnimationPort, TransientAnimationSpec } from '../../core/ports/TransientAnimationPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import type { ElementChangeSet } from '../../core/transaction/types.js';
import { createBuiltinAnimationRegistry } from '../../builtins/animations/index.js';
import { AnimationHandleImpl } from './AnimationHandle.js';
import type { AnimationRegistry } from './AnimationRegistry.js';
import type { AnimationDefinition, AnimationHandle, AnimationManager } from './types.js';

export interface AnimationManagerDependencies {
  readonly store: ElementStore;
  readonly shapes: ShapeRegistry;
  readonly render: LayerRenderPort;
  readonly registry?: AnimationRegistry;
  readonly errorReporter?: ErrorReporter;
}

interface HandleRecord {
  readonly handle: AnimationHandleImpl;
  readonly recordIds: Set<string>;
}

interface BaseRecord {
  readonly id: string;
  readonly key: string;
  readonly handleId: string;
  readonly channel: string;
  layerId: string;
  elapsedMs: number;
  lastFrameTime: number | undefined;
  selectorPauseDepth: number;
  handlePaused: boolean;
  hidden: boolean;
  retained: boolean;
}

interface ElementRecord extends BaseRecord {
  readonly kind: 'element';
  readonly elementId: string;
  readonly definition: AnimationDefinition;
  readonly spec: AnimationSpec;
}

interface TransientRecord extends BaseRecord {
  readonly kind: 'transient';
  readonly ownerId: string;
  readonly targetId: string;
  readonly spec: TransientAnimationSpec['animation'];
}

type ManagedRecord = ElementRecord | TransientRecord;
type TerminalStatus = Extract<AnimationStatus, 'stopped' | 'finished'>;

export class AnimationManagerImpl implements AnimationManager, AnimationControlPort, AnimationPreviewPort, TransientAnimationPort {
  readonly #store: ElementStore;
  readonly #shapes: ShapeRegistry;
  readonly #render: LayerRenderPort;
  readonly #registry: AnimationRegistry;
  readonly #errorReporter: ErrorReporter;
  readonly #handles = new Map<string, HandleRecord>();
  readonly #records = new Map<string, ManagedRecord>();
  readonly #recordKeys = new Map<string, string>();
  readonly #passes = new Map<string, LayerRenderLoopHandle>();
  readonly #previews = new Map<string, Readonly<ElementState>>();
  readonly #unsubscribeStore: () => void;
  #nextHandleId = 0;
  #nextRecordId = 0;
  #disposed = false;
  #destroying = false;
  #destroyRequested = false;
  #storeSubscribed = true;

  constructor(dependencies: AnimationManagerDependencies) {
    if (dependencies.errorReporter !== undefined && typeof dependencies.errorReporter !== 'function') {
      throw new InvalidArgumentError('Animation errorReporter must be a function');
    }
    this.#store = dependencies.store;
    this.#shapes = dependencies.shapes;
    this.#render = dependencies.render;
    this.#registry = dependencies.registry ?? createBuiltinAnimationRegistry();
    this.#errorReporter = dependencies.errorReporter ?? defaultErrorReporter;
    this.#unsubscribeStore = this.#store.subscribe((changes) => this.#handleStoreChanges(changes));
  }

  get activeCount(): number {
    return this.#records.size;
  }

  get activeLayerCount(): number {
    return this.#passes.size;
  }

  play(selector: ElementSelector, input: AnimationSpec): AnimationHandle {
    this.#assertActive();
    const safeSelector = normalizeElementSelector(selector);
    const definition = this.#registry.get(animationType(input));
    const spec = definition.normalize(input);
    const states = this.#store.query(safeSelector);
    const prepared = states.map((state) => {
      if (isNativeStyleRef(state.style)) throw new UnsupportedOperationError('Native styles cannot use structured animations');
      const geometry = this.#shapes.get(state.type).toRenderGeometry(state.geometry as never);
      definition.assertCompatible(state, geometry);
      return state;
    });
    const handle = this.#createHandle(prepared.length === 0 ? 'finished' : 'running');
    if (prepared.length === 0) return handle;
    const added: ManagedRecord[] = [];
    try {
      for (const state of prepared) {
        const channel = animationChannel(spec);
        this.#replaceRecord(elementKey(state.id, channel));
        const record: ElementRecord = {
          kind: 'element',
          id: `animation-record-${++this.#nextRecordId}`,
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
        this.#addRecord(record);
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

  playTransient(spec: TransientAnimationSpec): TransientAnimationHandle {
    this.#assertActive();
    const safe = normalizeTransient(spec);
    if (!this.#render.hasTarget(safe.renderLayerId, safe.renderTargetId)) {
      throw new ObjectDisposedError(`Transient animation target is unavailable: ${safe.renderTargetId}`);
    }
    const handle = this.#createHandle('running');
    const key = transientKey(safe.renderLayerId, safe.renderTargetId, safe.channel);
    this.#replaceRecord(key);
    const record: TransientRecord = {
      kind: 'transient',
      id: `animation-record-${++this.#nextRecordId}`,
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

  pause(selector: ElementSelector, channels?: readonly AnimationChannel[]): number {
    this.#assertActive();
    const records = this.#matchingElementRecords(selector, channels);
    for (const record of records) {
      record.selectorPauseDepth += 1;
      record.lastFrameTime = undefined;
    }
    this.#refreshHandles(records);
    this.#syncPasses();
    this.#requestLayers(new Set(records.map(({ layerId }) => layerId)));
    return records.length;
  }

  resume(selector: ElementSelector, channels?: readonly AnimationChannel[]): number {
    this.#assertActive();
    const records = this.#matchingElementRecords(selector, channels).filter(({ selectorPauseDepth }) => selectorPauseDepth > 0);
    for (const record of records) {
      record.selectorPauseDepth -= 1;
      record.lastFrameTime = undefined;
    }
    this.#refreshHandles(records);
    this.#syncPasses();
    this.#requestLayers(new Set(records.map(({ layerId }) => layerId)));
    return records.length;
  }

  stop(selector: ElementSelector, channels?: readonly AnimationChannel[]): number {
    this.#assertActive();
    const records = this.#matchingElementRecords(selector, channels);
    const layers = new Set(records.map(({ layerId }) => layerId));
    for (const record of records) this.#removeRecord(record, 'stopped');
    this.#syncPasses();
    this.#requestLayers(layers);
    return records.length;
  }

  stopTransient(ownerId: string): number {
    this.#assertActive();
    const safeOwner = nonEmptyString(ownerId, 'Transient animation ownerId');
    const records = [...this.#records.values()].filter((record): record is TransientRecord => record.kind === 'transient' && record.ownerId === safeOwner);
    const layers = new Set(records.map(({ layerId }) => layerId));
    for (const record of records) this.#removeRecord(record, 'stopped');
    this.#syncPasses();
    this.#requestLayers(layers);
    return records.length;
  }

  stopAll(): void {
    if (this.#disposed && !this.#destroying) return;
    for (const record of [...this.#records.values()]) this.#removeRecord(record, 'stopped');
    this.#syncPasses();
  }

  setPreview(state: Readonly<ElementState>): void {
    this.#assertActive();
    if (state === null || typeof state !== 'object') throw new InvalidArgumentError('Animation preview must be an Element state');
    const current = this.#store.get(state.id);
    if (current === undefined) throw new InvalidArgumentError(`Animation preview Element does not exist: ${String(state.id)}`);
    if (current.type !== state.type) throw new InvalidArgumentError('Animation preview cannot change Element type');
    const snapshot = cloneElementSnapshot(this.#shapes, state);
    const records = this.#elementRecords(state.id);
    const affectedLayers = new Set(records.map(({ layerId }) => layerId));
    this.#previews.set(state.id, snapshot);
    for (const record of records) {
      const timingChanged = record.layerId !== snapshot.layerId || record.hidden === snapshot.visible;
      record.layerId = snapshot.layerId;
      record.hidden = !snapshot.visible;
      if (timingChanged) record.lastFrameTime = undefined;
      affectedLayers.add(record.layerId);
      this.#refreshHandle(record.handleId);
    }
    this.#syncPasses();
    this.#requestLayers(affectedLayers);
  }

  clearPreview(elementId: string): void {
    this.#assertActive();
    const safeId = nonEmptyString(elementId, 'Animation preview Element id');
    if (!this.#previews.delete(safeId)) return;
    const state = this.#store.get(safeId);
    const records = this.#elementRecords(safeId);
    const affectedLayers = new Set(records.map(({ layerId }) => layerId));
    if (state !== undefined) {
      for (const record of records) {
        const timingChanged = record.layerId !== state.layerId || record.hidden === state.visible;
        record.layerId = state.layerId;
        record.hidden = !state.visible;
        if (timingChanged) record.lastFrameTime = undefined;
        affectedLayers.add(record.layerId);
        this.#refreshHandle(record.handleId);
      }
    }
    this.#syncPasses();
    this.#requestLayers(affectedLayers);
  }

  pauseHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    for (const record of records) {
      record.handlePaused = true;
      record.lastFrameTime = undefined;
    }
    this.#refreshHandle(id);
    this.#syncPasses();
    this.#requestLayers(new Set(records.map(({ layerId }) => layerId)));
  }

  resumeHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    for (const record of records) {
      record.handlePaused = false;
      record.lastFrameTime = undefined;
    }
    this.#refreshHandle(id);
    this.#syncPasses();
    this.#requestLayers(new Set(records.map(({ layerId }) => layerId)));
  }

  stopHandle(id: string): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    const records = this.#recordsFor(group);
    const layers = new Set(records.map(({ layerId }) => layerId));
    for (const record of records) this.#removeRecord(record, 'stopped');
    this.#terminateHandle(id, 'stopped');
    this.#syncPasses();
    this.#requestLayers(layers);
  }

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
      this.#handles.clear();
      this.#disposed = true;
    } finally {
      this.#destroying = false;
    }
  }

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

  #addRecord(record: ManagedRecord): void {
    const group = this.#handles.get(record.handleId);
    if (group === undefined) throw new ObjectDisposedError(`Animation handle is unavailable: ${record.handleId}`);
    this.#records.set(record.id, record);
    this.#recordKeys.set(record.key, record.id);
    group.recordIds.add(record.id);
  }

  #replaceRecord(key: string): void {
    const id = this.#recordKeys.get(key);
    const record = id === undefined ? undefined : this.#records.get(id);
    if (record !== undefined) this.#removeRecord(record, 'stopped');
  }

  #removeRecord(record: ManagedRecord, status: TerminalStatus): void {
    if (!this.#records.delete(record.id)) return;
    if (this.#recordKeys.get(record.key) === record.id) this.#recordKeys.delete(record.key);
    const group = this.#handles.get(record.handleId);
    group?.recordIds.delete(record.id);
    record.lastFrameTime = undefined;
    if (group !== undefined && group.recordIds.size === 0) this.#terminateHandle(record.handleId, status);
    else if (group !== undefined) this.#refreshHandle(record.handleId);
  }

  #finishRecord(record: ManagedRecord, retain: boolean, status: TerminalStatus): void {
    if (retain) {
      record.retained = true;
      record.lastFrameTime = undefined;
      this.#refreshHandle(record.handleId);
      return;
    }
    this.#removeRecord(record, status);
  }

  #terminateHandle(id: string, status: TerminalStatus): void {
    const group = this.#handles.get(id);
    if (group === undefined) return;
    group.handle.setStatus(status);
    if (group.recordIds.size === 0) this.#handles.delete(id);
  }

  #refreshHandles(records: readonly ManagedRecord[]): void {
    for (const id of new Set(records.map(({ handleId }) => handleId))) this.#refreshHandle(id);
  }

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

  #recordsFor(group: HandleRecord): ManagedRecord[] {
    return [...group.recordIds].flatMap((id) => {
      const record = this.#records.get(id);
      return record === undefined ? [] : [record];
    });
  }

  #matchingElementRecords(selector: ElementSelector, channels: readonly AnimationChannel[] | undefined): ElementRecord[] {
    const safeSelector = normalizeElementSelector(selector);
    const channelSet = normalizeChannels(channels);
    const ids = new Set(this.#store.query(safeSelector).map(({ id }) => id));
    return [...this.#records.values()].filter(
      (record): record is ElementRecord =>
        record.kind === 'element' && ids.has(record.elementId) && (channelSet === undefined || channelSet.has(record.channel))
    );
  }

  #elementRecords(elementId: string): ElementRecord[] {
    return [...this.#records.values()].filter((record): record is ElementRecord => record.kind === 'element' && record.elementId === elementId);
  }

  #syncPasses(): void {
    const needed = new Set<string>();
    for (const record of this.#records.values()) if (this.#shouldRender(record)) needed.add(record.layerId);
    for (const [layerId, pass] of [...this.#passes]) {
      if (needed.has(layerId)) continue;
      pass.requestRender();
      if (this.#destroyPass(pass)) this.#passes.delete(layerId);
    }
    for (const layerId of needed) {
      if (this.#passes.has(layerId)) continue;
      const pass = this.#render.open(layerId, (frame) => this.#renderLayer(layerId, frame));
      this.#passes.set(layerId, pass);
    }
  }

  #renderLayer(layerId: string, frame: LayerRenderFrame): LayerRenderBatch {
    const contributions: LayerRenderContribution[] = [];
    const finished: Array<{ record: ManagedRecord; retain: boolean; status: TerminalStatus }> = [];
    for (const record of [...this.#records.values()]) {
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
      const state = this.#previews.get(record.elementId) ?? this.#store.get(record.elementId);
      if (state === undefined || state.layerId !== record.layerId || !state.visible) continue;
      try {
        const geometry = this.#shapes.get(state.type).toRenderGeometry(state.geometry as never);
        record.definition.assertCompatible(state, geometry);
        if (isNativeStyleRef(state.style)) throw new UnsupportedOperationError('Native styles cannot use structured animations');
        if (this.#isRunning(record)) this.#advance(record, frame.time);
        const result = record.definition.frame(
          {
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
    if (finished.length > 0) this.#syncPasses();
    return Object.freeze({
      contributions: Object.freeze(contributions),
      requestNextFrame: [...this.#records.values()].some((record) => record.layerId === layerId && !record.retained && this.#isRunning(record))
    });
  }

  #advance(record: ManagedRecord, time: number): void {
    if (!Number.isFinite(time)) throw new InvalidArgumentError('Animation frame time must be finite');
    if (record.lastFrameTime !== undefined) record.elapsedMs += Math.max(0, time - record.lastFrameTime);
    record.lastFrameTime = time;
  }

  #isRunning(record: ManagedRecord): boolean {
    return !record.retained && !record.hidden && !record.handlePaused && record.selectorPauseDepth === 0;
  }

  #shouldRender(record: ManagedRecord): boolean {
    return !record.hidden;
  }

  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#disposed || this.#destroyRequested) return;
    const affectedLayers = new Set<string>();
    for (const change of changes.changes) {
      if (change.kind === 'remove' || change.after === undefined) this.#previews.delete(change.id);
      const records = [...this.#records.values()].filter((record): record is ElementRecord => record.kind === 'element' && record.elementId === change.id);
      for (const record of records) {
        affectedLayers.add(record.layerId);
        if (change.kind === 'remove' || change.after === undefined) {
          this.#removeRecord(record, 'stopped');
          continue;
        }
        const state = this.#previews.get(change.id) ?? change.after;
        const timingChanged = record.layerId !== state.layerId || record.hidden === state.visible;
        record.layerId = state.layerId;
        record.hidden = !state.visible;
        if (timingChanged) record.lastFrameTime = undefined;
        affectedLayers.add(record.layerId);
        this.#refreshHandle(record.handleId);
      }
    }
    this.#syncPasses();
    this.#requestLayers(affectedLayers);
  }

  #requestLayers(layerIds: ReadonlySet<string>): void {
    for (const layerId of layerIds) this.#passes.get(layerId)?.requestRender();
  }

  #destroyPass(pass: LayerRenderLoopHandle): boolean {
    try {
      pass.destroy();
      return true;
    } catch (error) {
      this.#report(error, 'destroy-render-pass');
      return false;
    }
  }

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

  #assertActive(): void {
    if (this.#disposed || this.#destroyRequested) throw new ObjectDisposedError('AnimationManager has been destroyed');
  }
}

function animationType(input: AnimationSpec): AnimationSpec['type'] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Animation spec must be a plain object');
  const descriptor = Object.getOwnPropertyDescriptor(input, 'type');
  if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Animation type must be a data property');
  if (descriptor.value !== 'pulse' && descriptor.value !== 'dash-flow' && descriptor.value !== 'path-travel') {
    throw new InvalidArgumentError(`Unknown animation type: ${String(descriptor.value)}`);
  }
  return descriptor.value;
}

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

function animationChannel(spec: AnimationSpec): string {
  return nonEmptyString(spec.channel ?? spec.type, 'Animation channel');
}

function normalizeChannels(channels: readonly AnimationChannel[] | undefined): ReadonlySet<string> | undefined {
  if (channels === undefined) return undefined;
  return new Set(stringArray(channels, 'Animation channels'));
}

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

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, label);
}

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

function elementKey(elementId: string, channel: string): string {
  return `element\u0000${elementId}\u0000${channel}`;
}

function transientKey(layerId: string, targetId: string, channel: string): string {
  return `transient\u0000${layerId}\u0000${targetId}\u0000${channel}`;
}
