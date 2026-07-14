import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import type { FeatureBinding } from '../adapters/openlayers/FeatureBinding.js';
import { stylePresets } from '../builtins/styles/presets.js';
import type { Pixel } from '../core/common/types.js';
import type { ElementStore } from '../core/element/ElementStore.js';
import type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState } from '../core/element/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { LayerManager } from '../core/layer/LayerManager.js';
import type { HitTestPort } from '../core/ports/HitTestPort.js';
import type { NativeStyleRef, StyleSpec } from '../core/style/types.js';
import { constructElementHandle, Element, elementHandleFeature } from './Element.js';
import type { LayerServiceImpl } from './LayerService.js';
import { inspectStyleInput } from './StyleFacade.js';
import type { ElementCreateInput, ElementHit, ElementService, ScreenExtent } from './types.js';

export interface ElementServiceOptions {
  readonly createId?: () => string;
}

interface CachedElement {
  readonly feature: ReturnType<FeatureBinding['requireFeature']>;
  readonly handle: Element;
}

export class ElementServiceImpl implements ElementService {
  readonly #store: ElementStore;
  readonly #manager: LayerManager;
  readonly #binding: FeatureBinding;
  readonly #layers: LayerServiceImpl;
  readonly #nativeRefs: NativeRefRegistry;
  readonly #hitTest: HitTestPort;
  readonly #createId: (() => string) | undefined;
  readonly #handles = new Map<string, CachedElement>();
  #nextId = 0;

  constructor(
    store: ElementStore,
    manager: LayerManager,
    binding: FeatureBinding,
    layers: LayerServiceImpl,
    nativeRefs: NativeRefRegistry,
    hitTest: HitTestPort,
    options: ElementServiceOptions = {}
  ) {
    this.#store = store;
    this.#manager = manager;
    this.#binding = binding;
    this.#layers = layers;
    this.#nativeRefs = nativeRefs;
    this.#hitTest = hitTest;
    this.#createId = options.createId;
  }

  add<T>(input: ElementCreateInput<T>): Element<T> {
    let provisional: NativeStyleRef | undefined;
    try {
      const result = this.#store.transaction((transaction) => {
        const record = inspectCreateInput(input);
        const geometry = requireGeometry(record.geometry);
        const layerId = hasOwn(record, 'layerId') ? requireString(record.layerId, 'Element layerId') : this.#layers.ensureDefault().id;
        const styleInput = hasOwn(record, 'style') ? record.style : defaultStyle(this.#binding.renderKind(geometry));
        const inspectedStyle = inspectStyleInput(styleInput as never);
        const style = inspectedStyle.matched ? (provisional = this.#nativeRefs.registerProvisionalStyle(inspectedStyle.value)) : (styleInput as StyleSpec);
        const state = transaction.add<T>({
          id: hasOwn(record, 'id') ? requireString(record.id, 'Element id') : this.#generateId(),
          type: geometry.type,
          geometry,
          style,
          ...(hasOwn(record, 'data') ? { data: record.data as T } : {}),
          ...(hasOwn(record, 'module') ? { module: requireString(record.module, 'Element module') } : {}),
          layerId,
          visible: hasOwn(record, 'visible') ? requireBoolean(record.visible, 'Element visible') : true
        });
        this.#binding.preflight(state);
        return state;
      });
      if (provisional !== undefined) this.#nativeRefs.commitProvisionalStyle(provisional);
      return this.#currentHandle<T>(result.value.id);
    } catch (error) {
      if (provisional !== undefined) this.#discardStyle(provisional);
      throw error;
    }
  }

  get<T>(id: string): Element<T> | undefined {
    const state = this.#store.get<T>(id);
    if (state === undefined) {
      this.#handles.delete(id);
      return undefined;
    }
    return this.#currentHandle<T>(id);
  }

  query<T>(selector?: ElementSelector<T>): readonly Element<T>[] {
    return Object.freeze(this.#store.query(selector).map(({ id }) => this.#currentHandle<T>(id)));
  }

  update<T>(selector: ElementSelector<T>, patch: ElementPatch<T>): readonly Element<T>[] {
    const result = this.#store.transaction((transaction) => {
      const states = transaction.update(selector, patch);
      for (const state of states) this.#binding.preflight(state);
      return states;
    });
    return Object.freeze(result.value.map(({ id }) => this.#currentHandle<T>(id)));
  }

  remove(selector: ElementSelector): number {
    const changes = this.#store.remove(selector);
    for (const change of changes.changes) this.#handles.delete(change.id);
    return changes.changes.length;
  }

  hide(selector: ElementSelector): readonly Element[] {
    const changes = this.#store.hide(selector);
    return Object.freeze(changes.changes.map(({ id }) => this.#currentHandle(id)));
  }

  show(selector: ElementSelector): readonly Element[] {
    const changes = this.#store.show(selector);
    return Object.freeze(changes.changes.map(({ id }) => this.#currentHandle(id)));
  }

  copy<T>(id: string, overrides?: ElementCopyOptions<T>): Element<T> {
    const result = this.#store.transaction((transaction) => {
      const state = transaction.copy(id, overrides);
      this.#binding.preflight(state);
      return state;
    });
    return this.#currentHandle<T>(result.value.id);
  }

  clear(): void {
    this.#store.clear();
    this.#handles.clear();
  }

  atPixel<T = unknown>(pixel: Pixel): ElementHit<T> | undefined {
    const hit = this.#hitTest.atPixel(pixel);
    if (hit === undefined) return undefined;
    const state = this.#store.get<T>(hit.elementId);
    const layerState = this.#manager.get(hit.layerId);
    if (state === undefined || layerState === undefined || state.layerId !== hit.layerId) return undefined;
    const element = this.get<T>(hit.elementId);
    const layer = this.#layers.get(hit.layerId);
    return element === undefined || layer === undefined ? undefined : Object.freeze({ element, layer });
  }

  getScreenExtent(target: string | Element): ScreenExtent | undefined {
    let id: string;
    let feature: ReturnType<FeatureBinding['requireFeature']>;
    if (typeof target === 'string') {
      id = target;
      const state = this.#store.get(id);
      if (state === undefined || this.#manager.get(state.layerId)?.kind !== 'vector') return undefined;
      try {
        feature = this.#binding.requireFeature(id);
      } catch {
        return undefined;
      }
      if (!this.#binding.isCurrentFeature(id, feature)) return undefined;
    } else {
      const feature = elementHandleFeature(target);
      if (feature === undefined || !this.#binding.isCurrentFeature(target.id, feature)) {
        throw new InvalidArgumentError('Element belongs to another Earth or generation');
      }
      id = target.id;
      const state = this.#store.get(id);
      if (state === undefined || this.#manager.get(state.layerId)?.kind !== 'vector') return undefined;
    }
    return this.#hitTest.getScreenExtent(id);
  }

  #currentHandle<T>(id: string): Element<T> {
    const feature = this.#binding.requireFeature(id);
    const cached = this.#handles.get(id);
    if (cached?.feature === feature) return cached.handle as Element<T>;
    const handle = constructElementHandle<T>({
      id,
      feature,
      removedByHandle: false,
      isCurrent: () => this.#store.get(id) !== undefined && this.#binding.isCurrentFeature(id, feature),
      getState: () => this.#store.get<T>(id) ?? missingElement(id),
      update: (patch: ElementPatch<T>) => {
        this.update({ id }, patch);
      },
      remove: () => {
        this.remove({ id });
      }
    });
    this.#handles.set(id, { feature, handle });
    return handle;
  }

  #generateId(): string {
    if (this.#createId !== undefined) return requireString(this.#createId(), 'Generated element id');
    let id: string;
    do id = `element-${++this.#nextId}`;
    while (this.#store.get(id) !== undefined);
    return id;
  }

  #discardStyle(reference: NativeStyleRef): void {
    try {
      this.#nativeRefs.discardProvisionalStyle(reference);
    } catch {
      // The reference was committed or the registry was destroyed.
    }
  }
}

function inspectCreateInput(value: unknown): Record<PropertyKey, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidArgumentError('Element input must be a plain object');
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Element input must be a plain object');
    const result: Record<PropertyKey, unknown> = {};
    const allowed = new Set(['geometry', 'id', 'style', 'data', 'module', 'layerId', 'visible']);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.has(key)) throw new InvalidArgumentError(`Unknown element input field: ${String(key)}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Element input fields must be data properties');
      result[key] = descriptor.value;
    }
    if (!hasOwn(result, 'geometry')) throw new InvalidArgumentError('Element input requires geometry');
    return result;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError('Element input must be inspectable');
  }
}

function requireGeometry(value: unknown): ElementState['geometry'] {
  if (value === null || typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string') {
    throw new InvalidArgumentError('Element geometry must be a ShapeState');
  }
  return value as ElementState['geometry'];
}

function defaultStyle(kind: ReturnType<FeatureBinding['renderKind']>): StyleSpec {
  if (kind === 'point') return stylePresets['point-default'];
  if (kind === 'polyline') return stylePresets['line-default'];
  return stylePresets['polygon-default'];
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return value;
}

function missingElement(id: string): never {
  throw new InvalidArgumentError(`Element does not exist: ${id}`);
}
