<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const FIRST_ID = 'vehicle-state-001';
const SECOND_ID = 'vehicle-state-002';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const firstVisible = ref(true);
const secondVisible = ref(true);
const feedback = ref('分别切换两辆车的“查看轨迹”项，状态按 featureId 隔离。');
const items: IContextMenuItem[] = [
  { key: 'view-track', label: '查看轨迹' },
  { key: 'locate-vehicle', label: '定位车辆' },
  { key: 'vehicle-detail', label: '车辆详情' }
];

const toggleTrack = (featureId: string) => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  const visible = menu.toggleModuleMenuState(MODULE, featureId, 'view-track');
  if (featureId === FIRST_ID) firstVisible.value = visible;
  else secondVisible.value = visible;
  feedback.value = `${featureId} 的轨迹菜单项已${visible ? '显示' : '隐藏'}。`;
};

onMounted(() => {
  const center = fromLonLat([116.4074, 39.9042]);
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  vehicles.add({ id: FIRST_ID, module: MODULE, center, size: 12, fill: { color: '#409eff' }, label: { text: '车辆 001', offsetY: 20 } });
  vehicles.add({
    id: SECOND_ID,
    module: MODULE,
    center: fromLonLat([117.2, 39.5]),
    size: 12,
    fill: { color: '#67c23a' },
    label: { text: '车辆 002', offsetY: 20 }
  });
  earth.useContextMenu().addModuleMenu(MODULE, items, ({ menu, featureId }) => (feedback.value = `${featureId}：${menu.label}`));
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
      <el-button size="small" @click="toggleTrack(FIRST_ID)">切换车辆 001 轨迹项</el-button><el-tag>{{ firstVisible ? '001 可见' : '001 隐藏' }}</el-tag
      ><el-button size="small" @click="toggleTrack(SECOND_ID)">切换车辆 002 轨迹项</el-button><el-tag>{{ secondVisible ? '002 可见' : '002 隐藏' }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
