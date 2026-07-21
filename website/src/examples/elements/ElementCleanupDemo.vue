<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-cleanup';
const BUSINESS_LAYER_ID = 'cleanup-demo-elements';
const MAP_ZOOM = 9.5;
const FOCUS_ZOOM = 10;

interface DemoData {
  label: string;
}

interface ElementRow {
  id: string;
  label: string;
  module: string;
  visible: boolean;
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const rows = ref<ElementRow[]>([]);
const selectedId = ref('cleanup-temporary-1');
const deletedCount = ref(0);
const status = ref('等待操作');
const selectedRow = computed(() => rows.value.find(({ id }) => id === selectedId.value));
let homeCenter: [number, number] | null = null;

const pointStyle = (label: string, module: string, selected: boolean): StyleSpec => {
  const color = module === 'temporary' ? '#e6a23c' : '#409eff';
  return {
    symbol: {
      type: 'circle',
      radius: selected ? 20 : 14,
      fill: { type: 'solid', color },
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
  };
};

const updatePresentation = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  for (const element of earth.elements.query<DemoData>()) {
    element.update({
      style: pointStyle(element.state.data?.label ?? element.id, element.state.module ?? 'permanent', element.id === selectedId.value)
    });
  }
};

const refresh = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  rows.value = earth.elements.query<DemoData>().map(({ state }) => ({
    id: state.id,
    label: state.data?.label ?? state.id,
    module: state.module ?? '—',
    visible: state.visible
  }));
  if (!rows.value.some(({ id }) => id === selectedId.value)) selectedId.value = rows.value[0]?.id ?? '';
  updatePresentation();
};

const animateHome = () => {
  if (homeCenter !== null) earthRef.value?.view.animateFlyTo(homeCenter, { zoom: MAP_ZOOM, duration: 450 });
};

const animateToSelected = () => {
  const element = earthRef.value?.elements.get<DemoData>(selectedId.value);
  if (element === undefined || element.state.geometry.type !== 'point') {
    animateHome();
    return;
  }
  const [center] = element.state.geometry.controlPoints;
  earthRef.value?.view.animateFlyTo(center, { zoom: FOCUS_ZOOM, duration: 450 });
};

const focusSelected = () => {
  const element = earthRef.value?.elements.get<DemoData>(selectedId.value);
  if (element === undefined) return;
  updatePresentation();
  animateToSelected();
  status.value = `已定位：${element.state.data?.label ?? element.id}`;
};

const selectRow = (row: ElementRow) => {
  selectedId.value = row.id;
  focusSelected();
};

const seed = () => {
  const earth = earthRef.value;
  if (earth === null || homeCenter === null) return;
  earth.elements.clear();
  const inputs = [
    { id: 'cleanup-temporary-1', label: '临时标记 A', module: 'temporary', offset: [-10_000, 7_000] },
    { id: 'cleanup-temporary-2', label: '临时标记 B', module: 'temporary', offset: [10_000, 7_000] },
    { id: 'cleanup-permanent-1', label: '永久设施 A', module: 'permanent', offset: [-10_000, -7_000] },
    { id: 'cleanup-permanent-2', label: '永久设施 B', module: 'permanent', offset: [10_000, -7_000] }
  ] as const;
  selectedId.value = 'cleanup-temporary-1';
  for (const input of inputs) {
    earth.elements.add<DemoData>({
      id: input.id,
      module: input.module,
      layerId: BUSINESS_LAYER_ID,
      data: { label: input.label },
      geometry: { type: 'point', controlPoints: [[homeCenter[0] + input.offset[0], homeCenter[1] + input.offset[1]]] },
      style: pointStyle(input.label, input.module, input.id === selectedId.value)
    });
  }
  deletedCount.value = 0;
  status.value = '已重建 4 个 Element';
  refresh();
  animateHome();
};

// #region element-cleanup
const removeSelectedHandle = () => {
  const element = earthRef.value?.elements.get<DemoData>(selectedId.value);
  if (element === undefined) return;
  const label = element.state.data?.label ?? element.id;
  element.remove();
  deletedCount.value = 1;
  refresh();
  animateToSelected();
  status.value = `句柄 remove() 已删除：${label}`;
};

const removeTemporary = () => {
  const count = earthRef.value?.elements.remove({ module: 'temporary' }) ?? 0;
  deletedCount.value = count;
  refresh();
  animateToSelected();
  status.value = `remove({ module: 'temporary' }) 已删除 ${count} 个`;
};

const clearAll = () => {
  const count = earthRef.value?.elements.query().length ?? 0;
  earthRef.value?.elements.clear();
  deletedCount.value = count;
  refresh();
  animateHome();
  status.value = `clear() 已清空 ${count} 个 Element`;
};
// #endregion element-cleanup

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
  homeCenter = [center[0], center[1]];
  earth.view.flyTo(homeCenter, MAP_ZOOM);
  earthRef.value = earth;
  seed();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  homeCenter = null;
});
</script>

<template>
  <div class="example-demo">
    <el-alert
      class="example-demo__alert"
      type="warning"
      :closable="false"
      show-icon
      title="批量 remove() 必须传入至少一个选择条件；清空全部对象请显式调用 clear()。"
    />

    <div class="example-demo__control-panel element-cleanup-demo__controls">
      <div class="example-demo__action-row element-cleanup-demo__action-row">
        <div class="example-demo__field example-demo__action-group element-cleanup-demo__field">
          <span>当前 Element</span>
          <el-select v-model="selectedId" aria-label="选择 Element" @change="focusSelected">
            <el-option v-for="row in rows" :key="row.id" :label="`${row.label} · ${row.id}`" :value="row.id" />
          </el-select>
        </div>
        <div class="example-demo__action-group element-cleanup-demo__action-group" role="group" aria-label="删除操作">
          <div class="example-demo__action-buttons">
            <el-button type="danger" plain :disabled="!selectedId" @click="removeSelectedHandle">句柄 remove()</el-button>
            <el-button type="danger" plain @click="removeTemporary">移除 temporary 模块</el-button>
            <el-popconfirm title="确定显式清空全部 Element？" @confirm="clearAll">
              <template #reference><el-button type="danger">clear()</el-button></template>
            </el-popconfirm>
          </div>
        </div>
        <div class="example-demo__action-group element-cleanup-demo__action-group" role="group" aria-label="恢复操作">
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="seed">重建示例</el-button>
          </div>
        </div>
        <div class="example-demo__feedback element-cleanup-demo__feedback" aria-live="polite">
          <el-tag type="warning" effect="dark">temporary · 橙色</el-tag>
          <el-tag type="primary" effect="dark">permanent · 蓝色</el-tag>
          <el-tag type="primary" effect="plain">当前：{{ selectedRow?.label ?? '无' }}</el-tag>
          <el-tag type="success" effect="plain">剩余 {{ rows.length }} 个</el-tag>
          <el-tag type="danger" effect="plain">本次删除 {{ deletedCount }} 个</el-tag>
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
      class="element-cleanup-demo__table"
      @row-click="selectRow"
    >
      <el-table-column prop="label" label="名称" min-width="130" />
      <el-table-column prop="id" label="ID" min-width="190" />
      <el-table-column prop="module" label="Module" min-width="120" />
      <el-table-column label="可见" width="72">
        <template #default="scope">{{ scope.row.visible ? '是' : '否' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.element-cleanup-demo__field :deep(.el-select) {
  width: 100%;
  max-width: 225px;
}

.element-cleanup-demo__field {
  flex: 0 1 140px;
}

.element-cleanup-demo__table {
  margin-top: 14px;
}

.element-cleanup-demo__table :deep(.el-table__row) {
  cursor: pointer;
}
</style>
