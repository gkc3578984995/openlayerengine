<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const globalState = ref('等待地图点击');
const moduleState = ref('点击蓝色模块点以触发模块回调');
const disposers: Array<() => void> = [];
const center = fromLonLat([116.4074, 39.9042]);

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const points = new PointLayer(earth, { register: false });
  points.add({ id: 'event-point', module: 'event-demo', center, size: 12, fill: { color: '#409eff' }, label: { text: '模块点', offsetY: 20 } });
  const events = earth.useGlobalEvent();
  disposers.push(
    events.addMouseClickEventByGlobal(({ position, pixel }) => {
      const [longitude, latitude] = position.map((value) => value.toFixed(4));
      globalState.value = `全局：${longitude}, ${latitude}（像素 ${pixel.join(', ')}）`;
    }),
    events.addMouseClickEventByModule('event-demo', ({ id, position }) => {
      const [longitude, latitude] = position.map((value) => value.toFixed(4));
      moduleState.value = `模块：${String(id)} @ ${longitude}, ${latitude}`;
    })
  );
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <span>{{ globalState }}</span>
      <span>{{ moduleState }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
