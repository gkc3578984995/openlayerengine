<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, toFlatCoordinates, type ShapeInput, type ShapeState } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const input: ShapeInput<'polyline'> = { type: 'polyline', controlPoints: [-1_000_000, 0, 1_000_000, 0] };
const normalized = ref<ShapeState | null>(null);
const saved = ref<number[]>([]);

const run = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.elements.clear();
  const element = earth.elements.add({ geometry: input });
  const geometry = earth.elements.get(element.id)?.state.geometry;
  if (geometry === undefined) return;
  normalized.value = geometry;
  saved.value = 'controlPoints' in geometry ? toFlatCoordinates(geometry.controlPoints) : [];
};

onMounted(() => {
  earthRef.value = new Earth({ target: mapId, view: { center: [0, 0], zoom: 3 }, controls: { attribution: false, rotate: false } });
  run();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="run">重新写入并读取</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
    <el-descriptions :column="1" border>
      <el-descriptions-item label="写入数组">{{ JSON.stringify(input.controlPoints) }}</el-descriptions-item>
      <el-descriptions-item label="读取 geometry">{{ JSON.stringify(normalized) }}</el-descriptions-item>
      <el-descriptions-item label="保存数组">{{ JSON.stringify(saved) }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>
