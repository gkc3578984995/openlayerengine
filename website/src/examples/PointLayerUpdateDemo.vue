<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';

const POINT_ID = 'update-point';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const pointLayer = shallowRef<PointLayer | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(
    earth.createXyzLayer(([z, x, y]) => {
      return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
    })
  );
  earthRef.value = earth;

  const layer = new PointLayer(earth, { register: false });
  layer.add({
    id: POINT_ID,
    center: BEIJING,
    size: 10,
    fill: { color: '#409eff' },
    stroke: { color: '#1d4ed8', width: 2 },
    label: { text: '北京', fill: { color: '#1f2937' }, offsetY: -18 }
  });
  pointLayer.value = layer;
});

const moveToShanghai = () => {
  pointLayer.value?.setPosition(POINT_ID, SHANGHAI);
  pointLayer.value?.set({
    id: POINT_ID,
    label: { text: '上海', fill: { color: '#b45309' }, offsetY: -18 }
  });
  earthRef.value?.animateFlyTo(SHANGHAI, 6, 600);
};

const reset = () => {
  pointLayer.value?.setPosition(POINT_ID, BEIJING);
  pointLayer.value?.set({
    id: POINT_ID,
    label: { text: '北京', fill: { color: '#1f2937' }, offsetY: -18 }
  });
  earthRef.value?.animateFlyTo(BEIJING, 5, 600);
};

onBeforeUnmount(() => {
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
