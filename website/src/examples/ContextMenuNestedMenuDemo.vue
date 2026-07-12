<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, PolylineLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const VEHICLE_POSITION = fromLonLat([116.4074, 39.9042]);
const TRACK_POSITIONS = [VEHICLE_POSITION, fromLonLat([116.432, 39.916]), fromLonLat([116.458, 39.899])];
const ALARM_POSITION = TRACK_POSITIONS[2];
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键地图，悬浮“车辆操作”或“告警处理”查看级联菜单。');
const items: IContextMenuItem[] = [
  {
    key: 'vehicle-actions',
    label: '车辆操作',
    child: [
      { key: 'navigate', label: '定位巡检车' },
      {
        key: 'track',
        label: '轨迹管理',
        child: [
          { key: 'track-live', label: '显示巡检轨迹' },
          { key: 'track-export', label: '隐藏巡检轨迹' }
        ]
      }
    ]
  },
  {
    key: 'alarm-actions',
    label: '告警处理',
    child: [
      { key: 'alarm-list', label: '显示告警位置' },
      { key: 'alarm-confirm', label: '确认并隐藏告警' }
    ]
  },
  { key: 'refresh-data', label: '恢复全部图层' }
];

onMounted(() => {
  const earth = new Earth({ center: VEHICLE_POSITION, zoom: 11 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));

  const vehicleLayer = new PointLayer(earth, { register: false });
  const trackLayer = new PolylineLayer(earth, { register: false });
  const alarmLayer = new PointLayer(earth, { register: false });
  vehicleLayer.add({
    id: 'inspection-vehicle',
    center: VEHICLE_POSITION,
    size: 11,
    fill: { color: '#409eff' },
    label: { text: '巡检车 01', offsetY: 22 }
  });
  trackLayer.add({
    id: 'inspection-track',
    positions: TRACK_POSITIONS,
    stroke: { color: '#409eff', width: 5 },
    backgroundStroke: { color: '#ffffff', width: 9 }
  });
  alarmLayer.add({
    id: 'route-alarm',
    center: ALARM_POSITION,
    size: 10,
    fill: { color: '#f56c6c' },
    label: { text: '偏航告警', offsetY: 22 }
  });

  earth.useContextMenu().addDefaultMenu(items, ({ menu }) => {
    if (menu.key === 'navigate') {
      vehicleLayer.show();
      earth.flyTo(VEHICLE_POSITION, 13);
    } else if (menu.key === 'track-live') {
      trackLayer.show();
    } else if (menu.key === 'track-export') {
      trackLayer.hide();
    } else if (menu.key === 'alarm-list') {
      alarmLayer.show();
      earth.flyTo(ALARM_POSITION, 13);
    } else if (menu.key === 'alarm-confirm') {
      alarmLayer.hide();
    } else if (menu.key === 'refresh-data') {
      vehicleLayer.show();
      trackLayer.show();
      alarmLayer.show();
    }
    feedback.value = `已执行：${menu.label}`;
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
      <el-tag type="info">车辆、轨迹与告警三级联动</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
