<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('选择高级几何后按地图提示完成绘制。');
const drawCircle = () => earthRef.value?.useDrawTool().drawCircle({ callback: () => (feedback.value = '已完成圆形范围绘制。') });
const drawArrow = () => earthRef.value?.useDrawTool().drawAttackArrow({ fillColor: 'rgba(64, 158, 255, 0.28)', strokeColor: '#409eff', callback: () => (feedback.value = '已完成进攻箭头绘制。') });
const drawCurve = () => earthRef.value?.useDrawTool().drawCurvePolyline({ strokeColor: '#67c23a', callback: () => (feedback.value = '已完成曲线绘制。') });
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
    <div class="example-demo__toolbar"><el-button type="primary" @click="drawCircle">绘制圆形范围</el-button><el-button @click="drawArrow">绘制进攻箭头</el-button><el-button @click="drawCurve">绘制曲线</el-button><span>{{ feedback }}</span></div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
