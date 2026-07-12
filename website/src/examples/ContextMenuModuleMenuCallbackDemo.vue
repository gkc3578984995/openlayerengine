<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-callback-001';
const VEHICLE_CENTER = fromLonLat([116.4074, 39.9042]);
const TASK_ID = 'vehicle-task';
const STATUS_ID = 'vehicle-status';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键车辆选择一项操作，地图会显示对应的任务或状态标记。');
const items: IContextMenuItem[] = [
  { key: 'dispatch', label: '派发配送任务' },
  { key: 'contact-driver', label: '标记司机已联系' },
  { key: 'open-work-order', label: '创建检修工单' }
];

onMounted(() => {
  const earth = new Earth({ center: VEHICLE_CENTER, zoom: 9 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  const taskLayer = new PointLayer(earth, { register: false });
  const statusLayer = new PointLayer(earth, { register: false });
  const feature = vehicles.add({
    id: VEHICLE_ID,
    module: MODULE,
    center: VEHICLE_CENTER,
    size: 12,
    fill: { color: '#67c23a' },
    label: { text: '配送车 A17', offsetY: 20 }
  });
  feature.set('param', { driver: '张师傅', status: '待派单', plateNumber: '京A·12345' });

  earth.useContextMenu().addModuleMenu(MODULE, items, ({ menu, featureId, position, param }) => {
    const center = fromLonLat(position);
    if (menu.key === 'dispatch') {
      taskLayer.remove(TASK_ID);
      taskLayer.add({
        id: TASK_ID,
        center: [center[0] + 1800, center[1]],
        size: 9,
        fill: { color: '#409eff' },
        label: { text: `${featureId} 配送任务`, offsetY: 18 }
      });
      feedback.value = `已为 ${(param as { plateNumber?: string })?.plateNumber ?? featureId} 派发配送任务`;
      return;
    }

    statusLayer.remove(STATUS_ID);
    const isContacted = menu.key === 'contact-driver';
    statusLayer.add({
      id: STATUS_ID,
      center: [center[0] - 1800, center[1]],
      size: 9,
      fill: { color: isContacted ? '#67c23a' : '#e6a23c' },
      label: { text: isContacted ? '司机已联系' : '检修工单', offsetY: 18 }
    });
    feedback.value = isContacted ? `${(param as { driver?: string })?.driver ?? '司机'}已确认收到通知` : `${featureId} 的检修工单已创建`;
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
      <el-tag>车辆任务回调</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
