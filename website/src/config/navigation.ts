export interface NavItem {
  label: string;
  to: string;
  children?: NavItem[];
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
        label: 'GlobalEvent 地图事件',
        to: '/components/global-event',
        children: [
          { label: '概览与初始化', to: '/components/global-event' },
          { label: '全局鼠标事件', to: '/components/global-event/global-mouse' },
          { label: '模块鼠标事件', to: '/components/global-event/module-events' },
          { label: '全局键盘事件', to: '/components/global-event/keyboard' }
        ]
      },
      {
        label: 'ContextMenu 右键菜单',
        to: '/components/context-menu',
        children: [
          { label: '概览与初始化', to: '/components/context-menu' },
          { label: '全局菜单', to: '/components/context-menu/default-menu' },
          { label: '模块菜单', to: '/components/context-menu/module-menu' },
          { label: '级联菜单', to: '/components/context-menu/cascade-menu' },
          { label: '菜单状态', to: '/components/context-menu/menu-state' },
          { label: '菜单移除与清理', to: '/components/context-menu/cleanup' }
        ]
      },
      {
        label: 'DynamicDraw 动态绘制', to: '/components/dynamic-draw', children: [
          { label: '概览与接入', to: '/components/dynamic-draw' },
          { label: '基础几何绘制', to: '/components/dynamic-draw/basic-geometry' },
          { label: '高级几何绘制', to: '/components/dynamic-draw/advanced-geometry' },
          { label: '几何编辑', to: '/components/dynamic-draw/editing' },
          { label: '图形管理', to: '/components/dynamic-draw/management' }
        ]
      },
      {
        label: 'Measure 测量工具',
        to: '/components/measure',
        children: [
          { label: '概览与初始化', to: '/components/measure' },
          { label: '量距离', to: '/components/measure/distance' },
          { label: '量面积', to: '/components/measure/area' },
          { label: '移除测量', to: '/components/measure/remove' }
        ]
      }
    ]
  }
];
