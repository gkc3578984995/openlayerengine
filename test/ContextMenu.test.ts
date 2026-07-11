/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi } from 'vitest';
import ContextMenu, { IContextMenuItem } from '../src/components/ContextMenu';

function makeContextMenu(): ContextMenu {
  const viewport = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  };
  const earth = {
    map: {
      getViewport: () => viewport,
      on: () => undefined
    }
  } as any;
  return new ContextMenu(earth);
}

const vehicleMenus: IContextMenuItem[] = [
  { key: 'openTrack', label: '查看航迹', visible: true, mutexKey: 'closeTrack' },
  { key: 'closeTrack', label: '关闭航迹', visible: false, mutexKey: 'openTrack' },
  {
    key: 'openInfo',
    label: '查看信息',
    child: [{ key: 'openData', label: '查看数据' }]
  }
];

function setModuleContext(menu: ContextMenu, featureId = 'car-01') {
  const contextMenu = menu as any;
  contextMenu.currentContext = {
    scope: 'module',
    position: [120, 39],
    pixel: [100, 100],
    module: 'vehicle',
    featureId
  };
  return contextMenu;
}

function withFakeDocument<T>(callback: () => T): T {
  const originalDocument = globalThis.document;
  const createElement = () => {
    const element: any = {
      children: [] as any[],
      className: '',
      classList: { add: vi.fn() },
      dataset: {},
      setAttribute: vi.fn(),
      appendChild(child: any) {
        this.children.push(child);
      }
    };
    Object.defineProperty(element, 'childElementCount', { get: () => element.children.length });
    return element;
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement } });
  try {
    return callback();
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  }
}

describe('ContextMenu 状态', () => {
  it('按模块和要素 ID 隔离状态，同时同步互斥菜单项', () => {
    const menu = makeContextMenu();
    expect(menu.addModuleMenu('vehicle', vehicleMenus)).toBe(true);

    expect(menu.getModuleMenuState('vehicle', 'car-01', 'openTrack')).toBe(true);
    expect(menu.getModuleMenuState('vehicle', 'car-01', 'closeTrack')).toBe(false);
    expect(menu.toggleModuleMenuState('vehicle', 'car-01', 'openTrack')).toBe(false);
    expect(menu.getModuleMenuState('vehicle', 'car-01', 'closeTrack')).toBe(true);
    expect(menu.getModuleMenuState('vehicle', 'car-02', 'openTrack')).toBe(true);

    expect(menu.clearModuleMenuState('vehicle', 'car-01')).toBe(true);
    expect(menu.getModuleMenuState('vehicle', 'car-01', 'openTrack')).toBe(true);
  });

  it('默认菜单状态独立保存，并支持主题切换', () => {
    const menu = makeContextMenu();
    expect(menu.addDefaultMenu([{ key: 'measure', label: '测量', visible: true }])).toBe(true);
    expect(menu.setDefaultMenuState('measure', false)).toBe(true);
    expect(menu.getDefaultMenuState('measure')).toBe(false);
    expect(menu.toggleTheme()).toBe(true);
    expect(menu.toggleTheme()).toBe(false);
  });

  it('拒绝存在重复或未解析 key 的无效菜单树', () => {
    const menu = makeContextMenu();
    expect(
      menu.addDefaultMenu([
        { key: 'duplicate', label: 'a' },
        { key: 'duplicate', label: 'b' }
      ])
    ).toBe(false);
    expect(menu.addModuleMenu('vehicle', [{ key: 'track', label: '查看航迹', mutexKey: 'missing' }])).toBe(false);
  });

  it('支持注册模块菜单权限守卫', () => {
    const menu = makeContextMenu();
    const before = () => false;
    expect(menu.addModuleMenu('vehicle', vehicleMenus, undefined, before)).toBe(true);
  });

  it('在触发模块回调前由内部切换互斥菜单状态', () => {
    const callback = vi.fn();
    const menu = makeContextMenu();
    expect(menu.addModuleMenu('vehicle', vehicleMenus, callback)).toBe(true);
    const contextMenu = setModuleContext(menu);
    const item = vehicleMenus[0];
    contextMenu.currentItems.set(item.key, item);
    const button = {
      disabled: false,
      dataset: { menuKey: item.key },
      closest: () => button
    };

    contextMenu.handleMenuClick({ target: button });

    expect(menu.getModuleMenuState('vehicle', 'car-01', 'openTrack')).toBe(false);
    expect(menu.getModuleMenuState('vehicle', 'car-01', 'closeTrack')).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('菜单展示前置灰无权限叶子项，子菜单父项不注册为动作', () => {
    const before = vi.fn((param) => param.menu.key !== 'openData');
    const menu = makeContextMenu();
    expect(menu.addModuleMenu('vehicle', vehicleMenus, undefined, before)).toBe(true);
    const contextMenu = setModuleContext(menu);

    const list = withFakeDocument(() => contextMenu.renderMenuList(vehicleMenus, 'module')) as any;
    const infoItem = list.children[1];
    const infoButton = infoItem.children[0];
    const dataButton = infoItem.children[1].children[0].children[0];

    expect(infoButton.dataset.menuKey).toBeUndefined();
    expect(contextMenu.currentItems.has('openInfo')).toBe(false);
    expect(dataButton.disabled).toBe(true);
    expect(before).toHaveBeenCalledWith(expect.objectContaining({ featureId: 'car-01', menu: vehicleMenus[2].child![0] }));
  });
});
