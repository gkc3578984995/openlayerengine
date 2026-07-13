<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const eventsRef = shallowRef<ReturnType<Earth['useGlobalEvent']> | null>(null);
const feedback = ref('分别注册一次左键或右键回调');
let cancelOnceClick: (() => void) | null = null;
let cancelOnceRightClick: (() => void) | null = null;

const registerOnceEvents = () => {
  const events = eventsRef.value;
  if (!events) return;
  cancelOnceClick?.();
  cancelOnceRightClick?.();
  cancelOnceClick = events.addCancelableMouseOnceClickEventByGlobal(({ position }) => {
    feedback.value = `一次左键点击：${position.map((value) => value.toFixed(4)).join(', ')}`;
    cancelOnceClick = null;
  });
  cancelOnceRightClick = events.addCancelableMouseOnceRightClickEventByGlobal(({ position }) => {
    feedback.value = `一次右键点击：${position.map((value) => value.toFixed(4)).join(', ')}`;
    cancelOnceRightClick = null;
  });
  feedback.value = '左键和右键的一次性回调均已注册';
};

const cancelOnceEvents = () => {
  cancelOnceClick?.();
  cancelOnceRightClick?.();
  cancelOnceClick = null;
  cancelOnceRightClick = null;
  feedback.value = '一次性回调已取消，可重新注册';
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  eventsRef.value = earth.useGlobalEvent();
  registerOnceEvents();
});

onBeforeUnmount(() => {
  cancelOnceClick?.();
  cancelOnceRightClick?.();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" type="primary" @click="registerOnceEvents">注册或重新注册</el-button>
      <el-button size="small" @click="cancelOnceEvents">取消两类一次性回调</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
