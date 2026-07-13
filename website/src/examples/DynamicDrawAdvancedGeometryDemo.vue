<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { DrawType, Earth, type IDrawEvent } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { advancedDynamicDrawGeometries, dynamicDrawGeometryGroups } from '../config/dynamicDrawGeometries';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const selectedGeometry = ref(advancedDynamicDrawGeometries[0].value);
const feedback = ref('选择高级图形后开始绘制，并按地图提示完成操作。');
const selectedGeometryConfig = computed(
  () => advancedDynamicDrawGeometries.find((geometry) => geometry.value === selectedGeometry.value) ?? advancedDynamicDrawGeometries[0]
);
const geometriesByGroup = (group: (typeof dynamicDrawGeometryGroups)[number]) => advancedDynamicDrawGeometries.filter((geometry) => geometry.group === group);
const startDrawing = () => {
  const drawTool = earthRef.value?.useDrawTool();
  const geometry = selectedGeometryConfig.value;
  if (!drawTool) return;
  drawTool[geometry.drawMethod]({
    fillColor: 'rgba(64, 158, 255, 0.28)',
    strokeColor: '#409eff',
    callback: (event: IDrawEvent) => {
      if (event.type === DrawType.Drawend) feedback.value = `已完成${geometry.label}绘制。`;
    }
  });
};
onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
});
onBeforeUnmount(() => {
  const earth = earthRef.value;
  if (!earth) return;
  earth.useDrawTool().destroy({ removeGraphics: true, removeLayers: true });
  earth.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-select v-model="selectedGeometry">
        <el-option-group v-for="group in dynamicDrawGeometryGroups" :key="group" :label="group">
          <el-option v-for="geometry in geometriesByGroup(group)" :key="geometry.value" :label="geometry.label" :value="geometry.value" />
        </el-option-group>
      </el-select>
      <el-button type="primary" @click="startDrawing">绘制{{ selectedGeometryConfig.label }}</el-button
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
