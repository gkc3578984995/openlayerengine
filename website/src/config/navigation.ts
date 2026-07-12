export interface NavItem {
  label: string;
  to: string;
  children?: NavItem[];
}

export interface SideGroup {
  title: string;
  items: NavItem[];
}

export const deriveExpandedParentRoutes = (groups: SideGroup[], currentPath: string): Set<string> => {
  const expanded = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      if (item.children && (item.to === currentPath || item.children.some((child) => child.to === currentPath))) {
        expanded.add(item.to);
      }
    }
  }
  return expanded;
};

export const toggleExpandedRoute = (expanded: ReadonlySet<string>, to: string): Set<string> => {
  const next = new Set(expanded);
  if (next.has(to)) next.delete(to);
  else next.add(to);
  return next;
};

export const topNavItems: NavItem[] = [
  { label: '指南', to: '/' },
  { label: '组件', to: '/components/point-layer' }
];

export const sideGroups: SideGroup[] = [
  {
    title: '快速上手',
    items: [
      { label: '安装与引入', to: '/guide/quick-start' },
      { label: '地图创建与销毁', to: '/guide/earth-create' },
      { label: 'Earth 实例方法', to: '/guide/global-methods' }
    ]
  },
  {
    title: '基础图层',
    items: [
      { label: '图层通用操作', to: '/components/layer-common' },
      { label: 'PointLayer 点图层', to: '/components/point-layer' }
    ]
  },
  {
    title: '地图交互',
    items: [
      {
        label: 'GlobalEvent 全局事件',
        to: '/components/global-event',
        children: [
          { label: '概览与初始化', to: '/components/global-event' },
          { label: '全局鼠标事件', to: '/components/global-event/global-mouse' },
          { label: '模块要素事件', to: '/components/global-event/module-events' },
          { label: '键盘事件', to: '/components/global-event/keyboard' },
          { label: '监听控制', to: '/components/global-event/listener-control' }
        ]
      },
      { label: 'ContextMenu 右键菜单', to: '/components/context-menu' },
      { label: 'DynamicDraw 动态绘制', to: '/components/dynamic-draw' },
      { label: 'Measure 测量工具', to: '/components/measure' }
    ]
  }
];
