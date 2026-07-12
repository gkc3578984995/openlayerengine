<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { DrawType, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import type { Feature } from 'ol';
import type { Geometry } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const selectedFeature = shallowRef<Feature<Geometry> | null>(null);
const feedback = ref('绘制点后可查询数量或删除该成果。');
const drawPoint = () => {
  earthRef.value?.useDrawTool().drawPoint({
    callback: (event) => {
      if (event.type === DrawType.Drawend && event.feature) {
        selectedFeature.value = event.feature;
        feedback.value = '已保存一个成果。';
      }
    }
  });
};
const inspect = () => (feedback.value = `当前共有 ${earthRef.value?.useDrawTool().get()?.length ?? 0} 个成果。`);
const removeSelected = () => {
  const feature = selectedFeature.value;
  if (!feature) return;
  earthRef.value?.useDrawTool().remove(feature);
  selectedFeature.value = null;
  feedback.value = '已删除当前成果。';
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
    <div class="example-demo__toolbar"><el-button type="primary" @click="drawPoint">绘制点</el-button><el-button @click="inspect">查询成果</el-button><el-button type="danger" plain :disabled="!selectedFeature" @click="removeSelected">删除当前成果</el-button><span>{{ feedback }}</span></div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
