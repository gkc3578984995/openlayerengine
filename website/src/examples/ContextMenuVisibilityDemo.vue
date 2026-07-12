<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('使用按钮修改“导出当前位置”的可见状态，再右键地图验证。');
const exportVisible = ref(true);
const stateLabel = computed(() => (exportVisible.value ? '当前可见' : '当前隐藏'));
const items: IContextMenuItem[] = [
  { key: 'save-current', label: '保存当前位置' },
  { key: 'export-current', label: '导出当前位置' },
  { key: 'open-history', label: '查看位置历史' }
];

const setVisibility = (visible: boolean) => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  menu.setDefaultMenuState('export-current', visible);
  exportVisible.value = menu.getDefaultMenuState('export-current');
  feedback.value = `setDefaultMenuState 后，“导出当前位置”${exportVisible.value ? '显示' : '隐藏'}。`;
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earth.useContextMenu().addDefaultMenu(items, ({ menu }) => (feedback.value = `已执行：${menu.label}`));
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
      <el-button size="small" @click="setVisibility(true)">显示导出项</el-button><el-button size="small" @click="setVisibility(false)">隐藏导出项</el-button
      ><el-tag>{{ stateLabel }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
