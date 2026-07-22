import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import { ElementProtectedError, InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ElementProtectionChange, ElementProtectionController, ElementProtectionViewPort } from '../../core/ports/ElementProtectionPort.js';
import type { ElementProtectionState, ElementProtectionUpdate } from '../../core/protection/types.js';
import type { ElementChangeSet, ElementGeneration } from '../../core/transaction/types.js';

/** 到期唤醒句柄。 */
export interface ElementProtectionWakeHandle {
  /** 取消尚未执行的唤醒。 */
  cancel(): void;
}

/** 到期调度器。 */
export interface ElementProtectionWake {
  /** 在指定时间戳到达后执行回调。 */
  scheduleAt(timestamp: number, callback: () => void): ElementProtectionWakeHandle;
}

/** Element 保护服务装配配置。 */
export interface ElementProtectionServiceOptions {
  /** 当前时间来源。 */
  readonly now?: () => number;
  /** 到期调度器。 */
  readonly wake?: ElementProtectionWake;
  /** 接收监听器和视图适配器中的非致命错误。 */
  readonly errorReporter?: ErrorReporter;
}

interface ProtectionRecord {
  readonly generation: ElementGeneration;
  readonly state: ElementProtectionState;
  wake?: ElementProtectionWakeHandle;
}

interface RevisionWatermark {
  readonly generation: ElementGeneration;
  readonly revision: number;
}

const allowedUpdateKeys = new Set(['protected', 'operatorId', 'operatorName', 'revision', 'expiresAt']);
const maxTimeoutDelayMs = 2_147_483_647;

/** 管理实例级协同保护状态、乱序过滤、到期和临时视图。 */
export class ElementProtectionService implements ElementProtectionController {
  readonly #store: ElementStore;
  readonly #view: ElementProtectionViewPort;
  readonly #now: () => number;
  readonly #wake: ElementProtectionWake;
  readonly #errorReporter: ErrorReporter;
  readonly #records = new Map<string, ProtectionRecord>();
  readonly #watermarks = new Map<string, RevisionWatermark>();
  readonly #listeners = new Map<number, (change: ElementProtectionChange) => void>();
  readonly #notificationQueue: ElementProtectionChange[] = [];
  #nextListenerId = 0;
  #unsubscribeStore: (() => void) | undefined;
  #disposed = false;
  #notifying = false;

  /** 绑定 ElementStore 与保护视图。 */
  constructor(store: ElementStore, view: ElementProtectionViewPort, options: ElementProtectionServiceOptions = {}) {
    if (options.now !== undefined && typeof options.now !== 'function') throw new InvalidArgumentError('Element protection now must be a function');
    if (options.errorReporter !== undefined && typeof options.errorReporter !== 'function') {
      throw new InvalidArgumentError('Element protection errorReporter must be a function');
    }
    this.#store = store;
    this.#view = view;
    this.#now = options.now ?? (() => Date.now());
    this.#wake = options.wake ?? defaultWake;
    this.#errorReporter = options.errorReporter ?? defaultErrorReporter;
    this.#unsubscribeStore = store.subscribe((changes) => this.#handleStoreChanges(changes));
  }

  /** 建立、更新或解除指定 Element 的保护状态。 */
  set(elementIdInput: string, input: ElementProtectionUpdate): boolean {
    this.#assertActive();
    const elementId = nonEmptyElementId(elementIdInput);
    const update = inspectUpdate(input);
    const element = this.#store.resolve(elementId);
    const generation = this.#store.generationOf(elementId);
    if (element === undefined || generation === undefined) return false;

    this.#discardForeignGeneration(elementId, generation);
    const watermark = this.#watermarks.get(elementId);
    if (update.revision !== undefined && watermark?.generation === generation && update.revision <= watermark.revision) return false;
    if (update.revision !== undefined) this.#watermarks.set(elementId, { generation, revision: update.revision });

    const current = this.#records.get(elementId);
    if (!update.protected || (update.expiresAt !== undefined && update.expiresAt <= this.#readNow())) {
      if (current === undefined || current.generation !== generation) return false;
      this.#removeRecord(elementId, current, true);
      return true;
    }

    const state = freezeState(elementId, update);
    if (current?.generation === generation && statesEqual(current.state, state)) return false;
    if (current !== undefined) this.#cancelWake(current);
    const record: ProtectionRecord = { generation, state };
    this.#records.set(elementId, record);
    this.#render(element, state);
    this.#attempt(() => this.#scheduleExpiry(elementId, record), 'schedule-expiry');
    this.#notify(
      Object.freeze({
        elementId,
        generation,
        ...(current === undefined ? {} : { previous: current.state }),
        current: state
      })
    );
    return true;
  }

  /** 读取当前 Element 代次的保护状态。 */
  get(elementIdInput: string, generation?: ElementGeneration): ElementProtectionState | undefined {
    this.#assertActive();
    const elementId = nonEmptyElementId(elementIdInput);
    const currentGeneration = this.#store.generationOf(elementId);
    if (currentGeneration === undefined || (generation !== undefined && generation !== currentGeneration)) return undefined;
    const record = this.#records.get(elementId);
    if (record === undefined || record.generation !== currentGeneration) return undefined;
    if (record.state.expiresAt !== undefined && record.state.expiresAt <= this.#readNow()) {
      this.#removeRecord(elementId, record, true);
      return undefined;
    }
    return record.state;
  }

  /** 目标受保护时拒绝进入本地可变交互。 */
  assertEditable(elementId: string, generation?: ElementGeneration): void {
    const state = this.get(elementId, generation);
    if (state !== undefined) throw new ElementProtectedError(state.elementId, state.operatorName, state.operatorId);
  }

  /** 订阅保护状态变化。 */
  subscribe(listener: (change: ElementProtectionChange) => void): () => void {
    this.#assertActive();
    if (typeof listener !== 'function') throw new InvalidArgumentError('Element protection listener must be a function');
    const id = ++this.#nextListenerId;
    this.#listeners.set(id, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(id);
    };
  }

  /** 释放订阅、定时器与全部临时视图。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const unsubscribe = this.#unsubscribeStore;
    this.#unsubscribeStore = undefined;
    if (unsubscribe !== undefined) this.#attempt(unsubscribe, 'unsubscribe-store');
    for (const record of this.#records.values()) this.#cancelWake(record);
    this.#records.clear();
    this.#watermarks.clear();
    this.#listeners.clear();
    this.#notificationQueue.length = 0;
    this.#attempt(() => this.#view.destroy(), 'destroy-view');
  }

  #handleStoreChanges(changes: ElementChangeSet): void {
    if (this.#disposed) return;
    for (const change of changes.changes) {
      if (change.kind === 'remove') {
        const currentGeneration = this.#store.generationOf(change.id);
        if (currentGeneration !== undefined) {
          this.#discardForeignGeneration(change.id, currentGeneration);
          continue;
        }
        this.#watermarks.delete(change.id);
        const record = this.#records.get(change.id);
        if (record !== undefined) this.#removeRecord(change.id, record, true);
        else this.#attempt(() => this.#view.remove(change.id), 'remove-view');
        continue;
      }
      const generation = this.#store.generationOf(change.id);
      if (generation === undefined) continue;
      this.#discardForeignGeneration(change.id, generation);
      const record = this.#records.get(change.id);
      if (record !== undefined && record.generation === generation && change.after !== undefined) this.#render(change.after, record.state);
    }
  }

  #discardForeignGeneration(elementId: string, generation: ElementGeneration): void {
    const record = this.#records.get(elementId);
    if (record !== undefined && record.generation !== generation) this.#removeRecord(elementId, record, true);
    const watermark = this.#watermarks.get(elementId);
    if (watermark !== undefined && watermark.generation !== generation) this.#watermarks.delete(elementId);
  }

  #scheduleExpiry(elementId: string, record: ProtectionRecord): void {
    const expiresAt = record.state.expiresAt;
    if (expiresAt === undefined) return;
    record.wake = this.#wake.scheduleAt(expiresAt, () => {
      if (this.#disposed || this.#records.get(elementId) !== record) return;
      if (expiresAt > this.#readNow()) {
        this.#attempt(() => this.#scheduleExpiry(elementId, record), 'reschedule-expiry');
        return;
      }
      this.#removeRecord(elementId, record, true);
    });
  }

  #removeRecord(elementId: string, record: ProtectionRecord, notify: boolean): void {
    if (this.#records.get(elementId) !== record) return;
    this.#records.delete(elementId);
    this.#cancelWake(record);
    this.#attempt(() => this.#view.remove(elementId), 'remove-view');
    if (notify) {
      this.#notify(Object.freeze({ elementId, generation: record.generation, previous: record.state }));
    }
  }

  #cancelWake(record: ProtectionRecord): void {
    const wake = record.wake;
    record.wake = undefined;
    if (wake !== undefined) this.#attempt(() => wake.cancel(), 'cancel-expiry');
  }

  #render(element: Readonly<ElementState>, protection: ElementProtectionState): void {
    this.#attempt(() => this.#view.upsert(element, protection), 'render-view');
  }

  #notify(change: ElementProtectionChange): void {
    this.#notificationQueue.push(change);
    if (this.#notifying) return;
    this.#notifying = true;
    try {
      while (this.#notificationQueue.length > 0 && !this.#disposed) {
        const next = this.#notificationQueue.shift();
        if (next === undefined) continue;
        for (const listener of [...this.#listeners.values()]) {
          if (this.#disposed) break;
          this.#attempt(() => listener(next), 'listener');
        }
      }
    } finally {
      this.#notifying = false;
    }
  }

  #readNow(): number {
    const value = this.#now();
    if (!Number.isFinite(value)) throw new InvalidArgumentError('Element protection clock must return a finite number');
    return value;
  }

  #attempt(work: () => void, operation: string): void {
    try {
      work();
    } catch (error) {
      try {
        const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
          source: 'ElementProtectionService',
          operation
        });
        void Promise.resolve(result).catch(() => undefined);
      } catch {
        return;
      }
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('Element protection service has been destroyed');
  }
}

const defaultWake: ElementProtectionWake = {
  scheduleAt(timestamp, callback) {
    let active = true;
    const timeout = globalThis.setTimeout(
      () => {
        if (!active) return;
        active = false;
        callback();
      },
      Math.min(maxTimeoutDelayMs, Math.max(0, timestamp - Date.now()))
    );
    return {
      cancel() {
        if (!active) return;
        active = false;
        globalThis.clearTimeout(timeout);
      }
    };
  }
};

function inspectUpdate(input: ElementProtectionUpdate): ElementProtectionUpdate {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new InvalidArgumentError('Element protection update must be an object');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new InvalidArgumentError('Element protection update cannot contain symbol fields');
    const descriptor = descriptors[key];
    if (descriptor === undefined) throw new InvalidArgumentError(`Element protection field is unavailable: ${key}`);
    if (!allowedUpdateKeys.has(key)) throw new InvalidArgumentError(`Unknown Element protection field: ${key}`);
    if (!('value' in descriptor)) throw new InvalidArgumentError(`Element protection field must be a data property: ${key}`);
  }
  if (typeof input.protected !== 'boolean') throw new InvalidArgumentError('Element protection protected must be a boolean');
  const operatorId = input.protected ? optionalNonEmptyString(input.operatorId, 'Element protection operatorId') : undefined;
  const operatorName = input.protected ? optionalNonEmptyString(input.operatorName, 'Element protection operatorName') : undefined;
  if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 0)) {
    throw new InvalidArgumentError('Element protection revision must be a non-negative safe integer');
  }
  const expiresAt = input.protected ? input.expiresAt : undefined;
  if (expiresAt !== undefined && (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt))) {
    throw new InvalidArgumentError('Element protection expiresAt must be finite');
  }
  if (!input.protected) {
    if ('operatorId' in input || 'operatorName' in input || 'expiresAt' in input) {
      throw new InvalidArgumentError('Element protection release only accepts protected and revision');
    }
    return Object.freeze({ protected: false, ...(input.revision === undefined ? {} : { revision: input.revision }) });
  }
  return Object.freeze({
    protected: true,
    ...(operatorId === undefined ? {} : { operatorId }),
    ...(operatorName === undefined ? {} : { operatorName }),
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    ...(expiresAt === undefined ? {} : { expiresAt })
  });
}

function freezeState(elementId: string, update: Extract<ElementProtectionUpdate, { readonly protected: true }>): ElementProtectionState {
  return Object.freeze({
    elementId,
    protected: true,
    ...(update.operatorId === undefined ? {} : { operatorId: update.operatorId }),
    ...(update.operatorName === undefined ? {} : { operatorName: update.operatorName }),
    ...(update.revision === undefined ? {} : { revision: update.revision }),
    ...(update.expiresAt === undefined ? {} : { expiresAt: update.expiresAt })
  });
}

function statesEqual(left: ElementProtectionState, right: ElementProtectionState): boolean {
  return (
    left.elementId === right.elementId &&
    left.operatorId === right.operatorId &&
    left.operatorName === right.operatorName &&
    left.revision === right.revision &&
    left.expiresAt === right.expiresAt
  );
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value.trim();
}

function nonEmptyElementId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Element protection id must be a non-empty string');
  return value;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, label);
}
