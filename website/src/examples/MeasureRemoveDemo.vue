<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('先开始测量并绘制一条线，再点击“移除测量”。');

const startMeasure = () => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  measure.lineSegmentation({
    callback: (event) => {
      feedback.value = `已完成 ${event.data.length} 段距离；现在可以移除测量。`;
    }
  });
  feedback.value = '依次单击线节点，右键结束。';
};

const removeMeasurement = () => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  feedback.value = '当前交互、测量图形、顶点标记和测量数据已移除。';
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
      <el-button type="primary" @click="startMeasure">开始距离测量</el-button>
      <el-button type="danger" plain @click="removeMeasurement">移除测量</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
