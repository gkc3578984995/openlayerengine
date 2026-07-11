import { ContextMenu, IContextMenuItem, PointLayer, useEarth } from '../../src';
import { fromLonLat } from 'ol/proj';

const vehicleMenu: IContextMenuItem[] = [
  { key: 'openTrack', label: '查看航迹', visible: true, mutexKey: 'closeTrack' },
  { key: 'closeTrack', label: '关闭航迹', visible: false, mutexKey: 'openTrack' },
  {
    key: 'openInfo',
    label: '查看信息',
    child: [{ key: 'openData', label: '查看数据' }]
  }
];

export const testContextMenu = () => {
  const earth = useEarth();
  const contextMenu = new ContextMenu(earth, { isDarkTheme: false });

  contextMenu.addDefaultMenu(
    [
      { key: 'enableOverview', label: '开启概览', visible: true, mutexKey: 'disableOverview' },
      { key: 'disableOverview', label: '关闭概览', visible: false, mutexKey: 'enableOverview' },
      { key: 'toggleTheme', label: '切换白天/夜间主题' }
    ],
    (event) => {
      if (event.menu.key === 'toggleTheme') {
        const isDarkTheme = contextMenu.toggleTheme();
        console.info(`[default menu] theme switched to ${isDarkTheme ? 'dark' : 'light'}`);
        return;
      }
      console.info(`[default menu] selected ${event.menu.key}`);
    }
  );

  contextMenu.addModuleMenu(
    'vehicle',
    vehicleMenu,
    (event) => {
      const featureId = event.featureId;
      if (!featureId) return;
      console.info('[vehicle menu]', {
        menu: event.menu.key,
        featureId,
        param: event.param,
        layer: event.layer
      });
    },
    (event) => {
      if (event.menu.key !== 'openData') return true;
      console.info('[vehicle menu] openData is disabled by before', event.featureId);
      return false;
    }
  );

  const vehicleLayer = new PointLayer(earth);
  vehicleLayer.add({
    id: 'vehicle-a',
    module: 'vehicle',
    center: fromLonLat([120.2, 39.8]),
    size: 10,
    fill: { color: '#0f766e' },
    label: { text: '车辆 A：右键测试菜单' },
    data: { name: 'vehicle-a', status: 'online' }
  });
  vehicleLayer.add({
    id: 'vehicle-b',
    module: 'vehicle',
    center: fromLonLat([120.9, 39.5]),
    size: 10,
    fill: { color: '#c2410c' },
    label: { text: '车辆 B：状态独立' },
    data: { name: 'vehicle-b', status: 'offline' }
  });
  return () => {
    contextMenu.destroy();
    vehicleLayer.remove();
    vehicleLayer.destroy();
  };
};
