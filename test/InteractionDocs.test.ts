import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as navigationConfig from '../website/src/config/navigation';

describe('interaction documentation infrastructure', () => {
  it('derives and toggles expansion for arbitrary nested navigation', () => {
    const deriveExpandedParentRoutes = Reflect.get(navigationConfig, 'deriveExpandedParentRoutes');
    const toggleExpandedRoute = Reflect.get(navigationConfig, 'toggleExpandedRoute');

    expect(deriveExpandedParentRoutes).toBeTypeOf('function');
    expect(toggleExpandedRoute).toBeTypeOf('function');

    const groups = [
      {
        title: 'Artificial group',
        items: [
          {
            label: 'Artificial parent',
            to: '/artificial',
            children: [{ label: 'Artificial child', to: '/artificial/child' }]
          },
          { label: 'Leaf', to: '/leaf' }
        ]
      }
    ];

    expect(deriveExpandedParentRoutes(groups, '/artificial')).toEqual(new Set(['/artificial']));
    expect(deriveExpandedParentRoutes(groups, '/artificial/child')).toEqual(new Set(['/artificial']));
    expect(deriveExpandedParentRoutes(groups, '/artificial/child/deeper')).toEqual(new Set());
    expect(deriveExpandedParentRoutes(groups, '/missing')).toEqual(new Set());

    const closed = new Set<string>();
    const opened = toggleExpandedRoute(closed, '/artificial');
    expect(opened).toEqual(new Set(['/artificial']));
    expect(opened).not.toBe(closed);
    expect(closed).toEqual(new Set());

    const reclosed = toggleExpandedRoute(opened, '/artificial');
    expect(reclosed).toEqual(new Set());
    expect(reclosed).not.toBe(opened);
    expect(opened).toEqual(new Set(['/artificial']));
  });

  it('adds the four interaction routes, navigation entries, and layout titles', async () => {
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
    expect(router).toContain("import DynamicDrawView from '../views/DynamicDrawView.vue';");
    expect(router).toContain("import MeasureView from '../views/MeasureView.vue';");
  });

  it('splits GlobalEvent into canonical nested navigation and API pages', async () => {
    const viewFiles = [
      'website/src/views/GlobalEventView.vue',
      'website/src/views/GlobalEventGlobalMouseView.vue',
      'website/src/views/GlobalEventModuleEventsView.vue',
      'website/src/views/GlobalEventKeyboardView.vue',
      'website/src/views/GlobalEventListenerControlView.vue'
    ] as const;
    const [navigation, layout, router, source, ...views] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('src/components/GlobalEvent.ts', 'utf8'),
      ...viewFiles.map((file) => readFile(file, 'utf8'))
    ]);

    const globalEventPages = [
      ['概览与初始化', '/components/global-event', 'GlobalEventView'],
      ['全局鼠标事件', '/components/global-event/global-mouse', 'GlobalEventGlobalMouseView'],
      ['模块要素事件', '/components/global-event/module-events', 'GlobalEventModuleEventsView'],
      ['键盘事件', '/components/global-event/keyboard', 'GlobalEventKeyboardView'],
      ['监听控制', '/components/global-event/listener-control', 'GlobalEventListenerControlView']
    ] as const;

    expect(navigation).toMatch(/export interface NavItem \{[\s\S]*?children\?: NavItem\[\];[\s\S]*?\}/);
    for (const [label, path, component] of globalEventPages) {
      expect(navigation).toContain(`{ label: '${label}', to: '${path}' }`);
      expect(router).toContain(`import ${component} from '../views/${component}.vue';`);
      expect(router).toMatch(new RegExp(`path: '${path.slice(1)}',[\\s\\S]*?component: ${component}`));
    }
    expect(layout).toContain('aria-expanded');
    expect(layout).toContain('item.children');
    expect(layout).toContain('docs-sidebar__child-link');
    expect(layout).toContain('expandedItems');
    expect(layout).toContain('deriveExpandedParentRoutes');
    expect(layout).toContain('toggleExpandedRoute');
    expect(layout).not.toMatch(/path === ['"]\/components\/global-event['"]|path\.startsWith\(['"]\/components\/global-event\//);
    expect(layout).toContain('route.path.startsWith(`${item.to}/`)');
    expect(layout).toContain(':class="{ \'is-active\': route.path === child.to }"');

    const [overview, globalMouse, moduleEvents, keyboard, listenerControl] = views;
    for (const view of views) {
      expect(view).toContain('<span class="doc-hero__eyebrow">GlobalEvent 全局事件</span>');
    }
    expect(overview).toContain('id="api-constructor"');
    expect(overview).toContain('new GlobalEvent(earth)');
    expect(overview).toContain('href="/guide/global-methods#api-methods"');
    expect(overview).toContain('<h1>概览与初始化</h1>');
    expect(overview).toContain('<PageAnchor title="概览与初始化"');
    expect(overview).toContain('<code>new GlobalEvent(earth)</code> 也是公开可用的构造方式');
    expect(overview).toMatch(/Earth\s+会缓存同一个共享实例并集中管理其生命周期/);
    for (const type of ['ModuleEventCallbackParams', 'ModuleEventCallback', 'GlobalEventCallback']) {
      const anchor = `id="api-type-${type.toLowerCase()}"`;
      expect(overview).toContain(anchor);
      for (const child of views.slice(1)) expect(child).not.toContain(anchor);
    }
    for (const path of globalEventPages.slice(1).map(([, path]) => path)) {
      expect(overview).toContain(`href="${path}#api-methods"`);
    }
    for (const child of views.slice(1)) {
      expect(child).toContain("presentation: 'method'");
      expect(child).toContain('<PageAnchor');
      expect(child).toContain('id="tips"');
    }
    expect(globalMouse).toContain('/components/global-event#api-type-globaleventcallback');
    expect(moduleEvents).toContain('/components/global-event#api-type-moduleeventcallback');
    expect(listenerControl).toContain('href=&quot;/components/global-event/global-mouse#api-methods&quot;>addMouseClickEventByGlobal');
    expect(listenerControl).toContain('href=&quot;/components/global-event/global-mouse#api-methods&quot;>hasGlobalMouseClickEvent');

    const globalMouseMethods = [
      'addMouseMoveEventByGlobal',
      'addMouseClickEventByGlobal',
      'addMouseLeftDownEventByGlobal',
      'addMouseLeftUpEventByGlobal',
      'addMouseDblClickEventByGlobal',
      'addMouseRightClickEventByGlobal',
      'addMouseOnceClickEventByGlobal',
      'addCancelableMouseOnceClickEventByGlobal',
      'addMouseOnceRightClickEventByGlobal',
      'addCancelableMouseOnceRightClickEventByGlobal',
      'hasGlobalMouseMoveEvent',
      'hasGlobalMouseClickEvent',
      'hasGlobalMouseLeftDownEvent',
      'hasGlobalMouseLeftUpEvent',
      'hasGlobalMouseDblClickEvent',
      'hasGlobalMouseRightClickEvent'
    ];
    const moduleMethods = [
      'addMouseMoveEventByModule',
      'addMouseClickEventByModule',
      'addMouseLeftDownEventByModule',
      'addMouseLeftUpEventByModule',
      'addMouseDblClickEventByModule',
      'addMouseRightClickEventByModule',
      'hasModuleMouseMoveEvent',
      'hasModuleMouseClickEvent',
      'hasModuleMouseLeftDownEvent',
      'hasModuleMouseLeftUpEvent',
      'hasModuleMouseDblClickEvent',
      'hasModuleMouseRightClickEvent',
      'removeModuleEvent',
      'removeAllModuleEvents'
    ];
    const keyboardMethods = ['addKeyDownEventByGlobal', 'enableGlobalKeyDownEvent', 'disableGlobalKeyDownEvent', 'hasGlobalKeyDownEvent'];
    const listenerMethods = [
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
      'disableGlobalMouseRightClickEvent'
    ];
    const canonicalMethods = [...globalMouseMethods, ...moduleMethods, ...keyboardMethods, ...listenerMethods];
    const sourceMethods = [...source.matchAll(/^ {2}(?!(?:private|protected)\s)(?:public\s+)?([A-Za-z]\w*)\([^)]*\)[^{]*\{/gm)]
      .map((match) => match[1])
      .filter((name) => !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name));
    expect(canonicalMethods).toHaveLength(58);
    expect(new Set(canonicalMethods)).toEqual(new Set(sourceMethods));
    const allPages = views.join('\n');
    for (const method of sourceMethods) {
      expect([...allPages.matchAll(new RegExp(`\\[\\s*'${method}',`, 'g'))]).toHaveLength(1);
    }
  });

  it('provides reachable page anchors for every Earth cross-page interaction link', async () => {
    const [globalMethods, router, globalEvent, contextMenu, dynamicDraw, measure] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/views/GlobalEventView.vue', 'utf8'),
      readFile('website/src/views/ContextMenuView.vue', 'utf8'),
      readFile('website/src/views/DynamicDrawView.vue', 'utf8'),
      readFile('website/src/views/MeasureView.vue', 'utf8')
    ]);
    expect(router).not.toContain('const ContextMenuPlaceholderView');
    expect(globalEvent).toContain('id="api-methods"');
    expect(contextMenu).toContain('id="api-methods"');
    expect(contextMenu).toContain('id="api-type-icontextmenuoption"');

    const targetOwner: Record<string, string> = {
      '/components/global-event': globalEvent,
      '/components/context-menu': contextMenu,
      '/components/dynamic-draw': dynamicDraw,
      '/components/measure': measure
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
    const [globalEvent, contextMenu, contextDemo, router] = await Promise.all([
      readFile('website/src/views/GlobalEventView.vue', 'utf8'),
      readFile('website/src/views/ContextMenuView.vue', 'utf8'),
      readFile('website/src/examples/ContextMenuDemo.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8')
    ]);

    expect(contextMenu).toContain("import contextMenuSource from '../examples/ContextMenuDemo.vue?raw';");
    expect(contextMenu).toContain('id="example-default-and-module"');
    expect(contextMenu).toContain('<PageAnchor');
    expect(contextDemo).toContain('createConfiguredLayer');
    expect(contextDemo).toContain('onBeforeUnmount');
    expect(contextDemo).toContain('.destroy()');
    expect(contextMenu).toMatch(/:source="contextMenuSource"\s*>\s*<template #preview>\s*<ContextMenuDemo\s*\/>/s);
    expect(router).toMatch(/path: 'components\/global-event',[\s\S]*?component: GlobalEventView/);
    expect(router).toMatch(/path: 'components\/context-menu',[\s\S]*?component: ContextMenuView/);

    for (const type of ['ModuleEventCallbackParams', 'ModuleEventCallback', 'GlobalEventCallback']) {
      expect(globalEvent).toContain(`id="api-type-${type.toLowerCase()}"`);
    }
    expect(globalEvent).not.toContain('GlobalKeyDownEventCallback');
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
    expect(contextDemo).toContain('earth?.useContextMenu().destroy()');
    expect(contextDemo).toContain('earth?.destroy()');
    expect(contextDemo.indexOf('earth?.useContextMenu().destroy()')).toBeLessThan(contextDemo.indexOf('earth?.destroy()'));
  });

  it('documents four focused GlobalEvent demos and their maintenance rules', async () => {
    const demos = [
      ['GlobalEventGlobalMouseView.vue', 'GlobalEventDemo.vue', 'example-global-mouse-events'],
      ['GlobalEventModuleEventsView.vue', 'GlobalEventModuleDemo.vue', 'example-module-feature-events'],
      ['GlobalEventKeyboardView.vue', 'GlobalEventKeyboardDemo.vue', 'example-keyboard-events'],
      ['GlobalEventListenerControlView.vue', 'GlobalEventListenerControlDemo.vue', 'example-listener-control']
    ] as const;
    const exampleDetails = {
      'example-global-mouse-events': { title: '全局移动与点击', sourceName: 'globalEventSource' },
      'example-module-feature-events': { title: '模块要素点击', sourceName: 'moduleEventSource' },
      'example-keyboard-events': { title: '键盘注册与取消', sourceName: 'keyboardEventSource' },
      'example-listener-control': { title: '监听启停与重新注册', sourceName: 'listenerControlSource' }
    } as const;

    const pairs = await Promise.all(
      demos.map(async ([viewFile, exampleFile]) =>
        Promise.all([readFile(`website/src/views/${viewFile}`, 'utf8'), readFile(`website/src/examples/${exampleFile}`, 'utf8')])
      )
    );
    const [rules, overview] = await Promise.all([readFile('website/AGENTS.md', 'utf8'), readFile('website/src/views/GlobalEventView.vue', 'utf8')]);

    expect(overview).not.toContain("import GlobalEventDemo from '../examples/GlobalEventDemo.vue';");
    expect(overview).not.toContain("import globalEventSource from '../examples/GlobalEventDemo.vue?raw';");
    expect(overview).not.toContain('example-global-events');
    expect(overview).not.toContain('<GlobalEventDemo');

    for (const [[, exampleFile, exampleId], [view, example]] of demos.map((demo, index) => [demo, pairs[index]] as const)) {
      const { title, sourceName } = exampleDetails[exampleId];
      const componentName = exampleFile.replace('.vue', '');
      expect(view).toContain(`import ${componentName} from '../examples/${exampleFile}';`);
      expect(view).toContain(`import ${sourceName} from '../examples/${exampleFile}?raw';`);
      expect(view).toContain(`{ id: '${exampleId}', label: '${title}' }`);
      expect(view).toContain(`id="${exampleId}"`);
      expect(view).toContain(`title="${title}"`);
      expect(view).toMatch(new RegExp(`:source="${sourceName}"\\s*>\\s*<template #preview>\\s*<${componentName}\\s*\\/>`, 's'));
      expect(example, `${exampleFile} should use the configured map source`).toContain('createConfiguredLayer');
      expect(example, `${exampleFile} should destroy Earth`).toContain('earthRef.value?.destroy()');
      if (exampleFile !== 'GlobalEventListenerControlDemo.vue') {
        expect(example, `${exampleFile} should clean up registrations`).toContain('disposers.splice(0).forEach');
        expect(example.indexOf('disposers.splice(0).forEach'), `${exampleFile} cleanup order`).toBeLessThan(example.indexOf('earthRef.value?.destroy()'));
      }
    }

    const [[, globalMouseDemo], [, moduleDemo], [, keyboardDemo], [, listenerDemo]] = pairs;
    expect(globalMouseDemo).toContain('addMouseMoveEventByGlobal');
    expect(globalMouseDemo).toContain('addMouseClickEventByGlobal');
    expect(globalMouseDemo).toContain('hasGlobalMouseClickEvent');
    expect(moduleDemo).toContain('addMouseClickEventByModule');
    expect(moduleDemo).toContain('addMouseDblClickEventByModule');
    expect(moduleDemo).toContain('hasModuleMouseClickEvent');
    expect(moduleDemo).toContain('removeAllModuleEvents');
    expect(keyboardDemo).toContain('addKeyDownEventByGlobal');
    expect(keyboardDemo).toContain('hasGlobalKeyDownEvent');
    expect(listenerDemo).toContain('enableGlobalMouseClickEvent');
    expect(listenerDemo).toContain('disableGlobalMouseClickEvent');
    expect(listenerDemo).toContain('let clickDisposer: (() => void) | null = null;');
    expect(listenerDemo).not.toContain('const disposers: Array<() => void>');
    expect(listenerDemo).toMatch(/if \(clickDisposer\) return;/);
    expect(listenerDemo).toMatch(/if \(!events\.hasGlobalMouseClickEvent\(\)\) \{[\s\S]*?events\.enableGlobalMouseClickEvent\(\)/);
    expect(listenerDemo).toMatch(/if \(events\.hasGlobalMouseClickEvent\(\)\) \{[\s\S]*?events\.disableGlobalMouseClickEvent\(\)/);
    expect(listenerDemo).toMatch(/disableGlobalMouseClickEvent\(\);[\s\S]*?clickDisposer = null;/);
    expect(listenerDemo).toMatch(/if \(events\.hasGlobalMouseClickEvent\(\) && !clickDisposer\) \{[\s\S]*?events\.disableGlobalMouseClickEvent\(\)/);
    expect(listenerDemo.indexOf('clickDisposer?.()')).toBeLessThan(listenerDemo.indexOf('earthRef.value?.destroy()'));

    const moduleEventsView = pairs[1][0];
    for (const method of ['add*EventByModule', 'addMouseClickEventByModule', 'removeModuleEvent', 'removeAllModuleEvents']) {
      expect(moduleEventsView).toMatch(new RegExp(`<code class="code-fn"><a href="#api-methods">${method.replace('*', '\\*')}</a></code\\s*>`));
    }
    expect(moduleEventsView).toContain('返回的注销函数只移除本次注册的回调，不影响其他事件类别');
    expect(moduleEventsView).toContain('只移除该模块指定名称的一类事件');
    expect(moduleEventsView).toContain('移除该模块已注册的全部事件类别');
    expect(moduleEventsView).toContain('命中要素的 <code>module</code> 属性');

    expect(rules).toContain('导出的可构造工具必须先展示公共构造函数');
    expect(rules).toContain('存在 Earth `use*` 入口时优先使用');
    expect(rules).toContain('大型对称 API 必须按行为族拆分');
    expect(rules).toContain('每个方法只能有一个规范归属页面');
    expect(rules).toContain('`disable*`、注销函数与 `remove*` 的语义不得混淆');
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

  it('documents runnable DynamicDraw and Measure demos, owned types, public methods, and routes', async () => {
    const [dynamicDraw, measure, dynamicDrawDemo, measureDemo, router, dynamicDrawComponent, measureComponent, dynamicDrawTypes, defaultTypes] =
      await Promise.all([
        readFile('website/src/views/DynamicDrawView.vue', 'utf8'),
        readFile('website/src/views/MeasureView.vue', 'utf8'),
        readFile('website/src/examples/DynamicDrawDemo.vue', 'utf8'),
        readFile('website/src/examples/MeasureDemo.vue', 'utf8'),
        readFile('website/src/router/index.ts', 'utf8'),
        readFile('src/components/DynamicDraw.ts', 'utf8'),
        readFile('src/components/Measure.ts', 'utf8'),
        readFile('src/interface/dynamicDraw.ts', 'utf8'),
        readFile('src/interface/default.ts', 'utf8')
      ]);

    for (const [view, demo, rawImport, exampleId] of [
      [dynamicDraw, dynamicDrawDemo, "import dynamicDrawSource from '../examples/DynamicDrawDemo.vue?raw';", 'example-drawing-and-plot'],
      [measure, measureDemo, "import measureSource from '../examples/MeasureDemo.vue?raw';", 'example-line-and-area']
    ]) {
      expect(view).toContain(rawImport);
      expect(view).toContain(`id="${exampleId}"`);
      expect(view).toContain('<PageAnchor');
      expect(demo).toContain('createConfiguredLayer');
      expect(demo).toContain('onBeforeUnmount');
    }
    expect(dynamicDraw).toMatch(/:source="dynamicDrawSource"\s*>\s*<template #preview>\s*<DynamicDrawDemo\s*\/>/s);
    expect(measure).toMatch(/:source="measureSource"\s*>\s*<template #preview>\s*<MeasureDemo\s*\/>/s);
    expect(router).toContain("import DynamicDrawView from '../views/DynamicDrawView.vue';");
    expect(router).toContain("import MeasureView from '../views/MeasureView.vue';");
    expect(router).toMatch(/path: 'components\/dynamic-draw',[\s\S]*?component: DynamicDrawView/);
    expect(router).toMatch(/path: 'components\/measure',[\s\S]*?component: MeasureView/);

    const dynamicDrawTypeNames = [...dynamicDrawTypes.matchAll(/^export (?:enum|interface) (\w+)/gm)].map((match) => match[1]);
    const measureTypeNames = [...defaultTypes.matchAll(/^export interface (IMeasure(?:Data|Event)?)/gm)].map((match) => match[1]);
    for (const type of dynamicDrawTypeNames) {
      expect(dynamicDraw).toContain(`id="api-type-${type.toLowerCase()}"`);
    }
    for (const type of measureTypeNames) {
      expect(measure).toContain(`id="api-type-${type.toLowerCase()}"`);
    }
    for (const property of ['featurePosition', 'ctlPoints', 'center', 'radius']) {
      expect(dynamicDraw).toContain(`{ name: '${property}'`);
    }

    const getPublicMethods = (source: string) =>
      [...source.matchAll(/^ {2}(?!(?:private|protected)\s)(?:public\s+)?([A-Za-z]\w*)\([^)]*\)[^{]*\{/gm)]
        .map((match) => match[1])
        .filter((name) => !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name));
    const dynamicDrawMethods = getPublicMethods(dynamicDrawComponent);
    const measureMethods = getPublicMethods(measureComponent);
    expect(dynamicDrawMethods).not.toHaveLength(0);
    expect(measureMethods).not.toHaveLength(0);
    expect(dynamicDraw).toContain('const methodRows = methods.map');
    expect(measure).toContain('const methodRows = methods.map');
    for (const method of dynamicDrawMethods) expect(dynamicDraw).toMatch(new RegExp(`\\[\\s*'${method}',`));
    for (const method of measureMethods) expect(measure).toMatch(new RegExp(`\\[\\s*'${method}',`));

    expect(dynamicDrawDemo).toContain('draw.drawPoint');
    expect(dynamicDrawDemo).toContain('draw.drawAttackArrow');
    expect(dynamicDrawDemo).toContain('draw.get');
    expect(dynamicDrawDemo).toContain('draw.remove');
    expect(dynamicDrawDemo).toContain('draw.destroy');
    expect(dynamicDrawDemo).toContain('earth.destroy');
    expect(dynamicDrawDemo.indexOf('draw.destroy')).toBeLessThan(dynamicDrawDemo.indexOf('earth.destroy'));
    expect(measureDemo).toContain('measure.lineSegmentation');
    expect(measureDemo).toContain('measure.polygonMeasure');
    expect(measureDemo).toContain('measure.clear');
    expect(measureDemo).toContain('earth.destroy');
    expect(measureDemo.indexOf('measure.clear')).toBeLessThan(measureDemo.indexOf('earth.destroy'));
  });
});
