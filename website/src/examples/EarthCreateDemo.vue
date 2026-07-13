<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);

const createMap = () => {
  if (earthRef.value) return;
  const earth = useEarth({
    target: mapId,
    view: { center: BEIJING, zoom: 5 }
  });
  useEarth() === earth;
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
};

const destroyMap = () => {
  earthRef.value?.destroy();
  earthRef.value = null;
};

onMounted(() => {
  createMap();
});

onBeforeUnmount(() => {
  destroyMap();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="createMap">创建地图</el-button>
      <el-button type="danger" plain @click="destroyMap">销毁地图</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
