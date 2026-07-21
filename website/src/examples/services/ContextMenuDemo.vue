<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { ContextMenuHandle, ContextMenuItemState, Coordinate, Earth, Element as EarthElement, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-context-menu';
const MODULE = 'context-menu-demo';
const MAP_ZOOM = 8.5;

type Scope = 'map' | 'module' | 'element';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const moduleMarkerRef = shallowRef<EarthElement | null>(null);
const elementMarkerRef = shallowRef<EarthElement | null>(null);
const actionMarkerRef = shallowRef<EarthElement | null>(null);
const handles = shallowRef<ContextMenuHandle[]>([]);
const registered = ref(false);
const theme = ref<'light' | 'dark'>('light');
const selectedScope = ref<Scope | null>(null);
const selectedAction = ref('等待操作：请按下方提示在地图上单击右键');
const mapItemState = ref<ContextMenuItemState | undefined>();
const sceneCenter = shallowRef<Coordinate | null>(null);
const moduleActive = ref(false);
const elementActive = ref(false);

const scenarios = [
  { scope: 'map', title: '① 地图空白处', result: '命中 map 注册', color: '#67c23a' },
  { scope: 'module', title: '② 橙色标记', result: '命中 module 注册', color: '#e6a23c' },
  { scope: 'element', title: '③ 蓝色标记', result: '命中 Element 注册', color: '#409eff' }
] as const;

const stateLabel = computed(() => {
  const state = mapItemState.value;
  if (state === undefined) return '未注册';
  return `${state.visible ? '显示' : '隐藏'} / ${state.disabled ? '禁用' : '可用'}`;
});

const pointStyle = (label: string, color: string, radius: number, selected = false): StyleSpec => ({
  symbol: {
    type: 'circle',
    radius,
    fill: { type: 'solid', color },
    stroke: { color: selected ? '#f56c6c' : '#ffffff', width: selected ? 6 : 4 }
  },
  text: {
    text: label,
    fontSize: 14,
    fontWeight: 'bold',
    offsetY: radius * 2 + 14,
    padding: [5, 8, 5, 8],
    fill: { type: 'solid', color: '#1f2937' },
    stroke: { color: '#ffffff', width: 3 },
    backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.94)' },
    backgroundStroke: { color, width: 2 }
  },
  zIndex: selected ? 40 : 30
});

const refreshState = () => {
  const earth = earthRef.value;
  if (earth === null || !registered.value) {
    mapItemState.value = undefined;
    return;
  }
  mapItemState.value = earth.contextMenu.getItemState('map', 'inspect');
};

const destroyRegistrations = () => {
  const registrations = handles.value;
  handles.value = [];
  registered.value = false;
  mapItemState.value = undefined;
  let cleanupError: unknown;
  for (const handle of registrations) {
    try {
      handle.destroy();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  selectedAction.value = registrations.length === 0 ? '当前没有菜单注册' : '三项注册已全部注销；右键不会再显示自定义菜单';
  if (cleanupError !== undefined) throw cleanupError;
};

const showMapResult = (coordinate: Coordinate, label: string) => {
  actionMarkerRef.value?.update({
    visible: true,
    geometry: { type: 'point', controlPoints: [coordinate] },
    style: pointStyle(label, '#67c23a', 11, true)
  });
};

// #region context-menu-register
const registerMenus = () => {
  const earth = earthRef.value;
  const moduleMarker = moduleMarkerRef.value;
  const elementMarker = elementMarkerRef.value;
  if (earth === null || moduleMarker === null || elementMarker === null) return;

  destroyRegistrations();
  const nextHandles: ContextMenuHandle[] = [];
  try {
    nextHandles.push(
      earth.contextMenu.register('map', {
        items: [
          { key: 'inspect', label: '在此显示坐标' },
          { key: 'labels', label: '显示地图提示', mutexKey: 'clean' },
          { key: 'clean', label: '切换为清爽提示', visible: false, mutexKey: 'labels' },
          {
            key: 'more',
            label: '视图操作',
            children: [
              { key: 'home', label: '返回三个演示位置' },
              { key: 'close', label: '关闭菜单' }
            ]
          }
        ],
        before: ({ coordinate }) => coordinate.every(Number.isFinite),
        onSelect: ({ item, coordinate }) => {
          selectedScope.value = 'map';
          selectedAction.value = `map：${item.label}`;
          if (item.key === 'inspect') showMapResult(coordinate, 'map 菜单结果');
          if (item.key === 'labels' || item.key === 'clean') showMapResult(coordinate, item.key === 'labels' ? '已切换提示' : '清爽提示');
          if (item.key === 'home') focusScenes();
          if (item.key === 'close') earth.contextMenu.close();
        }
      })
    );
    nextHandles.push(
      earth.contextMenu.register(
        { module: MODULE },
        {
          items: [{ key: 'module-highlight', label: '突出 module 标记' }],
          onSelect: ({ element, module }) => {
            moduleActive.value = !moduleActive.value;
            moduleMarker.update({
              style: pointStyle(
                moduleActive.value ? 'module 已命中' : '② module',
                moduleActive.value ? '#67c23a' : '#e6a23c',
                moduleActive.value ? 23 : 17,
                moduleActive.value
              )
            });
            selectedScope.value = 'module';
            selectedAction.value = `module：${module ?? '—'}，目标 ${element?.id ?? '—'}`;
          }
        }
      )
    );
    nextHandles.push(
      earth.contextMenu.register(elementMarker, {
        items: [{ key: 'element-highlight', label: '突出精确 Element' }],
        onSelect: ({ element }) => {
          elementActive.value = !elementActive.value;
          elementMarker.update({
            style: pointStyle(
              elementActive.value ? 'Element 已命中' : '③ Element',
              elementActive.value ? '#f56c6c' : '#409eff',
              elementActive.value ? 24 : 17,
              elementActive.value
            )
          });
          selectedScope.value = 'element';
          selectedAction.value = `Element：${element?.id ?? '—'}；即使 module 相同，也优先使用精确注册`;
        }
      })
    );
  } catch (error) {
    for (const handle of nextHandles) handle.destroy();
    throw error;
  }

  handles.value = nextHandles;
  registered.value = true;
  selectedAction.value = '三层菜单已注册：Element 优先于 module，module 优先于 map';
  refreshState();
};
// #endregion context-menu-register

const setInspectDisabled = () => {
  const earth = earthRef.value;
  if (earth === null || !registered.value) return;
  const disabled = !(earth.contextMenu.getItemState('map', 'inspect')?.disabled ?? false);
  earth.contextMenu.setItemState('map', 'inspect', { disabled });
  selectedScope.value = 'map';
  selectedAction.value = disabled ? 'map 的“在此显示坐标”已禁用' : 'map 的“在此显示坐标”已启用';
  refreshState();
};

const toggleLabels = () => {
  const earth = earthRef.value;
  if (earth === null || !registered.value) return;
  const next = earth.contextMenu.toggleItem('map', 'labels');
  selectedScope.value = 'map';
  selectedAction.value = `map 的“显示地图提示”切换为${next.visible ? '显示' : '隐藏'}，互斥项同步反转`;
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
  if (!registered.value) {
    selectedAction.value = '当前没有菜单注册，无法清除菜单项目状态';
    return;
  }
  const marker = elementMarkerRef.value;
  if (marker === null) return;
  earthRef.value?.contextMenu.clearElementState(marker.id);
  elementActive.value = false;
  marker.update({ style: pointStyle('③ Element', '#409eff', 17) });
  selectedScope.value = 'element';
  selectedAction.value = `已清除 ${marker.id} 保存的菜单状态，注册仍然有效`;
};

const closeMenu = () => {
  if (!registered.value) {
    selectedAction.value = '当前没有菜单注册，也没有可关闭的自定义菜单';
    return;
  }
  earthRef.value?.contextMenu.close();
  selectedAction.value = '只关闭当前菜单，三项注册仍然有效';
};

const focusScenes = () => {
  const center = sceneCenter.value;
  if (center !== null) earthRef.value?.view.animateFlyTo(center, { zoom: MAP_ZOOM, duration: 450 });
};

const reset = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  moduleActive.value = false;
  elementActive.value = false;
  selectedScope.value = null;
  actionMarkerRef.value?.update({ visible: false });
  moduleMarkerRef.value?.update({ style: pointStyle('② module', '#e6a23c', 17) });
  elementMarkerRef.value?.update({ style: pointStyle('③ Element', '#409eff', 17) });
  if (!registered.value) {
    registerMenus();
  } else {
    earth.contextMenu.setItemState('map', 'inspect', { visible: true, disabled: false });
    earth.contextMenu.setItemState('map', 'labels', { visible: true });
    earth.contextMenu.clearElementState('context-menu-element-marker');
    selectedAction.value = '已恢复三层命中场景与菜单状态';
    refreshState();
  }
  theme.value = 'light';
  earth.contextMenu.setTheme('light');
  focusScenes();
};

defineExpose({ reset, focusSelected: focusScenes });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: MAP_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.52 });
  const layer = earth.layers.add({ kind: 'vector', id: 'context-menu-elements', zIndex: 10, declutter: true });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  sceneCenter.value = center;

  moduleMarkerRef.value = earth.elements.add({
    id: 'context-menu-module-marker',
    module: MODULE,
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [[center[0] - 42_000, center[1]]] },
    style: pointStyle('② module', '#e6a23c', 17)
  });
  elementMarkerRef.value = earth.elements.add({
    id: 'context-menu-element-marker',
    module: MODULE,
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [[center[0] + 42_000, center[1]]] },
    style: pointStyle('③ Element', '#409eff', 17)
  });
  actionMarkerRef.value = earth.elements.add({
    id: 'context-menu-map-result',
    module: 'context-menu-result',
    layerId: layer.id,
    visible: false,
    geometry: { type: 'point', controlPoints: [center] },
    style: pointStyle('map 菜单结果', '#67c23a', 11, true)
  });
  earthRef.value = earth;
  earth.view.flyTo(center, MAP_ZOOM);
  registerMenus();
});

onBeforeUnmount(() => {
  try {
    destroyRegistrations();
  } finally {
    try {
      earthRef.value?.destroy();
    } finally {
      earthRef.value = null;
      moduleMarkerRef.value = null;
      elementMarkerRef.value = null;
      actionMarkerRef.value = null;
    }
  }
});
</script>

<template>
  <div class="example-demo context-menu-demo">
    <el-alert type="info" :closable="false" show-icon title="分别右键地图空白处、橙色标记和蓝色标记；每个位置只出现其优先级最高的一套菜单。" />

    <el-row class="context-menu-demo__scenarios" :gutter="12">
      <el-col v-for="scenario in scenarios" :key="scenario.scope" :xs="24" :sm="8">
        <el-card class="context-menu-demo__scenario" shadow="never" :class="{ 'is-active': selectedScope === scenario.scope }">
          <div class="context-menu-demo__scenario-title">
            <span class="context-menu-demo__dot" :style="{ backgroundColor: scenario.color }"></span>
            <strong>{{ scenario.title }}</strong>
          </div>
          <span>{{ scenario.result }}</span>
        </el-card>
      </el-col>
    </el-row>

    <div class="example-demo__control-panel context-menu-demo__controls">
      <div class="example-demo__actions context-menu-demo__toolbar">
        <div class="example-demo__action-group context-menu-demo__action-group" role="group" aria-label="注册与项目状态">
          <span>注册与项目状态</span>
          <div class="example-demo__action-buttons context-menu-demo__action-buttons">
            <el-button type="primary" :disabled="registered" @click="registerMenus">重新注册三层菜单</el-button>
            <el-button :disabled="!registered" @click="setInspectDisabled">切换 map 项禁用状态</el-button>
            <el-button :disabled="!registered" @click="toggleLabels">切换 map 互斥项</el-button>
          </div>
        </div>
        <div class="example-demo__action-group context-menu-demo__action-group" role="group" aria-label="菜单与注册清理">
          <span>菜单与注册清理</span>
          <div class="example-demo__action-buttons context-menu-demo__action-buttons">
            <el-button :disabled="!registered" @click="closeMenu">关闭当前菜单</el-button>
            <el-button :disabled="!registered" type="danger" plain @click="destroyRegistrations">注销三项注册</el-button>
          </div>
        </div>
      </div>

      <div class="example-demo__action-row context-menu-demo__settings-row">
        <div class="example-demo__control-grid context-menu-demo__settings">
          <div class="example-demo__action-group context-menu-demo__setting-group" role="group" aria-label="菜单主题控制">
            <div class="example-demo__action-buttons context-menu-demo__setting-buttons">
              <el-segmented v-model="theme" :options="['light', 'dark']" aria-label="右键菜单主题" @change="setMenuTheme" />
              <el-button plain @click="toggleMenuTheme">切换菜单主题</el-button>
            </div>
          </div>
          <div class="example-demo__action-group context-menu-demo__setting-group" role="group" aria-label="菜单状态控制">
            <div class="example-demo__action-buttons context-menu-demo__setting-buttons">
              <el-button plain :disabled="!registered" @click="clearMarkerState">清除 Element 状态</el-button>
            </div>
          </div>
        </div>
        <div class="example-demo__feedback context-menu-demo__feedback" aria-live="polite">
          <el-tag :type="registered ? 'success' : 'info'" effect="plain">{{ registered ? '已注册' : '已注销' }}</el-tag>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-descriptions class="context-menu-demo__result" :column="1" border aria-live="polite">
      <el-descriptions-item label="最近可见结果">{{ selectedAction }}</el-descriptions-item>
      <el-descriptions-item label="map inspect 状态">{{ stateLabel }}</el-descriptions-item>
      <el-descriptions-item label="当前菜单主题">{{ theme }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.context-menu-demo__toolbar {
  align-items: flex-start;
  gap: 10px;
}

.context-menu-demo__action-group {
  max-width: 100%;
}

.context-menu-demo__scenarios {
  margin-top: 14px;
  margin-bottom: 14px;
}

.context-menu-demo__scenario {
  height: 100%;
  border-color: var(--doc-border);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.context-menu-demo__scenario.is-active {
  border-color: var(--doc-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--doc-primary) 20%, transparent);
}

.context-menu-demo__scenario-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.context-menu-demo__dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
}

.context-menu-demo__settings {
  flex: 2 1 420px;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
}

.context-menu-demo__setting-buttons > *,
.context-menu-demo__setting-buttons :deep(.el-segmented) {
  max-width: 100%;
}

.context-menu-demo__result {
  margin-top: 14px;
}

.context-menu-demo__result :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}

@media (max-width: 767px) {
  .context-menu-demo__scenario {
    margin-bottom: 8px;
  }
}

@media (max-width: 560px) {
  .context-menu-demo__toolbar,
  .context-menu-demo__action-buttons,
  .context-menu-demo__settings,
  .context-menu-demo__setting-buttons {
    display: grid;
    grid-template-columns: 1fr;
  }

  .context-menu-demo__action-group,
  .context-menu-demo__action-buttons :deep(.el-button),
  .context-menu-demo__setting-group,
  .context-menu-demo__setting-buttons :deep(.el-button) {
    width: 100%;
  }

  .context-menu-demo__action-buttons :deep(.el-button),
  .context-menu-demo__setting-buttons :deep(.el-button) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
}
</style>
