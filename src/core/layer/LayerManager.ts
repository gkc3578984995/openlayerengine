import { cloneCoreState } from '../common/clone.js';
import type { ElementStore } from '../element/ElementStore.js';
import { InvalidArgumentError, ObjectDisposedError } from '../errors.js';
import { isNativeRef, type NativeRef } from '../native/types.js';
import type { LayerPort } from '../ports/LayerPort.js';
import type { CoreLayerSpec, CoreLayerState, LayerPatch, LayerPresentation, TileSourcePresetState } from './types.js';

const vectorFields = new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'wrapX', 'declutter']);
const tileFields = new Set(['kind', 'id', 'source', 'sourceOwnership', 'visible', 'opacity', 'zIndex']);
const nativeFields = new Set(['kind', 'id', 'ref', 'ownership']);
const patchFields = new Set(['visible', 'opacity', 'zIndex']);

export class LayerManager {
  readonly #store: ElementStore;
  readonly #port: LayerPort;
  readonly #states = new Map<string, Readonly<CoreLayerState>>();
  readonly #detachingIds = new Set<string>();
  #disposed = false;
  #mutating = false;

  constructor(store: ElementStore, port: LayerPort) {
    this.#store = store;
    this.#port = port;
  }

  ensureDefaultVector(): Readonly<CoreLayerState> {
    this.#assertActive();
    const existing = this.#states.get('default');
    if (existing !== undefined) {
      if (existing.kind !== 'vector') throw new InvalidArgumentError('Layer id default is occupied by a non-vector layer');
      return snapshot(existing);
    }
    return this.add({ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false });
  }

  add(spec: CoreLayerSpec): Readonly<CoreLayerState> {
    return this.#mutation(() => {
      const safeSpec = normalizeSpec(spec);
      if (this.#states.has(safeSpec.id)) throw new InvalidArgumentError(`Layer id already exists: ${safeSpec.id}`);
      let attached = false;
      let presentation: Readonly<LayerPresentation>;
      try {
        const attachedPresentation = this.#port.attach(safeSpec);
        attached = true;
        presentation = normalizePresentation(attachedPresentation);
      } catch (error) {
        if (attached) this.#port.detach(safeSpec.id);
        throw error;
      }
      const state = stateFromAttachment(safeSpec, presentation);
      this.#states.set(state.id, state);
      return snapshot(state);
    });
  }

  get(id: string): Readonly<CoreLayerState> | undefined {
    this.#assertActive();
    assertId(id);
    const state = this.#states.get(id);
    return state === undefined ? undefined : snapshot(state);
  }

  query(): readonly Readonly<CoreLayerState>[] {
    this.#assertActive();
    return Object.freeze([...this.#states.values()].map(snapshot));
  }

  update(id: string, patch: LayerPatch): Readonly<CoreLayerState> {
    return this.#mutation(() => {
      assertId(id);
      const before = this.#states.get(id);
      if (before === undefined) throw new InvalidArgumentError(`Layer does not exist: ${id}`);
      const safePatch = normalizePatch(patch);
      if (Reflect.ownKeys(safePatch).length === 0) return snapshot(before);
      const after = applyPatch(before, safePatch);
      this.#port.update(before, after);
      if (samePresentation(before, after)) return snapshot(before);
      this.#states.set(id, after);
      return snapshot(after);
    });
  }

  remove(id: string): boolean {
    return this.#mutation(() => {
      assertId(id);
      const state = this.#states.get(id);
      if (state === undefined) return false;
      this.#assertUnoccupied(id);
      this.#detachingIds.add(id);
      try {
        this.#port.detach(id);
        this.#states.delete(id);
        return true;
      } finally {
        this.#detachingIds.delete(id);
      }
    });
  }

  clear(): void {
    this.#mutation(() => {
      for (const id of this.#states.keys()) this.#assertUnoccupied(id);
      const ids = [...this.#states.keys()];
      for (const id of ids) this.#detachingIds.add(id);
      try {
        for (const id of ids) this.#port.detach(id);
        this.#states.clear();
      } finally {
        for (const id of ids) this.#detachingIds.delete(id);
      }
    });
  }

  destroy(): void {
    if (this.#disposed) return;
    if (this.#mutating) throw new InvalidArgumentError('Reentrant layer mutations are not supported');
    this.#mutating = true;
    const ids = [...this.#states.keys()];
    for (const id of ids) this.#detachingIds.add(id);
    try {
      for (const id of ids) this.#port.detach(id);
      this.#states.clear();
      this.#disposed = true;
    } finally {
      for (const id of ids) this.#detachingIds.delete(id);
      this.#mutating = false;
    }
  }

  requireVector(id: string): Readonly<Extract<CoreLayerState, { kind: 'vector' }>> {
    this.#assertActive();
    assertId(id);
    if (this.#detachingIds.has(id)) throw new InvalidArgumentError(`Vector layer is being detached: ${id}`);
    const state = this.#states.get(id);
    if (state === undefined) throw new InvalidArgumentError(`Vector layer does not exist: ${id}`);
    if (state.kind !== 'vector') throw new InvalidArgumentError(`Layer is not vector: ${id}`);
    return snapshot(state) as Readonly<Extract<CoreLayerState, { kind: 'vector' }>>;
  }

  #assertUnoccupied(id: string): void {
    if (this.#store.query({ layerId: id }).length > 0) throw new InvalidArgumentError(`Layer contains elements: ${id}`);
  }

  #mutation<T>(work: () => T): T {
    this.#assertActive();
    if (this.#mutating) throw new InvalidArgumentError('Reentrant layer mutations are not supported');
    this.#mutating = true;
    try {
      return work();
    } finally {
      this.#mutating = false;
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('LayerManager has been destroyed');
  }
}

function normalizeSpec(input: CoreLayerSpec): Readonly<CoreLayerSpec> {
  const spec = clonePlainRecord(input, 'Layer spec');
  const kind = ownValue(spec, 'kind');
  if (kind === 'vector') {
    assertFields(spec, vectorFields, 'vector layer');
    const result: CoreLayerSpec = {
      kind,
      id: requireId(spec),
      visible: requireBoolean(spec, 'visible'),
      opacity: requireOpacity(spec),
      ...(optionalZIndex(spec) === undefined ? {} : { zIndex: optionalZIndex(spec) }),
      wrapX: requireBoolean(spec, 'wrapX'),
      declutter: requireBoolean(spec, 'declutter')
    };
    return freeze(result);
  }
  if (kind === 'tile') {
    assertFields(spec, tileFields, 'tile layer');
    const source = ownValue(spec, 'source');
    const sourceOwnership = requireOwnership(spec, 'sourceOwnership');
    const normalizedSource: Extract<CoreLayerSpec, { kind: 'tile' }>['source'] = isNativeRef(source)
      ? (source as NativeRef<'source'>)
      : normalizePreset(source);
    if (!isNativeRef(normalizedSource) && sourceOwnership !== 'earth') throw new InvalidArgumentError('Preset tile sources must be Earth-owned');
    const result: CoreLayerSpec = {
      kind,
      id: requireId(spec),
      source: normalizedSource,
      sourceOwnership,
      visible: requireBoolean(spec, 'visible'),
      opacity: requireOpacity(spec),
      ...(optionalZIndex(spec) === undefined ? {} : { zIndex: optionalZIndex(spec) })
    };
    return freeze(result);
  }
  if (kind === 'native') {
    assertFields(spec, nativeFields, 'native layer');
    const ref = ownValue(spec, 'ref');
    if (!isNativeRef(ref)) throw new InvalidArgumentError('Native layer requires an issued layer reference');
    const result: CoreLayerSpec = { kind, id: requireId(spec), ref: ref as NativeRef<'layer'>, ownership: requireOwnership(spec, 'ownership') };
    return freeze(result);
  }
  throw new InvalidArgumentError('Unknown layer kind');
}

function normalizePreset(value: unknown): TileSourcePresetState {
  const preset = clonePlainRecord(value, 'Tile source preset');
  const kind = ownValue(preset, 'preset');
  if (kind === 'osm') {
    assertFields(preset, new Set(['preset']), 'OSM preset');
    return freeze({ preset: kind });
  }
  if (kind === 'xyz') {
    assertFields(preset, new Set(['preset', 'url', 'attributions']), 'XYZ preset');
    const url = requireNonEmptyString(ownValue(preset, 'url'), 'XYZ URL');
    const attributions = optionalAttributions(preset);
    return freeze({ preset: kind, url, ...(attributions === undefined ? {} : { attributions }) });
  }
  if (kind === 'compact-xyz') {
    assertFields(preset, new Set(['preset', 'baseUrl']), 'compact-xyz preset');
    return freeze({ preset: kind, baseUrl: requireNonEmptyString(ownValue(preset, 'baseUrl'), 'Compact base URL') });
  }
  throw new InvalidArgumentError('Unknown tile source preset');
}

function normalizePresentation(input: LayerPresentation): Readonly<LayerPresentation> {
  const value = clonePlainRecord(input, 'Layer presentation');
  assertFields(value, new Set(['visible', 'opacity', 'zIndex']), 'layer presentation');
  const zIndex = optionalZIndex(value);
  return freeze({
    visible: requireBoolean(value, 'visible'),
    opacity: requireOpacity(value),
    ...(zIndex === undefined ? {} : { zIndex })
  });
}

function normalizePatch(input: LayerPatch): LayerPatch {
  const patch = clonePlainRecord(input, 'Layer patch');
  assertFields(patch, patchFields, 'layer patch');
  const result: LayerPatch = {};
  if (hasOwn(patch, 'visible')) result.visible = requireBoolean(patch, 'visible');
  if (hasOwn(patch, 'opacity')) result.opacity = requireOpacity(patch);
  if (hasOwn(patch, 'zIndex')) result.zIndex = optionalZIndex(patch);
  return result;
}

function stateFromAttachment(spec: Readonly<CoreLayerSpec>, presentation: Readonly<LayerPresentation>): Readonly<CoreLayerState> {
  return freeze({
    ...spec,
    visible: presentation.visible,
    opacity: presentation.opacity,
    ...(presentation.zIndex === undefined ? {} : { zIndex: presentation.zIndex })
  } as CoreLayerState);
}

function applyPatch(before: Readonly<CoreLayerState>, patch: LayerPatch): Readonly<CoreLayerState> {
  const hasZIndex = hasOwn(patch, 'zIndex');
  const after = {
    ...before,
    visible: hasOwn(patch, 'visible') ? (patch.visible as boolean) : before.visible,
    opacity: hasOwn(patch, 'opacity') ? (patch.opacity as number) : before.opacity,
    ...(hasZIndex ? (patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }) : before.zIndex === undefined ? {} : { zIndex: before.zIndex })
  } as CoreLayerState;
  if (hasZIndex && patch.zIndex === undefined) Reflect.deleteProperty(after, 'zIndex');
  return freeze(after);
}

function samePresentation(left: Readonly<CoreLayerState>, right: Readonly<CoreLayerState>): boolean {
  return left.visible === right.visible && left.opacity === right.opacity && left.zIndex === right.zIndex;
}

function clonePlainRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  const cloned = cloneCoreState(value);
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned) || Object.getPrototypeOf(cloned) !== Object.prototype) {
    throw new InvalidArgumentError(`${label} must be a plain object`);
  }
  return cloned as Record<PropertyKey, unknown>;
}

function assertFields(value: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

function ownValue(value: Record<PropertyKey, unknown>, key: string): unknown {
  if (!hasOwn(value, key)) throw new InvalidArgumentError(`Layer record requires ${key}`);
  return value[key];
}

function requireId(value: Record<PropertyKey, unknown>): string {
  return requireNonEmptyString(ownValue(value, 'id'), 'Layer id');
}

function assertId(value: unknown): asserts value is string {
  requireNonEmptyString(value, 'Layer id');
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function requireBoolean(value: Record<PropertyKey, unknown>, key: string): boolean {
  const result = ownValue(value, key);
  if (typeof result !== 'boolean') throw new InvalidArgumentError(`Layer ${key} must be a boolean`);
  return result;
}

function requireOpacity(value: Record<PropertyKey, unknown>): number {
  const opacity = ownValue(value, 'opacity');
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new InvalidArgumentError('Layer opacity must be finite and between 0 and 1');
  }
  return opacity;
}

function optionalZIndex(value: Record<PropertyKey, unknown>): number | undefined {
  if (!hasOwn(value, 'zIndex')) return undefined;
  const zIndex = value.zIndex;
  if (zIndex === undefined) return undefined;
  if (typeof zIndex !== 'number' || !Number.isFinite(zIndex)) throw new InvalidArgumentError('Layer zIndex must be finite');
  return zIndex;
}

function requireOwnership(value: Record<PropertyKey, unknown>, key: string): 'external' | 'earth' {
  const ownership = ownValue(value, key);
  if (ownership !== 'external' && ownership !== 'earth') throw new InvalidArgumentError(`Layer ${key} must be external or earth`);
  return ownership;
}

function optionalAttributions(value: Record<PropertyKey, unknown>): string | readonly string[] | undefined {
  if (!hasOwn(value, 'attributions')) return undefined;
  const attributions = value.attributions;
  if (typeof attributions === 'string') return requireNonEmptyString(attributions, 'Attribution');
  if (!Array.isArray(attributions) || attributions.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new InvalidArgumentError('Attributions must be a string or string array');
  }
  return Object.freeze([...attributions]);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function snapshot<T extends CoreLayerState>(state: Readonly<T>): Readonly<T> {
  return freeze(cloneCoreState(state) as T);
}

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
