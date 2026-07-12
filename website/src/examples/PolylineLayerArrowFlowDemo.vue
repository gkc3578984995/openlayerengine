<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolylineLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const ARROW_ID = 'arrow-polyline';
const FLOW_ID = 'flow-polyline';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polylineLayer = shallowRef<PolylineLayer | null>(null);

const addArrowAndFlow = () => {
  const layer = polylineLayer.value;
  if (!layer) return;
  layer.remove();
  layer.add({
    id: ARROW_ID,
    positions: [fromLonLat([108.94, 34.34]), fromLonLat([112.94, 28.23]), fromLonLat([116.41, 39.9])],
    stroke: { color: '#f59e0b', width: 4 },
    isArrow: true,
    arrowIsRepeat: true
  });
  layer.add({
    id: FLOW_ID,
    positions: [fromLonLat([104.07, 30.67]), fromLonLat([114.31, 30.59]), fromLonLat([121.47, 31.23])],
    stroke: { width: 5, lineDash: [10, 18] },
    isFlowingDash: true,
    fullLineColor: 'rgba(37, 99, 235, 0.9)',
    dottedLineColor: '#ffffff'
  });
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([113.5, 33.5]), zoom: 4 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  polylineLayer.value = new PolylineLayer(earth, { register: false });
  addArrowAndFlow();
});

onBeforeUnmount(() => {
  polylineLayer.value?.remove();
  polylineLayer.value?.destroy();
  polylineLayer.value = null;
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="addArrowAndFlow">重建箭头与流动线</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
