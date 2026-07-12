<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const eventsRef = shallowRef<ReturnType<Earth['useGlobalEvent']> | null>(null);
const feedback = ref('点击“重新注册回调”后在地图上单击');
const clickRegistered = ref(false);
let clickDisposer: (() => void) | null = null;

const updateStatus = () => {
  clickRegistered.value = eventsRef.value?.hasGlobalMouseClickEvent() ?? false;
};

const enableListener = () => {
  const events = eventsRef.value;
  if (!events) return;
  if (!events.hasGlobalMouseClickEvent()) {
    events.enableGlobalMouseClickEvent();
  }
  feedback.value = '底层点击监听已启用；若此前停用过，仍需重新注册回调';
  updateStatus();
};

const disableListener = () => {
  const events = eventsRef.value;
  if (!events) return;
  if (events.hasGlobalMouseClickEvent()) {
    events.disableGlobalMouseClickEvent();
  }
  clickDisposer = null;
  feedback.value = '监听已停用且回调已清空，请重新注册';
  updateStatus();
};

const registerCallback = () => {
  const events = eventsRef.value;
  if (!events) return;
  if (clickDisposer) return;
  if (events.hasGlobalMouseClickEvent() && !clickDisposer) {
    events.disableGlobalMouseClickEvent();
  }
  clickDisposer = events.addMouseClickEventByGlobal(({ position }) => {
    const [longitude, latitude] = position.map((value) => value.toFixed(4));
    feedback.value = `回调触发：${longitude}, ${latitude}`;
  });
  feedback.value = '点击回调已重新注册';
  updateStatus();
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
      <el-button size="small" @click="enableListener">启用监听</el-button>
      <el-button size="small" type="danger" plain @click="disableListener">停用并清空</el-button>
      <el-button size="small" type="primary" @click="registerCallback">重新注册回调</el-button>
      <el-tag :type="clickRegistered ? 'success' : 'info'">监听状态：{{ clickRegistered ? '存在' : '不存在' }}</el-tag>
      <span>{{ feedback }}</span>
      <span>停用监听会清空该类别的全部回调，再次启用后仍需重新注册。</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
