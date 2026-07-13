<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolylineLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const LINE_ID = 'basic-polyline';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polylineLayer = shallowRef<PolylineLayer | null>(null);
let hasLine = false;

const addLine = () => {
  if (!polylineLayer.value || hasLine) return;
  polylineLayer.value.add({
    id: LINE_ID,
    positions: [BEIJING, SHANGHAI],
    stroke: { color: '#409eff', width: 4 },
    label: { text: '北京 → 上海', fill: { color: '#1f2937' }, offsetY: -12 }
  });
  hasLine = true;
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([119, 35.5]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  polylineLayer.value = new PolylineLayer(earth, { register: false });
  addLine();
});

onBeforeUnmount(() => {
  polylineLayer.value?.destroy();
  polylineLayer.value = null;
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="addLine">添加线路</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
