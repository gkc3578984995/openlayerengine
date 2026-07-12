import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('interaction documentation infrastructure', () => {
  it('adds the four interaction routes, navigation entries, and layout titles without importing future pages', async () => {
    const [navigation, router, layout] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8')
    ]);

    expect(navigation).toContain("title: '地图交互'");
    expect(navigation).toContain(`{ label: 'PointLayer 点图层', to: '/components/point-layer' }
    ]
  },
  {
    title: '地图交互'`);

    const interactionGroup = navigation.slice(navigation.indexOf("title: '地图交互'"));
    let previousItemIndex = -1;
    for (const [label, path, name, title] of [
      ['GlobalEvent 全局事件', '/components/global-event', 'global-event', 'GlobalEvent 全局事件'],
      ['ContextMenu 右键菜单', '/components/context-menu', 'context-menu', 'ContextMenu 右键菜单'],
      ['DynamicDraw 动态绘制', '/components/dynamic-draw', 'dynamic-draw', 'DynamicDraw 动态绘制'],
      ['Measure 测量工具', '/components/measure', 'measure', 'Measure 测量工具']
    ]) {
      const item = `{ label: '${label}', to: '${path}' }`;
      const itemIndex = interactionGroup.indexOf(item);
      expect(itemIndex).toBeGreaterThan(previousItemIndex);
      previousItemIndex = itemIndex;
      expect(router).toContain(`path: '${path.slice(1)}'`);
      expect(router).toContain(`name: '${name}'`);
      expect(layout).toContain(`return '${title}';`);
    }
    expect(router).toContain("import GlobalEventView from '../views/GlobalEventView.vue';");
    expect(router).toContain("import ContextMenuView from '../views/ContextMenuView.vue';");
    expect(router).not.toContain("import DynamicDrawView from '../views/DynamicDrawView.vue';");
    expect(router).not.toContain("import MeasureView from '../views/MeasureView.vue';");
  });

  it('provides reachable page anchors for every Earth cross-page interaction link', async () => {
    const [globalMethods, router, globalEvent, contextMenu] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/views/GlobalEventView.vue', 'utf8'),
      readFile('website/src/views/ContextMenuView.vue', 'utf8')
    ]);

    const placeholders = {
      globalEvent: 'const InteractionPlaceholderView = { template: \'<section><h2 id="api-methods">API 方法</h2></section>\' };',
      contextMenu:
        'const ContextMenuPlaceholderView = { template: \'<section><h2 id="api-methods">API 方法</h2><h3 id="api-type-icontextmenuoption">IContextMenuOption</h3></section>\' };'
    };
    expect(router).not.toContain('const ContextMenuPlaceholderView');
    expect(globalEvent).toContain('id="api-methods"');
    expect(contextMenu).toContain('id="api-methods"');
    expect(contextMenu).toContain('id="api-type-icontextmenuoption"');

    const targetOwner: Record<string, string> = {
      '/components/global-event': globalEvent,
      '/components/context-menu': contextMenu,
      '/components/dynamic-draw': placeholders.globalEvent,
      '/components/measure': placeholders.globalEvent
    };
    const hrefs = [...globalMethods.matchAll(/href="(\/components\/(?:global-event|context-menu|dynamic-draw|measure)#[^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([
      '/components/global-event#api-methods',
      '/components/global-event#api-methods',
      '/components/context-menu#api-methods',
      '/components/context-menu#api-type-icontextmenuoption',
      '/components/context-menu#api-methods',
      '/components/dynamic-draw#api-methods',
      '/components/dynamic-draw#api-methods',
      '/components/measure#api-methods',
      '/components/measure#api-methods'
    ]);
    for (const href of hrefs) {
      const [path, target] = href.split('#');
      expect(router).toContain(`path: '${path.slice(1)}'`);
      expect(targetOwner[path]).toContain(`id="${target}"`);
    }
  });

  it('documents runnable GlobalEvent and ContextMenu demos, owned types, and public methods', async () => {
    const [globalEvent, contextMenu, globalDemo, contextDemo, router] = await Promise.all([
      readFile('website/src/views/GlobalEventView.vue', 'utf8'),
      readFile('website/src/views/ContextMenuView.vue', 'utf8'),
      readFile('website/src/examples/GlobalEventDemo.vue', 'utf8'),
      readFile('website/src/examples/ContextMenuDemo.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8')
    ]);

    for (const [view, demo, rawImport, exampleId] of [
      [globalEvent, globalDemo, "import globalEventSource from '../examples/GlobalEventDemo.vue?raw';", 'example-global-events'],
      [contextMenu, contextDemo, "import contextMenuSource from '../examples/ContextMenuDemo.vue?raw';", 'example-default-and-module']
    ]) {
      expect(view).toContain(rawImport);
      expect(view).toContain(`id="${exampleId}"`);
      expect(view).toContain('<PageAnchor');
      expect(demo).toContain('createConfiguredLayer');
      expect(demo).toContain('onBeforeUnmount');
      expect(demo).toContain('.destroy()');
    }
    expect(globalEvent).toMatch(/:source="globalEventSource"\s*>\s*<template #preview>\s*<GlobalEventDemo\s*\/>/s);
    expect(contextMenu).toMatch(/:source="contextMenuSource"\s*>\s*<template #preview>\s*<ContextMenuDemo\s*\/>/s);
    expect(router).toMatch(/path: 'components\/global-event',[\s\S]*?component: GlobalEventView/);
    expect(router).toMatch(/path: 'components\/context-menu',[\s\S]*?component: ContextMenuView/);

    for (const type of ['ModuleEventCallbackParams', 'ModuleEventCallback', 'GlobalEventCallback']) {
      expect(globalEvent).toContain(`id="api-type-${type.toLowerCase()}"`);
    }
    expect(globalEvent).not.toContain('GlobalKeyDownEventCallback');
    const globalEventMethods = [
      'enableModuleMouseMoveEvent',
      'enableModuleMouseClickEvent',
      'enableModuleMouseLeftDownEvent',
      'enableModuleMouseLeftUpEvent',
      'enableModuleMouseDblClickEvent',
      'enableModuleMouseRightClickEvent',
      'enableGlobalMouseMoveEvent',
      'enableGlobalMouseClickEvent',
      'enableGlobalMouseLeftDownEvent',
      'enableGlobalMouseLeftUpEvent',
      'enableGlobalMouseDblClickEvent',
      'enableGlobalMouseRightClickEvent',
      'enableGlobalKeyDownEvent',
      'disableModuleMouseMoveEvent',
      'disableModuleMouseClickEvent',
      'disableModuleMouseLeftDownEvent',
      'disableModuleMouseLeftUpEvent',
      'disableModuleMouseDblClickEvent',
      'disableModuleMouseRightClickEvent',
      'disableGlobalMouseMoveEvent',
      'disableGlobalMouseClickEvent',
      'disableGlobalMouseLeftDownEvent',
      'disableGlobalMouseLeftUpEvent',
      'disableGlobalMouseDblClickEvent',
      'disableGlobalMouseRightClickEvent',
      'disableGlobalKeyDownEvent',
      'addMouseMoveEventByModule',
      'addMouseClickEventByModule',
      'addMouseLeftDownEventByModule',
      'addMouseLeftUpEventByModule',
      'addMouseDblClickEventByModule',
      'addMouseRightClickEventByModule',
      'addMouseMoveEventByGlobal',
      'addMouseClickEventByGlobal',
      'addMouseLeftDownEventByGlobal',
      'addMouseLeftUpEventByGlobal',
      'addMouseDblClickEventByGlobal',
      'addMouseRightClickEventByGlobal',
      'addKeyDownEventByGlobal',
      'addMouseOnceClickEventByGlobal',
      'addCancelableMouseOnceClickEventByGlobal',
      'addMouseOnceRightClickEventByGlobal',
      'addCancelableMouseOnceRightClickEventByGlobal',
      'hasModuleMouseMoveEvent',
      'hasModuleMouseClickEvent',
      'hasModuleMouseLeftDownEvent',
      'hasModuleMouseLeftUpEvent',
      'hasModuleMouseDblClickEvent',
      'hasModuleMouseRightClickEvent',
      'hasGlobalMouseMoveEvent',
      'hasGlobalMouseClickEvent',
      'hasGlobalMouseLeftDownEvent',
      'hasGlobalMouseLeftUpEvent',
      'hasGlobalMouseDblClickEvent',
      'hasGlobalMouseRightClickEvent',
      'hasGlobalKeyDownEvent',
      'removeModuleEvent',
      'removeAllModuleEvents'
    ];
    expect(globalEventMethods).toHaveLength(58);
    expect(globalEvent).toContain('const methodRows = methods.map');
    for (const method of globalEventMethods) {
      expect(globalEvent).toMatch(new RegExp(`\\[\\s*'${method}',`));
    }

    for (const type of ['IContextMenuOption', 'IContextMenuItem', 'IContextMenuCallbackParam', 'ContextMenuCallback', 'ContextMenuBefore']) {
      expect(contextMenu).toContain(`id="api-type-${type.toLowerCase()}"`);
    }
    const contextMenuMethods = [
      'addDefaultMenu',
      'addModuleMenu',
      'removeDefaultMenu',
      'removeModuleMenu',
      'clearModuleMenuState',
      'getDefaultMenuState',
      'setDefaultMenuState',
      'toggleDefaultMenuState',
      'getModuleMenuState',
      'setModuleMenuState',
      'toggleModuleMenuState',
      'setTheme',
      'toggleTheme',
      'close',
      'remove',
      'destroy',
      'destory'
    ];
    expect(contextMenuMethods).toHaveLength(17);
    expect(contextMenu).toContain('const methodRows = methods.map');
    for (const method of contextMenuMethods) {
      expect(contextMenu).toMatch(new RegExp(`\\[\\s*'${method}',`));
    }
    expect(contextMenu).toContain('deprecated');
    expect(contextDemo).toContain('addDefaultMenu');
    expect(contextDemo).toContain('addModuleMenu');
    expect(contextDemo).toContain('toggleTheme');
    expect(globalDemo).toContain('disposers.splice(0).forEach');
    expect(globalDemo).toContain('earthRef.value?.destroy()');
    expect(globalDemo.indexOf('disposers.splice(0).forEach')).toBeLessThan(globalDemo.indexOf('earthRef.value?.destroy()'));
    expect(contextDemo).toContain('earth?.useContextMenu().destroy()');
    expect(contextDemo).toContain('earth?.destroy()');
    expect(contextDemo.indexOf('earth?.useContextMenu().destroy()')).toBeLessThan(contextDemo.indexOf('earth?.destroy()'));
  });

  it('defines the Earth-owned feature hit type and links all interaction references to their owner pages', async () => {
    const [globalMethods, rules] = await Promise.all([readFile('website/src/views/GlobalMethodsView.vue', 'utf8'), readFile('website/AGENTS.md', 'utf8')]);

    expect(globalMethods).toContain("{ id: 'api-type-ifeatureatpixel', label: 'IFeatureAtPixel' }");
    expect(globalMethods.indexOf('id="api-type-ifeatureatpixel"')).toBeLessThan(globalMethods.indexOf('id="api-methods"'));
    expect(globalMethods).toContain('returns: \'<a href="#api-type-ifeatureatpixel">IFeatureAtPixel</a>\'');
    expect(globalMethods).toContain('params: \'<a href="/components/context-menu#api-type-icontextmenuoption">IContextMenuOption</a>?\'');

    for (const [method, page, type] of [
      ['useGlobalEvent', 'global-event', 'GlobalEvent'],
      ['useContextMenu', 'context-menu', 'ContextMenu'],
      ['useDrawTool', 'dynamic-draw', 'DynamicDraw'],
      ['useMeasure', 'measure', 'Measure']
    ]) {
      expect(globalMethods).toContain(`<code class="code-fn"><a href="/components/${page}#api-methods">${method}</a></code>`);
      expect(globalMethods).toContain(`returns: '<a href="/components/${page}#api-methods">${type}</a>'`);
    }

    expect(rules).toContain('公共类型只在其归属页面定义');
    expect(rules).toContain('跨页面引用必须链接到归属锚点');
    expect(rules).toContain('工具返回的 use* 方法名及返回类型必须链接到工具页');
    expect(rules).toContain('OpenLayers 外部类型既不是库类型定义，也不是根导出');
    expect(rules).toContain('工具示例覆盖核心流程及清理');
    expect(rules).toContain('跨页面锚点变更必须验证链接目标、导航、路由和布局标题');
  });
});
