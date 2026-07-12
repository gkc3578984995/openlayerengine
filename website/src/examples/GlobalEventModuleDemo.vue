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
let clickDisposer: (() => void) | null = null;
let dblClickDisposer: (() => void) | null = null;

const registerClick = () => {
  const events = eventsRef.value;
  if (!events || clickDisposer) return;
  clickDisposer = events.addMouseClickEventByModule(MODULE, ({ id }) => {
    feedback.value = `单击模块点：${String(id)}`;
  });
  feedback.value = '点击回调已注册';
};

const registerDblClick = () => {
  const events = eventsRef.value;
  if (!events || dblClickDisposer) return;
  dblClickDisposer = events.addMouseDblClickEventByModule(MODULE, ({ id }) => {
    feedback.value = `双击模块点：${String(id)}`;
  });
  feedback.value = '双击回调已注册';
};

const cancelClick = () => {
  clickDisposer?.();
  clickDisposer = null;
  feedback.value = '仅取消本次点击注册；双击回调保持不变';
};

const cancelDblClick = () => {
  dblClickDisposer?.();
  dblClickDisposer = null;
  feedback.value = '仅取消本次双击注册；点击回调保持不变';
};

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const points = new PointLayer(earth, { register: false });
  points.add({ id: 'event-point', module: MODULE, center, size: 12, fill: { color: '#409eff' }, label: { text: '模块点', offsetY: 20 } });
  earthRef.value = earth;
  eventsRef.value = earth.useGlobalEvent();
  registerClick();
  registerDblClick();
});

onBeforeUnmount(() => {
  clickDisposer?.();
  dblClickDisposer?.();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" @click="cancelClick">取消点击注册</el-button>
      <el-button size="small" @click="cancelDblClick">取消双击注册</el-button>
      <el-button size="small" type="primary" @click="registerClick">重新注册点击</el-button>
      <el-button size="small" type="primary" @click="registerDblClick">重新注册双击</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
