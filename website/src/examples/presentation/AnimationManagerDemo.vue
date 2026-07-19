<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, animationTypes, type AnimationHandle, type AnimationSpec, type AnimationStatus, type AnimationType } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const LAYER_ID = 'docs-animation-targets';
const ids = {
  point: 'docs-animation-point',
  line: 'docs-animation-line',
  area: 'docs-animation-area',
  circle: 'docs-animation-circle'
} as const;

const labels: Record<AnimationType, string> = {
  pulse: 'pulse · 点脉冲',
  'dash-flow': 'dash-flow · 虚线流动',
  'path-travel': 'path-travel · 路径尾迹',
  blink: 'blink · 阶跃闪烁',
  highlight: 'highlight · 呼吸高亮',
  alert: 'alert · 双峰告警',
  grow: 'grow · 路径生长',
  'radar-scan': 'radar-scan · 雷达扫描',
  'center-spread': 'center-spread · 中心扩散',
  fade: 'fade · 渐隐'
};

const targetByType: Record<AnimationType, { id: string; label: string }> = {
  pulse: { id: ids.point, label: 'Point' },
  'dash-flow': { id: ids.line, label: 'Polyline' },
  'path-travel': { id: ids.line, label: 'Polyline' },
  blink: { id: ids.area, label: 'Polygon' },
  highlight: { id: ids.area, label: 'Polygon' },
  alert: { id: ids.area, label: 'Polygon' },
  grow: { id: ids.line, label: 'Polyline' },
  'radar-scan': { id: ids.circle, label: 'Circle' },
  'center-spread': { id: ids.circle, label: 'Circle' },
  fade: { id: ids.area, label: 'Polygon' }
};

const specFactories = {
  pulse: () => ({ type: 'pulse', periodMs: 1100, color: '#409eff', repeat: true }),
  'dash-flow': () => ({ type: 'dash-flow', speed: 36, lineDash: [12, 8], color: '#00bfa5' }),
  'path-travel': () => ({ type: 'path-travel', durationMs: 2600, trailLength: 0.3, width: 5, color: '#ff7a00', repeat: true }),
  blink: () => ({ type: 'blink', periodMs: 900, dutyCycle: 0.55, minOpacity: 0.12, maxOpacity: 1, repeat: true }),
  highlight: () => ({ type: 'highlight', mode: 'breathe', color: '#ffc107', periodMs: 1400 }),
  alert: () => ({ type: 'alert', color: '#ff3b30', periodMs: 1300, repeat: true }),
  grow: () => ({ type: 'grow', durationMs: 1800, direction: 'forward', easing: 'ease-in-out', repeat: true }),
  'radar-scan': () => ({ type: 'radar-scan', periodMs: 2200, direction: 'clockwise', color: '#00e676', opacity: 0.38, beamWidthDeg: 52, repeat: true }),
  'center-spread': () => ({ type: 'center-spread', periodMs: 1700, color: '#00e676', opacity: 0.7, trailLength: 0.2, ringCount: 3, repeat: true }),
  fade: () => ({ type: 'fade', direction: 'out', durationMs: 1000, easing: 'ease-in-out' })
} satisfies Record<AnimationType, () => AnimationSpec>;

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const latestHandle = shallowRef<AnimationHandle | null>(null);
const allHandles = new Set<AnimationHandle>();
const selectedType = ref<AnimationType>('pulse');
const channel = ref('');
const status = ref<AnimationStatus>('stopped');
const statusLabel = computed(() => ({ running: '运行中', paused: '已暂停', stopped: '已停止', finished: '已自然完成' })[status.value]);
const selectedTarget = computed(() => targetByType[selectedType.value]);

const start = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const baseSpec = specFactories[selectedType.value]();
  const inputChannel = channel.value.trim();
  const spec = (inputChannel.length === 0 ? baseSpec : { ...baseSpec, channel: inputChannel }) as AnimationSpec;
  const handle = earth.animations.play({ id: selectedTarget.value.id }, spec);
  latestHandle.value = handle;
  allHandles.add(handle);
  status.value = handle.status;
  void handle.finished.then(() => {
    if (latestHandle.value === handle) status.value = handle.status;
  });
};

const pause = () => {
  latestHandle.value?.pause();
  if (latestHandle.value !== null) status.value = latestHandle.value.status;
};

const resume = () => {
  latestHandle.value?.resume();
  if (latestHandle.value !== null) status.value = latestHandle.value.status;
};

const stop = () => {
  latestHandle.value?.stop();
  if (latestHandle.value !== null) status.value = latestHandle.value.status;
};

const stopAll = () => {
  for (const handle of allHandles) handle.stop();
  allHandles.clear();
  earthRef.value?.animations.stopAll();
  latestHandle.value = null;
  status.value = 'stopped';
};

const addTargets = (earth: Earth) => {
  const projected = (coordinates: readonly (readonly [number, number])[]) => earth.view.toProjectedCoordinates(coordinates);
  earth.elements.add({
    id: ids.point,
    layerId: LAYER_ID,
    geometry: { type: 'point', controlPoints: projected([[115.95, 40.13]]) },
    style: {
      symbol: {
        type: 'circle',
        radius: 9,
        fill: { type: 'solid', color: '#409eff' },
        stroke: { color: '#ffffff', width: 2 }
      }
    }
  });
  earth.elements.add({
    id: ids.line,
    layerId: LAYER_ID,
    geometry: {
      type: 'polyline',
      controlPoints: projected([
        [115.75, 39.55],
        [116.25, 39.92],
        [116.75, 39.62],
        [117.08, 40.05]
      ])
    },
    style: { strokes: [{ color: '#2563eb', width: 4 }] }
  });
  earth.elements.add({
    id: ids.area,
    layerId: LAYER_ID,
    geometry: {
      type: 'polygon',
      controlPoints: projected([
        [116.1, 39.78],
        [116.62, 39.78],
        [116.7, 40.13],
        [116.18, 40.18]
      ])
    },
    style: {
      strokes: [{ color: '#7c3aed', width: 3 }],
      fill: { type: 'solid', color: 'rgba(124, 58, 237, 0.22)' }
    }
  });
  earth.elements.add({
    id: ids.circle,
    layerId: LAYER_ID,
    geometry: { type: 'circle', center: earth.view.toProjectedCoordinates([116.86, 39.95]), radius: 30_000 },
    style: {
      strokes: [{ color: '#059669', width: 3 }],
      fill: { type: 'solid', color: 'rgba(16, 185, 129, 0.16)' }
    }
  });
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 7 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 20 });
  addTargets(earth);
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), 7);
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  stopAll();
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo animation-manager-demo">
    <el-alert
      class="example-demo__alert"
      title="光敏提示：blink、呼吸 highlight 与 alert 可能引发不适。本示例不会自动播放，请确认后手动启动，并可随时暂停或停止。"
      type="warning"
      show-icon
      :closable="false"
    />
    <div class="animation-manager-demo__controls">
      <label>
        <span>AnimationType</span>
        <el-select v-model="selectedType" aria-label="动画类型">
          <el-option v-for="type in animationTypes" :key="type" :label="labels[type]" :value="type" />
        </el-select>
      </label>
      <label>
        <span>兼容目标</span>
        <el-input :model-value="selectedTarget.label" aria-label="当前兼容目标" readonly />
      </label>
      <label>
        <span>channel（留空使用 type）</span>
        <el-input v-model="channel" clearable placeholder="例如 attention" aria-label="动画 channel" />
      </label>
    </div>
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="start">启动</el-button>
      <el-button :disabled="latestHandle === null" @click="pause">暂停</el-button>
      <el-button :disabled="latestHandle === null" @click="resume">恢复</el-button>
      <el-button :disabled="latestHandle === null" @click="stop">停止当前</el-button>
      <el-button plain @click="stopAll">停止全部</el-button>
      <el-tag :type="status === 'running' ? 'success' : status === 'paused' ? 'warning' : 'info'">{{ statusLabel }}</el-tag>
    </div>
    <div ref="mapTarget" class="example-stage"></div>
    <p class="animation-manager-demo__hint">
      四个目标分别演示 Point、Polyline、Polygon 与 Circle 能力。相同目标、相同 channel 的新播放会原子替换旧记录；不同 channel 只有在写入域兼容时才会组合。
    </p>
  </div>
</template>

<style scoped>
.animation-manager-demo__controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.animation-manager-demo__controls label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--doc-muted);
  font-size: 12px;
}

.animation-manager-demo__hint {
  margin: 12px 0 0;
  color: var(--doc-muted);
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 760px) {
  .animation-manager-demo__controls {
    grid-template-columns: 1fr;
  }
}
</style>
