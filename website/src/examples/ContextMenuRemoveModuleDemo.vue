<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-cleanup-001';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const registered = ref(true);
const trackVisible = ref(false);
const feedback = ref('已预先隐藏此车辆的“查看轨迹”菜单项。');
const items: IContextMenuItem[] = [
  { key: 'view-track', label: '查看轨迹' },
  { key: 'locate-vehicle', label: '定位车辆' },
  { key: 'vehicle-detail', label: '车辆详情' }
];

const clearState = () => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  const cleared = menu.clearModuleMenuState(MODULE, VEHICLE_ID);
  trackVisible.value = menu.getModuleMenuState(MODULE, VEHICLE_ID, 'view-track');
  feedback.value = cleared ? `已清理 ${VEHICLE_ID} 的状态；轨迹项恢复为显示。` : '当前没有可清理的状态。';
};
const removeMenu = () => {
  const removed = earthRef.value?.useContextMenu().removeModuleMenu(MODULE) ?? false;
  if (removed) registered.value = false;
  feedback.value = removed ? '已移除车辆模块菜单及全部车辆状态。' : '没有可移除的车辆模块菜单。';
};

onMounted(() => {
  const center = fromLonLat([116.4074, 39.9042]);
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  vehicles.add({ id: VEHICLE_ID, module: MODULE, center, size: 12, fill: { color: '#f56c6c' }, label: { text: '清理状态车辆', offsetY: 20 } });
  const menu = earth.useContextMenu();
  menu.addModuleMenu(MODULE, items, ({ menu: item }) => (feedback.value = `已执行：${item.label}`));
  menu.setModuleMenuState(MODULE, VEHICLE_ID, 'view-track', false);
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
      <el-button size="small" @click="clearState">清理此车辆状态</el-button
      ><el-button size="small" type="danger" plain @click="removeMenu">移除模块菜单</el-button><el-tag>{{ trackVisible ? '轨迹项显示' : '轨迹项隐藏' }}</el-tag
      ><el-tag :type="registered ? 'success' : 'info'">{{ registered ? '模块菜单已注册' : '模块菜单已移除' }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
