<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, ETransform, ETranslateType, PolygonLayer, Transform, type ITransformCallback } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const FEATURE_ID = 'transform-polygon';
const CENTER = fromLonLat([116.4074, 39.9042]);
const polygonPositions = [
  [fromLonLat([115.7, 39.55]), fromLonLat([117.1, 39.55]), fromLonLat([117.1, 40.25]), fromLonLat([115.7, 40.25]), fromLonLat([115.7, 39.55])]
];

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const transformRef = shallowRef<Transform | null>(null);
const eventLogs = ref<string[]>(['等待选择图形']);

const formatEvent = (event: ITransformCallback) => {
  const feature = event.featureId ? ` · ${event.featureId}` : '';
  eventLogs.value = [`${event.type}${feature}`, ...eventLogs.value].slice(0, 4);
};

const trackedEvents = [ETransform.Select, ETransform.TranslateEnd, ETransform.RotateEnd, ETransform.ScaleEnd, ETransform.Undo, ETransform.Redo];

onMounted(() => {
  const earth = new Earth({ center: CENTER, zoom: 7 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const layer = new PolygonLayer(earth, { register: false });
  layer.add({
    id: FEATURE_ID,
    positions: polygonPositions,
    fill: { color: 'rgba(64, 158, 255, 0.28)' },
    stroke: { color: '#2563eb', width: 3 }
  });

  const transform = new Transform({
    earth,
    translateType: ETranslateType.Feature,
    scale: true,
    stretch: true,
    rotate: true,
    historyLimit: 10,
    transformLayers: [layer.getLayer()]
  });
  transform.on(trackedEvents, formatEvent);
  transformRef.value = transform;
});

const undo = () => {
  const transform = transformRef.value;
  if (!transform) return;
  transform.undo();
};

const redo = () => {
  const transform = transformRef.value;
  if (!transform) return;
  transform.redo();
};

onBeforeUnmount(() => {
  const transform = transformRef.value;
  if (transform) {
    for (const event of trackedEvents) transform.off(event, formatEvent);
    transform.destroy();
  }
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="undo">撤销</el-button>
      <el-button plain @click="redo">重做</el-button>
      <span>点击蓝色图形后，可拖动图形或控制点进行平移、缩放与旋转。</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
    <div class="transform-demo__events" aria-live="polite">
      <strong>事件记录</strong>
      <code v-for="item in eventLogs" :key="item">{{ item }}</code>
    </div>
  </div>
</template>

<style scoped>
.transform-demo__events {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
}

.transform-demo__events code {
  padding: 3px 8px;
  border: 1px solid var(--doc-border);
  border-radius: 6px;
  background: var(--doc-code-background);
}
</style>
