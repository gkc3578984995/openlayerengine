<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-callback-001';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键车辆后点击菜单项，查看模块回调上下文。');
const items: IContextMenuItem[] = [
  { key: 'dispatch', label: '派发任务' },
  { key: 'contact-driver', label: '联系司机' },
  { key: 'open-work-order', label: '打开工单' }
];

onMounted(() => {
  const center = fromLonLat([116.4074, 39.9042]);
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  const feature = vehicles.add({ id: VEHICLE_ID, module: MODULE, center, size: 12, fill: { color: '#67c23a' }, label: { text: '车辆回调示例', offsetY: 20 } });
  feature.set('param', { driver: '张师傅', status: '执行任务中', plateNumber: '京A·12345' });
  earth.useContextMenu().addModuleMenu(MODULE, items, ({ menu, module, featureId, param, layer }) => {
    feedback.value = `menu=${menu.key}；module=${module}；featureId=${featureId}；param=${JSON.stringify(param)}；layer=${layer?.constructor.name ?? '未知'}`;
  });
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  earthRef.value?.useContextMenu().destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-tag>模块回调上下文</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
