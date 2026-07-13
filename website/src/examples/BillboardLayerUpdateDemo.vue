<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { BillboardLayer, Earth } from '@vrsim/earth-engine-ol';
import type { Feature } from 'ol';
import type Point from 'ol/geom/Point';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const SVG_NAMESPACE = ['http:', '', 'www.w3.org', '2000', 'svg'].join('/');
const MARKER_SRC = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="${SVG_NAMESPACE}" width="44" height="44" viewBox="0 0 44 44"><rect x="3" y="3" width="38" height="38" rx="10" fill="#7c3aed"/><path fill="white" d="M12 21h15.2l-5.6-5.6 2.8-2.8L34.8 23 24.4 33.4l-2.8-2.8 5.6-5.6H12Z"/></svg>`
)}`;
const BILLBOARD_ID = 'update-billboard';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const TIANJIN = fromLonLat([117.2009, 39.0842]);

const mapId = useId();
const extentText = ref('点击按钮读取图标范围');
const earthRef = shallowRef<Earth | null>(null);
const billboardLayerRef = shallowRef<BillboardLayer | null>(null);
const featureRef = shallowRef<Feature<Point> | null>(null);

onMounted(() => {
  const earth = new Earth({ center: BEIJING, zoom: 7 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const billboardLayer = new BillboardLayer(earth, { wrapX: false });
  featureRef.value = billboardLayer.add({ id: BILLBOARD_ID, center: BEIJING, src: MARKER_SRC, size: [44, 44] });
  billboardLayerRef.value = billboardLayer;
});

const moveToTianjin = () => {
  billboardLayerRef.value?.setPosition(BILLBOARD_ID, TIANJIN);
  earthRef.value?.animateFlyTo(TIANJIN, 8, 600);
};

const readExtent = () => {
  const layer = billboardLayerRef.value;
  const feature = featureRef.value;
  if (!layer || !feature) return;
  const extent = layer.getIconExtent(feature);
  extentText.value = extent ? extent.map((value) => value.toFixed(0)).join(', ') : '图标尚未完成加载';
};

onBeforeUnmount(() => {
  billboardLayerRef.value?.destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="moveToTianjin">移动到天津</el-button>
      <el-button @click="readExtent">读取图标范围</el-button>
      <span>{{ extentText }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
