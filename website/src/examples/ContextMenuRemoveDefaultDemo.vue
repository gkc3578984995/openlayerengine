<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const registered = ref(false);
const feedback = ref('先注册全局菜单，再尝试移除并重新注册。');
const items: IContextMenuItem[] = [
  { key: 'save-map', label: '保存地图快照' },
  { key: 'copy-link', label: '复制地图链接' },
  { key: 'reset-map', label: '恢复初始视图' }
];

const registerMenu = () => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  registered.value = menu.addDefaultMenu(items, ({ menu: item }) => (feedback.value = `已执行：${item.label}`));
  feedback.value = '已注册全局菜单；右键地图可以打开。';
};
const removeMenu = () => {
  const removed = earthRef.value?.useContextMenu().removeDefaultMenu() ?? false;
  if (removed) registered.value = false;
  feedback.value = removed ? '已移除全局菜单；右键地图不再打开菜单。' : '没有可移除的全局菜单。';
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  registerMenu();
});

onBeforeUnmount(() => {
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
