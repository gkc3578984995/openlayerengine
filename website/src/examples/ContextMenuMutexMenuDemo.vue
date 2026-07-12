<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, PolylineLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const VEHICLE_POSITION = fromLonLat([116.4074, 39.9042]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图切换车辆标签或行驶轨迹，同组菜单项会自动互斥。');
const items: IContextMenuItem[] = [
  { key: 'show-label', label: '显示车辆标签', mutexKey: 'hide-label' },
  { key: 'hide-label', label: '隐藏车辆标签', mutexKey: 'show-label', visible: false },
  { key: 'enable-follow', label: '显示行驶轨迹', mutexKey: 'stop-follow' },
  { key: 'stop-follow', label: '隐藏行驶轨迹', mutexKey: 'enable-follow', visible: false }
];

onMounted(() => {
  const earth = new Earth({ center: VEHICLE_POSITION, zoom: 11 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));

  const vehicleLayer = new PointLayer(earth, { register: false });
  const labelLayer = new PointLayer(earth, { register: false });
  const trackLayer = new PolylineLayer(earth, { register: false });
  vehicleLayer.add({ id: 'vehicle-body', center: VEHICLE_POSITION, size: 12, fill: { color: '#409eff' } });
  labelLayer.add({ id: 'vehicle-label', center: VEHICLE_POSITION, size: 1, fill: { color: '#409eff00' }, label: { text: '运输车 京A·1024', offsetY: 24 } });
  trackLayer.add({
    id: 'vehicle-track',
    positions: [fromLonLat([116.37, 39.88]), VEHICLE_POSITION, fromLonLat([116.45, 39.93])],
    stroke: { color: '#67c23a', width: 5 },
    backgroundStroke: { color: '#ffffff', width: 9 }
  });
  labelLayer.hide();
  trackLayer.hide();

  earth.useContextMenu().addDefaultMenu(items, ({ menu }) => {
    if (menu.key === 'show-label') labelLayer.show();
    else if (menu.key === 'hide-label') labelLayer.hide();
    else if (menu.key === 'enable-follow') trackLayer.show();
    else if (menu.key === 'stop-follow') trackLayer.hide();
    feedback.value = `已执行：${menu.label}。再次右键可看到同组的另一个选项。`;
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
      <el-tag type="warning">标签与轨迹两组互斥状态</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
