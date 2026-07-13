<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, PolylineLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-cleanup-001';
const VEHICLE_CENTER = fromLonLat([116.4074, 39.9042]);
const TRACK_POINTS = [fromLonLat([116.24, 39.86]), VEHICLE_CENTER, fromLonLat([116.58, 40.01])];
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const trackLayerRef = shallowRef<PolylineLayer | null>(null);
const registered = ref(true);
const trackVisible = ref(false);
const feedback = ref('车辆轨迹已隐藏；清理菜单状态后会恢复默认显示。');
const items: IContextMenuItem[] = [
  { key: 'toggle-track', label: '切换车辆轨迹' },
  { key: 'locate-vehicle', label: '定位车辆' },
  { key: 'show-vehicle-track', label: '查看车辆与轨迹' }
];

const clearState = () => {
  const menu = earthRef.value?.useContextMenu();
  const trackLayer = trackLayerRef.value;
  if (!menu || !trackLayer) return;
  const cleared = menu.clearModuleMenuState(MODULE, VEHICLE_ID);
  trackVisible.value = menu.getModuleMenuState(MODULE, VEHICLE_ID, 'toggle-track');
  if (trackVisible.value) trackLayer.show();
  else trackLayer.hide();
  feedback.value = cleared ? '已清理车辆菜单状态，轨迹恢复默认显示。' : '当前没有可清理的车辆状态。';
};

const removeMenu = () => {
  const removed = earthRef.value?.useContextMenu().removeModuleMenu(MODULE) ?? false;
  if (removed) registered.value = false;
  feedback.value = removed ? '车辆模块菜单已移除；地图上的车辆和轨迹仍然保留。' : '没有可移除的车辆模块菜单。';
};

onMounted(() => {
  const earth = new Earth({ center: VEHICLE_CENTER, zoom: 9 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  const trackLayer = new PolylineLayer(earth, { register: false });
  vehicles.add({ id: VEHICLE_ID, module: MODULE, center: VEHICLE_CENTER, size: 12, fill: { color: '#f56c6c' }, label: { text: '清理状态车辆', offsetY: 20 } });
  trackLayer.add({ id: VEHICLE_ID, module: MODULE, positions: TRACK_POINTS, stroke: { color: '#409eff', width: 4 } });
  trackLayer.hide();

  const menu = earth.useContextMenu();
  menu.addModuleMenu(MODULE, items, ({ menu: item, position }) => {
    if (item.key === 'toggle-track') {
      trackVisible.value = !trackVisible.value;
      menu.setModuleMenuState(MODULE, VEHICLE_ID, 'toggle-track', trackVisible.value);
      if (trackVisible.value) trackLayer.show();
      else trackLayer.hide();
      feedback.value = trackVisible.value ? '车辆轨迹已显示。' : '车辆轨迹已隐藏。';
      return;
    }
    earth.flyTo(fromLonLat(position), item.key === 'locate-vehicle' ? 12 : 10);
    if (item.key === 'show-vehicle-track') {
      trackVisible.value = true;
      menu.setModuleMenuState(MODULE, VEHICLE_ID, 'toggle-track', true);
      trackLayer.show();
    }
    feedback.value = item.key === 'locate-vehicle' ? '已定位车辆。' : '已展示车辆与完整轨迹。';
  });
  menu.setModuleMenuState(MODULE, VEHICLE_ID, 'toggle-track', false);
  earthRef.value = earth;
  trackLayerRef.value = trackLayer;
});

onBeforeUnmount(() => {
  earthRef.value?.useContextMenu().destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" @click="clearState">清理此车辆状态</el-button>
      <el-button size="small" type="danger" plain @click="removeMenu">移除模块菜单</el-button>
      <el-tag>{{ trackVisible ? '轨迹显示' : '轨迹隐藏' }}</el-tag>
      <el-tag :type="registered ? 'success' : 'info'">{{ registered ? '模块菜单已注册' : '模块菜单已移除' }}</el-tag>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
