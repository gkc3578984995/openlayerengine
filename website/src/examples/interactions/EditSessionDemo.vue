<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, type Coordinate, type EditSession, type Element, type ShapeState, type StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';
import { interactionTargetById, interactionTargetExamples, type InteractionTargetId } from '../../config/interactionExamples';
import { createShapeExampleInput } from '../../config/shapeExamples';

const LAYER_ID = 'docs-edit-targets';
const TARGET_ID = 'docs-edit-target';
const DEFAULT_TARGET: InteractionTargetId = 'polygon';
const ICON_SOURCE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56"%3E%3Cpath fill="%232563eb" stroke="white" stroke-width="3" d="M24 2C12.4 2 3 11.4 3 23c0 15.8 21 31 21 31s21-15.2 21-31C45 11.4 35.6 2 24 2Z"/%3E%3Ccircle cx="24" cy="23" r="8" fill="white"/%3E%3C/svg%3E';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const targetRef = shallowRef<Element | null>(null);
const sessionRef = shallowRef<EditSession | null>(null);
const mapCenter = shallowRef<Coordinate | null>(null);
const selectedTargetId = ref<InteractionTargetId>(DEFAULT_TARGET);
const status = ref<'idle' | EditSession['status']>('idle');
const underlay = ref(true);
const operationCount = ref(0);
const currentControlPoints = ref(0);
const lastOperation = ref('选择目标后开始编辑');
const historyResult = ref('拖拽蓝色控制点后可撤销');
const storeState = ref('目标保持初始业务状态');
let disposers: Array<() => void> = [];

const isActive = computed(() => status.value === 'active');
const selectedTarget = computed(() => interactionTargetById[selectedTargetId.value]);
const supportRows = interactionTargetExamples.map((target) => ({
  target: target.label,
  move: target.edit.move ? '支持' : '— 不支持',
  insert: target.edit.insert ? '支持' : '— 不支持',
  remove: target.edit.remove ? '支持' : '— 不支持',
  note: target.description
}));

const controlPointCount = (geometry: ShapeState) => (geometry.type === 'circle' ? 2 : geometry.controlPoints.length);

const styleFor = (id: InteractionTargetId): StyleSpec => {
  if (id === 'point-icon') {
    return {
      symbol: { type: 'icon', src: ICON_SOURCE, size: [48, 56], anchor: [0.5, 1], anchorXUnits: 'fraction', anchorYUnits: 'fraction' }
    };
  }
  if (id === 'polyline') return { strokes: [{ color: '#2563eb', width: 7 }] };
  return {
    strokes: [{ color: '#2563eb', width: 5 }],
    fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.28)' }
  };
};

const releaseListeners = () => {
  for (const dispose of disposers.splice(0)) dispose();
};

const destroySession = () => {
  releaseListeners();
  sessionRef.value?.destroy();
  sessionRef.value = null;
  status.value = 'idle';
};

const createTarget = () => {
  const earth = earthRef.value;
  const center = mapCenter.value;
  if (earth === null || center === null) return;
  const existing = earth.elements.get(TARGET_ID);
  if (existing !== undefined) existing.remove();
  const definition = selectedTarget.value;
  const element = earth.elements.add({
    id: TARGET_ID,
    layerId: LAYER_ID,
    module: 'docs-edit',
    geometry: createShapeExampleInput(definition.type, [center[0], center[1]], definition.type === 'point' ? 1 : 12_000),
    style: styleFor(definition.id),
    data: { example: definition.id }
  });
  targetRef.value = element;
  currentControlPoints.value = controlPointCount(element.state.geometry);
};

const selectTarget = (id: InteractionTargetId) => {
  if (isActive.value) return;
  selectedTargetId.value = id;
  operationCount.value = 0;
  lastOperation.value = `已切换到 ${interactionTargetById[id].label}`;
  historyResult.value = '尚未产生编辑历史';
  storeState.value = '新目标保持初始业务状态';
  createTarget();
  focus();
};

// #region edit-session-control-points
const start = () => {
  const earth = earthRef.value;
  const element = targetRef.value;
  if (earth === null || element === null) return;
  destroySession();

  const session = earth.draw.edit(element, { underlay: underlay.value, policy: 'replace' });
  sessionRef.value = session;
  status.value = session.status;
  operationCount.value = 0;
  lastOperation.value = `正在编辑 ${selectedTarget.value.label}`;
  historyResult.value = '工作态尚无历史';

  disposers = [
    session.on('modifying', ({ operation, geometry }) => {
      operationCount.value += 1;
      currentControlPoints.value = controlPointCount(geometry);
      lastOperation.value = operation;
    }),
    session.on('complete', ({ element: completed }) => {
      currentControlPoints.value = controlPointCount(completed.state.geometry);
      storeState.value = `已提交 ${completed.state.geometry.type}，ID 仍为 ${completed.id}`;
      lastOperation.value = 'complete';
    }),
    session.on('cancel', ({ reason }) => {
      lastOperation.value = `cancel · ${reason}`;
      storeState.value = '未提交工作态，Store 保持不变';
    })
  ];

  void session.finished.then(() => {
    status.value = session.status;
    releaseListeners();
  });
};

const undo = () => {
  historyResult.value = sessionRef.value?.undo() === true ? '已撤销最近一次完整编辑操作' : '当前没有可撤销操作';
};

const redo = () => {
  historyResult.value = sessionRef.value?.redo() === true ? '已重做下一次编辑操作' : '当前没有可重做操作';
};

const finish = () => {
  sessionRef.value?.finish();
  if (sessionRef.value !== null) status.value = sessionRef.value.status;
};

const cancel = () => {
  sessionRef.value?.cancel();
  if (sessionRef.value !== null) status.value = sessionRef.value.status;
};
// #endregion edit-session-control-points

const focus = () => {
  const earth = earthRef.value;
  const center = mapCenter.value;
  if (earth === null || center === null) return;
  earth.view.flyTo(center, selectedTarget.value.type === 'point' ? 11 : 10);
};

const reset = () => {
  destroySession();
  operationCount.value = 0;
  lastOperation.value = '已恢复当前目录目标';
  historyResult.value = '尚未产生编辑历史';
  storeState.value = '目标保持初始业务状态';
  createTarget();
  focus();
};

defineExpose({ reset, focus });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 30 });
  mapCenter.value = earth.view.toProjectedCoordinates([116.4, 39.92]);
  earthRef.value = earth;
  createTarget();
  focus();
});

onBeforeUnmount(() => {
  destroySession();
  earthRef.value?.destroy();
  earthRef.value = null;
  targetRef.value = null;
});
</script>

<template>
  <div class="example-demo edit-session-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="选择不同 Shape 后再开始编辑；蓝色实心圆是控制点，浅蓝虚线圆是合法插入候选。"
    />

    <div class="edit-session-demo__catalog" aria-label="Edit 目标目录">
      <el-button
        v-for="target in interactionTargetExamples"
        :key="target.id"
        class="edit-session-demo__target-card"
        :type="selectedTargetId === target.id ? 'primary' : 'default'"
        :plain="selectedTargetId !== target.id"
        :disabled="isActive"
        :aria-pressed="selectedTargetId === target.id"
        @click="selectTarget(target.id)"
      >
        <span>{{ target.label }}</span>
        <small>{{ target.type }}</small>
      </el-button>
    </div>

    <el-descriptions class="edit-session-demo__target-detail" :column="2" border>
      <el-descriptions-item label="当前目标">{{ selectedTarget.label }}</el-descriptions-item>
      <el-descriptions-item label="ShapeType">{{ selectedTarget.type }}</el-descriptions-item>
      <el-descriptions-item label="移动控制点">支持</el-descriptions-item>
      <el-descriptions-item label="插入 / 删除">
        {{ selectedTarget.edit.insert ? '支持 Alt + 单击插入 / 删除' : '— 不支持，只有固定控制点' }}
      </el-descriptions-item>
      <el-descriptions-item label="说明" :span="2">{{ selectedTarget.description }}</el-descriptions-item>
    </el-descriptions>

    <div class="example-demo__control-panel">
      <div class="example-demo__control-grid edit-session-demo__controls">
        <div class="example-demo__action-group">
          <span>会话启动</span>
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="start">开始编辑当前目标</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>历史</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!isActive" @click="undo">撤销</el-button>
            <el-button :disabled="!isActive" @click="redo">重做</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>会话结束</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!isActive" @click="finish">完成并提交</el-button>
            <el-button :disabled="!isActive" @click="cancel">取消并回滚</el-button>
            <el-button :disabled="sessionRef === null" @click="destroySession">销毁 Session</el-button>
            <el-button plain :disabled="isActive" @click="reset">恢复当前目标</el-button>
          </div>
        </div>
      </div>
      <div class="example-demo__field edit-session-demo__field">
        <span>显示原始轮廓</span>
        <el-switch v-model="underlay" :disabled="isActive" />
      </div>
      <div class="example-demo__feedback" aria-live="polite">
        <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
        <el-tag type="primary" effect="plain">控制点：拖拽</el-tag>
        <el-tag v-if="selectedTarget.edit.insert" type="info" effect="plain">插入 / 删除：Alt + 单击</el-tag>
        <el-tag v-else type="info" effect="plain">固定拓扑：不支持插入 / 删除</el-tag>
      </div>
    </div>
    <div class="edit-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="edit-session-demo__map-guide">先点“开始编辑当前目标”，再拖拽地图上的蓝色控制点</div>
    </div>
    <el-descriptions class="edit-session-demo__summary" :column="2" border>
      <el-descriptions-item label="工作态操作数">{{ operationCount }}</el-descriptions-item>
      <el-descriptions-item label="当前控制点">{{ currentControlPoints }}</el-descriptions-item>
      <el-descriptions-item label="最近语义">{{ lastOperation }}</el-descriptions-item>
      <el-descriptions-item label="撤销 / 重做">{{ historyResult }}</el-descriptions-item>
      <el-descriptions-item label="Store 提交" :span="2">{{ storeState }}</el-descriptions-item>
    </el-descriptions>

    <h4 class="edit-session-demo__matrix-title">目标支持矩阵</h4>
    <el-table :data="supportRows" border size="small">
      <el-table-column prop="target" label="目标" min-width="190" />
      <el-table-column prop="move" label="移动" min-width="90" />
      <el-table-column prop="insert" label="插入" min-width="110" />
      <el-table-column prop="remove" label="删除" min-width="110" />
      <el-table-column prop="note" label="能力说明 / 不支持项" min-width="330" />
    </el-table>
  </div>
</template>

<style scoped>
.edit-session-demo__catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.edit-session-demo__target-card.el-button {
  height: auto;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  white-space: normal;
}

.edit-session-demo__target-card :deep(span) {
  display: grid;
  width: 100%;
  justify-items: start;
  gap: 3px;
  text-align: left;
}

.edit-session-demo__target-detail {
  margin-bottom: 12px;
}

.edit-session-demo__controls {
  grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr);
  align-items: stretch;
}

.edit-session-demo__field {
  width: max-content;
  max-width: 100%;
}

.edit-session-demo__map-shell {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.edit-session-demo__map-guide {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 2;
  max-width: calc(100% - 32px);
  padding: 7px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--doc-surface) 92%, transparent);
  color: var(--doc-text);
  font-size: 12px;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.edit-session-demo__summary {
  margin-top: 14px;
}

.edit-session-demo__matrix-title {
  margin: 18px 0 10px;
  color: var(--doc-text);
}

@media (max-width: 640px) {
  .edit-session-demo__controls {
    grid-template-columns: 1fr;
  }
}
</style>
