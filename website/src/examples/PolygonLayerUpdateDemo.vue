<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolygonLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POLYGON_ID = 'update-polygon';
const CENTER = fromLonLat([116.4074, 39.9042]);
const BEIJING_POSITIONS = [
  [fromLonLat([115.95, 40.15]), fromLonLat([116.7, 40.1]), fromLonLat([116.6, 39.7]), fromLonLat([116.05, 39.7]), fromLonLat([115.95, 40.15])]
];
const TIANJIN_POSITIONS = [
  [fromLonLat([116.85, 39.3]), fromLonLat([117.55, 39.25]), fromLonLat([117.45, 38.85]), fromLonLat([116.95, 38.85]), fromLonLat([116.85, 39.3])]
];
const TIANJIN = fromLonLat([117.2009, 39.0842]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polygonLayerRef = shallowRef<PolygonLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: CENTER, zoom: 7 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const polygonLayer = new PolygonLayer(earth, { register: false });
  polygonLayer.add({
    id: POLYGON_ID,
    positions: BEIJING_POSITIONS,
    fill: { color: 'rgba(139, 92, 246, 0.24)' },
    stroke: { color: '#7c3aed', width: 2 }
  });
  polygonLayerRef.value = polygonLayer;
});

const moveToTianjin = () => {
  polygonLayerRef.value?.setPosition(POLYGON_ID, TIANJIN_POSITIONS);
  earthRef.value?.animateFlyTo(TIANJIN, 7, 600);
};

const reset = () => {
  polygonLayerRef.value?.setPosition(POLYGON_ID, BEIJING_POSITIONS);
  earthRef.value?.animateFlyTo(CENTER, 7, 600);
};

onBeforeUnmount(() => {
  polygonLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="moveToTianjin">移动到天津</el-button>
      <el-button @click="reset">复位</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
