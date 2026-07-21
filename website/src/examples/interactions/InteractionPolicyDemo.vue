<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, InteractionConflictError, type Coordinate, type Element, type InteractionPolicy, type TransformSession } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

type InteractionName = 'Draw' | 'Measure' | 'Edit' | 'Transform';

interface StartedInteraction {
  readonly cancel: () => void;
  readonly disposers: readonly (() => void)[];
}

const TARGET_LAYER_ID = 'docs-policy-targets';
const DRAW_LAYER_ID = 'docs-policy-draw';
const TARGET_ID = 'docs-policy-polygon';
const DRAW_MODULE = 'docs-policy-draw';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const targetRef = shallowRef<Element | null>(null);
const mapCenter = shallowRef<Coordinate | null>(null);
const policy = ref<InteractionPolicy>('replace');
const activeType = ref<InteractionName | null>(null);
const cancellationReason = ref('尚未发生替换或取消');
const conflictResult = ref('尚未触发 InteractionConflictError');
const resourceState = ref('等待地图初始化');
const transitionResult = ref('请选择一种交互启动');
const baselineInteractionCount = ref(0);

let currentCancel: (() => void) | undefined;
let currentDisposers: Array<() => void> = [];

const hasActive = computed(() => activeType.value !== null);

const releaseCurrentListeners = () => {
  for (const dispose of currentDisposers.splice(0)) dispose();
};

const refreshResources = (expected: 'active' | 'idle') => {
  const earth = earthRef.value;
  if (earth === null) return;
  const count = earth.map.getInteractions().getLength();
  const expectedCount = baselineInteractionCount.value + (expected === 'active' ? 1 : 0);
  resourceState.value = `OpenLayers Interaction：${count}；预期：${expectedCount}；${count === expectedCount ? '资源数量已恢复' : '正在切换'}`;
};

// #region interaction-policy-replace-reject
const transition = (name: InteractionName, start: () => StartedInteraction) => {
  const previous = activeType.value;
  conflictResult.value = '本次启动没有冲突错误';
  try {
    const started = start();
    if (previous !== null && policy.value === 'replace') {
      cancellationReason.value = `${previous} → replaced；旧工作态已回滚，临时图层、Tooltip 与光标所有权已释放`;
    }
    releaseCurrentListeners();
    currentCancel = started.cancel;
    currentDisposers = [...started.disposers];
    activeType.value = name;
    transitionResult.value = `${name} 已启动（policy: ${policy.value}）`;
    refreshResources('active');
  } catch (error) {
    if (error instanceof InteractionConflictError) {
      conflictResult.value = `${error.name}：活动 ${previous ?? '未知'} 保持不变，新 ${name} 未创建`;
      transitionResult.value = 'reject 原子拒绝：旧会话继续可用';
      refreshResources('active');
      return;
    }
    conflictResult.value = error instanceof Error ? `${error.name}：${error.message}` : String(error);
  }
};

const startDraw = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  transition('Draw', () => {
    const session = earth.draw.start({
      type: 'polygon',
      layerId: DRAW_LAYER_ID,
      module: DRAW_MODULE,
      style: { strokes: [{ color: '#f97316', width: 4 }], fill: { type: 'solid', color: 'rgba(249, 115, 22, 0.24)' } },
      policy: policy.value
    });
    const off = session.on('cancel', ({ reason }) => {
      cancellationReason.value = `Draw → ${reason}`;
    });
    return { cancel: () => session.cancel(), disposers: [off] };
  });
};

const startMeasure = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  transition('Measure', () => {
    const session = earth.measure.start({ type: 'area', unit: 'km²', policy: policy.value });
    const off = session.on('cancel', ({ reason }) => {
      cancellationReason.value = `Measure → ${reason}`;
    });
    return { cancel: () => session.cancel(), disposers: [off] };
  });
};

const startEdit = () => {
  const earth = earthRef.value;
  const target = targetRef.value;
  if (earth === null || target === null) return;
  transition('Edit', () => {
    const session = earth.draw.edit(target, { underlay: true, policy: policy.value });
    const off = session.on('cancel', ({ reason }) => {
      cancellationReason.value = `Edit → ${reason}`;
    });
    return { cancel: () => session.cancel(), disposers: [off] };
  });
};

const startTransform = () => {
  const earth = earthRef.value;
  const target = targetRef.value;
  if (earth === null || target === null) return;
  transition('Transform', () => {
    const session: TransformSession = earth.transform.select(target, {
      translate: 'feature',
      scale: true,
      rotate: true,
      toolbar: true,
      policy: policy.value
    });
    const off = session.on('error', ({ error }) => {
      transitionResult.value = error instanceof Error ? error.message : 'Transform 操作失败';
    });
    return { cancel: () => session.cancel(), disposers: [off] };
  });
};
// #endregion interaction-policy-replace-reject

const cancelActive = () => {
  currentCancel?.();
  releaseCurrentListeners();
  currentCancel = undefined;
  cancellationReason.value = `${activeType.value ?? '会话'} → cancelled；可以立即启动任意其他交互`;
  activeType.value = null;
  transitionResult.value = '活动会话已取消，工作态已回滚';
  refreshResources('idle');
};

const focus = () => {
  const earth = earthRef.value;
  const center = mapCenter.value;
  if (earth === null || center === null) return;
  earth.view.flyTo(center, 10);
};

const reset = () => {
  if (hasActive.value) cancelActive();
  earthRef.value?.draw.clear({ module: DRAW_MODULE });
  earthRef.value?.measure.clear();
  policy.value = 'replace';
  cancellationReason.value = '尚未发生替换或取消';
  conflictResult.value = '尚未触发 InteractionConflictError';
  transitionResult.value = '示例已重置，请先启动一种交互';
  refreshResources('idle');
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
  earth.layers.add({ kind: 'vector', id: TARGET_LAYER_ID, zIndex: 20 });
  earth.layers.add({ kind: 'vector', id: DRAW_LAYER_ID, zIndex: 30 });
  mapCenter.value = earth.view.toProjectedCoordinates([116.4, 39.92]);
  targetRef.value = earth.elements.add({
    id: TARGET_ID,
    layerId: TARGET_LAYER_ID,
    module: 'docs-policy-target',
    geometry: {
      type: 'polygon',
      controlPoints: earth.view.toProjectedCoordinates([
        [116.25, 39.82],
        [116.55, 39.82],
        [116.56, 40.02],
        [116.24, 40.02]
      ])
    },
    style: {
      strokes: [{ color: '#2563eb', width: 5 }],
      fill: { type: 'solid', color: 'rgba(37, 99, 235, 0.24)' },
      text: { text: '交互目标', fontSize: 18, fontWeight: 'bold', fill: { type: 'solid', color: '#1e3a8a' } }
    }
  });
  earthRef.value = earth;
  baselineInteractionCount.value = earth.map.getInteractions().getLength();
  refreshResources('idle');
  focus();
});

onBeforeUnmount(() => {
  if (activeType.value !== null) currentCancel?.();
  releaseCurrentListeners();
  earthRef.value?.draw.clear({ module: DRAW_MODULE });
  earthRef.value?.measure.clear();
  earthRef.value?.destroy();
  earthRef.value = null;
  targetRef.value = null;
});
</script>

<template>
  <div class="example-demo interaction-policy-demo">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="先启动任一交互，再直接启动另一种：replace 会清理旧会话；reject 会抛出 InteractionConflictError 并保留旧会话。"
    />

    <div class="example-demo__control-panel">
      <div class="example-demo__field interaction-policy-demo__field">
        <span>冲突策略</span>
        <el-segmented
          v-model="policy"
          :options="[
            { label: 'replace', value: 'replace' },
            { label: 'reject', value: 'reject' }
          ]"
          aria-label="交互冲突策略"
        />
      </div>
      <div class="example-demo__control-grid interaction-policy-demo__launchers">
        <div class="example-demo__action-group">
          <span>启动会话</span>
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="startDraw">启动 Draw</el-button>
            <el-button type="success" @click="startMeasure">启动 Measure</el-button>
            <el-button type="warning" @click="startEdit">启动 Edit</el-button>
            <el-button @click="startTransform">启动 Transform</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>当前会话</span>
          <div class="example-demo__action-buttons">
            <el-button type="danger" plain :disabled="!hasActive" @click="cancelActive">取消当前会话</el-button>
          </div>
        </div>
      </div>
      <div class="example-demo__feedback" aria-live="polite">
        <el-tag :type="hasActive ? 'success' : 'info'">当前：{{ activeType ?? '无活动交互' }}</el-tag>
      </div>
    </div>

    <div class="interaction-policy-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="interaction-policy-demo__map-guide">蓝色面同时作为 Edit / Transform 目标；Draw / Measure 可直接在地图上输入</div>
    </div>

    <el-descriptions class="interaction-policy-demo__result" :column="1" border>
      <el-descriptions-item label="启动结果">{{ transitionResult }}</el-descriptions-item>
      <el-descriptions-item label="取消原因">{{ cancellationReason }}</el-descriptions-item>
      <el-descriptions-item label="冲突识别">{{ conflictResult }}</el-descriptions-item>
      <el-descriptions-item label="资源恢复">{{ resourceState }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.interaction-policy-demo__field {
  width: max-content;
  max-width: 100%;
}

.interaction-policy-demo__field :deep(.el-segmented) {
  max-width: 100%;
}

.interaction-policy-demo__launchers {
  align-items: stretch;
}

.interaction-policy-demo__map-shell {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.interaction-policy-demo__map-guide {
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

.interaction-policy-demo__result {
  margin-top: 14px;
}
</style>
