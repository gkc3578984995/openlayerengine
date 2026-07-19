<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, type Element, type TransformMode, type TransformSession } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const LAYER_ID = 'docs-transform-targets';
const FIRST_ID = 'docs-transform-a';
const SECOND_ID = 'docs-transform-b';
const MODULE = 'docs-transform';
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const firstRef = shallowRef<Element | null>(null);
const secondRef = shallowRef<Element | null>(null);
const sessionRef = shallowRef<TransformSession | null>(null);
const status = ref<'idle' | TransformSession['status']>('idle');
const mode = ref<TransformMode>('transform');
const selectedId = ref('未选择');
const lastEvent = ref('等待启动');
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
const hasToolbar = computed(() => {
  selectedId.value;
  return sessionRef.value?.toolbar !== undefined && !toolbarDestroyed.value;
});

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
      lastEvent.value = `remove · ${element.id}`;
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

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 30 });
  firstRef.value = earth.elements.add({
    id: FIRST_ID,
    layerId: LAYER_ID,
    module: MODULE,
    geometry: {
      type: 'polygon',
      controlPoints: earth.view.toProjectedCoordinates([
        [116.18, 39.82],
        [116.38, 39.8],
        [116.4, 40.0],
        [116.16, 40.02]
      ])
    },
    style: {
      strokes: [{ color: '#7c3aed', width: 5 }],
      fill: { type: 'solid', color: 'rgba(124, 58, 237, 0.3)' },
      text: { text: 'A', fontSize: 24, fontWeight: 'bold', fill: { type: 'solid', color: '#4c1d95' } }
    }
  });
  secondRef.value = earth.elements.add({
    id: SECOND_ID,
    layerId: LAYER_ID,
    module: MODULE,
    geometry: {
      type: 'polygon',
      controlPoints: earth.view.toProjectedCoordinates([
        [116.46, 39.82],
        [116.67, 39.84],
        [116.65, 40.04],
        [116.44, 40.01]
      ])
    },
    style: {
      strokes: [{ color: '#059669', width: 5 }],
      fill: { type: 'solid', color: 'rgba(16, 185, 129, 0.3)' },
      text: { text: 'B', fontSize: 24, fontWeight: 'bold', fill: { type: 'solid', color: '#065f46' } }
    }
  });
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.41, 39.92]), 10);
  earthRef.value = earth;
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
      title="紫色 A 与绿色 B 是业务 Element；选框、手柄和悬浮工具栏只属于当前 Transform Session。"
    />
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="startWaiting">start() 后地图选择</el-button>
      <el-button :disabled="firstRef === null" @click="selectFirst">select(A)</el-button>
      <el-button :disabled="!hasSelection || !hasBothTargets" @click="replaceSelected">replaceSelected</el-button>
      <el-radio-group :model-value="mode" :disabled="!hasSelection" @update:model-value="setMode">
        <el-radio-button value="transform">变换</el-radio-button>
        <el-radio-button value="edit">顶点编辑</el-radio-button>
      </el-radio-group>
      <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
    </div>
    <div class="example-demo__toolbar">
      <el-button :disabled="!hasSelection" @click="undo">撤销</el-button>
      <el-button :disabled="!hasSelection" @click="redo">重做</el-button>
      <el-button :disabled="!hasSelection" @click="copy">复制</el-button>
      <el-button :disabled="!hasSelection" type="danger" plain @click="remove">删除选中</el-button>
      <el-button :disabled="!isActive" @click="finish">完成并提交</el-button>
      <el-button :disabled="!isActive" @click="cancel">取消并回滚</el-button>
    </div>
    <div class="transform-session-demo__toolbar-controls">
      <span>Toolbar：</span>
      <el-button size="small" :disabled="!hasToolbar" @click="markToolbarEdit">高亮编辑项</el-button>
      <el-button size="small" :disabled="!hasToolbar" @click="toggleToolbar">{{ toolbarVisible ? '隐藏' : '显示' }}</el-button>
      <el-button size="small" :disabled="!hasToolbar" @click="toggleRemoveDisabled">
        {{ toolbarRemoveDisabled ? '启用删除项' : '禁用删除项' }}
      </el-button>
      <el-button size="small" :disabled="!hasToolbar" @click="shiftToolbar">{{ toolbarShifted ? '恢复位置' : '调整位置' }}</el-button>
      <el-button size="small" type="danger" plain :disabled="!hasToolbar" @click="destroyToolbar">销毁 Toolbar</el-button>
    </div>
    <div class="transform-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="transform-session-demo__map-guide">拖拽图形或八个外框手柄；切到顶点编辑可直接拖动控制点</div>
    </div>
    <el-descriptions class="transform-session-demo__summary" :column="2" border>
      <el-descriptions-item label="当前选择">{{ selectedId }}</el-descriptions-item>
      <el-descriptions-item label="当前模式">{{ mode }}</el-descriptions-item>
      <el-descriptions-item label="完整操作数">{{ operationCount }}</el-descriptions-item>
      <el-descriptions-item label="复制数">{{ copyCount }}</el-descriptions-item>
      <el-descriptions-item label="最近事件">{{ lastEvent }}</el-descriptions-item>
      <el-descriptions-item label="撤销 / 重做">{{ historyResult }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.transform-session-demo__toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--doc-muted);
  font-size: 13px;
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
</style>
