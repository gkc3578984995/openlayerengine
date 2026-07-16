import type { Coordinate, Pixel } from '../core/common/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { InternalContextMenuItemContext, InternalContextMenuStateTarget, InternalContextMenuTarget } from '../services/context-menu/types.js';
import type { ContextMenuService as InternalContextMenuService } from '../services/context-menu/ContextMenuService.js';
import { Element, elementHandleFeature } from './Element.js';
import type { Layer } from './Layer.js';
import type { ElementService, LayerService } from './types.js';

/** 可注册右键菜单的地图、Element 或业务模块目标。 */
export type ContextMenuTarget = 'map' | Element | Readonly<Record<'module', string>>;

/** 可保存菜单项目状态的地图或 Element 目标。 */
export type ContextMenuStateTarget = 'map' | Element;

/** 单个右键菜单项目的配置。 */
export interface ContextMenuItemSpec {
  /** 查询、更新和触发菜单项目时使用的唯一标识。 */
  readonly key: string;
  /** 菜单中展示的名称。 */
  readonly label: string;
  /** 菜单项目是否可见。 */
  readonly visible?: boolean;
  /** 菜单项目是否禁用。 */
  readonly disabled?: boolean;
  /** 当前项目显隐变化时，反向切换这些项目的可见状态。 */
  readonly mutexKey?: string;
  /** 当前项目包含的嵌套菜单。 */
  readonly children?: readonly ContextMenuItemSpec[];
}

/** 右键菜单回调接收的公共上下文。 */
export interface ContextMenuItemContext {
  /** 当前处理项目的只读配置。 */
  readonly item: ContextMenuItemSpec;
  /** 菜单来自地图、业务模块还是 Element。 */
  readonly scope: 'map' | 'module' | 'element';
  /** 右键位置的地图坐标快照。 */
  readonly coordinate: Coordinate;
  /** 右键位置相对地图视口的屏幕坐标。 */
  readonly pixel: Pixel;
  /** 命中受管理 Element 时提供的实时句柄。 */
  readonly element?: Element;
  /** 命中 Element 携带的业务模块标识。 */
  readonly module?: string;
  /** 命中 Element 所属的图层句柄。 */
  readonly layer?: Layer;
}

/** 一组右键菜单项目及其回调配置。 */
export interface ContextMenuSpec {
  /** 当前目标可展示的菜单树。 */
  readonly items: readonly ContextMenuItemSpec[];
  /** 显示前判断；仅返回 `true` 时项目可用，其他返回值或异常会保留项目但将其禁用。 */
  readonly before?: (context: ContextMenuItemContext) => boolean;
  /** 用户选择可用菜单项目后调用。 */
  readonly onSelect?: (context: ContextMenuItemContext) => void;
}

/** 右键菜单项目的可变状态。 */
export interface ContextMenuItemState {
  /** 菜单项目当前是否可见。 */
  readonly visible: boolean;
  /** 菜单项目当前是否禁用。 */
  readonly disabled: boolean;
}

/** 一次右键菜单注册的公开句柄。 */
export interface ContextMenuHandle {
  /**
   * 注销本次右键菜单注册。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const handle = earth.contextMenu.register('map', { items: [{ key: 'refresh', label: '刷新' }] });
   * handle.destroy();
   * ```
   */
  destroy(): void;
}

/** 注册和控制右键菜单的公开服务。 */
export interface ContextMenuService {
  /**
   * 为地图、业务模块或 Element 注册右键菜单。
   *
   * @param target 菜单生效的地图、Element 或业务模块。
   * @param spec 菜单项目及其显示前和选择回调。
   * @returns 用于注销本次注册的控制句柄。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const handle = earth.contextMenu.register('map', { items: [{ key: 'center', label: '回到中心' }] });
   * ```
   */
  register(target: ContextMenuTarget, spec: ContextMenuSpec): ContextMenuHandle;
  /**
   * 读取地图或 Element 菜单项目的当前状态。
   *
   * @param target 要查询的地图或 Element。
   * @param key 要查询的菜单项目标识。
   * @returns 项目状态快照，项目不存在时返回 `undefined`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const state = earth.contextMenu.getItemState('map', 'center');
   * ```
   */
  getItemState(target: ContextMenuStateTarget, key: string): ContextMenuItemState | undefined;
  /**
   * 更新地图或 Element 菜单项目的状态。
   *
   * @param target 要更新的地图或 Element。
   * @param key 要更新的菜单项目标识。
   * @param patch 可见和禁用状态的部分更新。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.setItemState('map', 'center', { disabled: true });
   * ```
   */
  setItemState(target: ContextMenuStateTarget, key: string, patch: Partial<ContextMenuItemState>): void;
  /**
   * 切换地图或 Element 菜单项目的状态。
   *
   * @param target 要更新的地图或 Element。
   * @param key 要切换状态的菜单项目标识。
   * @returns 切换后的菜单项目状态快照。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const state = earth.contextMenu.toggleItem('map', 'center');
   * ```
   */
  toggleItem(target: ContextMenuStateTarget, key: string): ContextMenuItemState;
  /**
   * 设置右键菜单主题。
   *
   * @param theme 要使用的明亮或暗色主题。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.setTheme('dark');
   * ```
   */
  setTheme(theme: 'light' | 'dark'): void;
  /**
   * 在明亮和暗色主题之间切换。
   *
   * @returns 切换后正在使用的主题名称。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const theme = earth.contextMenu.toggleTheme();
   * ```
   */
  toggleTheme(): 'light' | 'dark';
  /**
   * 清除指定 Element 保存的菜单项目状态。
   *
   * @param elementId 要清除菜单状态的 Element ID。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.clearElementState('target');
   * ```
   */
  clearElementState(elementId: string): void;
  /**
   * 关闭当前显示的右键菜单。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.close();
   * ```
   */
  close(): void;
}

/** 在公共菜单目标、回调上下文与内部状态之间完成转换。 */
export class ContextMenuFacade implements ContextMenuService {
  /** 管理菜单注册、状态和视图生命周期的内部服务。 */
  readonly #service: InternalContextMenuService;
  /** 校验归属并还原公共 Element 句柄。 */
  readonly #elements: ElementService;
  /** 还原菜单回调中的公共图层句柄。 */
  readonly #layers: LayerService;

  /** 绑定当前 Earth 的右键菜单、Element 和图层服务。 */
  constructor(service: InternalContextMenuService, elements: ElementService, layers: LayerService) {
    this.#service = service;
    this.#elements = elements;
    this.#layers = layers;
  }

  /**
   * 为地图、业务模块或 Element 注册右键菜单。
   *
   * @param target 菜单生效的地图、Element 或业务模块。
   * @param spec 菜单项目及其显示前和选择回调。
   * @returns 用于注销本次注册的控制句柄。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.register({ module: 'planning' }, { items: [{ key: 'remove', label: '删除' }] });
   * ```
   */
  register(target: ContextMenuTarget, spec: ContextMenuSpec): ContextMenuHandle {
    const inspected = inspectSpec(spec);
    return this.#service.register(toInternalTarget(target, this.#elements), {
      items: inspected.items,
      ...(inspected.before === undefined ? {} : { before: (context: InternalContextMenuItemContext) => inspected.before?.(this.#toPublic(context)) === true }),
      ...(inspected.onSelect === undefined ? {} : { onSelect: (context: InternalContextMenuItemContext) => inspected.onSelect?.(this.#toPublic(context)) })
    });
  }

  /**
   * 读取地图或 Element 菜单项目的当前状态。
   *
   * @param target 要查询的地图或 Element。
   * @param key 要查询的菜单项目标识。
   * @returns 项目状态快照，项目不存在时返回 `undefined`。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const state = earth.contextMenu.getItemState('map', 'remove');
   * ```
   */
  getItemState(target: ContextMenuStateTarget, key: string): ContextMenuItemState | undefined {
    return this.#service.getItemState(toInternalStateTarget(target, this.#elements), key);
  }

  /**
   * 更新地图或 Element 菜单项目的状态。
   *
   * @param target 要更新的地图或 Element。
   * @param key 要更新的菜单项目标识。
   * @param patch 可见和禁用状态的部分更新。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.setItemState('map', 'remove', { visible: false });
   * ```
   */
  setItemState(target: ContextMenuStateTarget, key: string, patch: Partial<ContextMenuItemState>): void {
    this.#service.setItemState(toInternalStateTarget(target, this.#elements), key, patch);
  }

  /**
   * 切换地图或 Element 菜单项目的状态。
   *
   * @param target 要更新的地图或 Element。
   * @param key 要切换状态的菜单项目标识。
   * @returns 切换后的菜单项目状态快照。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const state = earth.contextMenu.toggleItem('map', 'remove');
   * ```
   */
  toggleItem(target: ContextMenuStateTarget, key: string): ContextMenuItemState {
    return this.#service.toggleItem(toInternalStateTarget(target, this.#elements), key);
  }

  /**
   * 设置右键菜单主题。
   *
   * @param theme 要使用的明亮或暗色主题。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.setTheme('light');
   * ```
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.#service.setTheme(theme);
  }

  /**
   * 在明亮和暗色主题之间切换。
   *
   * @returns 切换后正在使用的主题名称。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * const theme = earth.contextMenu.toggleTheme();
   * ```
   */
  toggleTheme(): 'light' | 'dark' {
    return this.#service.toggleTheme();
  }

  /**
   * 清除指定 Element 保存的菜单项目状态。
   *
   * @param elementId 要清除菜单状态的 Element ID。
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.clearElementState('target');
   * ```
   */
  clearElementState(elementId: string): void {
    this.#service.clearElementState(elementId);
  }

  /**
   * 关闭当前显示的右键菜单。
   *
   *
   * @example
   * ```ts
   * import { useEarth } from '@vrsim/earth-engine-ol';
   *
   * const earth = useEarth();
   * earth.contextMenu.close();
   * ```
   */
  close(): void {
    this.#service.close();
  }

  /** @internal 销毁公共 Facade 及其内部右键菜单服务。 */
  destroy(): void {
    this.#service.destroy();
  }

  /** 将内部回调上下文转换为公共句柄和只读坐标。 */
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

/** 将公共注册目标转换为内部菜单目标。 */
function toInternalTarget(target: ContextMenuTarget, elements: ElementService): InternalContextMenuTarget {
  if (target === 'map') return Object.freeze({ kind: 'map' });
  if (isElementHandle(target)) return Object.freeze({ kind: 'element', elementId: currentElementId(target, elements) });
  const record = inspectModuleTarget(target);
  return Object.freeze({ kind: 'module', module: record.module });
}

/** 将公共状态目标转换为内部状态键。 */
function toInternalStateTarget(target: ContextMenuStateTarget, elements: ElementService): InternalContextMenuStateTarget {
  if (target === 'map') return Object.freeze({ kind: 'map' });
  if (isElementHandle(target)) return Object.freeze({ kind: 'element', elementId: currentElementId(target, elements) });
  throw new InvalidArgumentError('Context-menu state target must be map or Element');
}

/** 判断未知值是否为有效的公共 Element 句柄。 */
function isElementHandle(value: unknown): value is Element {
  return value !== null && typeof value === 'object' && elementHandleFeature(value as Element) !== undefined;
}

/** 校验 Element 归属，并返回当前代次的 ID。 */
function currentElementId(element: Element, elements: ElementService): string {
  const id = element.id;
  void element.state;
  const current = elements.get(id);
  if (current === undefined || elementHandleFeature(current) !== elementHandleFeature(element)) {
    throw new InvalidArgumentError(`Context-menu Element does not belong to this Earth: ${id}`);
  }
  return id;
}

/** 严格校验模块形式的菜单注册目标。 */
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

/** 校验菜单配置，并只接受数据属性形式的回调。 */
function inspectSpec(spec: ContextMenuSpec): {
  /** 校验后的只读菜单树。 */
  readonly items: readonly ContextMenuItemSpec[];
  /** 可选的显示前判断函数。 */
  readonly before?: (context: ContextMenuItemContext) => boolean;
  /** 可选的菜单选择函数。 */
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

/** 安全读取对象上的数据属性。 */
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

/** 安全读取并校验可选回调属性。 */
function optionalCallback(value: object, key: string): Function | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  const callback = dataValue(value, key);
  if (typeof callback !== 'function') throw new InvalidArgumentError(`Context-menu ${key} must be a function`);
  return callback;
}
