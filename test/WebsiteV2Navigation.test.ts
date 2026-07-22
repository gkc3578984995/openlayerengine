import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSideNavigation, getSideNavigationLabel, sideGroups, topNavItems } from '../website/src/config/navigation';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const expectedRoutes = [
  '/guide/quick-start',
  '/guide/earth-create',
  '/guide/migration-v2',
  '/components/core/earth',
  '/components/core/view',
  '/components/core/layers',
  '/components/core/controls',
  '/components/elements/overview',
  '/components/elements/create',
  '/components/elements/query',
  '/components/elements/update',
  '/components/elements/protection',
  '/components/elements/cleanup',
  '/components/elements/shapes',
  '/components/elements/styles',
  '/components/elements/linework',
  '/components/interactions/draw',
  '/components/interactions/edit',
  '/components/interactions/measure',
  '/components/interactions/transform',
  '/components/presentation/animations',
  '/components/services/context-menu',
  '/components/services/events',
  '/components/services/overlays',
  '/components/services/descriptor',
  '/components/reference/utils',
  '/components/reference/errors'
] as const;

const flattenItems = (items: (typeof sideGroups)[number]['items']): (typeof sideGroups)[number]['items'] =>
  items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);

describe('website V2 navigation', () => {
  it('publishes the complete V2 menu without legacy 1.x component entries', () => {
    expect(sideGroups.map(({ title }) => title)).toEqual(['快速上手', '核心', '地图元素', '地图交互', '地图表现', '地图服务', '工具与参考']);
    expect(sideGroups.flatMap(({ items }) => flattenItems(items).map(({ to }) => to))).toEqual(expectedRoutes);
    expect(topNavItems[1]).toEqual({ label: '组件', to: '/components/core/earth' });
    expect(topNavItems[2]).toEqual({ label: 'API 查询', to: '/api/methods' });

    const labels = sideGroups.flatMap(({ items }) => flattenItems(items).map(({ label }) => label));
    expect(labels).toEqual([
      '安装',
      '创建第一张地图',
      '1.x → 2.0 迁移',
      'Earth 与生命周期',
      '视图（View）',
      '图层（Layers）',
      '地图控件（Controls）',
      'Element 概览',
      '创建',
      '查询与选择器',
      '更新、复制与显隐',
      '协同保护模式',
      '删除与清理',
      '图形类型（Shapes）',
      '样式（Styles）',
      '路径线饰（Linework）',
      '绘制（Draw）',
      '编辑（Edit）',
      '测量（Measure）',
      '变换（Transform）',
      '动画（Animations）',
      '右键菜单（ContextMenu）',
      '事件（Events）',
      '覆盖物（Overlays）',
      'Descriptor',
      'Utils',
      '错误类型'
    ]);
    expect(labels).not.toContain('PointLayer 点图层');
    expect(labels).not.toContain('DynamicDraw 动态绘制');
    expect(labels).not.toContain('GlobalEvent 地图事件');
  });

  it('resolves page headings from the single navigation configuration', () => {
    expect(getSideNavigationLabel('/components/core/view')).toBe('视图（View）');
    expect(findSideNavigation('/components/services/overlays')?.group.title).toBe('地图服务');
    expect(findSideNavigation('/components/services/descriptor')?.item.label).toBe('Descriptor');
    expect(findSideNavigation('/components/services/overlays/descriptor')).toBeUndefined();
    expect(findSideNavigation('/components/reference/types')).toBeUndefined();
    expect(getSideNavigationLabel('/missing')).toBe('');

    const layout = readSource('website/src/layouts/DocsLayout.vue');
    expect(layout).toContain('getNavigationLabel(route.path)');
    expect(layout).not.toContain('globalEventTitles');
    expect(layout).not.toContain('dynamicDrawTitles');
  });

  it('routes every V2 module to a formal page and preserves home-card redirects', () => {
    const router = readSource('website/src/router/index.ts');

    expect(router).not.toContain('PlannedModuleView');
    expect(router).not.toContain('plannedRoutes');
    expect(router).toContain("import('../views/elements/ElementOverviewView.vue')");
    expect(router).toContain("import('../views/interactions/DrawView.vue')");
    expect(router).toContain("import('../views/presentation/AnimationsView.vue')");
    expect(router).toContain("import('../views/services/OverlaysView.vue')");
    expect(router).toContain("import('../views/reference/UtilsView.vue')");
    expect(router).toContain("import('../views/NotFoundView.vue')");
    expect(router).toContain("{ path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundView }");
    expect(router).toContain("path: 'components/reference/types'");
    expect(router).toContain("redirect: (to) => ({ path: '/api/types', query: to.query, hash: to.hash })");
    expect(router).toContain("{ path: 'components/services/descriptor', name: 'service-descriptor', component: DescriptorView }");
    expect(router).toContain("{ path: 'components/services/overlays/descriptor', redirect: '/components/services/descriptor' }");
    expect(router).toContain("path: '/api'");
    expect(router).toContain("{ path: 'methods', name: 'api-methods', component: ApiMethodsView }");
    expect(router).toContain("{ path: 'types', name: 'api-types', component: ApiTypesView }");
    expect(router).toContain("{ path: 'components/point-layer', redirect: '/components/elements/create' }");
    expect(router).toContain("{ path: 'components/measure', redirect: '/components/interactions/measure' }");
    expect(router).toContain("{ path: 'components/dynamic-draw', redirect: '/components/interactions/draw' }");
    expect(router).not.toContain("import('../views/PointLayerView.vue')");
    expect(router).not.toContain("import('../views/MeasureView.vue')");
  });

  it('uses real project links and sends migration references to canonical pages', () => {
    const links = readSource('website/src/config/projectLinks.ts');
    const docsLayout = readSource('website/src/layouts/DocsLayout.vue');
    const apiLayout = readSource('website/src/layouts/ApiQueryLayout.vue');
    const migration = readSource('website/src/views/MigrationV2View.vue');

    expect(links).toContain('https://github.com/gkc3578984995/openlayerengine');
    expect(docsLayout).toContain(':href="projectRepositoryUrl"');
    expect(docsLayout).toContain(':href="projectIssuesUrl"');
    expect(apiLayout).toContain(':href="projectRepositoryUrl"');
    expect(migration).toContain('旧 Billboard 明确迁为 Point + StyleSpec.symbol 的 icon 分支');
    expect(migration).toContain("to: '/components/interactions/draw#example-draw-session'");
    expect(migration).not.toMatch(/to:\s*'#migration-map-/u);
  });
});
