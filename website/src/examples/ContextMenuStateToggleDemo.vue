<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, PolylineLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const FIRST_ID = 'vehicle-state-001';
const SECOND_ID = 'vehicle-state-002';
const FIRST_POSITION = fromLonLat([116.39, 39.91]);
const SECOND_POSITION = fromLonLat([116.45, 39.89]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const trackLayerRef = shallowRef<PolylineLayer | null>(null);
const firstVisible = ref(true);
const secondVisible = ref(true);
const feedback = ref('分别切换两辆车的轨迹菜单项，地图轨迹与菜单状态都会按 featureId 隔离。');
const items: IContextMenuItem[] = [
  { key: 'toggle-track', label: '切换轨迹显示' },
  { key: 'locate-vehicle', label: '定位车辆' },
  { key: 'show-vehicle-track', label: '显示车辆与轨迹' }
];

const toggleTrack = (featureId: string) => {
  const menu = earthRef.value?.useContextMenu();
  const trackLayer = trackLayerRef.value;
  if (!menu || !trackLayer) return;
  const visible = menu.toggleModuleMenuState(MODULE, featureId, 'toggle-track');
  if (visible) trackLayer.show(featureId);
  else trackLayer.hide(featureId);
  if (featureId === FIRST_ID) firstVisible.value = visible;
  else secondVisible.value = visible;
  feedback.value = `${featureId} 的轨迹菜单项和地图轨迹已${visible ? '显示' : '隐藏'}。`;
};

onMounted(() => {
  const earth = new Earth({ center: FIRST_POSITION, zoom: 11 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  const trackLayer = new PolylineLayer(earth, { register: false });
  vehicles.add({ id: FIRST_ID, module: MODULE, center: FIRST_POSITION, size: 12, fill: { color: '#409eff' }, label: { text: '车辆 001', offsetY: 22 } });
  vehicles.add({ id: SECOND_ID, module: MODULE, center: SECOND_POSITION, size: 12, fill: { color: '#67c23a' }, label: { text: '车辆 002', offsetY: 22 } });
  trackLayer.add({
    id: FIRST_ID,
    module: MODULE,
    positions: [fromLonLat([116.36, 39.89]), FIRST_POSITION, fromLonLat([116.42, 39.93])],
    stroke: { color: '#409eff', width: 5 }
  });
  trackLayer.add({
    id: SECOND_ID,
    module: MODULE,
    positions: [fromLonLat([116.42, 39.87]), SECOND_POSITION, fromLonLat([116.48, 39.92])],
    stroke: { color: '#67c23a', width: 5 }
  });
  earth.useContextMenu().addModuleMenu(MODULE, items, ({ menu, featureId, position }) => {
    if (!featureId) return;
    if (menu.key === 'toggle-track') {
      toggleTrack(featureId);
      return;
    }
    const center = fromLonLat(position);
    if (menu.key === 'locate-vehicle') {
      earth.flyTo(center, 13);
      feedback.value = `已定位 ${featureId}。`;
      return;
    }
    earth.useContextMenu().setModuleMenuState(MODULE, featureId, 'toggle-track', true);
    trackLayer.show(featureId);
    if (featureId === FIRST_ID) firstVisible.value = true;
    else secondVisible.value = true;
    earth.flyTo(center, 12);
    feedback.value = `已显示 ${featureId} 及其完整轨迹。`;
  });
  trackLayerRef.value = trackLayer;
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
      <el-button size="small" @click="toggleTrack(FIRST_ID)">切换车辆 001 轨迹</el-button><el-tag>{{ firstVisible ? '001 显示' : '001 隐藏' }}</el-tag
      ><el-button size="small" @click="toggleTrack(SECOND_ID)">切换车辆 002 轨迹</el-button><el-tag>{{ secondVisible ? '002 显示' : '002 隐藏' }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
