<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('选择一种量距离方式后，按地图提示绘制；右键结束会话。');

const startMeasure = (mode: 'segment' | 'first' | 'center') => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  const callback = (event: { data: unknown[]; totalDistance?: number }) => {
    feedback.value = `已记录 ${event.data.length} 段距离${event.totalDistance === undefined ? '' : `，总计 ${event.totalDistance} km`}。`;
  };
  if (mode === 'segment') {
    measure.lineSegmentation({ callback });
    feedback.value = '逐段距离：依次单击折线节点，右键结束。';
  } else if (mode === 'first') {
    measure.lineFirst({ callback });
    feedback.value = '起点累计：依次单击节点，右键结束。';
  } else {
    measure.lineCenter({ callback });
    feedback.value = '中心距离：先单击中心点，再单击目标点；右键结束。';
  }
};

const clearMeasurement = () => {
  const earth = earthRef.value;
  if (!earth) return;
  const measure = earth.useMeasure();
  measure.clear();
  feedback.value = '距离测量已清空。';
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
      <el-button type="primary" @click="startMeasure('segment')">逐段距离</el-button>
      <el-button @click="startMeasure('first')">起点累计</el-button>
      <el-button @click="startMeasure('center')">中心距离</el-button>
      <el-button type="danger" plain @click="clearMeasurement">清空</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
