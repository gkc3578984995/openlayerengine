<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { ContextMenuHandle, ContextMenuItemState, Earth, Element as EarthElement } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-context-menu';
const MODULE = 'context-menu-demo';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const markerRef = shallowRef<EarthElement | null>(null);
const handles = shallowRef<ContextMenuHandle[]>([]);
const registered = ref(false);
const theme = ref<'light' | 'dark'>('light');
const selectedAction = ref('在地图或蓝色标记上单击右键');
const mapItemState = ref<ContextMenuItemState | undefined>();

const stateLabel = computed(() => {
  const state = mapItemState.value;
  if (state === undefined) return '未注册';
  return `${state.visible ? '显示' : '隐藏'} / ${state.disabled ? '禁用' : '可用'}`;
});

const refreshState = () => {
  mapItemState.value = earthRef.value?.contextMenu.getItemState('map', 'inspect');
};

const destroyRegistrations = () => {
  for (const handle of handles.value) handle.destroy();
  handles.value = [];
  registered.value = false;
  refreshState();
};

// #region context-menu-register
const registerMenus = () => {
  const earth = earthRef.value;
  const marker = markerRef.value;
  if (earth === null || marker === null) return;

  destroyRegistrations();
  const mapHandle = earth.contextMenu.register('map', {
    items: [
      { key: 'inspect', label: '查看坐标' },
      { key: 'labels', label: '显示标注', mutexKey: 'clean' },
      { key: 'clean', label: '清爽模式', visible: false, mutexKey: 'labels' },
      {
        key: 'more',
        label: '更多操作',
        children: [
          { key: 'home', label: '返回初始视图' },
          { key: 'close', label: '关闭菜单' }
        ]
      }
    ],
    before: ({ coordinate }) => coordinate.every(Number.isFinite),
    onSelect: ({ item, coordinate }) => {
      selectedAction.value = `${item.label}：${coordinate.map((value) => value.toFixed(0)).join(', ')}`;
      if (item.key === 'home') earth.view.flyHome({ duration: 450 });
      if (item.key === 'close') earth.contextMenu.close();
    }
  });
  const moduleHandle = earth.contextMenu.register(
    { module: MODULE },
    {
      items: [{ key: 'module-info', label: '查看模块信息' }],
      onSelect: ({ module }) => {
        selectedAction.value = `命中业务模块：${module ?? '—'}`;
      }
    }
  );
  const elementHandle = earth.contextMenu.register(marker, {
    items: [{ key: 'element-info', label: '查看 Element' }],
    onSelect: ({ element }) => {
      selectedAction.value = `命中 Element：${element?.id ?? '—'}`;
    }
  });

  handles.value = [mapHandle, moduleHandle, elementHandle];
  registered.value = true;
  refreshState();
};
// #endregion context-menu-register

const setInspectDisabled = () => {
  const earth = earthRef.value;
  if (earth === null || !registered.value) return;
  const disabled = !(earth.contextMenu.getItemState('map', 'inspect')?.disabled ?? false);
  earth.contextMenu.setItemState('map', 'inspect', { disabled });
  selectedAction.value = disabled ? '“查看坐标”已禁用' : '“查看坐标”已启用';
  refreshState();
};

const toggleLabels = () => {
  const earth = earthRef.value;
  if (earth === null || !registered.value) return;
  const next = earth.contextMenu.toggleItem('map', 'labels');
  selectedAction.value = `“显示标注”切换为${next.visible ? '显示' : '隐藏'}`;
  refreshState();
};

const setMenuTheme = (value: string | number | boolean | undefined) => {
  if (value !== 'light' && value !== 'dark') return;
  theme.value = value;
  earthRef.value?.contextMenu.setTheme(value);
};

const toggleMenuTheme = () => {
  const next = earthRef.value?.contextMenu.toggleTheme();
  if (next !== undefined) theme.value = next;
};

const clearMarkerState = () => {
  const marker = markerRef.value;
  if (marker === null) return;
  earthRef.value?.contextMenu.clearElementState(marker.id);
  selectedAction.value = `已清除 ${marker.id} 保存的菜单状态`;
};

const closeMenu = () => {
  earthRef.value?.contextMenu.close();
  selectedAction.value = '只关闭当前菜单，注册仍然有效';
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 8 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  const layer = earth.layers.add({ kind: 'vector', id: 'context-menu-elements', zIndex: 10 });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  const marker = earth.elements.add({
    id: 'context-menu-marker',
    module: MODULE,
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [center] },
    style: {
      symbol: {
        type: 'circle',
        radius: 15,
        fill: { type: 'solid', color: '#409eff' },
        stroke: { color: '#ffffff', width: 4 }
      },
      text: {
        text: '右键这个标记',
        fontSize: 14,
        fontWeight: 'bold',
        offsetY: 40,
        padding: [5, 8, 5, 8],
        fill: { type: 'solid', color: '#1f2937' },
        stroke: { color: '#ffffff', width: 3 },
        backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.9)' },
        backgroundStroke: { color: '#409eff', width: 2 }
      }
    }
  });
  earth.view.flyTo(center, 8);
  earthRef.value = earth;
  markerRef.value = marker;
  registerMenus();
});

onBeforeUnmount(() => {
  destroyRegistrations();
  earthRef.value?.destroy();
  earthRef.value = null;
  markerRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <el-alert type="info" :closable="false" show-icon title="在地图空白处或蓝色标记上单击右键，观察 map、module 与 Element 菜单的组合结果。" />

    <div class="example-demo__toolbar">
      <el-button type="primary" :disabled="registered" @click="registerMenus">重新注册</el-button>
      <el-button :disabled="!registered" @click="setInspectDisabled">切换“查看坐标”禁用状态</el-button>
      <el-button :disabled="!registered" @click="toggleLabels">切换互斥项目</el-button>
      <el-button @click="closeMenu">关闭当前菜单</el-button>
      <el-button :disabled="!registered" type="danger" plain @click="destroyRegistrations">注销三项注册</el-button>
    </div>

    <div class="context-menu-demo__settings">
      <el-segmented v-model="theme" :options="['light', 'dark']" aria-label="右键菜单主题" @change="setMenuTheme" />
      <el-button plain @click="toggleMenuTheme">toggleTheme()</el-button>
      <el-button plain @click="clearMarkerState">清除 Element 状态</el-button>
      <el-tag :type="registered ? 'success' : 'info'" effect="plain">{{ registered ? '已注册' : '已注销' }}</el-tag>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-descriptions class="context-menu-demo__result" :column="1" border>
      <el-descriptions-item label="最近动作">{{ selectedAction }}</el-descriptions-item>
      <el-descriptions-item label="inspect 状态">{{ stateLabel }}</el-descriptions-item>
      <el-descriptions-item label="当前菜单主题">{{ theme }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.context-menu-demo__settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
}

.context-menu-demo__result {
  margin-top: 14px;
}
</style>
