<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图选择菜单项；点击后，同组的另一个互斥项会出现。');
const items: IContextMenuItem[] = [
  { key: 'show-label', label: '显示车辆标签', mutexKey: 'hide-label' },
  { key: 'hide-label', label: '隐藏车辆标签', mutexKey: 'show-label', visible: false },
  { key: 'enable-follow', label: '开启车辆跟随', mutexKey: 'stop-follow' },
  { key: 'stop-follow', label: '停止车辆跟随', mutexKey: 'enable-follow', visible: false }
];

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earth.useContextMenu().addDefaultMenu(items, ({ menu }) => (feedback.value = `已执行：${menu.label}。再次右键可看到同组互斥项。`));
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
      <el-tag type="warning">两个互斥状态组</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
