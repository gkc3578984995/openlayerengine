<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POINT_ID = 'style-point';
const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const pointLayer = shallowRef<PointLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const layer = new PointLayer(earth, { register: false });
  layer.add({
    id: POINT_ID,
    center: BEIJING,
    size: 10,
    fill: { color: '#67c23a' },
    stroke: { color: '#2f6b14', width: 2 },
    label: {
      text: 'PointLayer 示例点',
      font: 'bold 13px sans-serif',
      fill: { color: '#1f2937' },
      offsetY: -18
    }
  });
  pointLayer.value = layer;
});

const enlarge = () => {
  pointLayer.value?.set({
    id: POINT_ID,
    size: 16,
    label: { text: '已放大', fill: { color: '#b45309' }, offsetY: -22 }
  });
};

const resetStyle = () => {
  pointLayer.value?.set({
    id: POINT_ID,
    size: 10,
    label: { text: 'PointLayer 示例点', fill: { color: '#1f2937' }, offsetY: -18 }
  });
};

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button @click="enlarge">放大尺寸</el-button>
      <el-button @click="resetStyle">还原</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
