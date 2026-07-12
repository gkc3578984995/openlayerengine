<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { CircleLayer, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const CIRCLE_ID = 'basic-circle';
const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const circleLayerRef = shallowRef<CircleLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 9 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const circleLayer = new CircleLayer(earth);
  circleLayer.add({
    id: CIRCLE_ID,
    center: BEIJING,
    radius: 18000,
    fill: { color: 'rgba(64, 158, 255, 0.28)' },
    stroke: { color: '#2563eb', width: 2 },
    label: { text: '服务范围', fill: { color: '#1f2937' } }
  });
  circleLayerRef.value = circleLayer;
});

onBeforeUnmount(() => {
  circleLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
