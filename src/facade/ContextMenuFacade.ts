import type { Coordinate, Pixel } from '../core/common/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { InternalContextMenuItemContext, InternalContextMenuStateTarget, InternalContextMenuTarget } from '../services/context-menu/types.js';
import type { ContextMenuService as InternalContextMenuService } from '../services/context-menu/ContextMenuService.js';
import { Element, elementHandleFeature } from './Element.js';
import type { Layer } from './Layer.js';
import type { ElementService, LayerService } from './types.js';

/** 右键菜单注册目标。接受地图、元素或业务模块。 */
export type ContextMenuTarget = 'map' | Element | Readonly<Record<'module', string>>;

/** 右键菜单状态目标。接受地图或元素。 */
export type ContextMenuStateTarget = 'map' | Element;

/** 单个右键菜单项目的配置。 */
export interface ContextMenuItemSpec {
  /** 项目标识。用于查询、更新和触发菜单项目。 */
  readonly key: string;
  /** 项目文本。指定菜单中展示的名称。 */
  readonly label: string;
  /** 可见状态。控制菜单项目是否显示。 */
  readonly visible?: boolean;
  /** 禁用状态。控制菜单项目是否不可操作。 */
  readonly disabled?: boolean;
  /** 互斥项目。当前项目显隐变化时，反向切换指定项目的可见状态。 */
  readonly mutexKey?: string;
  /** 子级项目。定义当前项目包含的嵌套菜单。 */
  readonly children?: readonly ContextMenuItemSpec[];
}

/** 右键菜单项目回调接收的公开上下文。 */
export interface ContextMenuItemContext {
  /** 菜单项目。提供当前处理项目的只读配置。 */
  readonly item: ContextMenuItemSpec;
  /** 命中范围。表示菜单来自地图、业务模块或元素。 */
  readonly scope: 'map' | 'module' | 'element';
  /** 地图坐标。提供右键发生位置的坐标快照。 */
  readonly coordinate: Coordinate;
  /** 屏幕像素。提供右键相对地图视口的像素位置。 */
  readonly pixel: Pixel;
  /** 命中元素。右键命中受管理元素时提供其实时句柄。 */
  readonly element?: Element;
  /** 业务模块。命中元素带有模块标识时提供该值。 */
  readonly module?: string;
  /** 命中图层。命中元素时提供所属图层句柄。 */
  readonly layer?: Layer;
}

/** 一组右键菜单项目及其回调配置。 */
export interface ContextMenuSpec {
  /** 菜单项目。定义当前目标可展示的菜单树。 */
  readonly items: readonly ContextMenuItemSpec[];
  /** 显示前回调。返回 `true` 时项目可用，返回其他值或抛错时项目仍显示但会禁用。 */
  readonly before?: (context: ContextMenuItemContext) => boolean;
  /** 选择回调。用户选择可用菜单项目后调用。 */
  readonly onSelect?: (context: ContextMenuItemContext) => void;
}

/** 右键菜单项目的可变状态。 */
export interface ContextMenuItemState {
  /** 可见状态。表示菜单项目当前是否显示。 */
  readonly visible: boolean;
  /** 禁用状态。表示菜单项目当前是否不可操作。 */
  readonly disabled: boolean;
}

/** 一次右键菜单注册的公开句柄。 */
export interface ContextMenuHandle {
  /**
   * 注销本次右键菜单注册。
   *
   * @returns 无返回值。
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

/** 右键菜单能力的公开入口。 */
export interface ContextMenuService {
  /**
   * 为地图、模块或元素注册右键菜单。
   *
   * @param target 注册目标。指定菜单生效的地图、元素或业务模块。
   * @param spec 菜单配置。指定菜单项目及其显示前和选择回调。
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
   * 读取地图或元素菜单项目的当前状态。
   *
   * @param target 查询目标。指定要查询的地图或元素。
   * @param key 项目标识。指定要查询的菜单项目。
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
   * 更新地图或元素菜单项目的状态。
   *
   * @param target 更新目标。指定要更新的地图或元素。
   * @param key 项目标识。指定要更新的菜单项目。
   * @param patch 状态更新。指定可见和禁用状态的部分更新。
   * @returns 无返回值。
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
   * 切换地图或元素菜单项目的状态。
   *
   * @param target 更新目标。指定要更新的地图或元素。
   * @param key 项目标识。指定要切换状态的菜单项目。
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
   * @param theme 菜单主题。指定要使用的明亮或暗色主题。
   * @returns 无返回值。
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
   * 清除指定元素保存的菜单项目状态。
   *
   * @param elementId 元素 ID。指定要清除菜单状态的元素。
   * @returns 无返回值。
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
   * @returns 无返回值。
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

/** 将公开菜单目标和回调上下文转换为内部状态的门面。 */
export class ContextMenuFacade implements ContextMenuService {
  /** 内部服务。负责菜单注册、状态和视图生命周期。 */
  readonly #service: InternalContextMenuService;
  /** 元素服务。用于校验归属并还原公开元素句柄。 */
  readonly #elements: ElementService;
  /** 图层服务。用于还原菜单回调中的公开图层句柄。 */
  readonly #layers: LayerService;

  /** 创建右键菜单门面并绑定 Earth 范围内的服务。 */
  constructor(service: InternalContextMenuService, elements: ElementService, layers: LayerService) {
    this.#service = service;
    this.#elements = elements;
    this.#layers = layers;
  }

  /**
   * 为地图、模块或元素注册右键菜单。
   *
   * @param target 注册目标。指定菜单生效的地图、元素或业务模块。
   * @param spec 菜单配置。指定菜单项目及其显示前和选择回调。
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
   * 读取地图或元素菜单项目的当前状态。
   *
   * @param target 查询目标。指定要查询的地图或元素。
   * @param key 项目标识。指定要查询的菜单项目。
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
   * 更新地图或元素菜单项目的状态。
   *
   * @param target 更新目标。指定要更新的地图或元素。
   * @param key 项目标识。指定要更新的菜单项目。
   * @param patch 状态更新。指定可见和禁用状态的部分更新。
   * @returns 无返回值。
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
   * 切换地图或元素菜单项目的状态。
   *
   * @param target 更新目标。指定要更新的地图或元素。
   * @param key 项目标识。指定要切换状态的菜单项目。
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
   * @param theme 菜单主题。指定要使用的明亮或暗色主题。
   * @returns 无返回值。
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
   * 清除指定元素保存的菜单项目状态。
   *
   * @param elementId 元素 ID。指定要清除菜单状态的元素。
   * @returns 无返回值。
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
   * @returns 无返回值。
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

  /** @internal 销毁右键菜单门面及其内部服务。 */
  destroy(): void {
    this.#service.destroy();
  }

  /** 将内部菜单回调上下文转换为公开句柄和只读坐标。 */
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

/** 将公开注册目标转换为内部菜单目标。 */
function toInternalTarget(target: ContextMenuTarget, elements: ElementService): InternalContextMenuTarget {
  if (target === 'map') return Object.freeze({ kind: 'map' });
  if (isElementHandle(target)) return Object.freeze({ kind: 'element', elementId: currentElementId(target, elements) });
  const record = inspectModuleTarget(target);
  return Object.freeze({ kind: 'module', module: record.module });
}

/** 将公开状态目标转换为内部状态键。 */
function toInternalStateTarget(target: ContextMenuStateTarget, elements: ElementService): InternalContextMenuStateTarget {
  if (target === 'map') return Object.freeze({ kind: 'map' });
  if (isElementHandle(target)) return Object.freeze({ kind: 'element', elementId: currentElementId(target, elements) });
  throw new InvalidArgumentError('Context-menu state target must be map or Element');
}

/** 判断未知值是否为有效的公开元素句柄。 */
function isElementHandle(value: unknown): value is Element {
  return value !== null && typeof value === 'object' && elementHandleFeature(value as Element) !== undefined;
}

/** 校验元素归属并返回其当前 ID。 */
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

/** 校验菜单配置并保留数据属性形式的回调。 */
function inspectSpec(spec: ContextMenuSpec): {
  /** 菜单项目。保存校验后的只读菜单树。 */
  readonly items: readonly ContextMenuItemSpec[];
  /** 显示前回调。保存可选的显示判断函数。 */
  readonly before?: (context: ContextMenuItemContext) => boolean;
  /** 选择回调。保存可选的菜单选择函数。 */
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
