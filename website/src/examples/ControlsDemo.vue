<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { Stroke } from 'ol/style';
import { createConfiguredLayer } from '../config/mapSources';

const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const graticuleOn = ref(false);
const scaleLineOn = ref(false);
const graticuleShowsLabels = ref(true);
const scaleLineUsesImperial = ref(false);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
});

const toggleGraticule = () => {
  if (graticuleOn.value) {
    earthRef.value?.disableGraticule();
  } else {
    earthRef.value?.enableGraticule({
      showLabels: graticuleShowsLabels.value,
      targetSize: graticuleShowsLabels.value ? 100 : 160,
      strokeStyle: new Stroke({ color: '#409eff', width: 1.5 })
    });
  }
  graticuleOn.value = !graticuleOn.value;
};

const rebuildGraticule = () => {
  graticuleShowsLabels.value = !graticuleShowsLabels.value;
  earthRef.value?.enableGraticule({
    showLabels: graticuleShowsLabels.value,
    targetSize: graticuleShowsLabels.value ? 100 : 160,
    strokeStyle: new Stroke({ color: '#409eff', width: 1.5 })
  });
  graticuleOn.value = true;
};

const toggleScaleLine = () => {
  if (scaleLineOn.value) {
    earthRef.value?.disableScaleLine();
  } else {
    earthRef.value?.enableScaleLine({ units: scaleLineUsesImperial.value ? 'imperial' : 'metric', bar: true, text: true, minWidth: 140 });
  }
  scaleLineOn.value = !scaleLineOn.value;
};

const rebuildScaleLine = () => {
  scaleLineUsesImperial.value = !scaleLineUsesImperial.value;
  earthRef.value?.enableScaleLine({ units: scaleLineUsesImperial.value ? 'imperial' : 'metric', bar: true, text: true, minWidth: 140 });
  scaleLineOn.value = true;
};

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button :type="graticuleOn ? 'primary' : 'default'" @click="toggleGraticule"> {{ graticuleOn ? '隐藏' : '显示' }}网格线 </el-button>
      <el-button @click="rebuildGraticule">切换{{ graticuleShowsLabels ? '无标签' : '带标签' }}网格</el-button>
      <el-button :type="scaleLineOn ? 'primary' : 'default'" @click="toggleScaleLine"> {{ scaleLineOn ? '隐藏' : '显示' }}比例尺 </el-button>
      <el-button @click="rebuildScaleLine">切换{{ scaleLineUsesImperial ? '公制' : '英制' }}比例尺</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
