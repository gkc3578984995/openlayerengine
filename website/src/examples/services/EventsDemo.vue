<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, EarthEventType, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-events';
const MODULE = 'events-demo';
const SELECTOR_ID = 'events-selector-marker';
const MAP_ZOOM = 8.5;

interface LatestEvent {
  type: EarthEventType | '—';
  title: string;
  scope: string;
  target: string;
  position: string;
  detail: string;
}

const eventDefinitions = [
  { type: 'pointermove', label: 'pointermove', scope: 'module', hint: '在橙色标记上移动' },
  { type: 'click', label: 'click', scope: 'global', hint: '单击地图任意位置' },
  { type: 'leftdown', label: 'leftdown', scope: 'selector', hint: '在蓝色标记上按下主按钮' },
  { type: 'leftup', label: 'leftup', scope: 'selector', hint: '在蓝色标记上松开主按钮' },
  { type: 'doubleclick', label: 'doubleclick', scope: 'global', hint: '双击地图任意位置' },
  { type: 'rightclick', label: 'rightclick', scope: 'once + signal', hint: '右键一次，或提前中止' },
  { type: 'keydown', label: 'keydown', scope: 'global', hint: '先单击地图，再按键' }
] as const satisfies ReadonlyArray<{ type: EarthEventType; label: string; scope: string; hint: string }>;

const emptyCounts = (): Record<EarthEventType, number> => ({
  pointermove: 0,
  click: 0,
  leftdown: 0,
  leftup: 0,
  doubleclick: 0,
  rightclick: 0,
  keydown: 0
});

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const sceneCenter = shallowRef<Coordinate | null>(null);
const counts = ref(emptyCounts());
const latestEvent = ref<LatestEvent>({
  type: '—',
  title: '尚未触发',
  scope: '—',
  target: '—',
  position: '—',
  detail: '按照事件卡片中的提示操作地图'
});
const subscriptionState = ref({ global: false, module: false, selector: false, signal: false });

let offClick: (() => void) | undefined;
let offDoubleClick: (() => void) | undefined;
let offKeydown: (() => void) | undefined;
let offModuleMove: (() => void) | undefined;
let offSelectorDown: (() => void) | undefined;
let offSelectorUp: (() => void) | undefined;
let offRightOnce: (() => void) | undefined;
let rightClickAbort: AbortController | undefined;

const eventCards = computed(() => eventDefinitions.map((definition) => ({ ...definition, count: counts.value[definition.type] })));

const formatPair = (values: readonly number[]) => values.map((value) => value.toFixed(0)).join(', ');

const recordEvent = (type: EarthEventType, scope: string, target: string, position: string, detail: string) => {
  counts.value = { ...counts.value, [type]: counts.value[type] + 1 };
  latestEvent.value = { type, title: `${type} 第 ${counts.value[type]} 次`, scope, target, position, detail };
};

const refreshState = () => {
  const events = earthRef.value?.events;
  subscriptionState.value = {
    global: (events?.has('click') ?? false) && (events?.has('doubleclick') ?? false) && (events?.has('keydown') ?? false),
    module: events?.has('pointermove', MODULE) ?? false,
    selector: offSelectorDown !== undefined && offSelectorUp !== undefined,
    signal: offRightOnce !== undefined && (events?.has('rightclick') ?? false)
  };
};

const disposeAll = (announce = true) => {
  const disposers = [offClick, offDoubleClick, offKeydown, offModuleMove, offSelectorDown, offSelectorUp, offRightOnce].filter(
    (dispose): dispose is () => void => dispose !== undefined
  );
  offClick = undefined;
  offDoubleClick = undefined;
  offKeydown = undefined;
  offModuleMove = undefined;
  offSelectorDown = undefined;
  offSelectorUp = undefined;
  offRightOnce = undefined;
  rightClickAbort?.abort();
  rightClickAbort = undefined;

  let cleanupError: unknown;
  for (const dispose of disposers) {
    try {
      dispose();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  refreshState();
  if (announce) {
    latestEvent.value = { type: '—', title: '订阅已注销', scope: '全部', target: '—', position: '—', detail: '七类事件均不再计数' };
  }
  if (cleanupError !== undefined) throw cleanupError;
};

// #region event-subscriptions
const subscribe = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  disposeAll(false);

  offClick = earth.events.on('click', ({ coordinate, pixel, element }) => {
    recordEvent('click', 'global', element?.id ?? '地图空白', `坐标 ${formatPair(coordinate)} / 像素 ${formatPair(pixel)}`, '全局订阅接收所有单击');
  });
  offDoubleClick = earth.events.on('doubleclick', ({ coordinate, pixel, element }) => {
    recordEvent(
      'doubleclick',
      'global',
      element?.id ?? '地图空白',
      `坐标 ${formatPair(coordinate)} / 像素 ${formatPair(pixel)}`,
      '双击也可能伴随浏览器产生的单击事件'
    );
  });
  offKeydown = earth.events.on('keydown', ({ key, code, originalEvent }) => {
    recordEvent('keydown', 'global', '地图键盘入口', '无地图坐标', `${key}（${code}）${originalEvent.repeat ? '，持续按键' : ''}`);
  });
  offModuleMove = earth.events.on(
    'pointermove',
    ({ phase, coordinate, pixel, element }) => {
      recordEvent(
        'pointermove',
        `module: ${MODULE}`,
        element?.id ?? '未命中',
        `坐标 ${formatPair(coordinate)} / 像素 ${formatPair(pixel)}`,
        `当前阶段：${phase ?? 'move'}`
      );
    },
    { module: MODULE }
  );
  offSelectorDown = earth.events.on(
    'leftdown',
    ({ coordinate, pixel, element }) => {
      recordEvent(
        'leftdown',
        `selector: { id: '${SELECTOR_ID}' }`,
        element?.id ?? '未命中',
        `坐标 ${formatPair(coordinate)} / 像素 ${formatPair(pixel)}`,
        '只在蓝色标记上按下时触发'
      );
    },
    { selector: { id: SELECTOR_ID } }
  );
  offSelectorUp = earth.events.on(
    'leftup',
    ({ coordinate, pixel, element }) => {
      recordEvent(
        'leftup',
        `selector: { id: '${SELECTOR_ID}' }`,
        element?.id ?? '未命中',
        `坐标 ${formatPair(coordinate)} / 像素 ${formatPair(pixel)}`,
        '只在蓝色标记上松开时触发'
      );
    },
    { selector: { id: SELECTOR_ID } }
  );

  rightClickAbort = new AbortController();
  offRightOnce = earth.events.once(
    'rightclick',
    ({ coordinate, pixel, element }) => {
      recordEvent(
        'rightclick',
        'global once + AbortSignal',
        element?.id ?? '地图空白',
        `坐标 ${formatPair(coordinate)} / 像素 ${formatPair(pixel)}`,
        '首次触发后已自动注销'
      );
      offRightOnce = undefined;
      rightClickAbort = undefined;
      refreshState();
    },
    { signal: rightClickAbort.signal }
  );
  latestEvent.value = {
    type: '—',
    title: '七类事件已订阅',
    scope: 'global / module / selector 三种路由 + signal 生命周期',
    target: '—',
    position: '—',
    detail: '现在可以按卡片提示操作地图'
  };
  refreshState();
};
// #endregion event-subscriptions

const cancelSignal = () => {
  rightClickAbort?.abort();
  rightClickAbort = undefined;
  offRightOnce = undefined;
  latestEvent.value = {
    type: 'rightclick',
    title: 'rightclick 已由 AbortSignal 中止',
    scope: 'global once + AbortSignal',
    target: '—',
    position: '—',
    detail: '中止后单击右键不会增加计数；可点“重新订阅七类事件”恢复'
  };
  refreshState();
};

const clearModule = () => {
  earthRef.value?.events.clearModule(MODULE);
  offModuleMove = undefined;
  latestEvent.value = {
    type: 'pointermove',
    title: 'module 订阅已批量清理',
    scope: `module: ${MODULE}`,
    target: '橙色标记',
    position: '—',
    detail: 'global、selector 与 AbortSignal 订阅保持有效'
  };
  refreshState();
};

const resetCounts = () => {
  counts.value = emptyCounts();
  latestEvent.value = { type: '—', title: '计数已清零', scope: '—', target: '—', position: '—', detail: '订阅状态没有改变' };
};

const focusScenes = () => {
  const center = sceneCenter.value;
  if (center !== null) earthRef.value?.view.animateFlyTo(center, { zoom: MAP_ZOOM, duration: 450 });
};

const reset = () => {
  counts.value = emptyCounts();
  subscribe();
  focusScenes();
};

defineExpose({ reset, focusSelected: focusScenes });

const markerStyle = (label: string, color: string): StyleSpec => ({
  symbol: {
    type: 'circle',
    radius: 17,
    fill: { type: 'solid', color },
    stroke: { color: '#ffffff', width: 4 }
  },
  text: {
    text: label,
    fontSize: 14,
    fontWeight: 'bold',
    offsetY: 48,
    padding: [5, 8, 5, 8],
    fill: { type: 'solid', color: '#1f2937' },
    stroke: { color: '#ffffff', width: 3 },
    backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.94)' },
    backgroundStroke: { color, width: 2 }
  },
  zIndex: 30
});

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: MAP_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.52 });
  const layer = earth.layers.add({ kind: 'vector', id: 'events-elements', zIndex: 10, declutter: true });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  sceneCenter.value = center;
  earth.elements.add({
    id: 'events-module-marker',
    module: MODULE,
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [[center[0] - 42_000, center[1]]] },
    style: markerStyle('橙色：module', '#e6a23c')
  });
  earth.elements.add({
    id: SELECTOR_ID,
    module: 'selector-demo',
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [[center[0] + 42_000, center[1]]] },
    style: markerStyle('蓝色：selector', '#409eff')
  });
  earth.view.flyTo(center, MAP_ZOOM);
  earthRef.value = earth;
  subscribe();
});

onBeforeUnmount(() => {
  try {
    disposeAll(false);
  } finally {
    try {
      earthRef.value?.destroy();
    } finally {
      earthRef.value = null;
    }
  }
});
</script>

<template>
  <div class="example-demo events-demo">
    <el-alert type="info" :closable="false" show-icon title="七张卡片对应七类公开事件；橙色标记演示 module，蓝色标记演示 selector，其余操作使用 global。" />

    <div class="example-demo__control-panel events-demo__toolbar">
      <div class="example-demo__action-row events-demo__action-row">
        <div class="example-demo__actions events-demo__actions">
          <div class="example-demo__action-group events-demo__action-group" role="group" aria-label="订阅控制">
            <span>订阅控制</span>
            <div class="example-demo__action-buttons events-demo__action-buttons">
              <el-button type="primary" @click="subscribe">重新订阅七类事件</el-button>
              <el-button :disabled="!subscriptionState.signal" @click="cancelSignal">中止 rightclick signal</el-button>
              <el-button :disabled="!subscriptionState.module" @click="clearModule">clearModule</el-button>
            </div>
          </div>
          <div class="example-demo__action-group events-demo__action-group" role="group" aria-label="计数与清理">
            <span>计数与清理</span>
            <div class="example-demo__action-buttons events-demo__action-buttons">
              <el-button @click="resetCounts">清零计数</el-button>
              <el-button type="danger" plain @click="disposeAll()">逐项调用注销函数</el-button>
            </div>
          </div>
        </div>
        <div class="example-demo__feedback events-demo__states" aria-live="polite">
          <el-tag :type="subscriptionState.global ? 'success' : 'info'" effect="plain">global：{{ subscriptionState.global ? '有效' : '已结束' }}</el-tag>
          <el-tag :type="subscriptionState.module ? 'success' : 'info'" effect="plain">module：{{ subscriptionState.module ? '有效' : '已清理' }}</el-tag>
          <el-tag :type="subscriptionState.selector ? 'success' : 'info'" effect="plain">selector：{{ subscriptionState.selector ? '有效' : '已结束' }}</el-tag>
          <el-tag :type="subscriptionState.signal ? 'warning' : 'info'" effect="plain"
            >AbortSignal：{{ subscriptionState.signal ? '等待 rightclick' : '已结束' }}</el-tag
          >
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage events-demo__map" tabindex="0" aria-label="事件交互地图"></div>

    <el-row class="events-demo__counters" :gutter="10">
      <el-col v-for="card in eventCards" :key="card.type" :xs="24" :sm="8" :lg="6">
        <el-card class="events-demo__counter" shadow="never" :class="{ 'is-current': latestEvent.type === card.type }">
          <div class="events-demo__counter-head">
            <code>{{ card.label }}</code>
            <strong>{{ card.count }}</strong>
          </div>
          <el-tag size="small" effect="plain">{{ card.scope }}</el-tag>
          <p>{{ card.hint }}</p>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="events-demo__latest" shadow="never">
      <template #header>
        <div class="events-demo__latest-title">
          <strong>当前事件</strong>
          <el-tag :type="latestEvent.type === '—' ? 'info' : 'primary'" effect="dark">{{ latestEvent.title }}</el-tag>
        </div>
      </template>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="路由范围">{{ latestEvent.scope }}</el-descriptions-item>
        <el-descriptions-item label="命中目标">{{ latestEvent.target }}</el-descriptions-item>
        <el-descriptions-item label="位置">{{ latestEvent.position }}</el-descriptions-item>
        <el-descriptions-item label="事件细节">{{ latestEvent.detail }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.events-demo__action-group {
  max-width: 100%;
}

.events-demo__states {
  align-content: center;
}

.events-demo__map:focus-visible {
  outline: 3px solid var(--doc-primary);
  outline-offset: 2px;
}

.events-demo__counters {
  margin-top: 14px;
}

.events-demo__counter {
  height: calc(100% - 10px);
  margin-bottom: 10px;
  border-color: var(--doc-border);
}

.events-demo__counter.is-current {
  border-color: var(--doc-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--doc-primary) 20%, transparent);
}

.events-demo__counter-head,
.events-demo__latest-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.events-demo__counter-head code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.events-demo__latest-title {
  flex-wrap: wrap;
}

.events-demo__latest-title :deep(.el-tag) {
  max-width: 100%;
  height: auto;
  white-space: normal;
}

.events-demo__counter-head strong {
  color: var(--doc-primary-deep);
  font-size: 24px;
}

.events-demo__counter p {
  margin: 8px 0 0;
  color: var(--doc-muted);
  font-size: 12px;
  line-height: 1.55;
}

.events-demo__latest {
  margin-top: 4px;
  border-color: var(--doc-border);
}

.events-demo__latest :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}

@media (max-width: 560px) {
  .events-demo__toolbar,
  .events-demo__action-buttons {
    display: grid;
    grid-template-columns: 1fr;
  }

  .events-demo__action-group,
  .events-demo__action-buttons :deep(.el-button) {
    width: 100%;
  }

  .events-demo__action-buttons :deep(.el-button) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
}
</style>
