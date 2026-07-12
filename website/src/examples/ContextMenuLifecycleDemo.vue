<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
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
  const markerLayer = new PointLayer(earth, { register: false });
  earth.useContextMenu().addDefaultMenu(items, ({ menu, position }) => {
    const center = fromLonLat(position);
    if (menu.key === 'mark-location') {
      markerLayer.add({ id: `mark-${Date.now()}`, center, size: 9, fill: { color: '#409eff' }, stroke: { color: '#ffffff', width: 2 } });
      feedback.value = `已在 ${position.map((value) => value.toFixed(4)).join(', ')} 添加临时标记。`;
      return;
    }
    if (menu.key === 'copy-coordinate') {
      markerLayer.remove('copied-position');
      markerLayer.add({ id: 'copied-position', center, size: 8, fill: { color: '#67c23a' }, label: { text: '已复制坐标', offsetY: 20 } });
      void navigator.clipboard?.writeText(position.map((value) => value.toFixed(6)).join(', ')).catch(() => undefined);
      feedback.value = '坐标已复制，绿色标记表示最近一次复制的位置。';
      return;
    }
    markerLayer.remove();
    earth.flyHome();
    feedback.value = '临时标记已清除，地图已返回初始视图。';
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
