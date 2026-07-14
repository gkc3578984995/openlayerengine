import BaseLayer from 'ol/layer/Base.js';
import ImageTileSource from 'ol/source/ImageTile.js';
import TileSource from 'ol/source/Tile.js';
import { createCallbackImageTileSource, type LayerAdapter } from '../adapters/openlayers/LayerAdapter.js';
import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { CoreLayerSpec, CoreLayerState, LayerKind } from '../core/layer/types.js';
import type { LayerManager } from '../core/layer/LayerManager.js';
import type { NativeRef } from '../core/native/types.js';
import { constructLayerHandle, Layer } from './Layer.js';
import type { LayerService, LayerState, PublicLayerSpec, TileUrlFunction } from './types.js';

export interface LayerServiceOptions {
  readonly createId?: () => string;
}

interface ParsedLayer {
  readonly spec: CoreLayerSpec;
  readonly provisional?: { readonly kind: 'layer' | 'source'; readonly ref: NativeRef<'layer'> | NativeRef<'source'> };
  readonly internallyCreatedSource?: ImageTileSource;
}

interface CachedLayer {
  readonly layer: BaseLayer;
  readonly handle: Layer;
  readonly generation: object;
}

export class LayerServiceImpl implements LayerService {
  readonly #manager: LayerManager;
  readonly #adapter: LayerAdapter;
  readonly #nativeRefs: NativeRefRegistry;
  readonly #createId: (() => string) | undefined;
  readonly #handles = new Map<string, CachedLayer>();
  #nextId = 0;
  #mutating = false;

  constructor(manager: LayerManager, adapter: LayerAdapter, nativeRefs: NativeRefRegistry, options: LayerServiceOptions = {}) {
    this.#manager = manager;
    this.#adapter = adapter;
    this.#nativeRefs = nativeRefs;
    this.#createId = options.createId;
    this.ensureDefault();
  }

  add(spec: PublicLayerSpec): Layer {
    return this.#mutation(() => {
      const parsed = this.#parse(spec);
      let attached = false;
      let rolledBack = false;
      try {
        this.#manager.add(parsed.spec);
        attached = true;
        if (parsed.provisional !== undefined) {
          this.#commit(parsed.provisional);
          this.#adapter.completeResourceHandoff(parsed.spec.id);
        }
      } catch (error) {
        if (attached) {
          try {
            rolledBack = this.#manager.remove(parsed.spec.id);
          } catch {
            // LayerAdapter owns cleanup reporting; preserve the initiating error.
          }
        } else {
          rolledBack = true;
        }
        if (rolledBack && parsed.internallyCreatedSource !== undefined) {
          try {
            parsed.internallyCreatedSource.dispose();
          } catch {
            // Preserve the attach error; the source is already no longer transferable.
          }
        }
        if (parsed.provisional !== undefined) this.#discard(parsed.provisional);
        throw error;
      }
      return this.#currentHandle(parsed.spec.id);
    });
  }

  get(id: string): Layer | undefined {
    const state = this.#manager.get(id);
    if (state === undefined) {
      this.#handles.delete(id);
      return undefined;
    }
    return this.#currentHandle(id);
  }

  query(kind?: LayerKind): readonly Layer[] {
    if (kind !== undefined && kind !== 'vector' && kind !== 'tile' && kind !== 'native') throw new InvalidArgumentError('Unknown layer kind');
    return Object.freeze(
      this.#manager
        .query()
        .filter((state) => kind === undefined || state.kind === kind)
        .map(({ id }) => this.#currentHandle(id))
    );
  }

  remove(id: string): boolean {
    return this.#mutation(() => {
      const removed = this.#manager.remove(id);
      if (removed) this.#handles.delete(id);
      return removed;
    });
  }

  clear(): void {
    this.#mutation(() => {
      this.#manager.clear();
      this.#handles.clear();
    });
  }

  ensureDefault(): Layer {
    const state = this.#manager.ensureDefaultVector();
    return this.#currentHandle(state.id);
  }

  #currentHandle(id: string): Layer {
    const nativeLayer = this.#adapter.requireLayer(id);
    const cached = this.#handles.get(id);
    if (cached?.layer === nativeLayer) return cached.handle;
    const generation = Object.freeze({});
    const handle = constructLayerHandle({
      id,
      nativeLayer,
      removedByHandle: false,
      isCurrent: () =>
        this.#handles.get(id)?.generation === generation && this.#manager.get(id) !== undefined && this.#adapter.requireLayer(id) === nativeLayer,
      getState: () => toPublicState(this.#manager.get(id) ?? missingLayer(id)),
      update: (patch: Parameters<Layer['update']>[0]) => {
        this.#manager.update(id, patch);
      },
      remove: () => {
        this.remove(id);
      }
    });
    this.#handles.set(id, { layer: nativeLayer, handle, generation });
    return handle;
  }

  #parse(input: PublicLayerSpec): ParsedLayer {
    const record = inspectRecord(input, 'Layer spec');
    const kind = requireOwn(record, 'kind');
    const id = hasOwn(record, 'id') ? requireString(record.id, 'Layer id') : this.#generateId();
    const visible = hasOwn(record, 'visible') ? requireBoolean(record.visible, 'visible') : true;
    const opacity = hasOwn(record, 'opacity') ? requireOpacity(record.opacity) : 1;
    const zIndex = hasOwn(record, 'zIndex') ? requireFinite(record.zIndex, 'zIndex') : undefined;
    const presentation = { visible, opacity, ...(zIndex === undefined ? {} : { zIndex }) };

    if (kind === 'vector') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'wrapX', 'declutter']), 'vector layer');
      return {
        spec: {
          kind,
          id,
          ...presentation,
          wrapX: hasOwn(record, 'wrapX') ? requireBoolean(record.wrapX, 'wrapX') : true,
          declutter: hasOwn(record, 'declutter') ? requireBoolean(record.declutter, 'declutter') : false
        }
      };
    }

    if (kind === 'native') {
      assertKeys(record, new Set(['kind', 'id', 'layer', 'ownership']), 'native layer');
      const layer = requireOwn(record, 'layer');
      if (!(layer instanceof BaseLayer)) throw new InvalidArgumentError('Native layer requires an OpenLayers BaseLayer');
      const ownership = hasOwn(record, 'ownership') ? requireOwnership(record.ownership) : 'external';
      const ref = this.#nativeRefs.registerProvisional('layer', layer);
      return { spec: { kind, id, ref, ownership }, provisional: { kind: 'layer', ref } };
    }

    if (kind !== 'tile') throw new InvalidArgumentError('Unknown layer kind');
    const preset = hasOwn(record, 'preset') ? record.preset : undefined;
    if (preset === 'osm') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'preset']), 'OSM layer');
      return { spec: { kind, id, ...presentation, source: { preset }, sourceOwnership: 'earth' } };
    }
    if (preset === 'compact-xyz') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'preset', 'baseUrl']), 'compact layer');
      return {
        spec: {
          kind,
          id,
          ...presentation,
          source: { preset, baseUrl: requireString(requireOwn(record, 'baseUrl'), 'Compact base URL') },
          sourceOwnership: 'earth'
        }
      };
    }
    if (preset === 'xyz') {
      assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'preset', 'url', 'tileUrlFunction', 'attributions']), 'XYZ layer');
      const hasUrl = hasOwn(record, 'url');
      const hasCallback = hasOwn(record, 'tileUrlFunction');
      if (hasUrl === hasCallback) throw new InvalidArgumentError('XYZ requires exactly one of url or tileUrlFunction');
      const attributions = hasOwn(record, 'attributions') ? requireAttributions(record.attributions) : undefined;
      if (hasUrl) {
        return {
          spec: {
            kind,
            id,
            ...presentation,
            source: { preset, url: requireString(record.url, 'XYZ URL'), ...(attributions === undefined ? {} : { attributions }) },
            sourceOwnership: 'earth'
          }
        };
      }
      const callback = record.tileUrlFunction;
      if (typeof callback !== 'function') throw new InvalidArgumentError('tileUrlFunction must be a function');
      const source = createCallbackImageTileSource(callback as TileUrlFunction, attributions);
      let ref: NativeRef<'source'>;
      try {
        ref = this.#nativeRefs.registerProvisional('source', source);
      } catch (error) {
        try {
          source.dispose();
        } catch {
          // Preserve the registration failure.
        }
        throw error;
      }
      return {
        spec: { kind, id, ...presentation, source: ref, sourceOwnership: 'earth' },
        provisional: { kind: 'source', ref },
        internallyCreatedSource: source
      };
    }

    if (preset !== undefined) throw new InvalidArgumentError('Unknown tile preset');
    assertKeys(record, new Set(['kind', 'id', 'visible', 'opacity', 'zIndex', 'source', 'ownership']), 'custom tile layer');
    const source = requireOwn(record, 'source');
    if (!(source instanceof TileSource)) throw new InvalidArgumentError('Custom tile layer requires an OpenLayers TileSource');
    const ownership = hasOwn(record, 'ownership') ? requireOwnership(record.ownership) : 'external';
    const ref = this.#nativeRefs.registerProvisional('source', source);
    return { spec: { kind, id, ...presentation, source: ref, sourceOwnership: ownership }, provisional: { kind: 'source', ref } };
  }

  #commit(provisional: NonNullable<ParsedLayer['provisional']>): void {
    if (provisional.kind === 'layer') this.#nativeRefs.commitProvisional('layer', provisional.ref as NativeRef<'layer'>);
    else this.#nativeRefs.commitProvisional('source', provisional.ref as NativeRef<'source'>);
  }

  #discard(provisional: NonNullable<ParsedLayer['provisional']>): void {
    try {
      if (provisional.kind === 'layer') this.#nativeRefs.discardProvisional('layer', provisional.ref as NativeRef<'layer'>);
      else this.#nativeRefs.discardProvisional('source', provisional.ref as NativeRef<'source'>);
    } catch {
      // A destroyed registry already invalidated the provisional reference.
    }
  }

  #generateId(): string {
    if (this.#createId !== undefined) return requireString(this.#createId(), 'Generated layer id');
    let id: string;
    do id = `layer-${++this.#nextId}`;
    while (this.#manager.get(id) !== undefined);
    return id;
  }

  #mutation<T>(work: () => T): T {
    if (this.#mutating) throw new InvalidArgumentError('Reentrant LayerService mutations are not supported');
    this.#mutating = true;
    try {
      return work();
    } finally {
      this.#mutating = false;
    }
  }
}

function toPublicState(state: Readonly<CoreLayerState>): Readonly<LayerState> {
  const presentation = {
    kind: state.kind,
    id: state.id,
    visible: state.visible,
    opacity: state.opacity,
    ...(state.zIndex === undefined ? {} : { zIndex: state.zIndex })
  };
  return Object.freeze(state.kind === 'vector' ? { ...presentation, wrapX: state.wrapX, declutter: state.declutter } : presentation) as Readonly<LayerState>;
}

function missingLayer(id: string): never {
  throw new InvalidArgumentError(`Layer does not exist: ${id}`);
}

function inspectRecord(value: unknown, label: string): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError(`${label} must be a plain object`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
    const result = Object.create(null) as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} fields must be data properties`);
      Object.defineProperty(result, key, {
        value: descriptor.value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError(`${label} must be inspectable`);
  }
}

function assertKeys(record: Record<PropertyKey, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label} field: ${String(key)}`);
  }
}

function requireOwn(record: Record<PropertyKey, unknown>, key: string): unknown {
  if (!hasOwn(record, key)) throw new InvalidArgumentError(`Layer spec requires ${key}`);
  return record[key];
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`Layer ${label} must be a boolean`);
  return value;
}

function requireOpacity(value: unknown): number {
  const opacity = requireFinite(value, 'opacity');
  if (opacity < 0 || opacity > 1) throw new InvalidArgumentError('Layer opacity must be between 0 and 1');
  return opacity;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`Layer ${label} must be finite`);
  return value;
}

function requireOwnership(value: unknown): 'external' | 'earth' {
  if (value !== 'external' && value !== 'earth') throw new InvalidArgumentError('Layer ownership must be external or earth');
  return value;
}

function requireAttributions(value: unknown): string | readonly string[] {
  if (typeof value === 'string') return requireString(value, 'Attribution');
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new InvalidArgumentError('Attributions must be a string or string array');
  }
  return Object.freeze([...value]) as readonly string[];
}
