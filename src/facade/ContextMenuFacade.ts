import type { Coordinate, Pixel } from '../core/common/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { InternalContextMenuItemContext, InternalContextMenuStateTarget, InternalContextMenuTarget } from '../services/context-menu/types.js';
import type { ContextMenuService as InternalContextMenuService } from '../services/context-menu/ContextMenuService.js';
import { Element, elementHandleFeature } from './Element.js';
import type { Layer } from './Layer.js';
import type { ElementService, LayerService } from './types.js';

export type ContextMenuTarget = 'map' | Element | Readonly<Record<'module', string>>;
export type ContextMenuStateTarget = 'map' | Element;

export interface ContextMenuItemSpec {
  readonly key: string;
  readonly label: string;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly mutexKey?: string;
  readonly children?: readonly ContextMenuItemSpec[];
}

export interface ContextMenuItemContext {
  readonly item: ContextMenuItemSpec;
  readonly scope: 'map' | 'module' | 'element';
  readonly coordinate: Coordinate;
  readonly pixel: Pixel;
  readonly element?: Element;
  readonly module?: string;
  readonly layer?: Layer;
}

export interface ContextMenuSpec {
  readonly items: readonly ContextMenuItemSpec[];
  readonly before?: (context: ContextMenuItemContext) => boolean;
  readonly onSelect?: (context: ContextMenuItemContext) => void;
}

export interface ContextMenuItemState {
  readonly visible: boolean;
  readonly disabled: boolean;
}

export interface ContextMenuHandle {
  destroy(): void;
}

export interface ContextMenuService {
  register(target: ContextMenuTarget, spec: ContextMenuSpec): ContextMenuHandle;
  getItemState(target: ContextMenuStateTarget, key: string): ContextMenuItemState | undefined;
  setItemState(target: ContextMenuStateTarget, key: string, patch: Partial<ContextMenuItemState>): void;
  toggleItem(target: ContextMenuStateTarget, key: string): ContextMenuItemState;
  setTheme(theme: 'light' | 'dark'): void;
  toggleTheme(): 'light' | 'dark';
  clearElementState(elementId: string): void;
  close(): void;
}

export class ContextMenuFacade implements ContextMenuService {
  readonly #service: InternalContextMenuService;
  readonly #elements: ElementService;
  readonly #layers: LayerService;

  constructor(service: InternalContextMenuService, elements: ElementService, layers: LayerService) {
    this.#service = service;
    this.#elements = elements;
    this.#layers = layers;
  }

  register(target: ContextMenuTarget, spec: ContextMenuSpec): ContextMenuHandle {
    const inspected = inspectSpec(spec);
    return this.#service.register(toInternalTarget(target, this.#elements), {
      items: inspected.items,
      ...(inspected.before === undefined ? {} : { before: (context: InternalContextMenuItemContext) => inspected.before?.(this.#toPublic(context)) === true }),
      ...(inspected.onSelect === undefined ? {} : { onSelect: (context: InternalContextMenuItemContext) => inspected.onSelect?.(this.#toPublic(context)) })
    });
  }

  getItemState(target: ContextMenuStateTarget, key: string): ContextMenuItemState | undefined {
    return this.#service.getItemState(toInternalStateTarget(target, this.#elements), key);
  }

  setItemState(target: ContextMenuStateTarget, key: string, patch: Partial<ContextMenuItemState>): void {
    this.#service.setItemState(toInternalStateTarget(target, this.#elements), key, patch);
  }

  toggleItem(target: ContextMenuStateTarget, key: string): ContextMenuItemState {
    return this.#service.toggleItem(toInternalStateTarget(target, this.#elements), key);
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.#service.setTheme(theme);
  }

  toggleTheme(): 'light' | 'dark' {
    return this.#service.toggleTheme();
  }

  clearElementState(elementId: string): void {
    this.#service.clearElementState(elementId);
  }

  close(): void {
    this.#service.close();
  }

  /** @internal Earth lifecycle hook. */
  destroy(): void {
    this.#service.destroy();
  }

  #toPublic(context: InternalContextMenuItemContext): ContextMenuItemContext {
    const element = context.element === undefined ? undefined : this.#elements.get(context.element.id);
    const layer = context.layerId === undefined ? undefined : this.#layers.get(context.layerId);
    return Object.freeze({
      item: context.item,
      scope: context.scope,
      coordinate: Object.freeze([...context.coordinate]) as Coordinate,
      pixel: Object.freeze([...context.pixel]) as Pixel,
      ...(element === undefined ? {} : { element }),
      ...(context.module === undefined ? {} : { module: context.module }),
      ...(layer === undefined ? {} : { layer })
    });
  }
}

function toInternalTarget(target: ContextMenuTarget, elements: ElementService): InternalContextMenuTarget {
  if (target === 'map') return Object.freeze({ kind: 'map' });
  if (isElementHandle(target)) return Object.freeze({ kind: 'element', elementId: currentElementId(target, elements) });
  const record = inspectModuleTarget(target);
  return Object.freeze({ kind: 'module', module: record.module });
}

function toInternalStateTarget(target: ContextMenuStateTarget, elements: ElementService): InternalContextMenuStateTarget {
  if (target === 'map') return Object.freeze({ kind: 'map' });
  if (isElementHandle(target)) return Object.freeze({ kind: 'element', elementId: currentElementId(target, elements) });
  throw new InvalidArgumentError('Context-menu state target must be map or Element');
}

function isElementHandle(value: unknown): value is Element {
  return value !== null && typeof value === 'object' && elementHandleFeature(value as Element) !== undefined;
}

function currentElementId(element: Element, elements: ElementService): string {
  const id = element.id;
  void element.state;
  const current = elements.get(id);
  if (current === undefined || elementHandleFeature(current) !== elementHandleFeature(element)) {
    throw new InvalidArgumentError(`Context-menu Element does not belong to this Earth: ${id}`);
  }
  return id;
}

function inspectModuleTarget(target: unknown): { readonly module: string } {
  if (target === null || typeof target !== 'object' || Array.isArray(target))
    throw new InvalidArgumentError('Context-menu target must be map, Element, or module');
  let keys: PropertyKey[];
  try {
    const prototype = Object.getPrototypeOf(target);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Context-menu module target must be a plain object');
    keys = Reflect.ownKeys(target);
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError('Context-menu module target must be inspectable');
  }
  if (keys.length !== 1 || keys[0] !== 'module') throw new InvalidArgumentError('Context-menu module target requires only module');
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(target, 'module');
  } catch {
    throw new InvalidArgumentError('Context-menu module target must be inspectable');
  }
  if (descriptor === undefined || !('value' in descriptor) || typeof descriptor.value !== 'string' || descriptor.value.trim().length === 0) {
    throw new InvalidArgumentError('Context-menu module must be a non-empty string');
  }
  return { module: descriptor.value };
}

function inspectSpec(spec: ContextMenuSpec): {
  readonly items: readonly ContextMenuItemSpec[];
  readonly before?: (context: ContextMenuItemContext) => boolean;
  readonly onSelect?: (context: ContextMenuItemContext) => void;
} {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw new InvalidArgumentError('Context-menu spec must be a plain object');
  let keys: PropertyKey[];
  try {
    const prototype = Object.getPrototypeOf(spec);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Context-menu spec must be a plain object');
    keys = Reflect.ownKeys(spec);
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError('Context-menu spec must be inspectable');
  }
  for (const key of keys) {
    if (key !== 'items' && key !== 'before' && key !== 'onSelect') throw new InvalidArgumentError(`Unknown context-menu spec field: ${String(key)}`);
  }
  const items = dataValue(spec, 'items');
  const before = optionalCallback(spec, 'before');
  const onSelect = optionalCallback(spec, 'onSelect');
  return {
    items: items as readonly ContextMenuItemSpec[],
    ...(before === undefined ? {} : { before: before as (context: ContextMenuItemContext) => boolean }),
    ...(onSelect === undefined ? {} : { onSelect: onSelect as (context: ContextMenuItemContext) => void })
  };
}

function dataValue(value: object, key: string): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw new InvalidArgumentError('Context-menu spec must be inspectable');
  }
  if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`Context-menu spec requires data property ${key}`);
  return descriptor.value;
}

function optionalCallback(value: object, key: string): Function | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  const callback = dataValue(value, key);
  if (typeof callback !== 'function') throw new InvalidArgumentError(`Context-menu ${key} must be a function`);
  return callback;
}
