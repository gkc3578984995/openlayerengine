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

/** Earth 生命周期状态。 */
export type EarthLifecycleState = 'ready' | 'destroying' | 'destroyed';

/** Earth 创建配置。 */
export interface EarthOptions {
  /** 挂载目标。可以传容器 ID 或容器元素。 */
  readonly target?: string | HTMLElement;
  /** 视图配置。用于设置中心点、缩放级别等 OpenLayers 视图选项。 */
  readonly view?: ViewOptions;
  /** 控件配置。用于开关 OpenLayers 默认控件。 */
  readonly controls?: DefaultsOptions;
}

/** EngineContext 创建函数。 */
type EngineContextFactory = (options: EarthOptions) => EngineContext;

/** 当前使用的 EngineContext 创建函数。 */
let engineContextFactory: EngineContextFactory = createEngineContext;

/**
 * 地图实例。统一管理当前地图及其全部服务。
 *
 * @example
 * ```ts
 * import { Earth } from '@vrsim/earth-engine-ol';
 *
 * const earth = new Earth({ target: 'map' });
 * ```
 */
export default class Earth {
  /** 地图对象。用于访问原生 OpenLayers Map。 */
  readonly map: Map;
  /** 挂载目标。返回创建实例时使用的容器 ID 或容器元素。 */
  readonly target: string | HTMLElement;
  /** 元素服务。用于创建、查询和批量操作元素。 */
  readonly elements: ElementService;
  /** 图层服务。用于创建、查询和管理图层。 */
  readonly layers: LayerService;
  /** 样式服务。用于统一设置和更新元素样式。 */
  readonly styles: StyleService;
  /** 动画管理器。用于播放和管理元素动画。 */
  readonly animations: AnimationManager;
  /** 绘制服务。用于绘制和动态编辑图形。 */
  readonly draw: DrawService;
  /** 变换服务。用于平移、旋转、缩放和编辑元素。 */
  readonly transform: TransformService;
  /** 测量服务。用于距离和面积测量。 */
  readonly measure: MeasureService;
  /** 事件服务。用于订阅当前地图的指针和键盘事件。 */
  readonly events: EventService;
  /** 右键菜单服务。用于注册和控制地图封装菜单。 */
  readonly contextMenu: ContextMenuService;
  /** 覆盖物服务。用于管理 Overlay 和 Descriptor。 */
  readonly overlays: OverlayService;
  /** 视图服务。用于定位、缩放、坐标换算和光标控制。 */
  readonly view: ViewService;
  /** 控件服务。用于管理经纬网和比例尺。 */
  readonly controls: ControlService;

  /** 内部服务上下文。 */
  readonly #context: EngineContext;
  /** 当前生命周期状态。 */
  #lifecycle: EarthLifecycleState = 'ready';

  /**
   * 创建一个由调用方自行管理的地图实例。
   *
   * 通过构造器创建的实例不会注册到 `useEarth`。
   *
   * @param options 配置。用于设置挂载目标、视图和默认控件。
   *
   * @example
   * ```ts
   * import { Earth } from '@vrsim/earth-engine-ol';
   *
   * const earth = new Earth({
   *   target: 'map',
   *   view: { center: [0, 0], zoom: 4 }
   * });
   * ```
   */
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

  /** 生命周期。表示实例正在使用、正在销毁或已销毁。 */
  get lifecycle(): EarthLifecycleState {
    return this.#lifecycle;
  }

  /** 销毁状态。实例已销毁时为 `true`。 */
  get isDestroyed(): boolean {
    return this.#lifecycle === 'destroyed';
  }

  /**
   * 销毁地图和全部服务。
   *
   * 重复调用不会产生额外操作。
   *
   * @returns 无返回值。
   *
   * @example
   * ```ts
   * const earth = useEarth('planning');
   * earth.destroy();
   * ```
   */
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

/** 为测试临时替换 EngineContext 创建函数。 */
export function setEarthContextFactoryForTests(factory: EngineContextFactory): () => void {
  if (typeof factory !== 'function') throw new TypeError('Earth context factory must be a function.');
  const previous = engineContextFactory;
  engineContextFactory = factory;
  return () => {
    if (engineContextFactory === factory) engineContextFactory = previous;
  };
}

/** 检查并复制 Earth 创建配置。 */
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

/** 检查配置对象，并只读取允许的数据属性。 */
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

/** 判断值能否作为地图挂载目标。 */
function isTarget(value: unknown): value is string | HTMLElement {
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement;
}

/** 复制普通配置对象，避免外部后续修改影响实例。 */
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

/** 递归复制数组和普通对象。 */
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

/** 判断属性名是否为数组当前范围内的索引。 */
function isArrayIndex(key: PropertyKey, length: number): key is string {
  if (typeof key !== 'string' || key.length === 0) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}
