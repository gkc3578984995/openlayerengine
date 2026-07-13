<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { BillboardLayer, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const SVG_NAMESPACE = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');
const MARKER_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="${SVG_NAMESPACE}" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" fill="#ffffff" stroke="#0f766e" stroke-width="4"/><path fill="#0f766e" d="m26 8 5.4 11 12.1 1.8-8.8 8.5 2.1 12.1L26 35.8l-10.8 5.6 2.1-12.1-8.8-8.5L20.6 19Z"/></svg>`
)}`;
const BILLBOARD_ID = 'style-billboard';
const CENTER = fromLonLat([120.1551, 30.2741]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const billboardLayerRef = shallowRef<BillboardLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: CENTER, zoom: 10 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const billboardLayer = new BillboardLayer(earth, { wrapX: false });
  billboardLayer.add({
    id: BILLBOARD_ID,
    center: CENTER,
    src: MARKER_SRC,
    size: [52, 52],
    label: { text: '城市地标', offsetY: -38, fill: { color: '#134e4a' } }
  });
  billboardLayerRef.value = billboardLayer;
});

const emphasize = () => {
  billboardLayerRef.value?.set({
    id: BILLBOARD_ID,
    scale: 1.35,
    rotation: 18,
    displacement: [12, 8],
    label: { text: '重点地标', offsetY: -46, fill: { color: '#b45309' } }
  });
};

const resetStyle = () => {
  billboardLayerRef.value?.set({
    id: BILLBOARD_ID,
    scale: 1,
    rotation: 0,
    displacement: [0, 0],
    label: { text: '城市地标', offsetY: -38, fill: { color: '#134e4a' } }
  });
};

onBeforeUnmount(() => {
  billboardLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="warning" @click="emphasize">强调样式</el-button>
      <el-button @click="resetStyle">还原</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
