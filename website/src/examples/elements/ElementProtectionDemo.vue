<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  Earth,
  ElementProtectedError,
  type Coordinate,
  type ElementProtectionState,
  type ElementProtectionUpdate,
  type ShapeInput,
  type StyleSpec
} from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const BUSINESS_LAYER_ID = 'docs-element-protection';
const MAP_ZOOM = 11;
const ICON_SOURCE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"%3E%3Crect x="5" y="10" width="46" height="39" rx="8" fill="%232563eb" stroke="white" stroke-width="3"/%3E%3Cpath d="M18 10V6h20v4M15 24h26M20 31h6v10h-6zM31 31h6v10h-6z" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/%3E%3C/svg%3E';

type DemoKind = 'point' | 'image' | 'polyline' | 'polygon';

interface ProtectionTarget {
  readonly id: string;
  readonly label: string;
  readonly kind: DemoKind;
  readonly geometry: ShapeInput;
  readonly style: StyleSpec;
  readonly focus: Coordinate;
  readonly operatorId: string;
  readonly operatorName: string;
}

interface ProtectionRow {
  readonly id: string;
  readonly label: string;
  readonly kind: DemoKind;
  readonly protection?: ElementProtectionState;
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const centerRef = shallowRef<Coordinate | null>(null);
const targets = shallowRef<readonly ProtectionTarget[]>([]);
const rows = ref<readonly ProtectionRow[]>([]);
const selectedId = ref('protection-point');
const operatorName = ref('王小明');
const status = ref('示例加载后，四类目标默认进入保护模式');
const revisionById = new Map<string, number>();
const expiryRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

const selectedRow = computed(() => rows.value.find(({ id }) => id === selectedId.value));
const protectedCount = computed(() => rows.value.filter(({ protection }) => protection !== undefined).length);

const nextRevision = (id: string) => {
  const next = (revisionById.get(id) ?? 0) + 1;
  revisionById.set(id, next);
  return next;
};

const createTargets = (center: Coordinate): readonly ProtectionTarget[] => {
  const [x, y] = center;
  return [
    {
      id: 'protection-point',
      label: '普通点',
      kind: 'point',
      geometry: { type: 'point', controlPoints: [[x - 14_000, y + 9_000]] },
      style: {
        symbol: {
          type: 'circle',
          radius: 15,
          fill: { type: 'solid', color: '#2563eb' },
          stroke: { color: '#ffffff', width: 4 }
        }
      },
      focus: [x - 14_000, y + 9_000],
      operatorId: 'user-wang',
      operatorName: '王小明'
    },
    {
      id: 'protection-image',
      label: '图片点',
      kind: 'image',
      geometry: { type: 'point', controlPoints: [[x + 14_000, y + 9_000]] },
      style: { symbol: { type: 'icon', src: ICON_SOURCE, size: [56, 56], anchor: [0.5, 0.5], anchorXUnits: 'fraction', anchorYUnits: 'fraction' } },
      focus: [x + 14_000, y + 9_000],
      operatorId: 'user-li',
      operatorName: '李娜'
    },
    {
      id: 'protection-line',
      label: '路线',
      kind: 'polyline',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [x - 20_000, y - 4_000],
          [x - 15_000, y - 15_000],
          [x - 4_000, y - 7_000]
        ]
      },
      style: { strokes: [{ color: '#2563eb', width: 7 }] },
      focus: [x - 13_000, y - 9_000],
      operatorId: 'user-chen',
      operatorName: '陈工'
    },
    {
      id: 'protection-polygon',
      label: '作业区',
      kind: 'polygon',
      geometry: {
        type: 'polygon',
        controlPoints: [
          [x + 5_000, y - 4_000],
          [x + 20_000, y - 5_000],
          [x + 17_000, y - 16_000],
          [x + 7_000, y - 14_000]
        ]
      },
      style: {
        strokes: [{ color: '#2563eb', width: 5 }],
        fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.24)' }
      },
      focus: [x + 12_000, y - 10_000],
      operatorId: 'user-zhao',
      operatorName: '赵敏'
    }
  ];
};

const refreshRows = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  rows.value = targets.value.map((target) => ({
    id: target.id,
    label: target.label,
    kind: target.kind,
    protection: earth.elements.getProtection(target.id)
  }));
};

const targetById = (id: string) => targets.value.find((target) => target.id === id);

const cancelExpiryRefresh = (elementId: string) => {
  const timer = expiryRefreshTimers.get(elementId);
  if (timer === undefined) return;
  clearTimeout(timer);
  expiryRefreshTimers.delete(elementId);
};

const cancelAllExpiryRefreshes = () => {
  for (const timer of expiryRefreshTimers.values()) clearTimeout(timer);
  expiryRefreshTimers.clear();
};

const focusSelected = () => {
  const target = targetById(selectedId.value);
  if (target === undefined) return;
  earthRef.value?.view.animateFlyTo(target.focus, { zoom: MAP_ZOOM + 0.4, duration: 420 });
};

// #region element-protection
const setSelectedProtection = (protectedValue: boolean, expiresAt?: number) => {
  const earth = earthRef.value;
  const target = targetById(selectedId.value);
  if (earth === null || target === undefined) return;
  cancelExpiryRefresh(target.id);

  const revision = nextRevision(target.id);
  const update: ElementProtectionUpdate = protectedValue
    ? {
        protected: true,
        operatorId: target.operatorId,
        operatorName: operatorName.value.trim() || undefined,
        revision,
        expiresAt
      }
    : { protected: false, revision };

  const changed = earth.elements.setProtection(target.id, update);
  const current = earth.elements.getProtection(target.id);
  refreshRows();
  status.value = changed
    ? current === undefined
      ? `${target.label} 已解除保护`
      : `${target.label} 已由 ${current.operatorName ?? '其他协作者'} 保护`
    : `${target.label} 的保护状态没有变化`;
  if (expiresAt !== undefined) {
    const timer = setTimeout(
      () => {
        if (expiryRefreshTimers.get(target.id) !== timer) return;
        expiryRefreshTimers.delete(target.id);
        refreshRows();
        if (earth.elements.getProtection(target.id) === undefined) status.value = `${target.label} 的 10 秒保护已到期`;
      },
      Math.max(0, expiresAt - Date.now()) + 50
    );
    expiryRefreshTimers.set(target.id, timer);
  }
};
// #endregion element-protection

const protectForTenSeconds = () => setSelectedProtection(true, Date.now() + 10_000);

const tryBuiltInEdit = () => {
  const earth = earthRef.value;
  const element = earth?.elements.get(selectedId.value);
  if (earth === null || earth === undefined || element === undefined) return;
  try {
    const edit = earth.draw.edit(element, { policy: 'replace' });
    edit.cancel();
    edit.destroy();
    status.value = `${selectedRow.value?.label ?? element.id} 未受保护，Edit 已正常启动并立即清理`;
  } catch (error) {
    if (!(error instanceof ElementProtectedError)) throw error;
    status.value = `${selectedRow.value?.label ?? element.id} 被保护，Edit 已拒绝启动`;
  }
};

const protectDefaults = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  for (const target of targets.value) {
    earth.elements.setProtection(target.id, {
      protected: true,
      operatorId: target.operatorId,
      operatorName: target.operatorName,
      revision: nextRevision(target.id)
    });
  }
};

const seed = () => {
  const earth = earthRef.value;
  const center = centerRef.value;
  if (earth === null || center === null) return;
  cancelAllExpiryRefreshes();
  earth.elements.clear();
  revisionById.clear();
  targets.value = createTargets(center);
  for (const target of targets.value) {
    earth.elements.add({
      id: target.id,
      layerId: BUSINESS_LAYER_ID,
      module: 'docs-element-protection',
      geometry: target.geometry,
      style: target.style,
      data: { label: target.label, kind: target.kind }
    });
  }
  protectDefaults();
  selectedId.value = targets.value[0]?.id ?? '';
  operatorName.value = targets.value[0]?.operatorName ?? '';
  status.value = '已重建普通点、图片点、路线和作业区，并恢复默认保护';
  refreshRows();
  earth.view.animateFlyTo(center, { zoom: MAP_ZOOM, duration: 420 });
};

const selectTarget = (id: string) => {
  selectedId.value = id;
  const target = targetById(id);
  operatorName.value = earthRef.value?.elements.getProtection(id)?.operatorName ?? target?.operatorName ?? '';
  focusSelected();
};

const selectRow = (row: ProtectionRow) => selectTarget(row.id);

defineExpose({ reset: seed, focusSelected });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: MAP_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.46 });
  earth.layers.add({ kind: 'vector', id: BUSINESS_LAYER_ID, zIndex: 30, declutter: true });
  centerRef.value = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earthRef.value = earth;
  seed();
});

onBeforeUnmount(() => {
  cancelAllExpiryRefreshes();
  earthRef.value?.destroy();
  earthRef.value = null;
  centerRef.value = null;
  targets.value = [];
});
</script>

<template>
  <div class="example-demo element-protection-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="保护层只表达协同编辑占用状态：Element 仍可命中和读取，但内置 Edit / Transform 不会接管受保护目标。"
    />

    <div class="element-protection-demo__catalog" aria-label="保护目标目录">
      <el-button
        v-for="row in rows"
        :key="row.id"
        class="element-protection-demo__target"
        :type="selectedId === row.id ? 'primary' : 'default'"
        :plain="selectedId !== row.id"
        :aria-pressed="selectedId === row.id"
        @click="selectTarget(row.id)"
      >
        <span>{{ row.label }}</span>
        <small>{{ row.kind }} · {{ row.protection === undefined ? '可编辑' : '保护中' }}</small>
      </el-button>
    </div>

    <div class="example-demo__control-panel">
      <div class="example-demo__control-grid element-protection-demo__controls">
        <div class="example-demo__field">
          <span>正在操作的人</span>
          <el-input v-model="operatorName" clearable aria-label="正在操作的人名称" placeholder="可选" />
        </div>
        <div class="example-demo__action-group">
          <span>保护状态</span>
          <div class="example-demo__action-buttons">
            <el-button type="warning" @click="setSelectedProtection(true)">进入保护</el-button>
            <el-button @click="setSelectedProtection(false)">解除保护</el-button>
            <el-button plain @click="protectForTenSeconds">保护 10 秒</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>交互验证</span>
          <div class="example-demo__action-buttons">
            <el-button type="primary" plain @click="tryBuiltInEdit">尝试启动 Edit</el-button>
          </div>
        </div>
      </div>
      <div class="example-demo__feedback" aria-live="polite">
        <el-tag type="warning" effect="dark">保护中 {{ protectedCount }} / {{ rows.length }}</el-tag>
        <el-tag :type="selectedRow?.protection === undefined ? 'success' : 'warning'" effect="plain">
          当前：{{ selectedRow?.protection === undefined ? '可编辑' : (selectedRow.protection.operatorName ?? '其他协作者') }}
        </el-tag>
        <el-tag effect="plain">{{ status }}</el-tag>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-table :data="rows" border size="small" row-key="id" class="element-protection-demo__table" @row-click="selectRow">
      <el-table-column prop="label" label="目标" min-width="100" />
      <el-table-column prop="kind" label="几何" min-width="100" />
      <el-table-column label="状态" min-width="100">
        <template #default="scope">{{ scope.row.protection === undefined ? '可编辑' : '保护中' }}</template>
      </el-table-column>
      <el-table-column label="操作人" min-width="130">
        <template #default="scope">{{ scope.row.protection?.operatorName ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="Revision" min-width="100">
        <template #default="scope">{{ scope.row.protection?.revision ?? '—' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.element-protection-demo__catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.element-protection-demo__target.el-button {
  height: auto;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  white-space: normal;
}

.element-protection-demo__target :deep(span) {
  display: grid;
  width: 100%;
  justify-items: start;
  gap: 3px;
  text-align: left;
}

.element-protection-demo__target small {
  color: var(--doc-text-muted);
  font-weight: 400;
}

.element-protection-demo__controls {
  grid-template-columns: minmax(160px, 0.8fr) minmax(260px, 1.5fr) minmax(150px, 0.7fr);
}

.element-protection-demo__table {
  margin-top: 14px;
}

.element-protection-demo__table :deep(.el-table__row) {
  cursor: pointer;
}

@media (max-width: 760px) {
  .element-protection-demo__controls {
    grid-template-columns: 1fr;
  }
}
</style>
