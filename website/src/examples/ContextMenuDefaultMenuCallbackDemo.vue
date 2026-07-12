<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('点击菜单项后，这里会显示回调参数。');
const items: IContextMenuItem[] = [
  { key: 'save-location', label: '保存位置' },
  { key: 'report-problem', label: '上报问题' },
  { key: 'share-position', label: '分享坐标' }
];

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earth.useContextMenu().addDefaultMenu(items, ({ menu, scope, position, pixel }) => {
    feedback.value = `menu=${menu.key}；scope=${scope}；经纬度=${position.map((value) => value.toFixed(4)).join(', ')}；像素=${pixel.map(Math.round).join(', ')}`;
  });
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  earthRef.value?.useContextMenu().destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-tag>全局回调上下文</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
