<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const moveState = ref('在地图上移动鼠标');
const clickState = ref('等待地图点击');
const clickRegistered = ref(false);
let moveDisposer: (() => void) | null = null;
let clickDisposer: (() => void) | null = null;
const center = fromLonLat([116.4074, 39.9042]);

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const events = earth.useGlobalEvent();
  moveDisposer = events.addMouseMoveEventByGlobal(({ position }) => {
    const [longitude, latitude] = position.map((value) => value.toFixed(4));
    moveState.value = `移动：${longitude}, ${latitude}`;
  });
  clickDisposer = events.addMouseClickEventByGlobal(({ position, pixel }) => {
    const [longitude, latitude] = position.map((value) => value.toFixed(4));
    clickState.value = `点击：${longitude}, ${latitude}（像素 ${pixel.join(', ')}）`;
  });
  clickRegistered.value = events.hasGlobalMouseClickEvent();
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  moveDisposer?.();
  clickDisposer?.();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-tag :type="clickRegistered ? 'success' : 'info'">点击回调：{{ clickRegistered ? '已注册' : '未注册' }}</el-tag>
      <span>{{ moveState }}</span>
      <span>{{ clickState }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
