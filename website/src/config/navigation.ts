export interface NavItem {
  label: string;
  to: string;
  children?: NavItem[];
}

export interface SideGroup {
  title: string;
  items: NavItem[];
}

export interface SideNavigationMatch {
  group: SideGroup;
  item: NavItem;
}

export type TopNavIndex = '/' | '/components' | '/api';

export const getTopNavIndex = (path: string): TopNavIndex => {
  if (path === '/api' || path.startsWith('/api/')) return '/api';
  if (path === '/components' || path.startsWith('/components/')) return '/components';
  return '/';
};

export const topNavItems: NavItem[] = [
  { label: '指南', to: '/' },
  { label: '组件', to: '/components/core/earth' },
  { label: 'API 查询', to: '/api/methods' }
];

export const sideGroups: SideGroup[] = [
  {
    title: '快速上手',
    items: [
      { label: '安装', to: '/guide/quick-start' },
      { label: '创建第一张地图', to: '/guide/earth-create' },
      { label: '1.x → 2.0 迁移', to: '/guide/migration-v2' }
    ]
  },
  {
    title: '核心',
    items: [
      { label: 'Earth 与生命周期', to: '/components/core/earth' },
      { label: '视图（View）', to: '/components/core/view' },
      { label: '图层（Layers）', to: '/components/core/layers' },
      { label: '地图控件（Controls）', to: '/components/core/controls' }
    ]
  },
  {
    title: '地图元素',
    items: [
      { label: 'Element 概览', to: '/components/elements/overview' },
      { label: '创建', to: '/components/elements/create' },
      { label: '查询与选择器', to: '/components/elements/query' },
      { label: '更新、复制与显隐', to: '/components/elements/update' },
      { label: '协同保护模式', to: '/components/elements/protection' },
      { label: '删除与清理', to: '/components/elements/cleanup' },
      { label: '图形类型（Shapes）', to: '/components/elements/shapes' },
      { label: '样式（Styles）', to: '/components/elements/styles' },
      { label: '路径线饰（Linework）', to: '/components/elements/linework' }
    ]
  },
  {
    title: '地图交互',
    items: [
      { label: '绘制（Draw）', to: '/components/interactions/draw' },
      { label: '编辑（Edit）', to: '/components/interactions/edit' },
      { label: '测量（Measure）', to: '/components/interactions/measure' },
      { label: '变换（Transform）', to: '/components/interactions/transform' }
    ]
  },
  {
    title: '地图表现',
    items: [{ label: '动画（Animations）', to: '/components/presentation/animations' }]
  },
  {
    title: '地图服务',
    items: [
      { label: '右键菜单（ContextMenu）', to: '/components/services/context-menu' },
      { label: '事件（Events）', to: '/components/services/events' },
      { label: '覆盖物（Overlays）', to: '/components/services/overlays' },
      { label: 'Descriptor', to: '/components/services/descriptor' }
    ]
  },
  {
    title: '工具与参考',
    items: [
      { label: 'Utils', to: '/components/reference/utils' },
      { label: '错误类型', to: '/components/reference/errors' }
    ]
  }
];

/** 不占用左侧菜单的独立文档页面。 */
export const standaloneNavItems: NavItem[] = [];

export const apiNavItems: NavItem[] = [
  { label: '方法', to: '/api/methods' },
  { label: '类型', to: '/api/types' }
];

const findItem = (items: readonly NavItem[], path: string): NavItem | undefined => {
  for (const item of items) {
    if (item.to === path) return item;
    const child = item.children ? findItem(item.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
};

export const findSideNavigation = (path: string): SideNavigationMatch | undefined => {
  for (const group of sideGroups) {
    const item = findItem(group.items, path);
    if (item) return { group, item };
  }
  return undefined;
};

export const getSideNavigationLabel = (path: string): string => findSideNavigation(path)?.item.label ?? '';

export const getNavigationLabel = (path: string): string =>
  getSideNavigationLabel(path) || standaloneNavItems.find((item) => item.to === path)?.label || apiNavItems.find((item) => item.to === path)?.label || '';
