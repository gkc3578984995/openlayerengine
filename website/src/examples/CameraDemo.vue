<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';

const BEIJING = fromLonLat([116.4074, 39.9042]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);
const CHENGDU = fromLonLat([104.0657, 30.6598]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(
    earth.createXyzLayer(([z, x, y]) => {
      return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
    })
  );
  earthRef.value = earth;
});

const goBeijing = () => earthRef.value?.flyTo(BEIJING, 5);
const goShanghai = () => earthRef.value?.flyTo(SHANGHAI, 6);
const goChengdu = () => earthRef.value?.animateFlyTo(CHENGDU, 6, 800);
const goHome = () => earthRef.value?.flyHome();

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button @click="goBeijing">北京</el-button>
      <el-button @click="goShanghai">上海</el-button>
      <el-button @click="goChengdu">成都（动画）</el-button>
      <el-button @click="goHome">复位</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
