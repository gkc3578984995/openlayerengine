<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图后选择不同菜单项，观察回调如何改变地图。');
const items: IContextMenuItem[] = [
  { key: 'save-location', label: '保存位置' },
  { key: 'focus-position', label: '移动观察中心' },
  { key: 'coordinate-label', label: '生成坐标标牌' }
];

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const markerLayer = new PointLayer(earth, { register: false });
  earth.useContextMenu().addDefaultMenu(items, ({ menu, scope, position, pixel }) => {
    const center = fromLonLat(position);
    if (menu.key === 'focus-position') {
      earth.flyTo(center, 9);
    } else {
      markerLayer.remove(menu.key);
      markerLayer.add({
        id: menu.key,
        center,
        size: menu.key === 'coordinate-label' ? 6 : 9,
        fill: { color: menu.key === 'coordinate-label' ? '#e6a23c' : '#67c23a' },
        stroke: { color: '#ffffff', width: 2 },
        label: { text: menu.key === 'coordinate-label' ? position.map((value) => value.toFixed(4)).join(', ') : '已保存位置', offsetY: 22 }
      });
    }
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
