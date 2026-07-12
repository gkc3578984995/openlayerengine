<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, OverlayLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const OVERLAY_ID = 'basic-overlay';
const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const overlayLayer = shallowRef<OverlayLayer | null>(null);
let overlayElement: HTMLDivElement | null = null;

const createOverlayElement = () => {
  const element = document.createElement('div');
  element.className = 'overlay-layer-demo-card';
  element.textContent = '北京 · 覆盖物';
  return element;
};

const addOverlay = () => {
  const layer = overlayLayer.value;
  if (!layer || layer.get(OVERLAY_ID)) return;

  overlayElement = createOverlayElement();
  layer.add({
    id: OVERLAY_ID,
    element: overlayElement,
    position: BEIJING,
    positioning: 'bottom-center',
    offset: [0, -14],
    data: { city: '北京' }
  });
  layer.get(OVERLAY_ID);
};

const removeOverlay = () => {
  overlayLayer.value?.remove(OVERLAY_ID);
  overlayElement?.remove();
  overlayElement = null;
};

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 6 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  overlayLayer.value = new OverlayLayer(earth);
  addOverlay();
});

onBeforeUnmount(() => {
  removeOverlay();
  overlayLayer.value?.remove();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="addOverlay">添加覆盖物</el-button>
      <el-button type="danger" plain @click="removeOverlay">移除覆盖物</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>

<style>
.overlay-layer-demo-card {
  padding: 8px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  color: var(--doc-text);
  background: var(--doc-surface);
  box-shadow: var(--doc-shadow);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
