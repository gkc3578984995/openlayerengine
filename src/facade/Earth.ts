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

/** 创建 Earth 时可配置的地图选项。 */
export interface EarthOptions {
  /** 地图容器 ID 或容器元素。 */
  readonly target?: string | HTMLElement;
  /** 中心点、缩放级别等 OpenLayers View 选项。 */
  readonly view?: ViewOptions;
  /** OpenLayers 默认控件的开关配置。 */
  readonly controls?: DefaultsOptions;
}

/** EngineContext 创建函数。 */
type EngineContextFactory = (options: EarthOptions) => EngineContext;

/** 当前使用的 EngineContext 创建函数。 */
let engineContextFactory: EngineContextFactory = createEngineContext;

/**
 * 地图实例，也是当前地图所有服务和资源的生命周期根节点。
 *
 * @example
 * ```ts
 * import { Earth } from '@vrsim/earth-engine-ol';
 *
 * const earth = new Earth({ target: 'map' });
 * ```
 */
export default class Earth {
  /** 供高级互操作使用的 OpenLayers Map。 */
  readonly map: Map;
  /** 创建实例时确定的容器 ID 或容器元素。 */
  readonly target: string | HTMLElement;
  /** 创建、查询和批量操作 Element。 */
  readonly elements: ElementService;
  /** 创建、查询和管理图层。 */
  readonly layers: LayerService;
  /** 设置和更新 Element 样式。 */
  readonly styles: StyleService;
  /** 播放和管理 Element 动画。 */
  readonly animations: AnimationManager;
  /** 绘制图形并启动 Edit Session。 */
  readonly draw: DrawService;
  /** 平移、旋转、缩放和编辑 Element。 */
  readonly transform: TransformService;
  /** 距离和面积测量。 */
  readonly measure: MeasureService;
  /** 订阅当前地图的指针和键盘事件。 */
  readonly events: EventService;
  /** 注册和控制地图右键菜单。 */
  readonly contextMenu: ContextMenuService;
  /** 管理 Overlay 和 Descriptor。 */
  readonly overlays: OverlayService;
  /** 定位、缩放、坐标换算和光标控制。 */
  readonly view: ViewService;
  /** 管理经纬网和比例尺。 */
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
   * @param options 地图容器、View 和默认控件配置。
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

  /** 当前生命周期阶段。 */
  get lifecycle(): EarthLifecycleState {
    return this.#lifecycle;
  }

  /** 生命周期进入 `destroyed` 后为 `true`。 */
  get isDestroyed(): boolean {
    return this.#lifecycle === 'destroyed';
  }

  /**
   * 销毁地图和全部服务。
   *
   * 重复调用不会产生额外操作。
   *
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

/** 校验 Earth 配置并生成不受调用方后续修改影响的副本。 */
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

/** 只从普通配置对象中读取允许的数据属性。 */
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

/** 深复制普通配置数据，隔离调用方后续修改。 */
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

/** 判断属性名是否是数组当前范围内的有效索引。 */
function isArrayIndex(key: PropertyKey, length: number): key is string {
  if (typeof key !== 'string' || key.length === 0) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}
