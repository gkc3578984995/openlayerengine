<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('选择要绘制的基础几何。右键结束线或面绘制。');
const start = (kind: 'point' | 'line' | 'polygon') => {
  const draw = earthRef.value?.useDrawTool();
  if (!draw) return;
  const callback = () => (feedback.value = `已完成${kind === 'point' ? '点' : kind === 'line' ? '线' : '面'}绘制。`);
  if (kind === 'point') draw.drawPoint({ callback });
  if (kind === 'line') draw.drawLine({ callback, strokeColor: '#409eff', strokeWidth: 3 });
  if (kind === 'polygon') draw.drawPolygon({ callback, fillColor: 'rgba(64, 158, 255, 0.25)' });
};
onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
});
onBeforeUnmount(() => {
  const earth = earthRef.value;
  if (!earth) return;
  earth.useDrawTool().destroy({ removeGraphics: true, removeLayers: true });
  earth.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="start('point')">绘制点</el-button><el-button @click="start('line')">绘制线</el-button
      ><el-button @click="start('polygon')">绘制面</el-button><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
