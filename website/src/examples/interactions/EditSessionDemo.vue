<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, type Coordinate, type EditSession, type Element } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const LAYER_ID = 'docs-edit-targets';
const TARGET_ID = 'docs-edit-polygon';
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const targetRef = shallowRef<Element | null>(null);
const sessionRef = shallowRef<EditSession | null>(null);
const status = ref<'idle' | EditSession['status']>('idle');
const underlay = ref(true);
const operationCount = ref(0);
const currentControlPoints = ref(4);
const lastOperation = ref('尚未修改');
const historyResult = ref('拖拽蓝色实心控制点后可撤销');
const storeState = ref('原始四边形');
let originalPoints: readonly Coordinate[] = [];
let disposers: Array<() => void> = [];

const isActive = computed(() => status.value === 'active');

const releaseListeners = () => {
  for (const dispose of disposers.splice(0)) dispose();
};

const destroySession = () => {
  releaseListeners();
  sessionRef.value?.destroy();
  sessionRef.value = null;
  status.value = 'idle';
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
  lastOperation.value = '编辑已启动，请拖拽控制点';
  historyResult.value = '工作态尚无历史';

  disposers = [
    session.on('modifying', ({ operation, geometry }) => {
      operationCount.value += 1;
      currentControlPoints.value = geometry.type === 'circle' ? 2 : geometry.controlPoints.length;
      lastOperation.value = operation;
    }),
    session.on('complete', ({ element: completed }) => {
      const geometry = completed.state.geometry;
      currentControlPoints.value = geometry.type === 'circle' ? 2 : geometry.controlPoints.length;
      storeState.value = `已提交 ${geometry.type}，ID 仍为 ${completed.id}`;
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

const resetTarget = () => {
  const target = targetRef.value;
  if (target === null || originalPoints.length === 0) return;
  target.update({ geometry: { type: 'polygon', controlPoints: originalPoints } });
  currentControlPoints.value = originalPoints.length;
  operationCount.value = 0;
  lastOperation.value = '已恢复示例初始形状';
  storeState.value = '原始四边形';
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 30 });
  originalPoints = earth.view.toProjectedCoordinates([
    [116.25, 39.82],
    [116.55, 39.8],
    [116.58, 40.02],
    [116.22, 40.04]
  ]);
  targetRef.value = earth.elements.add({
    id: TARGET_ID,
    layerId: LAYER_ID,
    module: 'docs-edit',
    geometry: { type: 'polygon', controlPoints: originalPoints },
    style: {
      strokes: [{ color: '#2563eb', width: 5 }],
      fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.28)' }
    }
  });
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.4, 39.92]), 10);
  earthRef.value = earth;
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
      title="开始后：蓝色实心圆是控制点，较小的浅蓝圆是插入候选；按 Alt 再单击可插入或删除。"
    />
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="start">开始编辑</el-button>
      <el-button :disabled="!isActive" @click="undo">撤销</el-button>
      <el-button :disabled="!isActive" @click="redo">重做</el-button>
      <el-button :disabled="!isActive" @click="finish">完成并提交</el-button>
      <el-button :disabled="!isActive" @click="cancel">取消并回滚</el-button>
      <el-button :disabled="sessionRef === null" @click="destroySession">销毁 Session</el-button>
      <el-button plain :disabled="isActive" @click="resetTarget">恢复初始图形</el-button>
    </div>
    <div class="edit-session-demo__options">
      <span>显示原始轮廓</span>
      <el-switch v-model="underlay" :disabled="isActive" />
      <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
      <el-tag type="primary" effect="plain">实心控制点：拖拽 / Alt 删除</el-tag>
      <el-tag type="info" effect="plain">浅色插入点：Alt 单击</el-tag>
    </div>
    <div class="edit-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="edit-session-demo__map-guide">先点“开始编辑”，再直接拖拽蓝色控制点</div>
    </div>
    <el-descriptions class="edit-session-demo__summary" :column="2" border>
      <el-descriptions-item label="工作态操作数">{{ operationCount }}</el-descriptions-item>
      <el-descriptions-item label="当前控制点">{{ currentControlPoints }}</el-descriptions-item>
      <el-descriptions-item label="最近语义">{{ lastOperation }}</el-descriptions-item>
      <el-descriptions-item label="撤销 / 重做">{{ historyResult }}</el-descriptions-item>
      <el-descriptions-item label="Store 提交" :span="2">{{ storeState }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.edit-session-demo__options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  color: var(--doc-muted);
  font-size: 13px;
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
</style>
