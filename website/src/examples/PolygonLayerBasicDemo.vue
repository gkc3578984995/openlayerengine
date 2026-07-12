<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolygonLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POLYGON_ID = 'basic-polygon';
const CENTER = fromLonLat([116.4074, 39.9042]);
const POSITIONS = [
  [fromLonLat([115.9, 40.15]), fromLonLat([116.75, 40.1]), fromLonLat([116.65, 39.65]), fromLonLat([116.05, 39.65]), fromLonLat([115.9, 40.15])]
];

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
    fill: { color: 'rgba(64, 158, 255, 0.28)' },
    stroke: { color: '#2563eb', width: 2 },
    label: { text: '规划区域', fill: { color: '#1f2937' } }
  });
  polygonLayerRef.value = polygonLayer;
});

onBeforeUnmount(() => {
  polygonLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
