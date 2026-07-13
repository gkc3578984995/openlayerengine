<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POINT_ID = 'basic-point';
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
    fill: { color: '#409eff' },
    stroke: { color: '#1d4ed8', width: 2 }
  });
  pointLayer.value = layer;
});

const addPoint = () => {
  if (pointLayer.value?.get(POINT_ID).length) return;
  pointLayer.value?.add({
    id: POINT_ID,
    center: BEIJING,
    size: 10,
    fill: { color: '#409eff' },
    stroke: { color: '#1d4ed8', width: 2 }
  });
};

const removePoint = () => {
  pointLayer.value?.remove(POINT_ID);
};

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="addPoint">添加点</el-button>
      <el-button type="danger" plain @click="removePoint">移除点</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
