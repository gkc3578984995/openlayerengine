export interface NavItem {
  label: string;
  to: string;
}

export interface SideGroup {
  title: string;
  items: NavItem[];
}

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
      { label: '全局方法', to: '/guide/global-methods' }
    ]
  },
  {
    title: '基础图层',
    items: [{ label: 'PointLayer 点图层', to: '/components/point-layer' }]
  }
];
