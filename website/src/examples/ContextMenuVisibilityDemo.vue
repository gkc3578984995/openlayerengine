<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const SAVED_FEATURE_ID = 'saved-station';
const EXPORT_FEATURE_ID = 'export-station';
const HISTORY_FEATURE_ID = 'history-station';
const HISTORY_POSITION = fromLonLat([116.44, 39.89]);
const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const featureLayerRef = shallowRef<PointLayer | null>(null);
const feedback = ref('隐藏“导出站点”菜单项时，地图中的导出站点也会同步隐藏。');
const exportVisible = ref(true);
const stateLabel = computed(() => (exportVisible.value ? '菜单与站点均可见' : '菜单与站点均隐藏'));
const items: IContextMenuItem[] = [
  { key: 'save-current', label: '保存当前站点' },
  { key: 'hide-export-station', label: '隐藏导出站点' },
  { key: 'open-history', label: '查看巡检历史' }
];

const setVisibility = (visible: boolean) => {
  const menu = earthRef.value?.useContextMenu();
  const featureLayer = featureLayerRef.value;
  if (!menu || !featureLayer) return;
  menu.setDefaultMenuState('hide-export-station', visible);
  exportVisible.value = menu.getDefaultMenuState('hide-export-station');
  if (exportVisible.value) featureLayer.show(EXPORT_FEATURE_ID);
  else featureLayer.hide(EXPORT_FEATURE_ID);
  feedback.value = `“隐藏导出站点”菜单项及其地图对象已${exportVisible.value ? '显示' : '隐藏'}。`;
};

onMounted(() => {
  const center = fromLonLat([116.4074, 39.9042]);
  const earth = new Earth({ center, zoom: 11 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const featureLayer = new PointLayer(earth, { register: false });
  featureLayer.add({
    id: SAVED_FEATURE_ID,
    center: fromLonLat([116.38, 39.91]),
    size: 9,
    fill: { color: '#409eff' },
    label: { text: '已保存站点', offsetY: 20 }
  });
  featureLayer.add({ id: EXPORT_FEATURE_ID, center, size: 11, fill: { color: '#e6a23c' }, label: { text: '可导出站点', offsetY: 22 } });
  featureLayer.add({
    id: HISTORY_FEATURE_ID,
    center: HISTORY_POSITION,
    size: 9,
    fill: { color: '#67c23a' },
    label: { text: '历史站点', offsetY: 20 }
  });
  featureLayer.hide(HISTORY_FEATURE_ID);
  earth.useContextMenu().addDefaultMenu(items, ({ menu, position }) => {
    if (menu.key === 'hide-export-station') {
      setVisibility(false);
      return;
    }
    if (menu.key === 'save-current') {
      const savedPosition = fromLonLat(position);
      featureLayer.remove(SAVED_FEATURE_ID);
      featureLayer.add({ id: SAVED_FEATURE_ID, center: savedPosition, size: 9, fill: { color: '#409eff' }, label: { text: '已保存站点', offsetY: 20 } });
      earth.flyTo(savedPosition, 13);
      feedback.value = '已在右键位置保存站点。';
      return;
    }
    featureLayer.show(HISTORY_FEATURE_ID);
    earth.flyTo(HISTORY_POSITION, 13);
    feedback.value = '已显示并定位历史巡检站点。';
  });
  featureLayerRef.value = featureLayer;
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
      <el-button size="small" @click="setVisibility(true)">显示导出项</el-button><el-button size="small" @click="setVisibility(false)">隐藏导出项</el-button
      ><el-tag>{{ stateLabel }}</el-tag
      ><span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
