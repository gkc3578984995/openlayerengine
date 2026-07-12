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
    expect(router).not.toContain("import GlobalEventView from '../views/GlobalEventView.vue';");
    expect(router).not.toContain("import ContextMenuView from '../views/ContextMenuView.vue';");
    expect(router).not.toContain("import DynamicDrawView from '../views/DynamicDrawView.vue';");
    expect(router).not.toContain("import MeasureView from '../views/MeasureView.vue';");
  });

  it('provides a reachable placeholder anchor for every Earth cross-page interaction link', async () => {
    const [globalMethods, router] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8')
    ]);

    const placeholders = {
      globalEvent: 'const InteractionPlaceholderView = { template: \'<section><h2 id="api-methods">API 方法</h2></section>\' };',
      contextMenu:
        'const ContextMenuPlaceholderView = { template: \'<section><h2 id="api-methods">API 方法</h2><h3 id="api-type-icontextmenuoption">IContextMenuOption</h3></section>\' };'
    };
    expect(router).toContain(placeholders.globalEvent);
    expect(router).toContain(placeholders.contextMenu);

    const targetOwner: Record<string, string> = {
      '/components/global-event': placeholders.globalEvent,
      '/components/context-menu': placeholders.contextMenu,
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

  it('defines the Earth-owned feature hit type and links all interaction references to their owner pages', async () => {
    const [globalMethods, rules] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/AGENTS.md', 'utf8')
    ]);

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
