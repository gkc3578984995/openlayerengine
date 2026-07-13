<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('点击“开始量面积”后依次单击区域顶点，右键结束。');

const startMeasure = () => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  measure.polygonMeasure({
    callback: (event) => {
      feedback.value = `面积为 ${event.area ?? 0} km²，共 ${event.data.length} 个边界坐标。`;
    }
  });
  feedback.value = '依次单击区域顶点，右键结束并查看面积。';
};

const clearMeasurement = () => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  feedback.value = '面积测量已清空。';
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  earth.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="startMeasure">开始量面积</el-button>
      <el-button type="danger" plain @click="clearMeasurement">清空</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
