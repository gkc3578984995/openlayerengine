<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';

const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const graticuleOn = ref(false);
const scaleLineOn = ref(false);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(
    earth.createXyzLayer(([z, x, y]) => {
      return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
    })
  );
  earthRef.value = earth;
});

const toggleGraticule = () => {
  if (graticuleOn.value) {
    earthRef.value?.disableGraticule();
  } else {
    earthRef.value?.enableGraticule();
  }
  graticuleOn.value = !graticuleOn.value;
};

const toggleScaleLine = () => {
  if (scaleLineOn.value) {
    earthRef.value?.disableScaleLine();
  } else {
    earthRef.value?.enableScaleLine();
  }
  scaleLineOn.value = !scaleLineOn.value;
};

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button :type="graticuleOn ? 'primary' : 'default'" @click="toggleGraticule">
        {{ graticuleOn ? '隐藏' : '显示' }}网格线
      </el-button>
      <el-button :type="scaleLineOn ? 'primary' : 'default'" @click="toggleScaleLine">
        {{ scaleLineOn ? '隐藏' : '显示' }}比例尺
      </el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
