<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-events';
const MODULE = 'events-demo';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const latestPointer = ref('将指针移到蓝色标记上');
const latestClick = ref('尚未触发');
const latestRightClick = ref('等待一次右键单击');
const latestKeydown = ref('单击地图获得焦点后按任意键');
const subscriptionState = ref({ click: false, moduleMove: false, rightOnce: false, keydown: false });

let offClick: (() => void) | undefined;
let offModuleMove: (() => void) | undefined;
let offRightOnce: (() => void) | undefined;
let offKeydown: (() => void) | undefined;

const refreshState = () => {
  const events = earthRef.value?.events;
  subscriptionState.value = {
    click: events?.has('click') ?? false,
    moduleMove: events?.has('pointermove', MODULE) ?? false,
    rightOnce: events?.has('rightclick') ?? false,
    keydown: events?.has('keydown') ?? false
  };
};

const disposeAll = () => {
  offClick?.();
  offModuleMove?.();
  offRightOnce?.();
  offKeydown?.();
  offClick = undefined;
  offModuleMove = undefined;
  offRightOnce = undefined;
  offKeydown = undefined;
  refreshState();
};

// #region event-subscriptions
const subscribe = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  disposeAll();

  offClick = earth.events.on('click', ({ coordinate, element }) => {
    latestClick.value = `${element?.id ?? '地图'} @ ${coordinate.map((value) => value.toFixed(0)).join(', ')}`;
  });
  offModuleMove = earth.events.on(
    'pointermove',
    ({ phase, element }) => {
      latestPointer.value = `${phase ?? 'move'}：${element?.id ?? '未命中'}`;
    },
    { module: MODULE }
  );
  offRightOnce = earth.events.once('rightclick', ({ pixel }) => {
    latestRightClick.value = `已触发：像素 ${pixel.map((value) => value.toFixed(0)).join(', ')}`;
    offRightOnce = undefined;
    refreshState();
  });
  offKeydown = earth.events.on('keydown', ({ key, code }) => {
    latestKeydown.value = `${key}（${code}）`;
  });
  refreshState();
};
// #endregion event-subscriptions

const cancelOnce = () => {
  offRightOnce?.();
  offRightOnce = undefined;
  latestRightClick.value = '已提前取消，回调不会触发';
  refreshState();
};

const clearModule = () => {
  earthRef.value?.events.clearModule(MODULE);
  latestPointer.value = `已清理模块 ${MODULE}；全局 click 与 keydown 保留`;
  refreshState();
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 8 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  const layer = earth.layers.add({ kind: 'vector', id: 'events-elements', zIndex: 10 });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.elements.add({
    id: 'events-marker',
    module: MODULE,
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [center] },
    style: {
      symbol: {
        type: 'circle',
        radius: 16,
        fill: { type: 'solid', color: '#409eff' },
        stroke: { color: '#ffffff', width: 4 }
      },
      text: {
        text: '移动指针到这里',
        fontSize: 14,
        fontWeight: 'bold',
        offsetY: 42,
        padding: [5, 8, 5, 8],
        fill: { type: 'solid', color: '#1f2937' },
        stroke: { color: '#ffffff', width: 3 },
        backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.9)' },
        backgroundStroke: { color: '#409eff', width: 2 }
      }
    }
  });
  earth.view.flyTo(center, 8);
  earthRef.value = earth;
  subscribe();
});

onBeforeUnmount(() => {
  disposeAll();
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <el-alert type="info" :closable="false" show-icon title="单击地图、在蓝色标记上移动指针、单击右键或先点击地图再按键盘，观察四类订阅。" />

    <div class="example-demo__toolbar">
      <el-button type="primary" @click="subscribe">重新订阅</el-button>
      <el-button :disabled="!subscriptionState.rightOnce" @click="cancelOnce">提前取消 once</el-button>
      <el-button :disabled="!subscriptionState.moduleMove" @click="clearModule">clearModule</el-button>
      <el-button type="danger" plain @click="disposeAll">逐项调用注销函数</el-button>
    </div>

    <div class="events-demo__states">
      <el-tag :type="subscriptionState.click ? 'success' : 'info'" effect="plain">全局 click：{{ subscriptionState.click ? '有订阅' : '无订阅' }}</el-tag>
      <el-tag :type="subscriptionState.moduleMove ? 'success' : 'info'" effect="plain"
        >模块 pointermove：{{ subscriptionState.moduleMove ? '有订阅' : '无订阅' }}</el-tag
      >
      <el-tag :type="subscriptionState.rightOnce ? 'warning' : 'info'" effect="plain"
        >once rightclick：{{ subscriptionState.rightOnce ? '等待触发' : '已结束' }}</el-tag
      >
      <el-tag :type="subscriptionState.keydown ? 'success' : 'info'" effect="plain">keydown：{{ subscriptionState.keydown ? '有订阅' : '无订阅' }}</el-tag>
    </div>

    <div ref="mapTarget" class="example-stage" tabindex="0"></div>

    <el-descriptions class="events-demo__result" :column="2" border>
      <el-descriptions-item label="click 最新载荷">{{ latestClick }}</el-descriptions-item>
      <el-descriptions-item label="pointermove 当前阶段">{{ latestPointer }}</el-descriptions-item>
      <el-descriptions-item label="once rightclick">{{ latestRightClick }}</el-descriptions-item>
      <el-descriptions-item label="keydown 最新按键">{{ latestKeydown }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.events-demo__states {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 14px;
}

.events-demo__result {
  margin: 14px 0;
}
</style>
