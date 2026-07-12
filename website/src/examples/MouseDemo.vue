<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';

const BEIJING = fromLonLat([116.4074, 39.9042]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const dragEnabled = ref(true);
const cursorLabel = ref('default');

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(
    earth.createXyzLayer(([z, x, y]) => {
      return `https://webrd0${(x % 4) + 1}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
    })
  );
  earthRef.value = earth;
});

const setCrosshair = () => {
  earthRef.value?.setMouseStyleToCrosshair();
  cursorLabel.value = 'crosshair';
};

const setDefault = () => {
  earthRef.value?.setMouseStyleToDefault();
  cursorLabel.value = 'default';
};

const toggleDrag = () => {
  if (dragEnabled.value) {
    earthRef.value?.disabledMapDrag();
  } else {
    earthRef.value?.enableMapDrag();
  }
  dragEnabled.value = !dragEnabled.value;
};

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button @click="setCrosshair">十字准线</el-button>
      <el-button @click="setDefault">默认指针</el-button>
      <el-button :type="dragEnabled ? 'primary' : 'danger'" @click="toggleDrag">
        {{ dragEnabled ? '禁用拖拽' : '启用拖拽' }}
      </el-button>
      <span class="example-demo__hint">当前光标：{{ cursorLabel }} | 拖拽：{{ dragEnabled ? '开' : '关' }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
