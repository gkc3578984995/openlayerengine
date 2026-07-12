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
const feedback = ref('单击或双击紫色模块点');
let clickDisposer: (() => void) | null = null;
let dblClickDisposer: (() => void) | null = null;

const registerEvents = () => {
  const events = eventsRef.value;
  if (!events) return;
  if (!clickDisposer) {
    clickDisposer = events.addMouseClickEventByModule(MODULE, ({ id }) => {
      feedback.value = `单击模块点：${String(id)}`;
    });
  }
  if (!dblClickDisposer) {
    dblClickDisposer = events.addMouseDblClickEventByModule(MODULE, ({ id }) => {
      feedback.value = `双击模块点：${String(id)}`;
    });
  }
  feedback.value = '点击和双击回调均已注册';
};

const removeClickByDisposer = () => {
  clickDisposer?.();
  clickDisposer = null;
  feedback.value = '只执行了点击回调的返回注销函数';
};

const removeDblClickByType = () => {
  eventsRef.value?.removeModuleEvent(MODULE, 'dblClick');
  dblClickDisposer = null;
  feedback.value = '已按类别移除该模块的双击回调';
};

const removeAllEvents = () => {
  eventsRef.value?.removeAllModuleEvents(MODULE);
  clickDisposer = null;
  dblClickDisposer = null;
  feedback.value = '已批量移除该模块的全部事件类别';
};

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const points = new PointLayer(earth, { register: false });
  points.add({ id: 'cleanup-point', module: MODULE, center, size: 12, fill: { color: '#8e44ad' }, label: { text: '清理范围', offsetY: 20 } });
  earthRef.value = earth;
  eventsRef.value = earth.useGlobalEvent();
  registerEvents();
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
      <el-button size="small" @click="removeClickByDisposer">注销一次点击注册</el-button>
      <el-button size="small" @click="removeDblClickByType">按类别移除双击</el-button>
      <el-button size="small" type="danger" plain @click="removeAllEvents">移除模块全部事件</el-button>
      <el-button size="small" type="primary" @click="registerEvents">重新注册</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
