<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolygonLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POLYGON_ID = 'style-polygon';
const CENTER = fromLonLat([120.1551, 30.2741]);
const POSITIONS = [[fromLonLat([119.7, 30.5]), fromLonLat([120.55, 30.45]), fromLonLat([120.45, 30.05]), fromLonLat([119.8, 30.0]), fromLonLat([119.7, 30.5])]];

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polygonLayerRef = shallowRef<PolygonLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: CENTER, zoom: 7 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const polygonLayer = new PolygonLayer(earth, { register: false });
  polygonLayer.add({
    id: POLYGON_ID,
    positions: POSITIONS,
    fill: { color: 'rgba(16, 185, 129, 0.25)' },
    backgroundStroke: { color: 'rgba(5, 150, 105, 0.28)', width: 9 },
    stroke: { color: '#047857', width: 3 },
    label: { text: '双层边界', fill: { color: '#1f2937' } }
  });
  polygonLayerRef.value = polygonLayer;
});

const useWarningStyle = () => {
  polygonLayerRef.value?.set({
    id: POLYGON_ID,
    fill: { color: 'rgba(245, 158, 11, 0.24)' },
    backgroundStroke: { color: 'rgba(180, 83, 9, 0.28)', width: 10 },
    stroke: { color: '#b45309', width: 3, lineDash: [10, 6] },
    label: { text: '预警区域', fill: { color: '#92400e' } }
  });
};

const useNormalStyle = () => {
  polygonLayerRef.value?.set({
    id: POLYGON_ID,
    fill: { color: 'rgba(16, 185, 129, 0.25)' },
    backgroundStroke: { color: 'rgba(5, 150, 105, 0.28)', width: 9 },
    stroke: { color: '#047857', width: 3, lineDash: [] },
    label: { text: '双层边界', fill: { color: '#1f2937' } }
  });
};

onBeforeUnmount(() => {
  polygonLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="warning" @click="useWarningStyle">预警样式</el-button>
      <el-button @click="useNormalStyle">常规样式</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
