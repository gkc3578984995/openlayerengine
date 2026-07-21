<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, Element, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-update';
const BUSINESS_LAYER_ID = 'update-demo-elements';
const SOURCE_ID = 'update-source';
const MAP_ZOOM = 9.5;
const FOCUS_ZOOM = 10;

interface DemoData {
  label: string;
  revision: number;
}

interface ElementRow {
  id: string;
  module: string;
  visible: boolean;
  label: string;
  revision: number;
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const selectedId = ref(SOURCE_ID);
const rows = ref<ElementRow[]>([]);
const offsetKm = ref(10);
const color = ref<string | null>('#e6a23c');
const status = ref('等待操作');
const affectedCount = ref(0);
const elementColors = new Map<string, string>();
let copyCount = 0;

const selectedRow = computed(() => rows.value.find(({ id }) => id === selectedId.value));

const pointStyle = (label: string, fillColor: string, selected: boolean): StyleSpec => ({
  symbol: {
    type: 'circle',
    radius: selected ? 20 : 14,
    fill: { type: 'solid', color: fillColor },
    stroke: { color: selected ? '#f59e0b' : '#ffffff', width: selected ? 5 : 3 }
  },
  text: {
    text: label,
    offsetY: selected ? 42 : 36,
    fontSize: selected ? 14 : 12,
    fontWeight: selected ? 'bold' : 'normal',
    padding: [4, 7, 4, 7],
    fill: { type: 'solid', color: '#111827' },
    backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.94)' },
    backgroundStroke: { color: selected ? '#f59e0b' : '#ffffff', width: selected ? 2 : 1 }
  },
  zIndex: selected ? 30 : 20
});

const colorFor = (element: Element<DemoData>) => {
  const stored = elementColors.get(element.id);
  if (stored !== undefined) return stored;
  if (element.state.module === 'reviewed') return '#8b5cf6';
  if (element.state.module === 'copies') return '#67c23a';
  return '#409eff';
};

const updatePresentation = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  for (const element of earth.elements.query<DemoData>()) {
    element.update({
      style: pointStyle(element.state.data?.label ?? element.id, colorFor(element), element.id === selectedId.value)
    });
  }
};

const refresh = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  rows.value = earth.elements.query<DemoData>().map(({ state }) => ({
    id: state.id,
    module: state.module ?? '—',
    visible: state.visible,
    label: state.data?.label ?? state.id,
    revision: state.data?.revision ?? 0
  }));
  if (!rows.value.some(({ id }) => id === selectedId.value)) selectedId.value = rows.value[0]?.id ?? '';
  updatePresentation();
};

const selected = (): Element<DemoData> | undefined => earthRef.value?.elements.get<DemoData>(selectedId.value);

const animateToSelected = () => {
  const element = selected();
  if (element === undefined || element.state.geometry.type !== 'point') return;
  const [center] = element.state.geometry.controlPoints;
  earthRef.value?.view.animateFlyTo(center, { zoom: FOCUS_ZOOM, duration: 450 });
};

const focusSelected = () => {
  const element = selected();
  if (element === undefined) return;
  updatePresentation();
  animateToSelected();
  status.value = element.state.visible
    ? `已定位：${element.state.data?.label ?? element.id}`
    : `已选择：${element.state.data?.label ?? element.id}（当前隐藏）`;
};

const selectRow = (row: ElementRow) => {
  selectedId.value = row.id;
  focusSelected();
};

// #region element-update
const updateHandle = () => {
  const element = selected();
  if (element === undefined || element.state.geometry.type !== 'point') return;
  const [center] = element.state.geometry.controlPoints;
  const revision = (element.state.data?.revision ?? 0) + 1;
  const label = `${element.state.data?.label?.replace(/ · v\d+$/, '') ?? element.id} · v${revision}`;
  element.update({
    module: 'edited',
    data: { label, revision },
    geometry: { type: 'point', controlPoints: [[center[0] + offsetKm.value * 1_000, center[1]]] }
  });
  elementColors.set(element.id, color.value ?? '#e6a23c');
  affectedCount.value = 1;
  refresh();
  animateToSelected();
  status.value = `update() 已移动并改色：${label}`;
};

const copySelected = () => {
  const earth = earthRef.value;
  const element = selected();
  if (earth === null || element === undefined || element.state.geometry.type !== 'point') return;
  copyCount += 1;
  const [center] = element.state.geometry.controlPoints;
  const copy = earth.elements.copy<DemoData>(element.id, {
    module: 'copies',
    visible: true,
    data: { label: `副本 ${copyCount}`, revision: 0 },
    geometry: { type: 'point', controlPoints: [[center[0] + 10_000, center[1] - 8_000]] }
  });
  elementColors.set(copy.id, '#67c23a');
  selectedId.value = copy.id;
  affectedCount.value = 1;
  refresh();
  animateToSelected();
  status.value = `copy() 已创建并定位：副本 ${copyCount}`;
};

const batchUpdate = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const updated = earth.elements.update<DemoData>({ module: 'copies' }, { module: 'reviewed', visible: true });
  for (const element of updated) elementColors.set(element.id, '#8b5cf6');
  if (updated[0] !== undefined) selectedId.value = updated[0].id;
  affectedCount.value = updated.length;
  refresh();
  if (updated.length > 0) animateToSelected();
  status.value = `批量 update() 已将 ${updated.length} 个副本标记为 reviewed`;
};

const hideSelected = () => {
  const hidden = earthRef.value?.elements.hide({ id: selectedId.value }) ?? [];
  affectedCount.value = hidden.length;
  refresh();
  animateToSelected();
  status.value = `hide() 已隐藏 ${hidden.length} 个 Element`;
};

const showSelected = () => {
  const shown = earthRef.value?.elements.show({ id: selectedId.value }) ?? [];
  affectedCount.value = shown.length;
  refresh();
  animateToSelected();
  status.value = `show() 已显示 ${shown.length} 个 Element`;
};
// #endregion element-update

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
  earth.elements.add<DemoData>({
    id: SOURCE_ID,
    module: 'working',
    layerId: BUSINESS_LAYER_ID,
    data: { label: '源对象', revision: 0 },
    geometry: { type: 'point', controlPoints: [center] },
    style: pointStyle('源对象', '#409eff', true)
  });
  elementColors.set(SOURCE_ID, '#409eff');
  earthRef.value = earth;
  affectedCount.value = 1;
  status.value = '已创建源对象，可从 update() 开始体验';
  refresh();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  elementColors.clear();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel element-update-demo__controls">
      <div class="example-demo__control-grid element-update-demo__settings">
        <div class="example-demo__field element-update-demo__field">
          <span>当前 Element</span>
          <el-select v-model="selectedId" aria-label="选择 Element" @change="focusSelected">
            <el-option v-for="row in rows" :key="row.id" :label="`${row.label} · ${row.id}`" :value="row.id" />
          </el-select>
        </div>
        <div class="example-demo__field element-update-demo__field">
          <span>横向移动（千米）</span>
          <el-input-number v-model="offsetKm" :min="-20" :max="20" :step="2" aria-label="横向移动千米" />
        </div>
        <div class="example-demo__field element-update-demo__field">
          <span>更新颜色</span>
          <el-color-picker v-model="color" aria-label="更新颜色" />
        </div>
      </div>
      <div class="example-demo__action-row">
        <div class="example-demo__actions element-update-demo__actions">
          <div class="example-demo__action-group element-update-demo__action-group" role="group" aria-label="更新与复制操作">
            <div class="example-demo__action-buttons">
              <el-button type="primary" :disabled="!selectedId" @click="updateHandle">句柄 update()</el-button>
              <el-button :disabled="!selectedId" @click="copySelected">copy()</el-button>
              <el-button @click="batchUpdate">批量 update()</el-button>
            </div>
          </div>
          <div class="example-demo__action-group element-update-demo__action-group" role="group" aria-label="显隐操作">
            <div class="example-demo__action-buttons">
              <el-button :disabled="!selectedId" @click="hideSelected">hide()</el-button>
              <el-button :disabled="!selectedId" @click="showSelected">show()</el-button>
            </div>
          </div>
        </div>
        <div class="example-demo__feedback element-update-demo__feedback" aria-live="polite">
          <el-tag type="primary" effect="plain">当前：{{ selectedRow?.label ?? '无' }}</el-tag>
          <el-tag type="success" effect="plain">本次影响 {{ affectedCount }} 个</el-tag>
          <el-tag effect="plain">{{ status }}</el-tag>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-table
      :data="rows"
      border
      size="small"
      row-key="id"
      highlight-current-row
      :current-row-key="selectedId"
      empty-text="当前 Earth 中没有 Element"
      class="element-update-demo__table"
      @row-click="selectRow"
    >
      <el-table-column prop="label" label="名称" min-width="130" />
      <el-table-column prop="id" label="ID" min-width="170" />
      <el-table-column prop="module" label="Module" min-width="110" />
      <el-table-column prop="revision" label="版本" width="72" />
      <el-table-column label="可见" width="72">
        <template #default="scope">{{ scope.row.visible ? '是' : '否' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.element-update-demo__settings {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
}

.element-update-demo__field :deep(.el-select) {
  width: 100%;
  max-width: 220px;
}

.element-update-demo__field :deep(.el-input-number) {
  width: 100%;
  max-width: 150px;
}

.element-update-demo__table {
  margin-top: 14px;
}

.element-update-demo__table :deep(.el-table__row) {
  cursor: pointer;
}
</style>
