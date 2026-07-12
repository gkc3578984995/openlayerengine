<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'event-demo';
const center = fromLonLat([116.4074, 39.9042]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const eventsRef = shallowRef<ReturnType<Earth['useGlobalEvent']> | null>(null);
const feedback = ref('单击或双击蓝色模块点');
const clickRegistered = ref(false);
const disposers: Array<() => void> = [];

const updateStatus = () => {
  clickRegistered.value = eventsRef.value?.hasModuleMouseClickEvent(MODULE) ?? false;
};

const registerEvents = () => {
  const events = eventsRef.value;
  if (!events || events.hasModuleMouseClickEvent(MODULE)) return;
  disposers.push(
    events.addMouseClickEventByModule(MODULE, ({ id }) => {
      feedback.value = `单击模块点：${String(id)}`;
    }),
    events.addMouseDblClickEventByModule(MODULE, ({ id }) => {
      feedback.value = `双击模块点：${String(id)}`;
    })
  );
  updateStatus();
};

const removeEvents = () => {
  eventsRef.value?.removeAllModuleEvents(MODULE);
  feedback.value = '模块回调已全部移除，可点击“重新注册”恢复';
  updateStatus();
};

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const points = new PointLayer(earth, { register: false });
  points.add({ id: 'event-point', module: MODULE, center, size: 12, fill: { color: '#409eff' }, label: { text: '模块点', offsetY: 20 } });
  earthRef.value = earth;
  eventsRef.value = earth.useGlobalEvent();
  registerEvents();
});

onBeforeUnmount(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" type="danger" plain @click="removeEvents">移除全部模块回调</el-button>
      <el-button size="small" type="primary" @click="registerEvents">重新注册点击与双击</el-button>
      <el-tag :type="clickRegistered ? 'success' : 'info'">点击回调：{{ clickRegistered ? '已注册' : '未注册' }}</el-tag>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
