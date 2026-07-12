<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-001';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键蓝色车辆要素，打开车辆操作菜单。');
const items: IContextMenuItem[] = [
  { key: 'locate-vehicle', label: '定位车辆' },
  { key: 'view-track', label: '查看轨迹' },
  { key: 'view-detail', label: '查看详情' }
];

onMounted(() => {
  const center = fromLonLat([116.4074, 39.9042]);
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  vehicles.add({ id: VEHICLE_ID, module: MODULE, center, size: 12, fill: { color: '#409eff' }, label: { text: '车辆 001', offsetY: 20 } });
  earth.useContextMenu().addModuleMenu(MODULE, items, ({ menu, featureId }) => (feedback.value = `车辆 ${featureId}：${menu.label}`));
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
      <el-tag type="success">仅注册车辆模块菜单</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
