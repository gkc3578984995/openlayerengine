import type Earth from '../Earth.js';
import type Feature from 'ol/Feature.js';
import type { Coordinate } from 'ol/coordinate.js';
import type Geometry from 'ol/geom/Geometry.js';
import type Layer from 'ol/layer/Layer.js';
import type Source from 'ol/source/Source.js';
import { toLonLat } from 'ol/proj.js';
import type { EventsKey } from 'ol/events.js';
import { unByKey } from 'ol/Observable.js';

export interface IContextMenuOption {
  /** `true` 为夜间主题，省略或 `false` 为白天主题。 */
  isDarkTheme?: boolean;
}

export interface IContextMenuItem {
  /** 同一菜单树内唯一的菜单标识。 */
  key: string;
  /** 菜单显示文本。 */
  label: string;
  /** 菜单初始可见状态，省略时默认显示。 */
  visible?: boolean;
  /** 是否禁用叶子菜单项；带子菜单的项不支持该属性。 */
  disabled?: boolean;
  /** 与当前叶子菜单项互斥的菜单 key；带子菜单的项不支持该属性。 */
  mutexKey?: string;
  /** 子菜单。 */
  child?: IContextMenuItem[];
}

export interface IContextMenuCallbackParam {
  /** 当前被选中的菜单项。 */
  menu: IContextMenuItem;
  /** 菜单来源。 */
  scope: 'default' | 'module';
  /** 右键位置（经纬度）。 */
  position: Coordinate;
  /** 右键位置（像素坐标）。 */
  pixel: number[];
  /** 模块菜单对应的模块名称。 */
  module?: string;
  /** 模块菜单对应的要素 ID。 */
  featureId?: string;
  /** 当前命中的要素参数。 */
  param?: unknown;
  /** 当前命中的 OpenLayers 要素。 */
  feature?: Feature<Geometry>;
  /** 当前命中的 OpenLayers 图层。 */
  layer?: Layer<Source>;
}

export type ContextMenuCallback = (param: IContextMenuCallbackParam) => void;
/** 在模块菜单打开前校验可见叶子菜单项的权限；返回 `false` 会将该项置灰。 */
export type ContextMenuBefore = (param: IContextMenuCallbackParam) => boolean;

interface RegisteredMenu {
  items: IContextMenuItem[];
  callback?: ContextMenuCallback;
  before?: ContextMenuBefore;
}

type CurrentMenuContext = Omit<IContextMenuCallbackParam, 'menu'>;

/** 地图右键菜单。 */
export default class ContextMenu {
  private readonly earth: Earth;
  private defaultMenu?: RegisteredMenu;
  private readonly moduleMenus = new Map<string, RegisteredMenu>();
  private readonly defaultMenuState = new Map<string, boolean>();
  private readonly moduleMenuState = new Map<string, Map<string, Map<string, boolean>>>();
  private root?: HTMLDivElement;
  private currentItems = new Map<string, IContextMenuItem>();
  private currentContext?: CurrentMenuContext;
  private anchorCoordinate?: Coordinate;
  private menuPositionKey?: EventsKey;
  private isDarkTheme: boolean;

  constructor(earth: Earth, option: IContextMenuOption = {}) {
    this.earth = earth;
    this.isDarkTheme = option.isDarkTheme ?? false;
    this.watchContextMenu();
    this.menuPositionKey = this.earth.map.on('postrender', this.syncMenuPosition);
  }

  /** 注册或替换默认菜单。 */
  addDefaultMenu(items: IContextMenuItem[], callback?: ContextMenuCallback): boolean {
    if (!this.isValidMenuList(items)) return false;
    this.defaultMenu = { items, callback };
    this.defaultMenuState.clear();
    return true;
  }

  /**
   * 注册或替换指定模块的菜单。
   * @param before 菜单展示前的权限守卫；返回 `false` 时对应叶子菜单项会置灰且不可点击。
   */
  addModuleMenu(module: string, items: IContextMenuItem[], callback?: ContextMenuCallback, before?: ContextMenuBefore): boolean {
    if (!module || !this.isValidMenuList(items)) return false;
    this.moduleMenus.set(module, { items, callback, before });
    this.moduleMenuState.delete(module);
    return true;
  }

  /** 移除默认菜单及其运行时状态。 */
  removeDefaultMenu(): boolean {
    const removed = this.defaultMenu !== undefined;
    this.defaultMenu = undefined;
    this.defaultMenuState.clear();
    if (this.currentContext?.scope === 'default') this.close();
    return removed;
  }

  /** 移除指定模块菜单及其所有要素状态。 */
  removeModuleMenu(module: string): boolean {
    const removed = this.moduleMenus.delete(module);
    this.moduleMenuState.delete(module);
    if (this.currentContext?.scope === 'module' && this.currentContext.module === module) this.close();
    return removed;
  }

  /** 清理指定模块要素的菜单状态。 */
  clearModuleMenuState(module: string, featureId: string): boolean {
    const moduleState = this.moduleMenuState.get(module);
    if (!moduleState) return false;
    const removed = moduleState.delete(featureId);
    if (moduleState.size === 0) this.moduleMenuState.delete(module);
    return removed;
  }

  /** 获取默认菜单项的当前可见状态。 */
  getDefaultMenuState(menuKey: string): boolean {
    const item = this.findMenuItem(this.defaultMenu?.items, menuKey);
    return item ? (this.defaultMenuState.get(menuKey) ?? item.visible ?? true) : false;
  }

  /** 设置默认菜单项的可见状态，同时同步互斥项。 */
  setDefaultMenuState(menuKey: string, visible: boolean): boolean {
    const item = this.findMenuItem(this.defaultMenu?.items, menuKey);
    if (!item) return false;
    this.defaultMenuState.set(menuKey, visible);
    if (item.mutexKey) this.defaultMenuState.set(item.mutexKey, !visible);
    return true;
  }

  /** 切换默认菜单项的可见状态，并返回切换后的状态。 */
  toggleDefaultMenuState(menuKey: string): boolean {
    const next = !this.getDefaultMenuState(menuKey);
    return this.setDefaultMenuState(menuKey, next) ? next : false;
  }

  /** 获取指定模块要素菜单项的当前可见状态。 */
  getModuleMenuState(module: string, featureId: string, menuKey: string): boolean {
    const item = this.findMenuItem(this.moduleMenus.get(module)?.items, menuKey);
    const state = this.moduleMenuState.get(module)?.get(featureId);
    return item ? (state?.get(menuKey) ?? item.visible ?? true) : false;
  }

  /** 设置指定模块要素菜单项的可见状态，同时同步互斥项。 */
  setModuleMenuState(module: string, featureId: string, menuKey: string, visible: boolean): boolean {
    const item = this.findMenuItem(this.moduleMenus.get(module)?.items, menuKey);
    if (!module || !featureId || !item) return false;
    const state = this.getFeatureState(module, featureId);
    state.set(menuKey, visible);
    if (item.mutexKey) state.set(item.mutexKey, !visible);
    return true;
  }

  /** 切换指定模块要素菜单项的可见状态，并返回切换后的状态。 */
  toggleModuleMenuState(module: string, featureId: string, menuKey: string): boolean {
    const next = !this.getModuleMenuState(module, featureId, menuKey);
    return this.setModuleMenuState(module, featureId, menuKey, next) ? next : false;
  }

  /** 设置菜单主题。`true` 为夜间，`false` 为白天。 */
  setTheme(isDarkTheme: boolean): void {
    this.isDarkTheme = isDarkTheme;
    this.applyTheme();
  }

  /** 切换菜单主题，并返回切换后的夜间主题状态。 */
  toggleTheme(): boolean {
    this.setTheme(!this.isDarkTheme);
    return this.isDarkTheme;
  }

  /** 关闭当前菜单。 */
  close(): void {
    if (this.root) this.root.style.display = 'none';
    this.currentItems.clear();
    this.currentContext = undefined;
    this.anchorCoordinate = undefined;
  }

  /** 兼容原有骨架方法：传入模块时移除模块菜单，否则移除默认菜单。 */
  remove(module?: string): boolean {
    return module ? this.removeModuleMenu(module) : this.removeDefaultMenu();
  }

  /** 销毁菜单、运行时状态与 DOM 监听。 */
  destroy(): void {
    const viewport = this.earth.map.getViewport?.();
    viewport?.removeEventListener('contextmenu', this.handleContextMenu);
    if (this.menuPositionKey) unByKey(this.menuPositionKey);
    this.menuPositionKey = undefined;
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
      document.removeEventListener('keydown', this.handleKeyDown);
    }
    this.root?.removeEventListener('click', this.handleMenuClick);
    this.root?.removeEventListener('pointerdown', this.stopMenuEvent);
    this.root?.removeEventListener('mousedown', this.stopMenuEvent);
    this.root?.removeEventListener('pointerup', this.stopMenuEvent);
    this.root?.removeEventListener('mouseup', this.stopMenuEvent);
    this.root?.removeEventListener('contextmenu', this.stopMenuEvent);
    this.root?.remove();
    this.root = undefined;
    this.defaultMenu = undefined;
    this.moduleMenus.clear();
    this.defaultMenuState.clear();
    this.moduleMenuState.clear();
    this.currentItems.clear();
    this.currentContext = undefined;
    this.anchorCoordinate = undefined;
  }

  private watchContextMenu(): void {
    const viewport = this.earth.map.getViewport?.();
    viewport?.addEventListener('contextmenu', this.handleContextMenu);
  }

  private handleContextMenu = (event: MouseEvent): void => {
    const pixel = this.earth.map.getEventPixel(event);
    const hit = this.earth.getFeatureAtPixel(pixel);
    const module = hit.module;
    const moduleMenu = module ? this.moduleMenus.get(module) : undefined;
    const menu = moduleMenu || this.defaultMenu;
    if (!menu) return;

    event.preventDefault();
    const scope: CurrentMenuContext['scope'] = moduleMenu ? 'module' : 'default';
    const feature = hit.feature as Feature<Geometry> | undefined;
    const coordinate = this.earth.map.getEventCoordinate(event);
    this.anchorCoordinate = coordinate;
    this.currentContext = {
      scope,
      position: toLonLat(coordinate),
      pixel,
      ...(scope === 'module'
        ? {
            module,
            featureId: hit.id,
            feature,
            param: feature?.get('param'),
            layer: hit.layer
          }
        : {})
    };
    this.show(menu.items, scope);
  };

  private handleMenuClick = (event: MouseEvent): void => {
    this.stopMenuEvent(event);
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('button[data-menu-key]');
    const menuKey = button?.dataset.menuKey;
    const menu = menuKey ? this.currentItems.get(menuKey) : undefined;
    const context = this.currentContext;
    if (!button || button.disabled || !menu || !context) return;

    const registeredMenu = context.scope === 'module' ? this.moduleMenus.get(context.module || '') : this.defaultMenu;
    const callbackParam = { ...context, menu };
    this.updateMutexMenuState(context, menu);
    try {
      registeredMenu?.callback?.(callbackParam);
    } finally {
      this.close();
    }
  };

  private handleDocumentPointerDown = (event: PointerEvent): void => {
    if (this.root && event.target instanceof Node && !this.root.contains(event.target)) this.close();
  };

  private stopMenuEvent = (event: Event): void => {
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.close();
  };

  private syncMenuPosition = (): void => {
    if (!this.root || this.root.style.display === 'none' || !this.anchorCoordinate) return;
    const pixel = this.earth.map.getPixelFromCoordinate(this.anchorCoordinate);
    if (!pixel) return;
    this.root.style.left = `${pixel[0]}px`;
    this.root.style.top = `${pixel[1]}px`;
  };

  private show(items: IContextMenuItem[], scope: CurrentMenuContext['scope']): void {
    this.ensureRoot();
    if (!this.root || !this.currentContext) return;
    this.currentItems.clear();
    this.root.replaceChildren(this.renderMenuList(items, scope));
    if (this.currentItems.size === 0) {
      this.close();
      return;
    }
    this.root.style.display = 'block';
    this.syncMenuPosition();
  }

  private renderMenuList(items: IContextMenuItem[], scope: CurrentMenuContext['scope']): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'ol-context-menu__list';
    items.forEach((item) => {
      if (!this.isItemVisible(item, scope)) return;
      const child = item.child?.length ? this.renderMenuList(item.child, scope) : undefined;
      if (item.child?.length && !child?.childElementCount) return;
      const listItem = document.createElement('li');
      listItem.className = 'ol-context-menu__item';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      if (child) {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
      } else {
        button.dataset.menuKey = item.key;
        button.disabled = this.isItemDisabled(item, scope);
        this.currentItems.set(item.key, item);
      }
      listItem.appendChild(button);
      if (child) {
        listItem.classList.add('ol-context-menu__item--has-child');
        child.classList.add('ol-context-menu__child');
        listItem.appendChild(child);
      }
      list.appendChild(listItem);
    });
    return list;
  }

  private isItemVisible(item: IContextMenuItem, scope: CurrentMenuContext['scope']): boolean {
    if (scope === 'default') return this.defaultMenuState.get(item.key) ?? item.visible ?? true;
    const { module, featureId } = this.currentContext || {};
    return module && featureId ? this.getModuleMenuState(module, featureId, item.key) : false;
  }

  private isItemDisabled(item: IContextMenuItem, scope: CurrentMenuContext['scope']): boolean {
    if (item.disabled) return true;
    if (scope !== 'module' || !this.currentContext) return false;
    const registeredMenu = this.moduleMenus.get(this.currentContext.module || '');
    if (!registeredMenu?.before) return false;
    try {
      return !registeredMenu.before({ ...this.currentContext, menu: item });
    } catch {
      return true;
    }
  }

  private updateMutexMenuState(context: CurrentMenuContext, item: IContextMenuItem): void {
    if (!item.mutexKey) return;
    if (context.scope === 'default') {
      this.setDefaultMenuState(item.key, false);
      return;
    }
    if (context.module && context.featureId) this.setModuleMenuState(context.module, context.featureId, item.key, false);
  }

  private ensureRoot(): void {
    if (this.root || typeof document === 'undefined') return;
    const viewport = this.earth.map.getViewport?.();
    if (!viewport) return;
    this.root = document.createElement('div');
    this.root.className = 'ol-context-menu';
    this.root.setAttribute('role', 'menu');
    this.root.style.display = 'none';
    this.root.addEventListener('click', this.handleMenuClick);
    this.root.addEventListener('pointerdown', this.stopMenuEvent);
    this.root.addEventListener('mousedown', this.stopMenuEvent);
    this.root.addEventListener('pointerup', this.stopMenuEvent);
    this.root.addEventListener('mouseup', this.stopMenuEvent);
    this.root.addEventListener('contextmenu', this.stopMenuEvent);
    viewport.appendChild(this.root);
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
    document.addEventListener('keydown', this.handleKeyDown);
    this.applyTheme();
  }

  private applyTheme(): void {
    this.root?.classList.toggle('ol-context-menu--dark', this.isDarkTheme);
    this.root?.classList.toggle('ol-context-menu--light', !this.isDarkTheme);
  }

  private getFeatureState(module: string, featureId: string): Map<string, boolean> {
    let moduleState = this.moduleMenuState.get(module);
    if (!moduleState) {
      moduleState = new Map();
      this.moduleMenuState.set(module, moduleState);
    }
    let featureState = moduleState.get(featureId);
    if (!featureState) {
      featureState = new Map();
      moduleState.set(featureId, featureState);
    }
    return featureState;
  }

  private findMenuItem(items: IContextMenuItem[] | undefined, key: string): IContextMenuItem | undefined {
    if (!items) return undefined;
    for (const item of items) {
      if (item.key === key) return item;
      const child = this.findMenuItem(item.child, key);
      if (child) return child;
    }
    return undefined;
  }

  private isValidMenuList(items: IContextMenuItem[]): boolean {
    const keys = new Set<string>();
    const mutexKeys: string[] = [];
    const visit = (current: IContextMenuItem[]): boolean => {
      for (const item of current) {
        if (!item.key || !item.label || keys.has(item.key)) return false;
        keys.add(item.key);
        if (item.child?.length && (item.disabled !== undefined || item.mutexKey !== undefined)) return false;
        if (item.mutexKey) mutexKeys.push(item.mutexKey);
        if (item.child && !visit(item.child)) return false;
      }
      return true;
    };
    return Array.isArray(items) && visit(items) && mutexKeys.every((key) => keys.has(key));
  }
}
