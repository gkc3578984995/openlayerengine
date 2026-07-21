<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, toFlatCoordinates, type Coordinate, type ShapeState } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const input = [120, 0, 110, 0] as const;
const projected = ref<readonly number[]>([]);
const normalized = ref<ShapeState | null>(null);
const geographic = ref<readonly Coordinate[]>([]);
const saved = ref<number[]>([]);
const circleRadius = ref<number>();

const run = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.elements.clear();

  const projectedInput = earth.view.toProjectedCoordinates(input);
  projected.value = projectedInput;
  const element = earth.elements.add({ geometry: { type: 'polyline', controlPoints: projectedInput } });
  const circle = earth.elements.add({
    geometry: {
      type: 'circle',
      center: earth.view.toProjectedCoordinates([115, 2]),
      radius: 500_000
    }
  });
  const geometry = earth.elements.get(element.id)?.state.geometry;
  const circleGeometry = earth.elements.get(circle.id)?.state.geometry;
  if (geometry?.type !== 'polyline' || circleGeometry?.type !== 'circle') return;

  normalized.value = geometry;
  geographic.value = earth.view.toGeographicCoordinates(geometry.controlPoints);
  saved.value = toFlatCoordinates(geographic.value);
  circleRadius.value = circleGeometry.radius;
  const demoCenter = earth.view.toProjectedCoordinates([115, 0]);
  earth.view.setCenter(demoCenter);
  earth.map.renderSync();
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
      <el-button type="primary" @click="run">重新转换并读取</el-button>
    </div>
    <div :id="mapId" class="example-stage"></div>
    <el-descriptions class="element-coordinate-storage-demo__details" :column="1" border>
      <el-descriptions-item label="业务经纬度输入">{{ JSON.stringify(input) }}</el-descriptions-item>
      <el-descriptions-item label="View 投影坐标">{{ JSON.stringify(projected) }}</el-descriptions-item>
      <el-descriptions-item label="Element.state geometry">{{ JSON.stringify(normalized) }}</el-descriptions-item>
      <el-descriptions-item label="转回经纬度">{{ JSON.stringify(geographic) }}</el-descriptions-item>
      <el-descriptions-item label="扁平保存数组">{{ JSON.stringify(saved) }}</el-descriptions-item>
      <el-descriptions-item label="圆半径（米）">{{ circleRadius }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.element-coordinate-storage-demo__details {
  margin-top: 16px;
}

.element-coordinate-storage-demo__details :deep(.el-descriptions__content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
