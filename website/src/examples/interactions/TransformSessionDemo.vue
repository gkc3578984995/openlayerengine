<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, type Coordinate, type Element, type StyleSpec, type TransformMode, type TransformSession } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';
import { interactionTargetById, interactionTargetExamples, type InteractionTargetId } from '../../config/interactionExamples';
import { createShapeExampleInput } from '../../config/shapeExamples';

const LAYER_ID = 'docs-transform-targets';
const FIRST_ID = 'docs-transform-a';
const SECOND_ID = 'docs-transform-b';
const MODULE = 'docs-transform';
const DEFAULT_TARGET: InteractionTargetId = 'polygon';
const ICON_SOURCE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56"%3E%3Cpath fill="%237c3aed" stroke="white" stroke-width="3" d="M24 2C12.4 2 3 11.4 3 23c0 15.8 21 31 21 31s21-15.2 21-31C45 11.4 35.6 2 24 2Z"/%3E%3Ccircle cx="24" cy="23" r="8" fill="white"/%3E%3C/svg%3E';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const firstRef = shallowRef<Element | null>(null);
const secondRef = shallowRef<Element | null>(null);
const sessionRef = shallowRef<TransformSession | null>(null);
const mapCenter = shallowRef<Coordinate | null>(null);
const selectedTargetId = ref<InteractionTargetId>(DEFAULT_TARGET);
const companionTargetId = ref<InteractionTargetId>('circle');
const status = ref<'idle' | TransformSession['status']>('idle');
const mode = ref<TransformMode>('transform');
const selectedId = ref('未选择');
const lastEvent = ref('选择目录目标后启动 Session');
const historyResult = ref('尚未执行撤销 / 重做');
const operationCount = ref(0);
const copyCount = ref(0);
const toolbarVisible = ref(true);
const toolbarRemoveDisabled = ref(false);
const toolbarShifted = ref(false);
const toolbarDestroyed = ref(false);
let disposers: Array<() => void> = [];

const isActive = computed(() => status.value === 'active');
const hasSelection = computed(() => isActive.value && selectedId.value !== '未选择');
const hasBothTargets = computed(() => firstRef.value !== null && secondRef.value !== null);
const selectedTarget = computed(() => interactionTargetById[selectedTargetId.value]);
const companionTarget = computed(() => interactionTargetById[companionTargetId.value]);
const hasToolbar = computed(() => {
  selectedId.value;
  return sessionRef.value?.toolbar !== undefined && !toolbarDestroyed.value;
});
const supportRows = interactionTargetExamples.map((target) => ({
  target: target.label,
  translate: target.transform.translate ? '支持' : '— 不支持',
  rotate: target.transform.rotate ? '支持' : '— 不支持',
  scale: target.transform.scale ? '支持' : '— 不支持',
  vertex: target.transform.vertex ? '支持' : '— 不支持',
  note: target.description
}));

const releaseListeners = () => {
  for (const dispose of disposers.splice(0)) dispose();
};

const cancelSession = () => {
  if (sessionRef.value?.status === 'active') sessionRef.value.cancel();
  releaseListeners();
  sessionRef.value = null;
  status.value = 'idle';
  mode.value = 'transform';
  selectedId.value = '未选择';
  toolbarDestroyed.value = false;
  toolbarVisible.value = true;
};

const sessionOptions = () => ({
  selector: { module: MODULE },
  translate: 'feature' as const,
  scale: true,
  stretch: true,
  rotate: true,
  historyLimit: 20,
  toolbar: { offset: [0, 14] as const, visible: true },
  policy: 'replace' as const
});

const styleFor = (id: InteractionTargetId, role: 'primary' | 'secondary'): StyleSpec => {
  const color = role === 'primary' ? '#7c3aed' : '#059669';
  const fill = role === 'primary' ? 'rgba(124, 58, 237, 0.30)' : 'rgba(16, 185, 129, 0.30)';
  if (id === 'point-icon') {
    return {
      symbol: {
        type: 'icon',
        src: ICON_SOURCE,
        size: [48, 56],
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction'
      },
      text: { text: role === 'primary' ? 'A' : 'B', offsetY: 18, fontSize: 14, fill: { type: 'solid', color } }
    };
  }
  if (id === 'polyline') {
    return {
      strokes: [{ color, width: 7 }],
      text: { text: role === 'primary' ? 'A' : 'B', fontSize: 18, fontWeight: 'bold', fill: { type: 'solid', color } }
    };
  }
  return {
    strokes: [{ color, width: 5 }],
    fill: { type: 'solid', color: fill },
    text: { text: role === 'primary' ? 'A' : 'B', fontSize: 24, fontWeight: 'bold', fill: { type: 'solid', color } }
  };
};

const targetCenter = (role: 'primary' | 'secondary'): readonly [number, number] | undefined => {
  const center = mapCenter.value;
  if (center === null) return undefined;
  return [center[0] + (role === 'primary' ? -27_000 : 27_000), center[1]];
};

const createTarget = (role: 'primary' | 'secondary') => {
  const earth = earthRef.value;
  const center = targetCenter(role);
  if (earth === null || center === undefined) return null;
  const id = role === 'primary' ? FIRST_ID : SECOND_ID;
  earth.elements.get(id)?.remove();
  const definition = role === 'primary' ? selectedTarget.value : companionTarget.value;
  return earth.elements.add({
    id,
    layerId: LAYER_ID,
    module: MODULE,
    geometry: createShapeExampleInput(definition.type, center, definition.type === 'point' ? 1 : 7_000),
    style: styleFor(definition.id, role),
    data: { example: definition.id, role }
  });
};

const nextCompanion = (id: InteractionTargetId) => {
  const index = interactionTargetExamples.findIndex((example) => example.id === id);
  return interactionTargetExamples[(index + 1) % interactionTargetExamples.length].id;
};

const createTargetPair = () => {
  firstRef.value = createTarget('primary');
  secondRef.value = createTarget('secondary');
};

const selectCatalogTarget = (id: InteractionTargetId) => {
  if (isActive.value) return;
  cancelSession();
  selectedTargetId.value = id;
  companionTargetId.value = nextCompanion(id);
  createTargetPair();
  lastEvent.value = `A 为 ${interactionTargetById[id].label}，B 为 ${companionTarget.value.label}`;
  historyResult.value = '尚未执行撤销 / 重做';
  operationCount.value = 0;
  focus();
};

const bindSession = (session: TransformSession) => {
  sessionRef.value = session;
  status.value = session.status;
  mode.value = session.mode;
  operationCount.value = 0;
  toolbarDestroyed.value = false;
  toolbarVisible.value = true;
  toolbarRemoveDisabled.value = false;
  toolbarShifted.value = false;

  const markOperation = (event: string) => {
    operationCount.value += 1;
    lastEvent.value = event;
  };
  disposers = [
    session.on('select', ({ element }) => {
      selectedId.value = element.id;
      lastEvent.value = `select · ${element.id}`;
    }),
    session.on('selectEnd', ({ element }) => {
      selectedId.value = '未选择';
      lastEvent.value = `selectEnd · ${element.id}`;
    }),
    session.on('translateEnd', () => markOperation('translateEnd · 已形成一条历史命令')),
    session.on('rotateEnd', () => markOperation('rotateEnd · 已形成一条历史命令')),
    session.on('scaleEnd', () => markOperation('scaleEnd · 已形成一条历史命令')),
    session.on('edit', () => markOperation('edit · 顶点工作态已更新')),
    session.on('copyPreviewConfirm', ({ element }) => {
      copyCount.value += 1;
      lastEvent.value = `copyPreviewConfirm · ${element.id}`;
    }),
    session.on('remove', ({ element }) => {
      if (element.id === FIRST_ID) firstRef.value = null;
      if (element.id === SECOND_ID) secondRef.value = null;
      selectedId.value = '未选择';
      lastEvent.value = `remove · ${element.id}；可用“重置示例”恢复`;
    }),
    session.on('error', ({ error }) => {
      lastEvent.value = error instanceof Error ? error.message : 'Transform 操作失败';
    })
  ];
};

// #region transform-start-select-replace
const startWaiting = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  cancelSession();
  const session = earth.transform.start(sessionOptions());
  bindSession(session);
  selectedId.value = '未选择';
  lastEvent.value = 'start · 请在地图中单击 A 或 B';
};

const selectFirst = () => {
  const earth = earthRef.value;
  const element = firstRef.value;
  if (earth === null || element === null) return;
  cancelSession();
  const session = earth.transform.select(element, sessionOptions());
  bindSession(session);
  selectedId.value = element.id;
  lastEvent.value = `select(element) · ${element.id}`;
};

const replaceSelected = () => {
  const session = sessionRef.value;
  const earth = earthRef.value;
  if (session === null || earth === null) return;
  const nextId = selectedId.value === FIRST_ID ? SECOND_ID : FIRST_ID;
  const next = earth.elements.get(nextId);
  if (next === undefined) return;
  session.replaceSelected(next, { retainHistory: false });
  selectedId.value = next.id;
  lastEvent.value = `replaceSelected · ${next.id}`;
};
// #endregion transform-start-select-replace

// #region transform-session-and-toolbar
const setMode = (nextMode: TransformMode) => {
  sessionRef.value?.setMode(nextMode);
  mode.value = sessionRef.value?.mode ?? nextMode;
  lastEvent.value = `setMode · ${nextMode}`;
};

const undo = () => {
  historyResult.value = sessionRef.value?.undo() === true ? '已撤销最近一次完整操作' : '没有可撤销操作';
};

const redo = () => {
  historyResult.value = sessionRef.value?.redo() === true ? '已重做下一次操作' : '没有可重做操作';
};

const copy = () => {
  const copied = sessionRef.value?.copy({ module: 'docs-transform-copy' });
  if (copied !== undefined) lastEvent.value = `copy · ${copied.id}`;
};

const remove = () => sessionRef.value?.remove();

const toggleToolbar = () => {
  const toolbar = sessionRef.value?.toolbar;
  if (toolbar === undefined || toolbarDestroyed.value) return;
  toolbarVisible.value = !toolbarVisible.value;
  if (toolbarVisible.value) toolbar.show();
  else toolbar.hide();
};

const markToolbarEdit = () => {
  sessionRef.value?.toolbar?.setActive('edit');
  lastEvent.value = 'toolbar.setActive · edit';
};

const toggleRemoveDisabled = () => {
  const toolbar = sessionRef.value?.toolbar;
  if (toolbar === undefined || toolbarDestroyed.value) return;
  toolbarRemoveDisabled.value = !toolbarRemoveDisabled.value;
  toolbar.updateItem('remove', { disabled: toolbarRemoveDisabled.value, title: toolbarRemoveDisabled.value ? '删除已禁用' : '删除' });
};

const shiftToolbar = () => {
  const toolbar = sessionRef.value?.toolbar;
  if (toolbar === undefined || toolbarDestroyed.value) return;
  toolbarShifted.value = !toolbarShifted.value;
  toolbar.updateOptions({ offset: toolbarShifted.value ? [28, 22] : [0, 14], className: 'docs-transform-toolbar', visible: true });
};

const destroyToolbar = () => {
  sessionRef.value?.toolbar?.destroy();
  toolbarDestroyed.value = true;
  toolbarVisible.value = false;
};

const finish = () => {
  sessionRef.value?.finish();
  if (sessionRef.value !== null) status.value = sessionRef.value.status;
  releaseListeners();
};

const cancel = () => {
  sessionRef.value?.cancel();
  if (sessionRef.value !== null) status.value = sessionRef.value.status;
  releaseListeners();
};
// #endregion transform-session-and-toolbar

const focus = () => {
  const earth = earthRef.value;
  const center = mapCenter.value;
  if (earth === null || center === null) return;
  earth.view.flyTo(center, 10);
};

const reset = () => {
  cancelSession();
  earthRef.value?.elements.remove({ module: 'docs-transform-copy' });
  copyCount.value = 0;
  operationCount.value = 0;
  historyResult.value = '尚未执行撤销 / 重做';
  lastEvent.value = '已恢复 A / B 目标与 Transform 资源';
  createTargetPair();
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
  mapCenter.value = earth.view.toProjectedCoordinates([116.41, 39.92]);
  earthRef.value = earth;
  createTargetPair();
  focus();
});

onBeforeUnmount(() => {
  cancelSession();
  earthRef.value?.destroy();
  earthRef.value = null;
  firstRef.value = null;
  secondRef.value = null;
});
</script>

<template>
  <div class="example-demo transform-session-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="紫色 A 是目录主目标，绿色 B 是替换目标；选框、手柄和工具栏只属于当前 Transform Session。"
    />

    <div class="transform-session-demo__catalog" aria-label="Transform 目标目录">
      <el-button
        v-for="target in interactionTargetExamples"
        :key="target.id"
        class="transform-session-demo__target-card"
        :type="selectedTargetId === target.id ? 'primary' : 'default'"
        :plain="selectedTargetId !== target.id"
        :disabled="isActive"
        :aria-pressed="selectedTargetId === target.id"
        @click="selectCatalogTarget(target.id)"
      >
        <span>{{ target.label }}</span>
        <small>{{ target.type }}</small>
      </el-button>
    </div>

    <el-descriptions class="transform-session-demo__target-detail" :column="2" border>
      <el-descriptions-item label="A 主目标">{{ selectedTarget.label }}</el-descriptions-item>
      <el-descriptions-item label="B 替换目标">{{ companionTarget.label }}</el-descriptions-item>
      <el-descriptions-item label="旋转">
        {{ selectedTarget.transform.rotate ? '支持' : '— 不支持，Session 不会显示旋转手柄' }}
      </el-descriptions-item>
      <el-descriptions-item label="缩放 / 顶点编辑">支持</el-descriptions-item>
      <el-descriptions-item label="说明" :span="2">{{ selectedTarget.description }}</el-descriptions-item>
    </el-descriptions>

    <div class="example-demo__control-panel transform-session-demo__control-panel">
      <div class="example-demo__action-group">
        <span>目标选择</span>
        <div class="example-demo__action-buttons">
          <el-button type="primary" @click="startWaiting">start() 后地图选择</el-button>
          <el-button :disabled="firstRef === null" @click="selectFirst">select(A)</el-button>
          <el-button :disabled="!hasSelection || !hasBothTargets" @click="replaceSelected">replaceSelected(A / B)</el-button>
        </div>
      </div>
      <div class="example-demo__field">
        <span>编辑模式</span>
        <el-radio-group :model-value="mode" :disabled="!hasSelection" @update:model-value="setMode">
          <el-radio-button value="transform">变换</el-radio-button>
          <el-radio-button value="edit">顶点编辑</el-radio-button>
        </el-radio-group>
      </div>
      <div class="example-demo__action-row transform-session-demo__secondary-actions">
        <div class="example-demo__action-group">
          <span>历史</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!hasSelection" @click="undo">撤销</el-button>
            <el-button :disabled="!hasSelection" @click="redo">重做</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>选中对象</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!hasSelection" @click="copy">复制</el-button>
            <el-button :disabled="!hasSelection" type="danger" plain @click="remove">删除选中</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>会话</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!isActive" @click="finish">完成并提交</el-button>
            <el-button :disabled="!isActive" @click="cancel">取消并回滚</el-button>
          </div>
        </div>
      </div>
      <div class="example-demo__feedback transform-session-demo__feedback" aria-live="polite">
        <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
      </div>
    </div>
    <div class="example-demo__control-panel transform-session-demo__toolbar-controls">
      <div class="example-demo__action-group">
        <strong>Toolbar</strong>
        <div class="example-demo__action-buttons transform-session-demo__toolbar-actions">
          <el-button size="small" :disabled="!hasToolbar" @click="markToolbarEdit">高亮编辑项</el-button>
          <el-button size="small" :disabled="!hasToolbar" @click="toggleToolbar">{{ toolbarVisible ? '隐藏' : '显示' }}</el-button>
          <el-button size="small" :disabled="!hasToolbar" @click="toggleRemoveDisabled">
            {{ toolbarRemoveDisabled ? '启用删除项' : '禁用删除项' }}
          </el-button>
          <el-button size="small" :disabled="!hasToolbar" @click="shiftToolbar">{{ toolbarShifted ? '恢复位置' : '调整位置' }}</el-button>
        </div>
        <div class="example-demo__action-buttons transform-session-demo__toolbar-actions">
          <el-button size="small" type="danger" plain :disabled="!hasToolbar" @click="destroyToolbar">销毁 Toolbar</el-button>
        </div>
      </div>
    </div>
    <div class="transform-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="transform-session-demo__map-guide">选择 A 或 B；拖拽图形、外框手柄，或切换到顶点编辑</div>
    </div>
    <el-descriptions class="transform-session-demo__summary" :column="2" border>
      <el-descriptions-item label="当前选择">{{ selectedId }}</el-descriptions-item>
      <el-descriptions-item label="当前模式">{{ mode }}</el-descriptions-item>
      <el-descriptions-item label="完整操作数">{{ operationCount }}</el-descriptions-item>
      <el-descriptions-item label="复制数">{{ copyCount }}</el-descriptions-item>
      <el-descriptions-item label="最近事件">{{ lastEvent }}</el-descriptions-item>
      <el-descriptions-item label="撤销 / 重做">{{ historyResult }}</el-descriptions-item>
    </el-descriptions>

    <h4 class="transform-session-demo__matrix-title">目标支持矩阵</h4>
    <el-table :data="supportRows" border size="small">
      <el-table-column prop="target" label="目标" min-width="190" />
      <el-table-column prop="translate" label="平移" min-width="90" />
      <el-table-column prop="rotate" label="旋转" min-width="110" />
      <el-table-column prop="scale" label="缩放 / 拉伸" min-width="130" />
      <el-table-column prop="vertex" label="顶点模式" min-width="110" />
      <el-table-column prop="note" label="能力说明 / 不支持项" min-width="330" />
    </el-table>
  </div>
</template>

<style scoped>
.transform-session-demo__catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.transform-session-demo__target-card.el-button {
  height: auto;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  white-space: normal;
}

.transform-session-demo__target-card :deep(span) {
  display: grid;
  width: 100%;
  justify-items: start;
  gap: 3px;
  text-align: left;
}

.transform-session-demo__target-detail {
  margin-bottom: 12px;
}

.transform-session-demo__control-panel {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
}

.transform-session-demo__feedback,
.transform-session-demo__secondary-actions {
  grid-column: 1 / -1;
}

.transform-session-demo__feedback {
  align-self: stretch;
}

.transform-session-demo__secondary-actions {
  align-items: stretch;
}

.transform-session-demo__toolbar-actions + .transform-session-demo__toolbar-actions {
  padding-top: 8px;
  border-top: 1px solid var(--doc-border);
}

.transform-session-demo__map-shell {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.transform-session-demo__map-guide {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 2;
  max-width: calc(100% - 32px);
  padding: 7px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--doc-surface) 94%, transparent);
  color: var(--doc-text);
  font-size: 12px;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.transform-session-demo__summary {
  margin-top: 14px;
}

.transform-session-demo__matrix-title {
  margin: 18px 0 10px;
  color: var(--doc-text);
}
</style>
