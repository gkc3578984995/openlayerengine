<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { CircleLayer, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const CIRCLE_ID = 'pattern-circle';
const HANGZHOU = fromLonLat([120.1551, 30.2741]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const circleLayerRef = shallowRef<CircleLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: HANGZHOU, zoom: 9 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const circleLayer = new CircleLayer(earth);
  circleLayer.add({
    id: CIRCLE_ID,
    center: HANGZHOU,
    radius: 18000,
    fill: { type: 'diagonal', color: '#2563eb', size: 16, lineWidth: 2, backgroundColor: 'rgba(219, 234, 254, 0.45)' },
    stroke: { color: '#1d4ed8', width: 2 }
  });
  circleLayerRef.value = circleLayer;
});

const useDotPattern = () => {
  circleLayerRef.value?.set({
    id: CIRCLE_ID,
    fill: { type: 'dot', color: '#b45309', size: 16, dotRadius: 2, backgroundColor: 'rgba(254, 243, 199, 0.5)' },
    stroke: { color: '#b45309' }
  });
};

const useDiagonalPattern = () => {
  circleLayerRef.value?.set({
    id: CIRCLE_ID,
    fill: { type: 'diagonal', color: '#2563eb', size: 16, lineWidth: 2, backgroundColor: 'rgba(219, 234, 254, 0.45)' },
    stroke: { color: '#1d4ed8' }
  });
};

onBeforeUnmount(() => {
  circleLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="useDotPattern">点阵纹理</el-button>
      <el-button @click="useDiagonalPattern">斜线纹理</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
