<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const COMMAND_CENTER = fromLonLat([116.4074, 39.9042]);
const DEPOT = fromLonLat([116.365, 39.925]);
const INSPECTION_SITE = fromLonLat([116.455, 39.885]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const isDark = ref(false);
const feedback = ref('切换主题后右键地图，再选择场景菜单定位不同业务点。');
const items: IContextMenuItem[] = [
  { key: 'locate-command-center', label: '定位指挥中心' },
  { key: 'locate-vehicle-depot', label: '定位车辆仓库' },
  { key: 'locate-inspection-site', label: '定位巡检现场' }
];

const setTheme = (dark: boolean) => {
  earthRef.value?.useContextMenu().setTheme(dark);
  isDark.value = dark;
  feedback.value = `setTheme(${dark}) 已执行；右键地图查看${dark ? '深色' : '浅色'}菜单。`;
};
const toggleTheme = () => {
  const dark = earthRef.value?.useContextMenu().toggleTheme();
  if (dark === undefined) return;
  isDark.value = dark;
  feedback.value = `toggleTheme() 返回 ${dark}。`;
};

onMounted(() => {
  const earth = new Earth({ center: COMMAND_CENTER, zoom: 11 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const sceneLayer = new PointLayer(earth, { register: false });
  sceneLayer.add({ id: 'command-center', center: COMMAND_CENTER, size: 12, fill: { color: '#409eff' }, label: { text: '指挥中心', offsetY: 22 } });
  sceneLayer.add({ id: 'vehicle-depot', center: DEPOT, size: 11, fill: { color: '#67c23a' }, label: { text: '车辆仓库', offsetY: 22 } });
  sceneLayer.add({ id: 'inspection-site', center: INSPECTION_SITE, size: 11, fill: { color: '#e6a23c' }, label: { text: '巡检现场', offsetY: 22 } });
  earth.useContextMenu({ isDarkTheme: false }).addDefaultMenu(items, ({ menu }) => {
    const targets: Record<string, number[]> = {
      'locate-command-center': COMMAND_CENTER,
      'locate-vehicle-depot': DEPOT,
      'locate-inspection-site': INSPECTION_SITE
    };
    earth.flyTo(targets[menu.key] ?? COMMAND_CENTER, 13);
    feedback.value = `已执行：${menu.label}`;
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
      <el-button size="small" @click="setTheme(false)">设为浅色</el-button><el-button size="small" @click="setTheme(true)">设为深色</el-button
      ><el-button size="small" type="primary" @click="toggleTheme">切换主题</el-button
      ><el-tag :type="isDark ? 'info' : 'success'">{{ isDark ? '深色主题' : '浅色主题' }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
