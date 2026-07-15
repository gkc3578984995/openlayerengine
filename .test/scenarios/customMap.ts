import { useEarth } from '@vrsim/earth-engine-ol';
import { ScenarioDefinition } from '../harness/types';

export const customMap: ScenarioDefinition = {
  id: 'customm-map',
  group: '自定义地图',
  title: '用户自定义地图',
  summary: '直接展示自定义地图。',
  steps: ['测试创建一个自定义地图，并展示所有工具函数的结果。'],
  mount(context) {
    const target = context.createMapTarget('1');
    target.id = 'olContainer';
    setTimeout(() => {
      const earth = context.trackEarth(useEarth({ view: { center: [0, 0], zoom: 2 } }));
      earth.layers.add({ kind: 'vector', id: 'a', zIndex: 25, wrapX: true, declutter: false });
      earth.elements.add({
        layerId: 'a',
        geometry: { type: 'circle', center: [0, 0], radius: 1000000 }
      });
    }, 1000);
  }
};
