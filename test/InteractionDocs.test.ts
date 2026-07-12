import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('interaction documentation infrastructure', () => {
  it('adds the four interaction routes, navigation entries, and layout titles', async () => {
    const [navigation, router, layout] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8')
    ]);

    expect(navigation).toContain("title: '地图交互'");
    expect(navigation).toMatch(
      /\{ label: 'PointLayer 点图层', to: '\/components\/point-layer' \}\r?\n\s+\]\r?\n\s+\},\r?\n\s+\{\r?\n\s+title: '地图交互'/
    );

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
      'website/src/views/GlobalEventKeyboardView.vue'
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
      ['模块鼠标事件', '/components/global-event/module-events', 'GlobalEventModuleEventsView'],
      ['全局键盘事件', '/components/global-event/keyboard', 'GlobalEventKeyboardView']
    ] as const;

    expect(navigation).toMatch(/export interface NavItem \{[\s\S]*?children\?: NavItem\[\];[\s\S]*?\}/);
    for (const [label, path, component] of globalEventPages) {
      expect(navigation).toContain(`{ label: '${label}', to: '${path}' }`);
      expect(router).toContain(`import ${component} from '../views/${component}.vue';`);
      expect(router).toMatch(new RegExp(`path: '${path.slice(1)}',[\\s\\S]*?component: ${component}`));
    }
    for (const obsoleteEntry of ['listener-control', 'GlobalEventListenerControlView']) {
      expect(navigation).not.toContain(obsoleteEntry);
      expect(router).not.toContain(obsoleteEntry);
      expect(layout).not.toContain(obsoleteEntry);
    }
    expect(navigation).toContain("label: 'GlobalEvent 地图事件'");
    expect(layout).toContain("'/components/global-event/global-mouse': 'GlobalEvent 全局鼠标事件'");
    expect(layout).toContain("'/components/global-event/module-events': 'GlobalEvent 模块鼠标事件'");
    expect(layout).toContain("'/components/global-event/keyboard': 'GlobalEvent 全局键盘事件'");
    expect(layout).toContain('item.children');
    expect(layout).toContain('docs-sidebar__child-link');
    expect(layout).toContain('<div v-if="item.children" class="docs-sidebar__children">');
    expect(layout).not.toContain('aria-expanded');
    expect(layout).not.toContain('docs-sidebar__toggle');
    expect(layout).not.toContain('expandedItems');
    expect(layout).not.toContain('deriveExpandedParentRoutes');
    expect(layout).not.toContain('toggleExpandedRoute');
    expect(layout).toContain('route.path.startsWith(`${item.to}/`)');
    expect(layout).toContain(':class="{ \'is-active\': route.path === child.to }"');

    const [overview, globalMouse, moduleEvents, keyboard] = views;
    for (const view of views) {
      expect(view).toContain('<span class="doc-hero__eyebrow">GlobalEvent 地图事件</span>');
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
    expect(overview.indexOf("id: 'overview'")).toBeLessThan(overview.indexOf("id: 'listener-management'"));
    expect(overview.indexOf("id: 'listener-management'")).toBeLessThan(overview.indexOf("id: 'examples'"));
    expect(overview.indexOf("id: 'examples'")).toBeLessThan(overview.indexOf("id: 'api'"));
    expect(overview.indexOf("id: 'api'")).toBeLessThan(overview.indexOf("id: 'tips'"));
    expect(overview).not.toContain("id: 'api-methods'");
    expect(overview).not.toContain("id: 'api-listener-control'");
    expect(overview).toContain('add* 会自动启用对应的底层监听');
    expect(overview).toContain('disable* 会停止对应底层监听并清空该类别的全部回调');
    expect(overview).toContain('const dispose = earth.useGlobalEvent().addMouseClickEventByGlobal(onClick);');
    expect(overview.indexOf('<section id="examples"')).toBeLessThan(overview.indexOf('<section id="api"'));
    for (const child of views.slice(1)) {
      expect(child).toContain("presentation: 'method'");
      expect(child).toContain('<PageAnchor');
      expect(child).toContain('id="tips"');
    }
    expect(globalMouse).toContain('/components/global-event#api-type-globaleventcallback');
    expect(moduleEvents).toContain('/components/global-event#api-type-moduleeventcallback');

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
    const keyboardMethods = ['addKeyDownEventByGlobal', 'hasGlobalKeyDownEvent'];
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
      'disableGlobalMouseRightClickEvent',
      'enableGlobalKeyDownEvent',
      'disableGlobalKeyDownEvent'
    ];
    const canonicalMethods = [...globalMouseMethods, ...moduleMethods, ...keyboardMethods, ...listenerMethods];
    const sourceMethods = [...source.matchAll(/^ {2}(?!(?:private|protected)\s)(?:public\s+)?([A-Za-z]\w*)\([^)]*\)[^{]*\{/gm)]
      .map((match) => match[1])
      .filter((name) => !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name));
    expect(canonicalMethods).toHaveLength(58);
    expect(new Set(canonicalMethods)).toEqual(new Set(sourceMethods));
    for (const child of [globalMouse, moduleEvents, keyboard]) {
      expect(child).toContain('id="api-listener-control"');
      expect(child).toContain('高级：底层监听控制');
    }
    for (const method of listenerMethods) expect(overview).not.toMatch(new RegExp(`\\[\\s*'${method}',`));
    for (const method of keyboardMethods) {
      expect([...keyboard.matchAll(new RegExp(`\\[\\s*'${method}',`, 'g'))]).toHaveLength(1);
    }
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
    expect(globalEvent).toContain('id="api-constructor"');
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
      '/components/global-event#api-constructor',
      '/components/global-event#api-constructor',
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

  it('documents six GlobalEvent lifecycle demos and their maintenance rules', async () => {
    const examples = [
      ['GlobalEventView.vue', '最小完整生命周期', 'example-minimal-lifecycle', 'GlobalEventLifecycleDemo'],
      ['GlobalEventGlobalMouseView.vue', '持续全局事件', 'example-persistent-global-events', 'GlobalEventDemo'],
      ['GlobalEventGlobalMouseView.vue', '一次性事件与取消', 'example-once-events', 'GlobalEventOnceDemo'],
      ['GlobalEventModuleEventsView.vue', '模块回调生命周期', 'example-module-lifecycle', 'GlobalEventModuleDemo'],
      ['GlobalEventModuleEventsView.vue', '模块事件清理范围', 'example-module-cleanup-scope', 'GlobalEventModuleCleanupDemo'],
      ['GlobalEventKeyboardView.vue', '键盘事件生命周期', 'example-keyboard-lifecycle', 'GlobalEventKeyboardDemo']
    ] as const;
    const sourceNames = {
      GlobalEventLifecycleDemo: 'globalEventLifecycleSource',
      GlobalEventDemo: 'globalEventSource',
      GlobalEventOnceDemo: 'globalEventOnceSource',
      GlobalEventModuleDemo: 'globalEventModuleSource',
      GlobalEventModuleCleanupDemo: 'globalEventModuleCleanupSource',
      GlobalEventKeyboardDemo: 'globalEventKeyboardSource'
    } as const;
    const viewFiles = [...new Set(examples.map(([viewFile]) => viewFile))];
    const views = Object.fromEntries(await Promise.all(viewFiles.map(async (file) => [file, await readFile(`website/src/views/${file}`, 'utf8')])));
    const demos = Object.fromEntries(
      await Promise.all(examples.map(async ([, , , component]) => [component, await readFile(`website/src/examples/${component}.vue`, 'utf8')]))
    );
    const rules = await readFile('website/AGENTS.md', 'utf8');

    for (const [viewFile, title, anchor, component] of examples) {
      const view = views[viewFile];
      const demo = demos[component];
      const sourceName = sourceNames[component];
      expect(view).toContain(`import ${component} from '../examples/${component}.vue';`);
      expect(view).toContain(`import ${sourceName} from '../examples/${component}.vue?raw';`);
      expect(view).toContain(`{ id: '${anchor}', label: '${title}' }`);
      expect(view).toContain(`id="${anchor}"`);
      expect(view).toContain(`title="${title}"`);
      expect(view).toMatch(new RegExp(`:source="${sourceName}"\\s*>\\s*<template #preview>\\s*<${component}\\s*\\/>`, 's'));
      expect(demo, `${component} should use the configured map source`).toContain('createConfiguredLayer');
      expect(demo, `${component} should clean up registrations before destroy`).toContain('onBeforeUnmount');
      expect(demo.indexOf('onBeforeUnmount'), `${component} cleanup should precede destroy`).toBeLessThan(demo.indexOf('earthRef.value?.destroy()'));
    }

    const cleanupCalls = {
      GlobalEventLifecycleDemo: ['clickDisposer?.()'],
      GlobalEventDemo: ['moveDisposer?.()', 'clickDisposer?.()'],
      GlobalEventOnceDemo: ['cancelOnceClick?.()', 'cancelOnceRightClick?.()'],
      GlobalEventModuleDemo: ['clickDisposer?.()', 'dblClickDisposer?.()'],
      GlobalEventModuleCleanupDemo: ['clickDisposer?.()', 'dblClickDisposer?.()'],
      GlobalEventKeyboardDemo: ['cancelKeyDown?.()']
    } as const;
    for (const [component, calls] of Object.entries(cleanupCalls)) {
      const demo = demos[component as keyof typeof demos];
      const cleanupStart = demo.indexOf('onBeforeUnmount(() => {');
      const destroy = demo.indexOf('earthRef.value?.destroy()');
      for (const call of calls) {
        const callIndex = demo.indexOf(call, cleanupStart);
        expect(callIndex, `${component} should call ${call} during unmount cleanup`).toBeGreaterThan(cleanupStart);
        expect(callIndex, `${component} should call ${call} before destroying Earth`).toBeLessThan(destroy);
      }
    }

    const dailyDemos = examples.map(([, , , component]) => demos[component]);
    for (const demo of dailyDemos) {
      expect(demo).toMatch(/add[A-Za-z]*Event/);
      expect(demo).toMatch(/(?:disposers|[A-Za-z]+Disposer|cancel[A-Za-z]*)/);
      expect(demo).not.toMatch(/(?:enable|disable)(?:Global|Module)/);
    }

    const [overview, globalMouse, moduleEvents, keyboard] = [
      views['GlobalEventView.vue'],
      views['GlobalEventGlobalMouseView.vue'],
      views['GlobalEventModuleEventsView.vue'],
      views['GlobalEventKeyboardView.vue']
    ];
    expect(overview).toContain('重要提示：监听自动管理');
    expect(overview).toContain('返回的注销函数只清理本次注册');
    expect(overview).toContain('disable* 会停止对应底层监听并清空该类别的全部回调');
    expect(overview).not.toContain('GlobalEventListenerControlDemo');
    expect(overview).not.toContain('example-advanced-listener-control');
    expect(overview).toContain('href=&quot;/guide/global-methods#api-methods&quot;>earth.useGlobalEvent</a>');
    expect(overview).not.toContain('href=&quot;#api-methods&quot;>earth.useGlobalEvent</a>');
    expect(demos.GlobalEventLifecycleDemo).toContain('addMouseClickEventByGlobal');
    expect(demos.GlobalEventOnceDemo).toContain('addCancelableMouseOnceClickEventByGlobal');
    expect(demos.GlobalEventOnceDemo).toContain('addCancelableMouseOnceRightClickEventByGlobal');
    expect(demos.GlobalEventModuleDemo).toContain('addMouseClickEventByModule');
    expect(demos.GlobalEventModuleDemo).toContain('addMouseDblClickEventByModule');
    expect(demos.GlobalEventModuleDemo).not.toContain('removeModuleEvent');
    expect(demos.GlobalEventModuleDemo).not.toContain('removeAllModuleEvents');
    expect(demos.GlobalEventModuleCleanupDemo).toContain("removeModuleEvent(MODULE, 'dblClick')");
    expect(demos.GlobalEventModuleCleanupDemo).toContain('removeAllModuleEvents(MODULE)');
    expect(demos.GlobalEventKeyboardDemo).toContain('addKeyDownEventByGlobal');
    expect(demos.GlobalEventKeyboardDemo).toContain('hasGlobalKeyDownEvent');
    for (const view of [overview, globalMouse, moduleEvents, keyboard]) expect(view).toContain('code-fn');
    expect(globalMouse).toContain('href=&quot;#api-methods&quot;');
    expect(moduleEvents).toContain('href=&quot;#api-methods&quot;');
    expect(keyboard).toContain('href=&quot;#api-methods&quot;');

    expect(rules).toContain('日常示例优先调用返回注销函数的高层 `add*` API');
    expect(rules).toContain('`disable*` 会批量停用底层监听并清空同类别回调');
  });

  it('defines the Earth-owned feature hit type and links all interaction references to their owner pages', async () => {
    const [globalMethods, rules] = await Promise.all([readFile('website/src/views/GlobalMethodsView.vue', 'utf8'), readFile('website/AGENTS.md', 'utf8')]);

    expect(globalMethods).toContain("{ id: 'api-type-ifeatureatpixel', label: 'IFeatureAtPixel' }");
    expect(globalMethods.indexOf('id="api-type-ifeatureatpixel"')).toBeLessThan(globalMethods.indexOf('id="api-methods"'));
    expect(globalMethods).toContain('returns: \'<a href="#api-type-ifeatureatpixel">IFeatureAtPixel</a>\'');
    expect(globalMethods).toContain('params: \'<a href="/components/context-menu#api-type-icontextmenuoption">IContextMenuOption</a>?\'');

    for (const [method, page, type, anchor] of [
      ['useGlobalEvent', 'global-event', 'GlobalEvent', 'api-constructor'],
      ['useContextMenu', 'context-menu', 'ContextMenu', 'api-methods'],
      ['useDrawTool', 'dynamic-draw', 'DynamicDraw', 'api-methods'],
      ['useMeasure', 'measure', 'Measure', 'api-methods']
    ]) {
      expect(globalMethods).toContain(`<code class="code-fn"><a href="/components/${page}#${anchor}">${method}</a></code>`);
      expect(globalMethods).toContain(`returns: '<a href="/components/${page}#${anchor}">${type}</a>'`);
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
