<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { BillboardLayer, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const SVG_NAMESPACE = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');
const MARKER_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="${SVG_NAMESPACE}" width="48" height="48" viewBox="0 0 48 48"><path fill="#2563eb" d="M24 2C14.1 2 6 10.1 6 20c0 13.5 18 26 18 26s18-12.5 18-26C42 10.1 33.9 2 24 2Z"/><circle cx="24" cy="20" r="7" fill="white"/></svg>`
)}`;
const CENTER = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const billboardLayerRef = shallowRef<BillboardLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: CENTER, zoom: 10 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const billboardLayer = new BillboardLayer(earth, { wrapX: false });
  billboardLayer.add({
    id: 'basic-billboard',
    center: CENTER,
    src: MARKER_SRC,
    size: [48, 48],
    anchor: [24, 48],
    anchorXUnits: 'pixels',
    anchorYUnits: 'pixels'
  });
  billboardLayerRef.value = billboardLayer;
});

onBeforeUnmount(() => {
  billboardLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
