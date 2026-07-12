<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PolylineLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const LINE_ID = 'update-polyline';
const ORIGINAL_ROUTE = [fromLonLat([116.4074, 39.9042]), fromLonLat([121.4737, 31.2304])];
const UPDATED_ROUTE = [fromLonLat([116.4074, 39.9042]), fromLonLat([114.3054, 30.5931]), fromLonLat([113.2644, 23.1291])];

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polylineLayer = shallowRef<PolylineLayer | null>(null);

const addOriginalLine = () => {
  polylineLayer.value?.add({ id: LINE_ID, positions: ORIGINAL_ROUTE, stroke: { color: '#409eff', width: 4 } });
};

const updateLine = () => {
  polylineLayer.value?.setPosition(LINE_ID, UPDATED_ROUTE);
  polylineLayer.value?.set({
    id: LINE_ID,
    stroke: { color: '#67c23a', width: 6 },
    label: { text: '北京 → 武汉 → 广州', fill: { color: '#166534' }, offsetY: -12 }
  });
};

const hideLine = () => {
  polylineLayer.value?.hide(LINE_ID);
};

const showLine = () => {
  polylineLayer.value?.show(LINE_ID);
};

const removeLine = () => {
  polylineLayer.value?.remove(LINE_ID);
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([117, 32]), zoom: 4 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  polylineLayer.value = new PolylineLayer(earth, { register: false });
  addOriginalLine();
});

onBeforeUnmount(() => {
  polylineLayer.value?.remove();
  polylineLayer.value?.destroy();
  polylineLayer.value = null;
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="updateLine">更新路线与样式</el-button>
      <el-button @click="hideLine">隐藏</el-button>
      <el-button @click="showLine">显示</el-button>
      <el-button type="danger" plain @click="removeLine">移除</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
