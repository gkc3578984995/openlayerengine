<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const POINT_A = 'common-point-a';
const POINT_B = 'common-point-b';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const pointLayer = shallowRef<PointLayer | null>(null);
const opacity = ref(100);
const zIndex = ref(10);
const result = ref('点击工具栏按钮观察图层通用方法的效果。');

const createLayer = () => {
  const earth = earthRef.value;
  if (!earth || pointLayer.value) return;

  const layer = new PointLayer(earth, { register: false });
  layer.add({ id: POINT_A, center: BEIJING, size: 11, fill: { color: '#409eff' }, stroke: { color: '#1d4ed8', width: 2 }, label: { text: '北京', offsetY: -18 } });
  layer.add({ id: POINT_B, center: SHANGHAI, size: 11, fill: { color: '#67c23a' }, stroke: { color: '#2f6b14', width: 2 }, label: { text: '上海', offsetY: -18 } });
  layer.setLayerOpacity(opacity.value);
  layer.setLayerIndex(zIndex.value);
  pointLayer.value = layer;
  result.value = '图层已创建，可继续操作。';
};

const inspectLayer = () => {
  const layer = pointLayer.value;
  if (!layer) return;
  const feature = layer.get(POINT_A)[0];
  const snapshot = feature ? layer.getUpdatedParam(feature) : undefined;
  const vectorLayer = layer.getLayer();
  result.value = `当前要素数：${layer.get().length}；可见：${vectorLayer.getVisible() ? '是' : '否'}；北京点快照：${snapshot ? '已读取' : '不存在'}。`;
};

const hideBeijing = () => {
  pointLayer.value?.hide(POINT_A);
  result.value = '已隐藏北京点。';
};

const showAll = () => {
  pointLayer.value?.show();
  result.value = '已显示全部要素和图层。';
};

const lowerOpacity = () => {
  opacity.value = opacity.value === 100 ? 45 : 100;
  pointLayer.value?.setLayerOpacity(opacity.value);
  result.value = `图层透明度已设置为 ${opacity.value}%。`;
};

const raiseLayer = () => {
  zIndex.value = zIndex.value === 10 ? 30 : 10;
  pointLayer.value?.setLayerIndex(zIndex.value);
  result.value = `图层层级已设置为 ${zIndex.value}。`;
};

const destroyLayer = () => {
  const destroyed = pointLayer.value?.destroy() ?? false;
  pointLayer.value = null;
  result.value = destroyed ? '图层已销毁，可通过“重新创建图层”恢复演示。' : '图层未能销毁。';
};

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  createLayer();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="inspectLayer">读取状态</el-button>
      <el-button @click="hideBeijing">隐藏北京点</el-button>
      <el-button @click="showAll">显示全部</el-button>
      <el-button @click="lowerOpacity">切换透明度</el-button>
      <el-button @click="raiseLayer">切换层级</el-button>
      <el-button type="danger" plain @click="destroyLayer">销毁图层</el-button>
      <el-button type="success" plain @click="createLayer">重新创建图层</el-button>
    </div>
    <el-alert class="example-demo__alert" :title="result" type="info" :closable="false" show-icon />
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
