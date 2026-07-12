<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const eventsRef = shallowRef<ReturnType<Earth['useGlobalEvent']> | null>(null);
const lastKey = ref('尚未按键');
const keyRegistered = ref(false);
const disposers: Array<() => void> = [];
let cancelKeyDown: (() => void) | null = null;

const updateStatus = () => {
  keyRegistered.value = eventsRef.value?.hasGlobalKeyDownEvent() ?? false;
};

const registerKeyDown = () => {
  const events = eventsRef.value;
  if (!events || events.hasGlobalKeyDownEvent()) return;
  cancelKeyDown = events.addKeyDownEventByGlobal((event) => {
    lastKey.value = `最近按键：${event.key}`;
  });
  disposers.push(cancelKeyDown);
  updateStatus();
};

const cancelRegistration = () => {
  cancelKeyDown?.();
  cancelKeyDown = null;
  lastKey.value = '键盘回调已取消';
  updateStatus();
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  eventsRef.value = earth.useGlobalEvent();
});

onBeforeUnmount(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" type="primary" @click="registerKeyDown">注册键盘回调</el-button>
      <el-button size="small" @click="cancelRegistration">取消键盘回调</el-button>
      <el-tag :type="keyRegistered ? 'success' : 'info'">键盘回调：{{ keyRegistered ? '已注册' : '未注册' }}</el-tag>
      <span>{{ lastKey }}</span>
      <span>监听挂载在 document；点击地图获得操作焦点后即可按键，焦点不局限于地图容器。</span>
    </div>
    <div :id="mapId" class="example-stage" tabindex="0"></div>
  </div>
</template>
