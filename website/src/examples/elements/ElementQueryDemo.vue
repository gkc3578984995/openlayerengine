<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type MapBrowserEvent from 'ol/MapBrowserEvent.js';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, Element, ElementSelector, ScreenExtent, ShapeType, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-query';
const BUSINESS_LAYER_ID = 'query-demo-elements';
const MAP_ZOOM = 9.5;
const FOCUS_ZOOM = 10;

interface DemoData {
  label: string;
  priority: number;
}

interface ResultRow {
  id: string;
  label: string;
  type: ShapeType;
  module: string;
  priority: number;
  visible: boolean;
}

type VisualState = 'selected' | 'matched' | 'muted';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const moduleFilter = ref('all');
const typeFilter = ref<'all' | ShapeType>('all');
const visibilityFilter = ref<'all' | 'visible' | 'hidden'>('all');
const usePriority = ref(false);
const minimumPriority = ref(2);
const results = ref<ResultRow[]>([]);
const selectedId = ref('query-center');
const status = ref('等待查询');
const screenExtent = shallowRef<ScreenExtent | null>(null);
let matchedIds = new Set<string>();

const screenExtentStyle = computed(() => {
  const extent = screenExtent.value;
  if (extent === null) return {};
  return {
    left: `${extent[0]}px`,
    top: `${extent[1]}px`,
    width: `${Math.max(1, extent[2] - extent[0])}px`,
    height: `${Math.max(1, extent[3] - extent[1])}px`
  };
});

const textStyle = (label: string, visualState: VisualState, offsetY = 0): NonNullable<StyleSpec['text']> => {
  const selected = visualState === 'selected';
  const matched = visualState !== 'muted';
  return {
    text: label,
    offsetY,
    fontSize: selected ? 14 : 12,
    fontWeight: selected ? 'bold' : 'normal',
    padding: [4, 7, 4, 7],
    fill: { type: 'solid', color: '#111827' },
    backgroundFill: { type: 'solid', color: matched ? 'rgba(255, 255, 255, 0.94)' : 'rgba(255, 255, 255, 0.7)' },
    backgroundStroke: { color: selected ? '#f59e0b' : '#ffffff', width: selected ? 2 : 1 }
  };
};

const shapeStyle = (label: string, module: string, type: ShapeType, visualState: VisualState): StyleSpec => {
  const selected = visualState === 'selected';
  const matched = visualState !== 'muted';
  const color = selected ? '#f59e0b' : module === 'vehicles' ? '#409eff' : '#67c23a';
  const mutedColor = 'rgba(148, 163, 184, 0.55)';
  if (type === 'point') {
    return {
      symbol: {
        type: 'circle',
        radius: selected ? 20 : matched ? 16 : 13,
        fill: { type: 'solid', color: matched ? color : mutedColor },
        stroke: { color: '#ffffff', width: selected ? 5 : 3 }
      },
      text: textStyle(label, visualState, selected ? 42 : 36),
      zIndex: selected ? 30 : matched ? 20 : 10
    };
  }
  if (type === 'polyline') {
    return {
      strokes: [
        { color: matched ? '#ffffff' : 'rgba(255, 255, 255, 0.65)', width: selected ? 13 : matched ? 10 : 7, lineCap: 'round', lineJoin: 'round' },
        { color: matched ? color : mutedColor, width: selected ? 7 : matched ? 5 : 3, lineCap: 'round', lineJoin: 'round' }
      ],
      text: textStyle(label, visualState, selected ? 30 : 25),
      zIndex: selected ? 30 : matched ? 20 : 10
    };
  }
  return {
    strokes: [
      { color: matched ? '#ffffff' : 'rgba(255, 255, 255, 0.65)', width: selected ? 11 : matched ? 8 : 6 },
      { color: matched ? color : mutedColor, width: selected ? 6 : matched ? 4 : 3 }
    ],
    fill: {
      type: 'solid',
      color: selected
        ? 'rgba(245, 158, 11, 0.38)'
        : matched
          ? module === 'vehicles'
            ? 'rgba(64, 158, 255, 0.3)'
            : 'rgba(103, 194, 58, 0.3)'
          : 'rgba(148, 163, 184, 0.16)'
    },
    text: textStyle(label, visualState),
    zIndex: selected ? 30 : matched ? 20 : 10
  };
};

const updatePresentation = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  for (const element of earth.elements.query<DemoData>()) {
    const visualState: VisualState = element.id === selectedId.value ? 'selected' : matchedIds.has(element.id) ? 'matched' : 'muted';
    element.update({ style: shapeStyle(element.state.data?.label ?? element.id, element.state.module ?? '—', element.state.type, visualState) });
  }
};

const centerFor = (element: Element<DemoData>): Coordinate | undefined => {
  const geometry = element.state.geometry;
  if (geometry.type === 'circle') return [geometry.center[0], geometry.center[1]];
  if (geometry.controlPoints.length === 0) return undefined;
  const [x, y] = geometry.controlPoints.reduce<[number, number]>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [x / geometry.controlPoints.length, y / geometry.controlPoints.length];
};

const animateToSelected = () => {
  const element = earthRef.value?.elements.get<DemoData>(selectedId.value);
  if (element === undefined) return;
  const center = centerFor(element);
  if (center === undefined) return;
  earthRef.value?.view.animateFlyTo(center, { zoom: FOCUS_ZOOM, duration: 450 });
};

const focusSelected = () => {
  const element = earthRef.value?.elements.get<DemoData>(selectedId.value);
  if (element === undefined) return;
  screenExtent.value = null;
  updatePresentation();
  animateToSelected();
  status.value = element.state.visible
    ? `已定位：${element.state.data?.label ?? element.id}`
    : `已选择：${element.state.data?.label ?? element.id}（当前隐藏）`;
};

const selectRow = (row: ResultRow) => {
  selectedId.value = row.id;
  focusSelected();
};

// #region element-query
const runQuery = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const selector: ElementSelector<DemoData> = {
    ...(moduleFilter.value === 'all' ? {} : { module: moduleFilter.value }),
    ...(typeFilter.value === 'all' ? {} : { type: typeFilter.value }),
    ...(visibilityFilter.value === 'all' ? {} : { visible: visibilityFilter.value === 'visible' }),
    ...(usePriority.value ? { predicate: (state) => (state.data?.priority ?? 0) >= minimumPriority.value } : {})
  };
  const matched = Object.keys(selector).length === 0 ? earth.elements.query<DemoData>() : earth.elements.query(selector);
  matchedIds = new Set(matched.map(({ id }) => id));
  screenExtent.value = null;
  results.value = matched.map(({ state }) => ({
    id: state.id,
    label: state.data?.label ?? state.id,
    type: state.type,
    module: state.module ?? '—',
    priority: state.data?.priority ?? 0,
    visible: state.visible
  }));
  if (!results.value.some(({ id }) => id === selectedId.value)) selectedId.value = results.value[0]?.id ?? '';
  updatePresentation();
  if (selectedId.value) animateToSelected();
  status.value = `query() 匹配 ${matched.length} 个 Element`;
};

const getSelected = () => {
  const element = earthRef.value?.elements.get<DemoData>(selectedId.value);
  screenExtent.value = null;
  status.value = element === undefined ? `get('${selectedId.value}') → undefined` : `get('${selectedId.value}') → ${element.state.data?.label}`;
  if (element !== undefined) {
    updatePresentation();
    animateToSelected();
  }
};

const inspectExtent = () => {
  const extent = earthRef.value?.elements.getScreenExtent(selectedId.value);
  screenExtent.value = extent ?? null;
  status.value = extent === undefined ? '目标当前没有可见屏幕范围' : `屏幕范围：[${extent.map((value) => value.toFixed(1)).join(', ')}]`;
  updatePresentation();
};

const hitAtPixel = (event: MapBrowserEvent) => {
  const earth = earthRef.value;
  if (earth === null) return;
  const hit = earth.elements.atPixel<DemoData>([event.pixel[0]!, event.pixel[1]!]);
  if (hit === undefined) {
    screenExtent.value = null;
    status.value = 'atPixel()：点击位置未命中 Element';
    return;
  }
  selectedId.value = hit.element.id;
  screenExtent.value = null;
  updatePresentation();
  status.value = `atPixel() 命中：${hit.element.state.data?.label ?? hit.element.id}`;
};
// #endregion element-query

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: MAP_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.5 });
  earth.layers.add({ kind: 'vector', id: BUSINESS_LAYER_ID, zIndex: 20, declutter: true });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.view.flyTo(center, MAP_ZOOM);
  const items = [
    {
      id: 'query-center',
      module: 'vehicles',
      label: '中心车辆',
      priority: 3,
      visible: true,
      geometry: { type: 'point', controlPoints: [[center[0] - 13_000, center[1] + 9_000]] }
    },
    {
      id: 'query-vehicle-route',
      module: 'vehicles',
      label: '巡检路线',
      priority: 2,
      visible: true,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [center[0] - 18_000, center[1] - 9_000],
          [center[0] - 7_000, center[1] - 3_000],
          [center[0] + 2_000, center[1] - 10_000]
        ]
      }
    },
    {
      id: 'query-facility-range',
      module: 'facilities',
      label: '服务范围',
      priority: 4,
      visible: true,
      geometry: { type: 'circle', center: [center[0] + 12_000, center[1] - 7_000], radius: 5_500 }
    },
    {
      id: 'query-facility-point',
      module: 'facilities',
      label: '北侧站点',
      priority: 2,
      visible: true,
      geometry: { type: 'point', controlPoints: [[center[0] + 14_000, center[1] + 10_000]] }
    },
    {
      id: 'query-vehicle-hidden',
      module: 'vehicles',
      label: '离线车辆',
      priority: 1,
      visible: false,
      geometry: { type: 'point', controlPoints: [[center[0], center[1] + 14_000]] }
    }
  ] as const;
  for (const item of items) {
    earth.elements.add<DemoData>({
      id: item.id,
      module: item.module,
      layerId: BUSINESS_LAYER_ID,
      visible: item.visible,
      data: { label: item.label, priority: item.priority },
      geometry: item.geometry,
      style: shapeStyle(item.label, item.module, item.geometry.type, item.id === selectedId.value ? 'selected' : 'matched')
    });
  }
  earthRef.value = earth;
  earth.map.on('singleclick', hitAtPixel);
  runQuery();
});

onBeforeUnmount(() => {
  earthRef.value?.map.un('singleclick', hitAtPixel);
  earthRef.value?.destroy();
  earthRef.value = null;
  matchedIds.clear();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel element-query-demo__control-panel">
      <div class="example-demo__control-grid element-query-demo__filters">
        <div class="example-demo__field element-query-demo__field">
          <span>模块</span>
          <el-select v-model="moduleFilter" aria-label="模块条件">
            <el-option label="全部模块" value="all" />
            <el-option label="vehicles" value="vehicles" />
            <el-option label="facilities" value="facilities" />
          </el-select>
        </div>
        <div class="example-demo__field element-query-demo__field">
          <span>图形类型</span>
          <el-select v-model="typeFilter" aria-label="图形类型条件">
            <el-option label="全部类型" value="all" />
            <el-option label="point" value="point" />
            <el-option label="polyline" value="polyline" />
            <el-option label="circle" value="circle" />
          </el-select>
        </div>
        <div class="example-demo__field element-query-demo__field">
          <span>显隐</span>
          <el-select v-model="visibilityFilter" aria-label="显隐条件">
            <el-option label="全部显隐" value="all" />
            <el-option label="仅可见" value="visible" />
            <el-option label="仅隐藏" value="hidden" />
          </el-select>
        </div>
        <div class="example-demo__field element-query-demo__field">
          <span>Predicate</span>
          <el-switch v-model="usePriority" active-text="启用 predicate" />
        </div>
        <div class="example-demo__field element-query-demo__field">
          <span>最低优先级</span>
          <el-input-number v-model="minimumPriority" :min="1" :max="4" :disabled="!usePriority" aria-label="最低优先级" />
        </div>
      </div>
      <div class="example-demo__action-row">
        <div class="example-demo__action-group element-query-demo__action-group" role="group" aria-label="查询操作">
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="runQuery">执行 query()</el-button>
          </div>
        </div>
        <div class="example-demo__feedback element-query-demo__feedback" aria-live="polite">
          <el-tag type="primary" effect="plain">{{ status }}</el-tag>
        </div>
      </div>
    </div>

    <div class="element-query-demo__stage-wrap">
      <div ref="mapTarget" class="example-stage element-query-demo__stage"></div>
      <el-tag class="element-query-demo__map-hint" type="primary" effect="dark">点击图形执行 atPixel()</el-tag>
      <div v-if="screenExtent" class="element-query-demo__screen-extent" :style="screenExtentStyle">
        <span>getScreenExtent()</span>
      </div>
    </div>

    <div class="example-demo__control-panel element-query-demo__actions">
      <div class="example-demo__action-row">
        <div class="example-demo__field element-query-demo__field">
          <span>查询结果</span>
          <el-select v-model="selectedId" aria-label="选择查询结果" @change="focusSelected">
            <el-option v-if="selectedId && !results.some((row) => row.id === selectedId)" :label="`${selectedId} · 未匹配当前条件`" :value="selectedId" />
            <el-option v-for="row in results" :key="row.id" :label="`${row.label} · ${row.id}`" :value="row.id" />
          </el-select>
        </div>
        <div class="example-demo__action-group element-query-demo__action-group" role="group" aria-label="查询结果操作">
          <div class="example-demo__action-buttons">
            <el-button @click="getSelected">get()</el-button>
            <el-button @click="inspectExtent">getScreenExtent()</el-button>
          </div>
        </div>
        <div class="example-demo__feedback element-query-demo__feedback" aria-live="polite">
          <el-tag type="success" effect="plain">匹配 {{ results.length }} 个</el-tag>
        </div>
      </div>
    </div>

    <el-table
      :data="results"
      border
      size="small"
      row-key="id"
      highlight-current-row
      :current-row-key="selectedId"
      empty-text="没有匹配的 Element"
      class="element-query-demo__table"
      @row-click="selectRow"
    >
      <el-table-column prop="label" label="名称" min-width="130" />
      <el-table-column prop="id" label="ID" min-width="170" />
      <el-table-column prop="type" label="ShapeType" min-width="100" />
      <el-table-column prop="module" label="Module" min-width="110" />
      <el-table-column prop="priority" label="优先级" width="80" />
      <el-table-column label="可见" width="78">
        <template #default="scope">{{ scope.row.visible ? '是' : '否' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.element-query-demo__filters {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
}

.element-query-demo__field :deep(.el-select) {
  width: 100%;
  max-width: 210px;
}

.element-query-demo__field :deep(.el-input-number) {
  max-width: 100%;
}

.element-query-demo__actions {
  margin-top: 14px;
}

.element-query-demo__stage-wrap {
  position: relative;
}

.element-query-demo__map-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 2;
  transform: translateX(-50%);
  pointer-events: none;
}

.element-query-demo__screen-extent {
  position: absolute;
  z-index: 3;
  border: 2px dashed var(--el-color-warning);
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-warning) 16%, transparent);
  pointer-events: none;
}

.element-query-demo__screen-extent span {
  position: absolute;
  top: -26px;
  left: 0;
  padding: 3px 7px;
  border-radius: 4px;
  background: var(--el-color-warning);
  color: var(--el-color-white);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.element-query-demo__stage :deep(.ol-viewport) {
  cursor: pointer;
}

.element-query-demo__table :deep(.el-table__row) {
  cursor: pointer;
}
</style>
