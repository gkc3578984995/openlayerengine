import Feature from 'ol/Feature.js';
import type OlMap from 'ol/Map.js';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenuViewAdapter } from '../src/adapters/dom/ContextMenuViewAdapter.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { createTransientNativeRef } from '../src/core/native/types.js';
import type { ContextMenuViewEvent, ContextMenuViewModel, ContextMenuViewPort } from '../src/core/ports/ContextMenuViewPort.js';
import type { InputEventMap, InputPort, InputType } from '../src/core/ports/InputPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { ContextMenuFacade, type ContextMenuItemSpec } from '../src/facade/ContextMenuFacade.js';
import { constructElementHandle, type Element } from '../src/facade/Element.js';
import type { ElementService, LayerService } from '../src/facade/types.js';
import { ContextMenuService } from '../src/services/context-menu/ContextMenuService.js';
import { EventService } from '../src/services/events/EventService.js';
import { InputRouter } from '../src/services/events/InputRouter.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

type InputListener = (event: InputEventMap[InputType]) => void;

class FakeInputPort implements InputPort {
  readonly listeners = new Map<InputType, InputListener>();

  listen<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.listeners.set(type, listener as InputListener);
    return () => this.listeners.delete(type);
  }

  emit<T extends InputType>(type: T, event: InputEventMap[T]): void {
    this.listeners.get(type)?.(event);
  }
}

class FakeContextMenuView implements ContextMenuViewPort {
  model: ContextMenuViewModel | undefined;
  theme: 'light' | 'dark' = 'light';
  #listener: ((event: ContextMenuViewEvent) => void) | undefined;

  listen(listener: (event: ContextMenuViewEvent) => void): () => void {
    this.#listener = listener;
    return () => {
      if (this.#listener === listener) this.#listener = undefined;
    };
  }

  show(model: ContextMenuViewModel): void {
    this.model = model;
  }

  close(): void {
    this.model = undefined;
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
  }

  destroy(): void {
    this.model = undefined;
    this.#listener = undefined;
  }

  emit(event: ContextMenuViewEvent): void {
    this.#listener?.(event);
  }
}

const nativeEventRef = createTransientNativeRef('input-event');

function element(overrides: Partial<ElementState> = {}): ElementState {
  return {
    id: 'a',
    type: 'point',
    geometry: { type: 'point', controlPoints: [[1, 2]] },
    style: { symbol: { type: 'circle', radius: 5, fill: { type: 'solid', color: '#f00' } } },
    data: { owner: 'first' },
    module: 'vehicle',
    layerId: 'layer-a',
    visible: true,
    ...overrides
  };
}

function createHarness<View extends ContextMenuViewPort>(view: View) {
  const port = new FakeInputPort();
  const router = new InputRouter(port);
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  store.add(element());
  store.add(element({ id: 'b', data: { owner: 'second' }, layerId: 'layer-b' }));
  const events = new EventService(router, store, vi.fn());
  const menus = new ContextMenuService(events, store, view, vi.fn());
  const handles = new Map<string, Element>();
  for (const id of ['a', 'b']) {
    const feature = new Feature();
    handles.set(
      id,
      constructElementHandle({
        id,
        feature,
        isCurrent: () => store.get(id) !== undefined,
        getState: () => {
          const state = store.get(id);
          if (state === undefined) throw new Error(`Element 已移除：${id}`);
          return state;
        },
        update: vi.fn(),
        remove: vi.fn(),
        removedByHandle: false
      })
    );
  }
  const elements = { get: (id: string) => handles.get(id) } as unknown as ElementService;
  const layers = { get: () => undefined } as unknown as LayerService;
  const facade = new ContextMenuFacade(menus, elements, layers);
  const rightclick = (elementId?: string): void => {
    port.emit('rightclick', {
      type: 'rightclick',
      coordinate: Object.freeze([120, 39]),
      pixel: Object.freeze([100, 100]),
      ...(elementId === undefined ? {} : { elementId }),
      nativeEventRef
    });
  };
  const destroy = (): void => {
    menus.destroy();
    events.destroy();
    router.destroy();
  };
  return { destroy, facade, handles, menus, rightclick, store, view };
}

function requireHandle(handles: ReadonlyMap<string, Element>, id: string): Element {
  const handle = handles.get(id);
  if (handle === undefined) throw new Error(`测试句柄不存在：${id}`);
  return handle;
}

const vehicleMenus: readonly ContextMenuItemSpec[] = [
  { key: 'openTrack', label: '查看航迹', visible: true, mutexKey: 'closeTrack' },
  { key: 'closeTrack', label: '关闭航迹', visible: false, mutexKey: 'openTrack' },
  {
    key: 'openInfo',
    label: '查看信息',
    children: [{ key: 'openData', label: '查看数据' }]
  }
];

describe('ContextMenuFacade 与 ContextMenuService 状态回归', () => {
  coversCapabilities(
    'contextmenu-default-menu',
    'contextmenu-module-menu',
    'contextmenu-nested-items',
    'contextmenu-disabled-items',
    'contextmenu-before-guard',
    'contextmenu-default-item-state',
    'contextmenu-feature-item-state',
    'contextmenu-mutex-state',
    'contextmenu-theme',
    'contextmenu-callback-payload',
    'contextmenu-close-triggers',
    'contextmenu-event-isolation'
  );

  it('按元素隔离模块菜单状态并同步互斥项', () => {
    const harness = createHarness(new FakeContextMenuView());
    const first = requireHandle(harness.handles, 'a');
    const second = requireHandle(harness.handles, 'b');
    harness.facade.register({ module: 'vehicle' }, { items: vehicleMenus });

    expect(harness.facade.getItemState(first, 'openTrack')?.visible).toBe(true);
    expect(harness.facade.getItemState(first, 'closeTrack')?.visible).toBe(false);
    expect(harness.facade.toggleItem(first, 'openTrack').visible).toBe(false);
    expect(harness.facade.getItemState(first, 'closeTrack')?.visible).toBe(true);
    expect(harness.facade.getItemState(second, 'openTrack')?.visible).toBe(true);

    harness.facade.clearElementState('a');
    expect(harness.facade.getItemState(first, 'openTrack')?.visible).toBe(true);
    harness.destroy();
  });

  it('独立保存地图菜单状态并支持明暗主题切换', () => {
    const harness = createHarness(new FakeContextMenuView());
    harness.facade.register('map', { items: [{ key: 'measure', label: '测量', visible: true }] });

    harness.facade.setItemState('map', 'measure', { visible: false });
    expect(harness.facade.getItemState('map', 'measure')).toEqual({ visible: false, disabled: false });
    expect(harness.facade.toggleTheme()).toBe('dark');
    expect(harness.view.theme).toBe('dark');
    expect(harness.facade.toggleTheme()).toBe('light');
    expect(harness.view.theme).toBe('light');
    harness.destroy();
  });

  it('拒绝重复 key 和无法解析互斥项的菜单树', () => {
    const harness = createHarness(new FakeContextMenuView());

    expect(() =>
      harness.facade.register('map', {
        items: [
          { key: 'duplicate', label: 'a' },
          { key: 'duplicate', label: 'b' }
        ]
      })
    ).toThrow(InvalidArgumentError);
    expect(() => harness.facade.register({ module: 'vehicle' }, { items: [{ key: 'track', label: '查看航迹', mutexKey: 'missing' }] })).toThrow(
      InvalidArgumentError
    );
    harness.destroy();
  });

  it('在展示模块菜单前执行公开权限守卫并禁用无权限项', () => {
    const harness = createHarness(new FakeContextMenuView());
    const before = vi.fn(() => false);
    harness.facade.register({ module: 'vehicle' }, { items: [{ key: 'open', label: '打开' }], before });

    harness.rightclick('a');

    expect(harness.view.model?.items).toEqual([{ key: 'open', label: '打开', disabled: true }]);
    expect(before).toHaveBeenCalledWith(expect.objectContaining({ item: { key: 'open', label: '打开' }, element: requireHandle(harness.handles, 'a') }));
    harness.destroy();
  });

  it('在公开选择回调前切换互斥状态并在选择后关闭菜单', () => {
    const harness = createHarness(new FakeContextMenuView());
    const first = requireHandle(harness.handles, 'a');
    const observed: boolean[] = [];
    const callback = vi.fn(() => observed.push(harness.facade.getItemState(first, 'openTrack')?.visible ?? true));
    harness.facade.register({ module: 'vehicle' }, { items: vehicleMenus, onSelect: callback });

    harness.rightclick('a');
    harness.view.emit({ type: 'select', key: 'openTrack' });

    expect(observed).toEqual([false]);
    expect(harness.facade.getItemState(first, 'closeTrack')?.visible).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(harness.view.model).toBeUndefined();
    harness.destroy();
  });

  it('仅对叶子项执行权限判断且不把父菜单注册为动作', () => {
    const harness = createHarness(new FakeContextMenuView());
    const callback = vi.fn();
    const before = vi.fn((context: { readonly item: ContextMenuItemSpec }) => context.item.key !== 'openData');
    harness.facade.register({ module: 'vehicle' }, { items: [vehicleMenus[2]], before, onSelect: callback });

    harness.rightclick('a');
    const parent = harness.view.model?.items[0];

    expect(parent).toMatchObject({ key: 'openInfo', children: [{ key: 'openData', disabled: true }] });
    expect(before).toHaveBeenCalledTimes(1);
    expect(before).toHaveBeenCalledWith(
      expect.objectContaining({ item: expect.objectContaining({ key: 'openData' }), element: requireHandle(harness.handles, 'a') })
    );
    harness.view.emit({ type: 'select', key: 'openInfo' });
    harness.view.emit({ type: 'select', key: 'openData' });
    expect(callback).not.toHaveBeenCalled();
    harness.destroy();
  });

  it('真实 DOM 视图阻断菜单 pointerdown 冒泡到地图视口', () => {
    const fakeDocument = new FakeDocument();
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('Element', FakeDomElement);
    vi.stubGlobal('Node', FakeDomElement);
    let destroy: (() => void) | undefined;
    try {
      const map = new MenuMapHarness();
      const harness = createHarness(new ContextMenuViewAdapter(map as unknown as OlMap));
      destroy = harness.destroy;
      harness.facade.register('map', { items: [{ key: 'map', label: '地图菜单' }] });
      harness.rightclick();
      const root = map.viewport.children[0];
      if (root === undefined) throw new Error('菜单根节点未创建');
      const viewportPointerDown = vi.fn();
      map.viewport.addEventListener('pointerdown', viewportPointerDown);
      const event = fakeEvent('pointerdown', root);

      root.dispatchEvent(event);

      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(viewportPointerDown).not.toHaveBeenCalled();
    } finally {
      destroy?.();
      vi.unstubAllGlobals();
    }
  });
});

interface FakeMenuEvent {
  readonly type: string;
  target: unknown;
  cancelBubble: boolean;
  readonly preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation(): void;
}

type FakeMenuListener = (event: FakeMenuEvent) => void;

function fakeEvent(type: string, target: unknown): FakeMenuEvent {
  return {
    type,
    target,
    cancelBubble: false,
    preventDefault: vi.fn(),
    stopPropagation() {
      this.cancelBubble = true;
    }
  };
}

class FakeClassList {
  readonly values = new Set<string>();

  add(...names: string[]): void {
    names.forEach((name) => this.values.add(name));
  }

  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class FakeDomElement {
  readonly children: FakeDomElement[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, FakeMenuListener[]>();
  parent: FakeDomElement | undefined;
  className = '';
  textContent = '';
  disabled = false;
  type = '';

  constructor(readonly tagName: string) {}

  setAttribute(): void {}

  appendChild(child: FakeDomElement): FakeDomElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeDomElement[]): void {
    this.children.splice(0).forEach((child) => (child.parent = undefined));
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type: string, listener: FakeMenuListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: FakeMenuListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener)
    );
  }

  dispatchEvent(event: FakeMenuEvent): boolean {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    if (!event.cancelBubble) this.parent?.dispatchEvent(event);
    return true;
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  closest(selector: string): FakeDomElement | null {
    if (selector === 'button[data-menu-key]' && this.dataset.menuKey !== undefined) return this;
    return this.parent?.closest(selector) ?? null;
  }

  remove(): void {
    if (this.parent === undefined) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = undefined;
  }
}

class FakeDocument extends FakeDomElement {
  constructor() {
    super('document');
  }

  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName);
  }
}

class MenuMapHarness {
  readonly viewport = new FakeDomElement('viewport');
  readonly listeners = new Map<string, Set<() => void>>();

  getViewport(): FakeDomElement {
    return this.viewport;
  }

  getPixelFromCoordinate(): readonly [number, number] {
    return [20, 40];
  }

  on(type: string, listener: () => void): void {
    let listeners = this.listeners.get(type);
    if (listeners === undefined) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
  }

  un(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
}
