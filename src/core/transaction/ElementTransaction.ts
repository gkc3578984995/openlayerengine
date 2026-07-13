import { cloneCoreState } from '../common/clone.js';
import { DuplicateElementIdError, InvalidArgumentError, ObjectDisposedError } from '../errors.js';
import { isNativeRef } from '../native/types.js';
import type { ShapeRegistry } from '../shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../style/types.js';
import { createElementSnapshot, type ElementSnapshot } from '../element/snapshot.js';
import { assertDestructiveSelector, compileSelector } from '../element/selector.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState } from '../element/types.js';
import type { ElementChange, ElementChangeSet } from './types.js';

type StoredElement = ElementSnapshot<unknown>;

interface TransactionState {
  readonly shapeRegistry: ShapeRegistry;
  readonly states: Map<string, StoredElement>;
  readonly createId: () => string;
  readonly before: Map<string, StoredElement | undefined>;
  readonly order: string[];
  active: boolean;
}

const transactionStates = new WeakMap<ElementTransaction, TransactionState>();
const patchFields: ReadonlySet<string> = new Set(['geometry', 'style', 'data', 'module', 'layerId', 'visible']);

export class ElementTransaction {
  constructor(shapeRegistry: ShapeRegistry, states: Map<string, StoredElement>, createId: () => string) {
    transactionStates.set(this, { shapeRegistry, states, createId, before: new Map(), order: [], active: true });
  }

  add<T>(input: ElementState<T>): Readonly<ElementState<T>> {
    const transaction = activeState(this);
    const state = createElementSnapshot(transaction.shapeRegistry, input);
    if (transaction.states.has(state.id)) throw new DuplicateElementIdError(`Element id already exists: ${state.id}`);
    remember(transaction, state.id, undefined);
    transaction.states.set(state.id, state as StoredElement);
    return snapshot(transaction, state);
  }

  get<T>(id: string): Readonly<ElementState<T>> | undefined {
    const transaction = activeState(this);
    const state = transaction.states.get(id);
    return state === undefined ? undefined : snapshot<T>(transaction, state);
  }

  query<T>(selector?: ElementSelector<T>): readonly Readonly<ElementState<T>>[] {
    const transaction = activeState(this);
    return Object.freeze(matchingEntries<T>(transaction, selector).map(([, state]) => snapshot<T>(transaction, state)));
  }

  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Readonly<ElementState<T>>[] {
    const transaction = activeState(this);
    assertDestructiveSelector(selector as ElementSelector);
    const safePatch = clonePatch(patch);
    if (Reflect.ownKeys(safePatch).length === 0) return Object.freeze([]);

    const replacements = matchingEntries(transaction, selector).map(([id, state]) => {
      const candidate = mergeState(state, safePatch, id);
      return [id, state, createElementSnapshot(transaction.shapeRegistry, candidate)] as const;
    });
    for (const [id, before, after] of replacements) {
      remember(transaction, id, before);
      transaction.states.set(id, after as StoredElement);
    }
    return Object.freeze(replacements.map(([, , state]) => snapshot<T>(transaction, state)));
  }

  remove(selector: ElementSelector): readonly string[] {
    const transaction = activeState(this);
    assertDestructiveSelector(selector);
    const matches = matchingEntries(transaction, selector);
    for (const [id, before] of matches) {
      remember(transaction, id, before);
      transaction.states.delete(id);
    }
    return Object.freeze(matches.map(([id]) => id));
  }

  hide(selector: ElementSelector): readonly Readonly<ElementState>[] {
    return this.update(selector, { visible: false });
  }

  show(selector: ElementSelector): readonly Readonly<ElementState>[] {
    return this.update(selector, { visible: true });
  }

  copy<T>(id: string, overrides: ElementCopyOptions<T> = {}): Readonly<ElementState<T>> {
    const transaction = activeState(this);
    const source = transaction.states.get(id);
    if (source === undefined) throw new InvalidArgumentError(`Element does not exist: ${id}`);
    const safeOverrides = clonePatch(overrides);
    const generatedId = transaction.createId();
    const candidate = mergeState(source, safeOverrides, generatedId);
    const copied = createElementSnapshot(transaction.shapeRegistry, candidate);
    if (transaction.states.has(copied.id)) throw new DuplicateElementIdError(`Element id already exists: ${copied.id}`);
    remember(transaction, copied.id, undefined);
    transaction.states.set(copied.id, copied as StoredElement);
    return snapshot<T>(transaction, copied);
  }

  clear(): readonly string[] {
    const transaction = activeState(this);
    const entries = [...transaction.states.entries()];
    for (const [id, before] of entries) {
      remember(transaction, id, before);
      transaction.states.delete(id);
    }
    return Object.freeze(entries.map(([id]) => id));
  }
}

export function completeElementTransaction(transaction: ElementTransaction): ElementChangeSet {
  const state = activeState(transaction);
  const changes: ElementChange[] = [];
  for (const id of state.order) {
    const before = state.before.get(id);
    const after = state.states.get(id);
    if (before === undefined && after === undefined) continue;
    if (before !== undefined && after !== undefined && equalCoreState(before, after)) continue;
    const kind = before === undefined ? 'add' : after === undefined ? 'remove' : 'update';
    changes.push(
      Object.freeze({
        kind,
        id,
        ...(before === undefined ? {} : { before: snapshot(state, before) }),
        ...(after === undefined ? {} : { after: snapshot(state, after) })
      })
    );
  }
  state.active = false;
  return Object.freeze({ changes: Object.freeze(changes) });
}

export function abortElementTransaction(transaction: ElementTransaction): void {
  const state = transactionStates.get(transaction);
  if (state !== undefined) state.active = false;
}

function activeState(transaction: ElementTransaction): TransactionState {
  const state = transactionStates.get(transaction);
  if (state === undefined || !state.active) throw new ObjectDisposedError('Element transaction is no longer active');
  return state;
}

function remember(transaction: TransactionState, id: string, before: StoredElement | undefined): void {
  if (transaction.before.has(id)) return;
  transaction.before.set(id, before);
  transaction.order.push(id);
}

function matchingEntries<T>(transaction: TransactionState, selector?: ElementSelector<T>): Array<readonly [string, StoredElement]> {
  const matches = compileSelector(selector);
  const result: Array<readonly [string, StoredElement]> = [];
  for (const [id, state] of transaction.states) {
    const isolated = snapshot<T>(transaction, state);
    if (matches(isolated)) result.push([id, state]);
  }
  return result;
}

function clonePatch<T>(patch: ElementPatch<T> | ElementCopyOptions<T>): ElementPatch<T> {
  const cloned = cloneCoreState(patch) as ElementPatch<T>;
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned) || Object.getPrototypeOf(cloned) !== Object.prototype) {
    throw new InvalidArgumentError('Element patch must be a plain object');
  }
  for (const key of Reflect.ownKeys(cloned)) {
    if (typeof key !== 'string' || !patchFields.has(key)) throw new InvalidArgumentError(`Unknown element patch field: ${String(key)}`);
  }
  return cloned;
}

function mergeState<T>(source: StoredElement, patch: ElementPatch<T>, id: string): ElementState<T> {
  const has = (key: keyof ElementPatch<T>): boolean => Object.prototype.hasOwnProperty.call(patch, key);
  return {
    id,
    type: source.type,
    geometry: has('geometry') ? (patch.geometry as ElementState<T>['geometry']) : source.geometry,
    style: has('style') ? (patch.style as ElementState<T>['style']) : source.style,
    ...(has('data') || Object.prototype.hasOwnProperty.call(source, 'data') ? { data: has('data') ? patch.data : (source.data as T | undefined) } : {}),
    ...(has('module') || Object.prototype.hasOwnProperty.call(source, 'module') ? { module: has('module') ? patch.module : source.module } : {}),
    layerId: has('layerId') ? (patch.layerId as string) : source.layerId,
    visible: has('visible') ? (patch.visible as boolean) : source.visible
  };
}

function snapshot<T>(transaction: TransactionState, state: StoredElement): ElementSnapshot<T> {
  return createElementSnapshot(transaction.shapeRegistry, state as ElementState<T>);
}

function equalCoreState(left: unknown, right: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean {
  if (Object.is(left, right)) return true;
  if (isNativeRef(left) || isNativeRef(right) || isNativeStyleRef(left) || isNativeStyleRef(right)) return false;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const previous = seen.get(left);
  if (previous?.has(right)) return true;
  if (previous === undefined) seen.set(left, new WeakSet([right]));
  else previous.add(right);
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key) => !rightKeys.includes(key))) return false;
  return leftKeys.every((key) => equalCoreState(Reflect.get(left, key), Reflect.get(right, key), seen));
}
