<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const BEIJING = fromLonLat([116.4074, 39.9042]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId1 = useId();
const mapId2 = useId();
const earthRef1 = shallowRef<Earth | null>(null);
const earthRef2 = shallowRef<Earth | null>(null);

const createMaps = () => {
  if (earthRef1.value) return;
  const earth1 = useEarth({ id: mapId1, target: mapId1, view: { center: BEIJING, zoom: 5 } });
  console.assert(useEarth(mapId1) === earth1);
  earth1.addLayer(createConfiguredLayer(earth1, 'vector'));
  earthRef1.value = earth1;

  const earth2 = useEarth({ id: mapId2, target: mapId2, view: { center: SHANGHAI, zoom: 6 } });
  console.assert(useEarth(mapId2) === earth2);
  earth2.addLayer(createConfiguredLayer(earth2, 'vector'));
  earthRef2.value = earth2;
};

const destroyMaps = () => {
  earthRef1.value?.destroy();
  earthRef1.value = null;
  earthRef2.value?.destroy();
  earthRef2.value = null;
};

onMounted(() => {
  createMaps();
});

onBeforeUnmount(() => {
  destroyMaps();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="createMaps">创建双地图</el-button>
      <el-button type="danger" plain @click="destroyMaps">销毁全部</el-button>
    </div>
    <div class="example-demo__dual">
      <div :id="mapId1" class="example-stage example-stage--half"></div>
      <div :id="mapId2" class="example-stage example-stage--half"></div>
    </div>
  </div>
</template>
