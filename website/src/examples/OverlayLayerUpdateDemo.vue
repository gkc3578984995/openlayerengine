<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, OverlayLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const OVERLAY_ID = 'update-overlay';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const overlayLayer = shallowRef<OverlayLayer | null>(null);
let overlayElement: HTMLDivElement | null = null;

const createOverlayElement = () => {
  const element = document.createElement('div');
  element.className = 'overlay-layer-update-card';
  element.textContent = '北京';
  return element;
};

const updateOverlay = (label: string, position: number[], offset: number[]) => {
  if (!overlayElement) return;
  overlayElement.textContent = label;
  overlayLayer.value?.set({ id: OVERLAY_ID, element: overlayElement, offset, positioning: 'bottom-center' });
  overlayLayer.value?.setPosition(OVERLAY_ID, position);
};

const moveToShanghai = () => {
  updateOverlay('上海', SHANGHAI, [0, -20]);
  earthRef.value?.animateFlyTo(SHANGHAI, 6, 600);
};

const reset = () => {
  updateOverlay('北京', BEIJING, [0, -14]);
  earthRef.value?.animateFlyTo(BEIJING, 6, 600);
};

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 6 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  overlayElement = createOverlayElement();
  const layer = new OverlayLayer(earth);
  layer.add({ id: OVERLAY_ID, element: overlayElement, position: BEIJING, positioning: 'bottom-center', offset: [0, -14] });
  overlayLayer.value = layer;
});

onBeforeUnmount(() => {
  overlayLayer.value?.remove(OVERLAY_ID);
  overlayElement?.remove();
  overlayElement = null;
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="moveToShanghai">移动到上海</el-button>
      <el-button @click="reset">复位</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>

<style>
.overlay-layer-update-card {
  min-width: 72px;
  padding: 9px 14px;
  border: 1px solid var(--doc-primary);
  border-radius: 999px;
  color: var(--doc-primary-deep);
  background: var(--doc-surface);
  box-shadow: var(--doc-shadow);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}
</style>
