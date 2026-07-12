<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const isDark = ref(false);
const feedback = ref('选择主题后右键地图，查看菜单的颜色变化。');
const items: IContextMenuItem[] = [
  { key: 'open-panel', label: '打开地图面板' },
  { key: 'save-view', label: '保存当前视图' },
  { key: 'share-view', label: '分享当前视图' }
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
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earth.useContextMenu({ isDarkTheme: false }).addDefaultMenu(items, ({ menu }) => (feedback.value = `已执行：${menu.label}`));
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
