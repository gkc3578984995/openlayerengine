<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';

const BEIJING = fromLonLat([116.4074, 39.9042]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const vectorLayerId = ref<string | null>(null);
const satelliteLayerId = ref<string | null>(null);

const createAmapLayer = (earth: Earth, style: 6 | 8) => {
  return earth.createXyzLayer(([z, x, y]) => {
    return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=${style}&x=${x}&y=${y}&z=${z}`;
  });
};

const createMap = () => {
  if (earthRef.value) return;
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  vectorLayerId.value = earth.addLayer(createAmapLayer(earth, 8));
  earthRef.value = earth;
};

const addSatelliteLayer = () => {
  const earth = earthRef.value;
  if (!earth || satelliteLayerId.value) return;
  satelliteLayerId.value = earth.addLayer(createAmapLayer(earth, 6));
};

const removeVectorLayer = () => {
  if (!earthRef.value || !vectorLayerId.value) return;
  earthRef.value.removeLayer(vectorLayerId.value);
  vectorLayerId.value = null;
};

const removeSatelliteLayer = () => {
  if (!earthRef.value || !satelliteLayerId.value) return;
  earthRef.value.removeLayer(satelliteLayerId.value);
  satelliteLayerId.value = null;
};

const destroyMap = () => {
  earthRef.value?.destroy();
  earthRef.value = null;
  vectorLayerId.value = null;
  satelliteLayerId.value = null;
};

onMounted(createMap);
onBeforeUnmount(destroyMap);
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="createMap">创建地图</el-button>
      <el-button :disabled="!earthRef || !!satelliteLayerId" @click="addSatelliteLayer">添加卫星底图</el-button>
      <el-button :disabled="!vectorLayerId" plain @click="removeVectorLayer">移除矢量底图</el-button>
      <el-button :disabled="!satelliteLayerId" plain @click="removeSatelliteLayer">移除卫星底图</el-button>
      <el-button type="danger" plain @click="destroyMap">销毁地图</el-button>
    </div>
    <p class="example-demo__hint">矢量底图：{{ vectorLayerId ? '已添加' : '已移除' }}；卫星底图：{{ satelliteLayerId ? '已添加' : '未添加或已移除' }}</p>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
