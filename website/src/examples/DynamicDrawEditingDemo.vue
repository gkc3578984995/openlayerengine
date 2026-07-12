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
const featureRef = shallowRef<Feature<Geometry> | null>(null);
const feedback = ref('先绘制一个进攻箭头，再点击“编辑当前箭头”。');
const drawArrow = () => {
  earthRef.value?.useDrawTool().drawAttackArrow({
    fillColor: 'rgba(64, 158, 255, 0.28)',
    callback: (event) => {
      if (event.type === DrawType.Drawend && event.feature) {
        featureRef.value = event.feature;
        feedback.value = '箭头已创建，可以开始编辑。';
      }
    }
  });
};
const editArrow = () => {
  const feature = featureRef.value;
  if (!feature) return;
  earthRef.value?.useDrawTool().editAttackArrow({ feature, callback: () => (feedback.value = '正在编辑；右键退出编辑。') });
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
    <div class="example-demo__toolbar"><el-button type="primary" @click="drawArrow">绘制进攻箭头</el-button><el-button :disabled="!featureRef" @click="editArrow">编辑当前箭头</el-button><span>{{ feedback }}</span></div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
