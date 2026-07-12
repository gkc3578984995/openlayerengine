<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolylineLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const FLIGHT_ID = 'demo-flight';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const GUANGZHOU = fromLonLat([113.2644, 23.1291]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polylineLayer = shallowRef<PolylineLayer | null>(null);

const addFlight = () => {
  const layer = polylineLayer.value;
  if (!layer) return;
  layer.removeFlightLine(FLIGHT_ID);
  layer.addFlightLine({
    id: FLIGHT_ID,
    position: [BEIJING, GUANGZHOU],
    width: 4,
    color: '#409eff',
    arrowColor: '#f59e0b',
    isRepeat: true,
    isShowAnchorPoint: true
  });
};

const changeDestination = () => {
  polylineLayer.value?.setFlightPosition(FLIGHT_ID, [BEIJING, SHANGHAI]);
};

const removeFlight = () => {
  polylineLayer.value?.removeFlightLine(FLIGHT_ID);
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.5, 31.5]), zoom: 4 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  polylineLayer.value = new PolylineLayer(earth, { register: false });
  addFlight();
});

onBeforeUnmount(() => {
  polylineLayer.value?.removeFlightLine();
  polylineLayer.value?.destroy();
  polylineLayer.value = null;
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="addFlight">添加飞行线</el-button>
      <el-button @click="changeDestination">改飞上海</el-button>
      <el-button type="danger" plain @click="removeFlight">移除飞行线</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
