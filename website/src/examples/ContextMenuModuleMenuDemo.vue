<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-001';
const VEHICLE_CENTER = fromLonLat([116.4074, 39.9042]);
const NEXT_STOP = fromLonLat([116.52, 39.93]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('右键蓝色车辆，可定位、调度或移除这辆车。');
const items: IContextMenuItem[] = [
  { key: 'locate-vehicle', label: '定位车辆' },
  { key: 'dispatch-next-stop', label: '调度至下一站' },
  { key: 'remove-offline-vehicle', label: '移除离线车辆' }
];

onMounted(() => {
  const earth = new Earth({ center: VEHICLE_CENTER, zoom: 9 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  const vehiclePositions: Record<string, Coordinate> = {
    [VEHICLE_ID]: VEHICLE_CENTER
  };
  vehicles.add({ id: VEHICLE_ID, module: MODULE, center: VEHICLE_CENTER, size: 12, fill: { color: '#409eff' }, label: { text: '配送车 001', offsetY: 20 } });

  earth.useContextMenu().addModuleMenu(MODULE, items, ({ menu, featureId }) => {
    if (!featureId) return;
    if (menu.key === 'locate-vehicle') {
      earth.flyTo(vehiclePositions[featureId] ?? VEHICLE_CENTER, 12);
      feedback.value = `已定位 ${featureId}`;
      return;
    }
    if (menu.key === 'dispatch-next-stop') {
      vehicles.setPosition(featureId, NEXT_STOP);
      vehiclePositions[featureId] = NEXT_STOP;
      earth.flyTo(NEXT_STOP, 12);
      feedback.value = `${featureId} 已调度至下一站`;
      return;
    }
    vehicles.remove(featureId);
    delete vehiclePositions[featureId];
    feedback.value = `${featureId} 已从地图移除`;
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
      <el-tag type="success">仅注册车辆模块菜单</el-tag><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
