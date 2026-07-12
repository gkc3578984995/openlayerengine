<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const markerLayerRef = shallowRef<PointLayer | null>(null);
const registered = ref(false);
const feedback = ref('先注册全局菜单，再尝试移除并重新注册。');
const items: IContextMenuItem[] = [
  { key: 'add-review-marker', label: '添加复核标记' },
  { key: 'add-warning-marker', label: '添加警戒标记' },
  { key: 'clear-markers', label: '清除全部标记' }
];

const registerMenu = () => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  registered.value = menu.addDefaultMenu(items, ({ menu: item, position }) => {
    const markerLayer = markerLayerRef.value;
    if (!markerLayer) return;
    if (item.key === 'clear-markers') {
      markerLayer.remove();
      feedback.value = '地图上的复核标记和警戒标记已清除。';
      return;
    }
    const isWarning = item.key === 'add-warning-marker';
    markerLayer.add({
      id: `${item.key}-${Date.now()}`,
      center: fromLonLat(position),
      size: isWarning ? 12 : 9,
      fill: { color: isWarning ? '#f56c6c' : '#409eff' },
      stroke: { color: '#ffffff', width: 2 },
      label: { text: item.label, offsetY: 22 }
    });
    feedback.value = `已执行“${item.label}”，并在地图上保留操作位置。`;
  });
  feedback.value = '已注册全局菜单；右键地图可以打开。';
};
const removeMenu = () => {
  const removed = earthRef.value?.useContextMenu().removeDefaultMenu() ?? false;
  if (removed) {
    registered.value = false;
    markerLayerRef.value?.remove();
  }
  feedback.value = removed ? '已移除全局菜单；右键地图不再打开菜单。' : '没有可移除的全局菜单。';
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const markerLayer = new PointLayer(earth, { register: false });
  markerLayer.add({
    id: 'initial-review-marker',
    center: fromLonLat([116.4074, 39.9042]),
    size: 9,
    fill: { color: '#409eff' },
    label: { text: '待复核标记', offsetY: 22 }
  });
  markerLayerRef.value = markerLayer;
  earthRef.value = earth;
  registerMenu();
});

onBeforeUnmount(() => {
  markerLayerRef.value?.remove();
  earthRef.value?.useContextMenu().destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" type="primary" @click="registerMenu">重新注册</el-button><el-button size="small" @click="removeMenu">移除全局菜单</el-button
      ><el-tag :type="registered ? 'success' : 'info'">{{ registered ? '已注册' : '未注册' }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
