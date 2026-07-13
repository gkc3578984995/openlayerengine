<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POINT_ID = 'flash-point';
const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const pointLayer = shallowRef<PointLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const layer = new PointLayer(earth, { register: false });
  layer.add({
    id: POINT_ID,
    center: BEIJING,
    size: 10,
    fill: { color: '#f56c6c' },
    stroke: { color: '#c45656', width: 2 }
  });
  pointLayer.value = layer;

  // 默认开启闪烁
  startFlash();
});

const startFlash = () => {
  pointLayer.value?.set({
    id: POINT_ID,
    isFlash: true,
    flashColor: { R: 255, G: 99, B: 71 },
    duration: 900,
    isRepeat: true
  });
  pointLayer.value?.continueFlash(POINT_ID);
};

const stopFlash = () => {
  pointLayer.value?.stopFlash(POINT_ID);
};

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="startFlash">开始闪烁</el-button>
      <el-button @click="stopFlash">停止闪烁</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
