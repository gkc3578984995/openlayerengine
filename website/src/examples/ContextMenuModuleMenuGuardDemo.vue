<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const MODULE = 'vehicle';
const VEHICLE_ID = 'vehicle-guard-001';
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const canEdit = ref(false);
const feedback = ref('当前仅可查看详情；右键车辆可看到编辑与删除为禁用状态。');
const items: IContextMenuItem[] = [
  { key: 'vehicle-detail', label: '查看详情' },
  { key: 'edit-vehicle', label: '编辑车辆' },
  { key: 'delete-vehicle', label: '删除车辆' }
];

const togglePermission = () => {
  canEdit.value = !canEdit.value;
  feedback.value = canEdit.value ? '已授予编辑权限；重新右键车辆查看可用菜单。' : '已撤销编辑权限；编辑与删除菜单会被守卫禁用。';
};

onMounted(() => {
  const center = fromLonLat([116.4074, 39.9042]);
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const vehicles = new PointLayer(earth, { register: false });
  vehicles.add({ id: VEHICLE_ID, module: MODULE, center, size: 12, fill: { color: '#e6a23c' }, label: { text: '待审批车辆', offsetY: 20 } });
  earth.useContextMenu().addModuleMenu(
    MODULE,
    items,
    ({ menu }) => (feedback.value = `守卫允许执行：${menu.label}`),
    ({ menu }) => menu.key === 'vehicle-detail' || canEdit.value
  );
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
      <el-button size="small" type="primary" @click="togglePermission">{{ canEdit ? '撤销编辑权限' : '授予编辑权限' }}</el-button
      ><el-tag :type="canEdit ? 'success' : 'warning'">{{ canEdit ? '可编辑' : '仅查看' }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
