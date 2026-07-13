<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { CircleLayer, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const CIRCLE_ID = 'update-circle';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const TIANJIN = fromLonLat([117.2009, 39.0842]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const circleLayerRef = shallowRef<CircleLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 8 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const circleLayer = new CircleLayer(earth);
  circleLayer.add({
    id: CIRCLE_ID,
    center: BEIJING,
    radius: 22000,
    fill: { color: 'rgba(16, 185, 129, 0.25)' },
    stroke: { color: '#059669', width: 2 }
  });
  circleLayerRef.value = circleLayer;
});

const moveToTianjin = () => {
  circleLayerRef.value?.setPosition(CIRCLE_ID, TIANJIN);
  earthRef.value?.animateFlyTo(TIANJIN, 8, 600);
};

const reset = () => {
  circleLayerRef.value?.setPosition(CIRCLE_ID, BEIJING);
  earthRef.value?.animateFlyTo(BEIJING, 8, 600);
};

onBeforeUnmount(() => {
  circleLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="moveToTianjin">移动到天津</el-button>
      <el-button @click="reset">复位</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
