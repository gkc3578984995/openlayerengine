<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图，悬浮“车辆操作”或“告警处理”查看级联菜单。');
const items: IContextMenuItem[] = [
  {
    key: 'vehicle-actions',
    label: '车辆操作',
    child: [
      { key: 'navigate', label: '发起导航' },
      {
        key: 'track',
        label: '查看轨迹',
        child: [
          { key: 'track-live', label: '实时轨迹' },
          { key: 'track-export', label: '导出轨迹' }
        ]
      }
    ]
  },
  {
    key: 'alarm-actions',
    label: '告警处理',
    child: [
      { key: 'alarm-list', label: '查看告警' },
      { key: 'alarm-confirm', label: '确认告警' }
    ]
  },
  { key: 'refresh-data', label: '刷新地图数据' }
];

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earth.useContextMenu().addDefaultMenu(items, ({ menu }) => (feedback.value = `已选择叶子菜单：${menu.label}`));
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
      <el-tag type="info">两级与三级菜单</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
