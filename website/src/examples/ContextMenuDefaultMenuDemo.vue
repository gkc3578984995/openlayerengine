<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图任意空白位置，可添加不同用途的业务标记。');
const items: IContextMenuItem[] = [
  { key: 'add-task', label: '添加任务点' },
  { key: 'add-warning', label: '添加警戒点' },
  { key: 'clear-marks', label: '清除临时标记' }
];

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const markerLayer = new PointLayer(earth, { register: false });
  earth.useContextMenu().addDefaultMenu(items, ({ menu, position }) => {
    if (menu.key === 'clear-marks') {
      markerLayer.remove();
      feedback.value = '所有任务点和警戒点均已清除。';
      return;
    }
    const isWarning = menu.key === 'add-warning';
    markerLayer.add({
      id: `${menu.key}-${Date.now()}`,
      center: fromLonLat(position),
      size: isWarning ? 12 : 9,
      fill: { color: isWarning ? '#f56c6c' : '#409eff' },
      stroke: { color: '#ffffff', width: 2 },
      label: { text: isWarning ? '警戒点' : '任务点', offsetY: 22 }
    });
    feedback.value = `已在右键位置添加${isWarning ? '红色警戒点' : '蓝色任务点'}。`;
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
      <el-tag type="success">仅注册全局菜单</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
