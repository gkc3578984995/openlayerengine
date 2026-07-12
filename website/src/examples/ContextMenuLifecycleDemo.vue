<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图空白处，体验已注册的地图操作菜单。');
const items: IContextMenuItem[] = [
  { key: 'mark-location', label: '标记此位置' },
  { key: 'copy-coordinate', label: '复制坐标' },
  { key: 'reset-view', label: '重置视图' }
];

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earth.useContextMenu().addDefaultMenu(items, ({ menu, position }) => {
    feedback.value = `已执行“${menu.label}”，位置：${position.map((value) => value.toFixed(4)).join(', ')}`;
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
      <el-tag type="info">生命周期：创建 → 注册 → 销毁</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
