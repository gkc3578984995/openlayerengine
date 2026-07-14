import type Map from 'ol/Map.js';
import type { DefaultsOptions } from 'ol/control/defaults.js';
import type { ViewOptions } from 'ol/View.js';
import type { EngineContext } from '../internal/EngineContext.js';
import { createEngineContext } from '../internal/createEngineContext.js';
import type { AnimationManager } from '../services/animation/types.js';
import type { ContextMenuService } from './ContextMenuFacade.js';
import type { ControlService } from './ControlService.js';
import type { DrawService } from './drawTypes.js';
import type { EventService } from './EventFacade.js';
import type { MeasureService } from './measureTypes.js';
import type { OverlayService } from './overlayTypes.js';
import type { StyleService } from './styleTypes.js';
import type { TransformService } from './transformTypes.js';
import type { ElementService, LayerService } from './types.js';
import type { ViewService } from './ViewService.js';
import { unregisterEarth } from './earthRegistry.js';

export type EarthLifecycleState = 'ready' | 'destroying' | 'destroyed';

export interface EarthOptions {
  readonly target?: string | HTMLElement;
  readonly view?: ViewOptions;
  readonly controls?: DefaultsOptions;
}

type EngineContextFactory = (options: EarthOptions) => EngineContext;

let engineContextFactory: EngineContextFactory = createEngineContext;

export default class Earth {
  readonly map: Map;
  readonly target: string | HTMLElement;
  readonly elements: ElementService;
  readonly layers: LayerService;
  readonly styles: StyleService;
  readonly animations: AnimationManager;
  readonly draw: DrawService;
  readonly transform: TransformService;
  readonly measure: MeasureService;
  readonly events: EventService;
  readonly contextMenu: ContextMenuService;
  readonly overlays: OverlayService;
  readonly view: ViewService;
  readonly controls: ControlService;

  readonly #context: EngineContext;
  #lifecycle: EarthLifecycleState = 'ready';

  constructor(options: EarthOptions = {}) {
    const context = engineContextFactory(normalizeEarthOptions(options));
    this.#context = context;
    this.map = context.map;
    this.target = context.target;
    this.elements = context.elements;
    this.layers = context.layers;
    this.styles = context.styles;
    this.animations = context.animations;
    this.draw = context.draw;
    this.transform = context.transform;
    this.measure = context.measure;
    this.events = context.events;
    this.contextMenu = context.contextMenu;
    this.overlays = context.overlays;
    this.view = context.view;
    this.controls = context.controls;
  }

  get lifecycle(): EarthLifecycleState {
    return this.#lifecycle;
  }

  get isDestroyed(): boolean {
    return this.#lifecycle === 'destroyed';
  }

  destroy(): void {
    if (this.#lifecycle !== 'ready') return;
    this.#lifecycle = 'destroying';
    try {
      this.#context.destroy();
    } finally {
      this.#lifecycle = 'destroyed';
      unregisterEarth(this);
    }
  }
}

export function setEarthContextFactoryForTests(factory: EngineContextFactory): () => void {
  if (typeof factory !== 'function') throw new TypeError('Earth context factory must be a function.');
  const previous = engineContextFactory;
  engineContextFactory = factory;
  return () => {
    if (engineContextFactory === factory) engineContextFactory = previous;
  };
}

export function normalizeEarthOptions(input: EarthOptions): EarthOptions {
  const record = inspectOptionsRecord(input, new Set(['target', 'view', 'controls']), 'Earth options');
  const target = record.target === undefined ? 'olContainer' : record.target;
  if (!isTarget(target)) throw new TypeError('Earth target must be a non-empty string or HTMLElement.');
  const view = record.view === undefined ? undefined : copyDataRecord(record.view, 'Earth view options');
  const controls = record.controls === undefined ? undefined : copyDataRecord(record.controls, 'Earth controls options');
  return Object.freeze({
    target,
    ...(view === undefined ? {} : { view: view as ViewOptions }),
    ...(controls === undefined ? {} : { controls: controls as DefaultsOptions })
  });
}

function inspectOptionsRecord(input: unknown, allowed: ReadonlySet<string>, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`${label} must be a plain object.`);
  let prototype: object | null;
  let keys: PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
  } catch {
    throw new TypeError(`${label} must be inspectable.`);
  }
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(`Unknown ${label.toLowerCase()} field: ${String(key)}.`);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      throw new TypeError(`${label} must be inspectable.`);
    }
    if (descriptor === undefined || !('value' in descriptor)) throw new TypeError(`${label} cannot contain accessor properties.`);
    record[key] = descriptor.value;
  }
  return record;
}

function isTarget(value: unknown): value is string | HTMLElement {
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}

function copyDataRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a plain object.`);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
    return copyDataValue(value, label, new WeakMap()) as Readonly<Record<string, unknown>>;
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith(label)) throw error;
    throw new TypeError(`${label} must be inspectable.`);
  }
}

function copyDataValue(value: unknown, label: string, copies: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  const isPlainRecord = prototype === Object.prototype || prototype === null;
  if (!isArray && !isPlainRecord) return value;

  const existing = copies.get(value);
  if (existing !== undefined) return existing;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw new TypeError(`${label} cannot contain symbol properties.`);

  if (isArray) {
    const source = value as unknown[];
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const key of keys) {
      if (key === 'length') continue;
      if (!isArrayIndex(key, source.length)) throw new TypeError(`${label} arrays cannot contain extra properties.`);
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new TypeError(`${label} cannot contain accessor properties.`);
    }
    for (let index = 0; index < source.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
      if (descriptor === undefined || !('value' in descriptor)) throw new TypeError(`${label} arrays cannot be sparse or contain accessor properties.`);
      copy.push(copyDataValue(descriptor.value, label, copies));
    }
    return Object.freeze(copy);
  }

  const copy = Object.create(prototype) as Record<string, unknown>;
  copies.set(value, copy);
  for (const key of keys) {
    if (typeof key !== 'string') throw new TypeError(`${label} cannot contain symbol properties.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new TypeError(`${label} cannot contain accessor properties.`);
    copy[key] = copyDataValue(descriptor.value, label, copies);
  }
  return Object.freeze(copy);
}

function isArrayIndex(key: PropertyKey, length: number): key is string {
  if (typeof key !== 'string' || key.length === 0) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}
