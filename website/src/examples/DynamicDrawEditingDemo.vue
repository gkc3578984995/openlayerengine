<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue';
import { DrawType, Earth, ModifyType, type IDrawEvent, type IModifyEvent } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import type { Feature } from 'ol';
import type { Geometry } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { dynamicDrawGeometryGroups, editableDynamicDrawGeometries } from '../config/dynamicDrawGeometries';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const featureRef = shallowRef<Feature<Geometry> | null>(null);
const featureGeometry = ref<string | null>(null);
const activeDrawingGeometry = ref<string | null>(null);
const activeEditingGeometry = ref<string | null>(null);
const selectedGeometry = ref(editableDynamicDrawGeometries[0].value);
const lastValidSelection = ref(selectedGeometry.value);
const feedback = ref('选择图形后先绘制，再编辑当前成果。');
const selectedGeometryConfig = computed(() => editableDynamicDrawGeometries.find((geometry) => geometry.value === selectedGeometry.value) ?? editableDynamicDrawGeometries[0]);
const geometriesByGroup = (group: (typeof dynamicDrawGeometryGroups)[number]) => editableDynamicDrawGeometries.filter((geometry) => geometry.group === group);
const isInteractionActive = computed(() => activeDrawingGeometry.value !== null || activeEditingGeometry.value !== null);
const canEdit = computed(() => !isInteractionActive.value && featureRef.value !== null && featureGeometry.value === selectedGeometry.value);
watch(selectedGeometry, (currentGeometry) => {
  if (isInteractionActive.value) {
    selectedGeometry.value = lastValidSelection.value;
    return;
  }
  lastValidSelection.value = currentGeometry;
  featureRef.value = null;
  featureGeometry.value = null;
  feedback.value = `已选择${selectedGeometryConfig.value.label}，请先完成绘制。`;
});
const startDrawing = () => {
  const drawTool = earthRef.value?.useDrawTool();
  const geometry = selectedGeometryConfig.value;
  if (!drawTool) return;
  activeDrawingGeometry.value = geometry.value;
  drawTool[geometry.drawMethod]({
    fillColor: 'rgba(64, 158, 255, 0.28)',
    callback: (event: IDrawEvent) => {
      if (event.type === DrawType.Drawexit) {
        if (activeDrawingGeometry.value === geometry.value) activeDrawingGeometry.value = null;
        return;
      }
      if (event.type === DrawType.Drawend && event.feature) {
        if (activeDrawingGeometry.value === geometry.value) activeDrawingGeometry.value = null;
        if (selectedGeometry.value !== geometry.value) return;
        featureRef.value = event.feature;
        featureGeometry.value = geometry.value;
        feedback.value = `${geometry.label}已创建，可以开始编辑。`;
      }
    }
  });
};
const startEditing = () => {
  const feature = featureRef.value;
  if (!feature || !canEdit.value) return;
  const geometry = selectedGeometryConfig.value;
  activeEditingGeometry.value = geometry.value;
  earthRef.value?.useDrawTool()[geometry.editMethod]({
    feature,
    callback: (event: IModifyEvent) => {
      if (event.type === ModifyType.Modifyexit && activeEditingGeometry.value === geometry.value) activeEditingGeometry.value = null;
      feedback.value = event.type === ModifyType.Modifyexit ? `已退出${geometry.label}编辑。` : `正在编辑${geometry.label}；右键退出编辑。`;
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
      <el-select v-model="selectedGeometry" :disabled="isInteractionActive">
        <el-option-group v-for="group in dynamicDrawGeometryGroups" :key="group" :label="group">
          <el-option v-for="geometry in geometriesByGroup(group)" :key="geometry.value" :label="geometry.label" :value="geometry.value" />
        </el-option-group>
      </el-select>
      <el-button type="primary" :disabled="isInteractionActive" @click="startDrawing">绘制{{ selectedGeometryConfig.label }}</el-button><el-button :disabled="!canEdit" @click="startEditing">编辑当前图形</el-button><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
