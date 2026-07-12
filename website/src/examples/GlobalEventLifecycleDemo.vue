<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const eventsRef = shallowRef<ReturnType<Earth['useGlobalEvent']> | null>(null);
const feedback = ref('点击“注册点击回调”开始演示');
const registered = ref(false);
let clickDisposer: (() => void) | null = null;

const registerClick = () => {
  const events = eventsRef.value;
  if (!events || clickDisposer) return;
  clickDisposer = events.addMouseClickEventByGlobal(({ position }) => {
    const [longitude, latitude] = position.map((value) => value.toFixed(4));
    feedback.value = `收到地图点击：${longitude}, ${latitude}`;
  });
  registered.value = true;
  feedback.value = '回调已注册，点击地图查看坐标';
};

const unregisterClick = () => {
  clickDisposer?.();
  clickDisposer = null;
  registered.value = false;
  feedback.value = '已执行返回的注销函数';
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  eventsRef.value = earth.useGlobalEvent();
});

onBeforeUnmount(() => {
  clickDisposer?.();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" type="primary" @click="registerClick">注册点击回调</el-button>
      <el-button size="small" @click="unregisterClick">执行注销函数</el-button>
      <el-tag :type="registered ? 'success' : 'info'">回调：{{ registered ? '已注册' : '未注册' }}</el-tag>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
