<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, animationTypes, type AnimationHandle, type AnimationSpec, type AnimationStatus, type AnimationType } from '@vrsim/earth-engine-ol';
import {
  animationEffectManifest,
  animationEffectManifestByType,
  defaultAnimationManifestDemoControls,
  type AnimationManifestDemoControls
} from '../../../../.test/animationEffectManifest';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

type FadeDirection = 'in' | 'out';
type GrowDirection = 'forward' | 'reverse';
type HighlightMode = 'steady' | 'breathe';
type RadarDirection = 'clockwise' | 'counterclockwise';
type RadarScanMode = 'one-way' | 'round-trip';
type RadialTrailStyle = 'solid' | 'gradient';

const LAYER_ID = 'docs-animation-targets';
const MODULE_ID = 'docs-animation-gallery';
const HOME_CENTER = [116.8, 39.85] as const;
const HOME_ZOOM = 6.8;
const FOCUS_ZOOM = 8.25;
const composableTypes = new Set<AnimationType>(['blink', 'highlight', 'alert', 'fade']);

const targetCenters = {
  pulse: [114.4, 40.55],
  'dash-flow': [114.4, 39.18],
  'path-travel': [115.6, 39.18],
  blink: [115.6, 40.55],
  highlight: [116.8, 40.55],
  alert: [118, 40.55],
  grow: [116.8, 39.18],
  'radar-scan': [118, 39.18],
  'center-spread': [119.2, 39.18],
  fade: [119.2, 40.55]
} as const satisfies Record<AnimationType, readonly [number, number]>;

const targetLabels = {
  pulse: 'Point',
  'dash-flow': 'Polyline',
  'path-travel': 'Polyline',
  blink: 'Polygon',
  highlight: 'Polygon',
  alert: 'Polygon',
  grow: 'FineArrow',
  'radar-scan': 'Sector',
  'center-spread': 'Circle',
  fade: 'Polygon'
} as const satisfies Record<AnimationType, string>;

const targetId = (type: AnimationType) => `docs-animation-${type}`;
const effectOptions = animationEffectManifest.map((entry) => ({ type: entry.animationType, label: entry.label }));
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const latestHandle = shallowRef<AnimationHandle | null>(null);
const activeHandles = new Set<AnimationHandle>();
const selectedType = ref<AnimationType>('pulse');
const channel = ref('');
const compositionMode = ref(false);
const fadeDirection = ref<FadeDirection>(defaultAnimationManifestDemoControls.fadeDirection);
const growDirection = ref<GrowDirection>(defaultAnimationManifestDemoControls.growDirection);
const highlightMode = ref<HighlightMode>(defaultAnimationManifestDemoControls.highlightMode);
const radarDirection = ref<RadarDirection>(defaultAnimationManifestDemoControls.radarDirection);
const radarScanMode = ref<RadarScanMode>(defaultAnimationManifestDemoControls.radarScanMode);
const radarTrailStyle = ref<RadialTrailStyle>(defaultAnimationManifestDemoControls.radarTrailStyle);
const radarColor = ref(defaultAnimationManifestDemoControls.radarColor);
const radarGradientTail = ref(defaultAnimationManifestDemoControls.radarGradientTail);
const radarGradientMiddle = ref(defaultAnimationManifestDemoControls.radarGradientMiddle);
const radarGradientFront = ref(defaultAnimationManifestDemoControls.radarGradientFront);
const centerSpreadTrailStyle = ref<RadialTrailStyle>(defaultAnimationManifestDemoControls.centerSpreadTrailStyle);
const centerSpreadColor = ref(defaultAnimationManifestDemoControls.centerSpreadColor);
const centerSpreadGradientTail = ref(defaultAnimationManifestDemoControls.centerSpreadGradientTail);
const centerSpreadGradientMiddle = ref(defaultAnimationManifestDemoControls.centerSpreadGradientMiddle);
const centerSpreadGradientFront = ref(defaultAnimationManifestDemoControls.centerSpreadGradientFront);
const centerSpreadOpacity = ref(defaultAnimationManifestDemoControls.centerSpreadOpacity);
const centerSpreadTrailLength = ref(defaultAnimationManifestDemoControls.centerSpreadTrailLength);
const status = ref<AnimationStatus>('stopped');
const feedback = ref('十个目标彼此隔离；选择效果后再手动启动。');

const selectedEntry = computed(() => animationEffectManifestByType[selectedType.value]);
const compositionCompatible = computed(() => composableTypes.has(selectedType.value));
const playbackTargetType = computed<AnimationType>(() => (compositionMode.value && compositionCompatible.value ? 'highlight' : selectedType.value));
const selectedTargetLabel = computed(() =>
  compositionMode.value && compositionCompatible.value ? '共享 Polygon（组合实验）' : `${targetLabels[selectedType.value]}（独立目标）`
);
const statusLabel = computed(() => ({ running: '运行中', paused: '已暂停', stopped: '已停止', finished: '已自然完成' })[status.value]);
const canPause = computed(() => latestHandle.value !== null && status.value === 'running');
const canResume = computed(() => latestHandle.value !== null && status.value === 'paused');
const canStop = computed(() => latestHandle.value !== null && status.value !== 'stopped');

const controls = (): AnimationManifestDemoControls => ({
  fadeDirection: fadeDirection.value,
  growDirection: growDirection.value,
  highlightMode: highlightMode.value,
  radarDirection: radarDirection.value,
  radarScanMode: radarScanMode.value,
  radarTrailStyle: radarTrailStyle.value,
  radarColor: radarColor.value,
  radarGradientTail: radarGradientTail.value,
  radarGradientMiddle: radarGradientMiddle.value,
  radarGradientFront: radarGradientFront.value,
  centerSpreadTrailStyle: centerSpreadTrailStyle.value,
  centerSpreadColor: centerSpreadColor.value,
  centerSpreadGradientTail: centerSpreadGradientTail.value,
  centerSpreadGradientMiddle: centerSpreadGradientMiddle.value,
  centerSpreadGradientFront: centerSpreadGradientFront.value,
  centerSpreadOpacity: centerSpreadOpacity.value,
  centerSpreadTrailLength: centerSpreadTrailLength.value
});

const trackHandle = (handle: AnimationHandle) => {
  latestHandle.value = handle;
  activeHandles.add(handle);
  status.value = handle.status;
  void handle.finished.then(() => {
    activeHandles.delete(handle);
    if (latestHandle.value === handle) status.value = handle.status;
  });
  return handle;
};

const stopAll = () => {
  for (const handle of activeHandles) handle.stop();
  activeHandles.clear();
  earthRef.value?.animations.stopAll();
  latestHandle.value = null;
  status.value = 'stopped';
  feedback.value = '已停止当前 Earth 的全部动画并释放临时展示资源。';
};

const play = (type: AnimationType, id: string, overrides: Partial<AnimationSpec> = {}) => {
  const earth = earthRef.value;
  if (earth === null) return null;
  const baseSpec = animationEffectManifestByType[type].createDemoSpec(controls());
  const spec = { ...baseSpec, ...overrides } as AnimationSpec;
  if (spec.type === 'highlight' && spec.mode !== 'breathe') delete (spec as { periodMs?: number }).periodMs;
  if (spec.type === 'fade' && spec.direction === 'in') earth.elements.show({ id });
  return trackHandle(earth.animations.play({ id }, spec));
};

const start = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  if (!compositionMode.value) stopAll();
  const id = targetId(playbackTargetType.value);
  const selectedChannel = channel.value.trim();
  try {
    play(selectedType.value, id, selectedChannel.length === 0 ? {} : { channel: selectedChannel });
    feedback.value = compositionMode.value
      ? `${selectedType.value} 已加入共享 Polygon；不同 channel 才会进入写入域合成。`
      : `${selectedType.value} 已在自己的 ${targetLabels[selectedType.value]} 上启动；普通模式会先停止旧效果。`;
  } catch (error) {
    feedback.value = error instanceof Error ? `${error.name}: ${error.message}` : '动画启动失败';
  }
};

const pause = () => {
  latestHandle.value?.pause();
  if (latestHandle.value !== null) status.value = latestHandle.value.status;
};

const resume = () => {
  latestHandle.value?.resume();
  if (latestHandle.value !== null) status.value = latestHandle.value.status;
};

const applyRunningRadialOptions = (type: 'radar-scan' | 'center-spread') => {
  if (selectedType.value !== type || compositionMode.value) return;
  const currentStatus = latestHandle.value?.status;
  if (currentStatus !== 'running' && currentStatus !== 'paused') return;
  start();
  if (latestHandle.value === null || status.value !== 'running') return;
  if (currentStatus === 'paused') pause();
  feedback.value = currentStatus === 'paused' ? `${type} 参数已应用；新动画保持暂停。` : `${type} 参数已应用并重新启动。`;
};

const stop = () => {
  latestHandle.value?.stop();
  if (latestHandle.value !== null) status.value = latestHandle.value.status;
};

const focusType = (type: AnimationType) => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.view.animateFlyTo(earth.view.toProjectedCoordinates(targetCenters[type]), { zoom: FOCUS_ZOOM, duration: 420 });
};

const focusSelected = () => focusType(playbackTargetType.value);

const selectEffect = (type: AnimationType, focus = false) => {
  if (!compositionMode.value || !composableTypes.has(type)) {
    stopAll();
    compositionMode.value = false;
  }
  selectedType.value = type;
  feedback.value = `${type} 使用独立 ${targetLabels[type]} 目标；点击“启动”观察效果。`;
  if (focus) focusType(type);
};

const onCompositionChange = (enabled: boolean | string | number) => {
  stopAll();
  compositionMode.value = Boolean(enabled);
  feedback.value = compositionMode.value
    ? '组合模式已开启：blink、highlight、alert、fade 会写入同一个 Polygon；留空 channel 时各自使用 type。'
    : '已回到普通模式；切换或再次启动会先停止旧动画。';
};

const playComposition = () => {
  stopAll();
  selectedType.value = 'alert';
  compositionMode.value = true;
  const id = targetId('highlight');
  try {
    play('highlight', id, { channel: 'composition-highlight', mode: 'steady' });
    play('alert', id, { channel: 'composition-alert' });
    feedback.value = '组合成功：steady highlight 与 alert 使用不同 channel，在共享 Polygon 上稳定叠加。';
    focusType('highlight');
  } catch (error) {
    feedback.value = error instanceof Error ? `${error.name}: ${error.message}` : '组合启动失败';
  }
};

const playReplace = () => {
  stopAll();
  compositionMode.value = false;
  selectedType.value = 'alert';
  const id = targetId('highlight');
  try {
    play('highlight', id, { channel: 'attention', mode: 'steady' });
    play('alert', id, { channel: 'attention' });
    feedback.value = 'replace 已验证：alert 在完整校验后原子替换同 channel 的 highlight。';
    focusType('highlight');
  } catch (error) {
    feedback.value = error instanceof Error ? `${error.name}: ${error.message}` : 'replace 验证失败';
  }
};

const playGrowConflict = () => {
  stopAll();
  compositionMode.value = false;
  selectedType.value = 'grow';
  const id = targetId('grow');
  try {
    play('grow', id, { channel: 'grow-forward', direction: 'forward' });
    play('grow', id, { channel: 'grow-reverse', direction: 'reverse' });
    feedback.value = '未触发预期的 target-geometry 冲突。';
  } catch (error) {
    feedback.value = error instanceof Error ? `预期冲突：${error.name}；第一条 grow 仍保持运行。` : '已触发预期冲突';
  }
  focusType('grow');
};

const showAllTargets = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  for (const type of animationTypes) earth.elements.show({ id: targetId(type) });
};

const reset = () => {
  stopAll();
  compositionMode.value = false;
  selectedType.value = 'pulse';
  channel.value = '';
  fadeDirection.value = defaultAnimationManifestDemoControls.fadeDirection;
  growDirection.value = defaultAnimationManifestDemoControls.growDirection;
  highlightMode.value = defaultAnimationManifestDemoControls.highlightMode;
  radarDirection.value = defaultAnimationManifestDemoControls.radarDirection;
  radarScanMode.value = defaultAnimationManifestDemoControls.radarScanMode;
  radarTrailStyle.value = defaultAnimationManifestDemoControls.radarTrailStyle;
  radarColor.value = defaultAnimationManifestDemoControls.radarColor;
  radarGradientTail.value = defaultAnimationManifestDemoControls.radarGradientTail;
  radarGradientMiddle.value = defaultAnimationManifestDemoControls.radarGradientMiddle;
  radarGradientFront.value = defaultAnimationManifestDemoControls.radarGradientFront;
  centerSpreadTrailStyle.value = defaultAnimationManifestDemoControls.centerSpreadTrailStyle;
  centerSpreadColor.value = defaultAnimationManifestDemoControls.centerSpreadColor;
  centerSpreadGradientTail.value = defaultAnimationManifestDemoControls.centerSpreadGradientTail;
  centerSpreadGradientMiddle.value = defaultAnimationManifestDemoControls.centerSpreadGradientMiddle;
  centerSpreadGradientFront.value = defaultAnimationManifestDemoControls.centerSpreadGradientFront;
  centerSpreadOpacity.value = defaultAnimationManifestDemoControls.centerSpreadOpacity;
  centerSpreadTrailLength.value = defaultAnimationManifestDemoControls.centerSpreadTrailLength;
  showAllTargets();
  const earth = earthRef.value;
  if (earth !== null) earth.view.animateFlyTo(earth.view.toProjectedCoordinates(HOME_CENTER), { zoom: HOME_ZOOM, duration: 420 });
  feedback.value = '已停止全部动画、恢复默认参数并回到十目标总览。';
};

const addTargets = (earth: Earth) => {
  const projected = (coordinates: readonly (readonly [number, number])[]) => earth.view.toProjectedCoordinates(coordinates);
  const around = (center: readonly [number, number], dx = 0.32, dy = 0.24) =>
    projected([
      [center[0] - dx, center[1] - dy],
      [center[0] + dx, center[1] - dy],
      [center[0] + dx, center[1] + dy],
      [center[0] - dx, center[1] + dy]
    ]);
  const add = (input: Parameters<Earth['elements']['add']>[0]) => earth.elements.add({ ...input, layerId: LAYER_ID, module: MODULE_ID });

  add({
    id: targetId('pulse'),
    geometry: { type: 'point', controlPoints: projected([targetCenters.pulse]) },
    style: {
      symbol: { type: 'circle', radius: 9, fill: { type: 'solid', color: '#ef4444' }, stroke: { color: '#ffffff', width: 2 } },
      text: {
        text: 'pulse · Point',
        fontSize: 12,
        offsetY: 25,
        fill: { type: 'solid', color: '#7f1d1d' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.88)' },
        padding: [3, 6, 3, 6]
      }
    }
  });

  const addArea = (type: 'blink' | 'highlight' | 'alert' | 'fade', color: string, fill: string) =>
    add({
      id: targetId(type),
      geometry: { type: 'polygon', controlPoints: around(targetCenters[type]) },
      style: {
        strokes: [{ color, width: 3 }],
        fill: { type: 'solid', color: fill },
        text: {
          text: `${type} · Polygon`,
          fontSize: 12,
          fill: { type: 'solid', color },
          backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.84)' },
          padding: [2, 5, 2, 5]
        }
      }
    });
  addArea('blink', '#7c3aed', 'rgba(124,58,237,0.28)');
  addArea('highlight', '#ca8a04', 'rgba(234,179,8,0.24)');
  addArea('alert', '#dc2626', 'rgba(239,68,68,0.24)');
  addArea('fade', '#475569', 'rgba(100,116,139,0.3)');

  add({
    id: targetId('dash-flow'),
    geometry: {
      type: 'polyline',
      controlPoints: projected([
        [113.98, 39.02],
        [114.38, 39.38],
        [114.82, 39.04]
      ])
    },
    style: {
      strokes: [
        { color: '#ffffff', width: 7 },
        { color: '#2563eb', width: 4, lineDash: [12, 8] }
      ],
      text: {
        text: 'dash-flow',
        placement: 'line',
        fontSize: 12,
        fill: { type: 'solid', color: '#1e3a8a' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.84)' },
        padding: [2, 5, 2, 5]
      }
    }
  });
  add({
    id: targetId('path-travel'),
    geometry: {
      type: 'polyline',
      controlPoints: projected([
        [115.16, 39.02],
        [115.58, 39.4],
        [116.02, 39.04]
      ])
    },
    style: {
      strokes: [{ color: '#64748b', width: 4 }],
      text: {
        text: 'path-travel',
        placement: 'line',
        fontSize: 12,
        fill: { type: 'solid', color: '#334155' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.84)' },
        padding: [2, 5, 2, 5]
      }
    }
  });
  add({
    id: targetId('grow'),
    geometry: {
      type: 'fine-arrow',
      controlPoints: projected([
        [116.35, 38.98],
        [117.23, 39.38]
      ])
    },
    style: {
      strokes: [{ color: '#ea580c', width: 2 }],
      fill: { type: 'solid', color: 'rgba(249,115,22,0.48)' },
      text: {
        text: 'grow · FineArrow',
        fontSize: 12,
        fill: { type: 'solid', color: '#9a3412' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.84)' },
        padding: [2, 5, 2, 5]
      }
    }
  });
  add({
    id: targetId('radar-scan'),
    geometry: {
      type: 'sector',
      controlPoints: projected([targetCenters['radar-scan'], [118.45, 39.18], [118, 39.63]])
    },
    style: {
      strokes: [{ color: '#0891b2', width: 3 }],
      text: {
        text: 'radar-scan · Sector',
        fontSize: 12,
        fill: { type: 'solid', color: '#155e75' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.84)' },
        padding: [2, 5, 2, 5]
      }
    }
  });
  add({
    id: targetId('center-spread'),
    geometry: { type: 'circle', center: earth.view.toProjectedCoordinates(targetCenters['center-spread']), radius: 38_000 },
    style: {
      strokes: [{ color: 'rgba(16,185,129,0.72)', width: 1.5 }],
      text: {
        text: 'center-spread · Circle',
        fontSize: 12,
        fill: { type: 'solid', color: '#065f46' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.84)' },
        padding: [2, 5, 2, 5]
      }
    }
  });
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: HOME_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 20 });
  addTargets(earth);
  earth.view.flyTo(earth.view.toProjectedCoordinates(HOME_CENTER), HOME_ZOOM);
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  stopAll();
  earthRef.value?.destroy();
  earthRef.value = null;
});

defineExpose({ reset, focusSelected });
</script>

<template>
  <div class="example-demo animation-manager-demo">
    <el-alert
      class="example-demo__alert"
      title="光敏提示：blink、呼吸 highlight 与 alert 可能引发不适。本示例不会自动播放，并可随时暂停或停止。"
      type="warning"
      show-icon
      :closable="false"
    />

    <div class="example-demo__control-panel">
      <div class="animation-manager-demo__controls">
        <label>
          <span>AnimationType</span>
          <el-select :model-value="selectedType" aria-label="动画类型" @update:model-value="selectEffect">
            <el-option v-for="effect in effectOptions" :key="effect.type" :label="effect.label" :value="effect.type" />
          </el-select>
        </label>
        <label>
          <span>当前目标</span>
          <el-input :model-value="selectedTargetLabel" aria-label="当前兼容目标" readonly />
        </label>
        <label>
          <span>channel（留空使用 type）</span>
          <el-input v-model="channel" clearable placeholder="例如 attention" aria-label="动画 channel" />
        </label>
        <label class="animation-manager-demo__switch">
          <span>显式组合模式</span>
          <el-switch
            v-model="compositionMode"
            :disabled="!compositionCompatible"
            inline-prompt
            active-text="组合"
            inactive-text="普通"
            aria-label="跨 channel 组合模式"
            @change="onCompositionChange"
          />
        </label>
      </div>

      <div class="animation-manager-demo__metadata">
        <span><strong>目标能力：</strong>{{ selectedEntry.targetCapability.join(' + ') }}</span>
        <span><strong>写入域：</strong>{{ selectedEntry.writeDomains.join(' + ') }}</span>
        <span><strong>兼容 Shape：</strong>{{ selectedEntry.supportedShapeTypes.join('、') }}</span>
      </div>

      <div v-if="selectedType === 'highlight'" class="animation-manager-demo__options">
        <span>highlight mode</span>
        <el-radio-group v-model="highlightMode" aria-label="highlight 模式">
          <el-radio-button value="steady">steady 稳定</el-radio-button>
          <el-radio-button value="breathe">breathe 呼吸</el-radio-button>
        </el-radio-group>
      </div>
      <div v-else-if="selectedType === 'grow'" class="animation-manager-demo__options">
        <span>FineArrow 揭示方向</span>
        <el-radio-group v-model="growDirection" aria-label="FineArrow 揭示方向">
          <el-radio-button value="forward">forward 正向</el-radio-button>
          <el-radio-button value="reverse">reverse 反向</el-radio-button>
        </el-radio-group>
      </div>
      <div v-else-if="selectedType === 'fade'" class="animation-manager-demo__options">
        <span>fade 生命周期</span>
        <el-radio-group v-model="fadeDirection" aria-label="fade 生命周期">
          <el-radio-button value="out">out · retain</el-radio-button>
          <el-radio-button value="in">in · remove</el-radio-button>
        </el-radio-group>
      </div>
      <div v-else-if="selectedType === 'radar-scan'" class="animation-manager-demo__radial-options animation-manager-demo__radial-options--radar">
        <div class="animation-manager-demo__options">
          <span>Sector 扫描方式</span>
          <el-radio-group v-model="radarScanMode" aria-label="Sector 扫描方式" @change="applyRunningRadialOptions('radar-scan')">
            <el-radio-button value="one-way">单向</el-radio-button>
            <el-radio-button value="round-trip">往复</el-radio-button>
          </el-radio-group>
        </div>
        <div class="animation-manager-demo__options">
          <span>Sector 首程方向</span>
          <el-radio-group v-model="radarDirection" aria-label="Sector 首程方向" @change="applyRunningRadialOptions('radar-scan')">
            <el-radio-button value="clockwise">顺时针</el-radio-button>
            <el-radio-button value="counterclockwise">逆时针</el-radio-button>
          </el-radio-group>
        </div>
        <div class="animation-manager-demo__options">
          <span>尾迹</span>
          <el-radio-group v-model="radarTrailStyle" aria-label="雷达尾迹样式" @change="applyRunningRadialOptions('radar-scan')">
            <el-radio-button value="gradient">三段 gradient</el-radio-button>
            <el-radio-button value="solid">纯色</el-radio-button>
          </el-radio-group>
        </div>
        <div class="animation-manager-demo__colors">
          <label v-if="radarTrailStyle === 'solid'"
            ><span>纯色</span><el-color-picker v-model="radarColor" show-alpha @change="applyRunningRadialOptions('radar-scan')"
          /></label>
          <template v-else>
            <label><span>尾端 0</span><el-color-picker v-model="radarGradientTail" show-alpha @change="applyRunningRadialOptions('radar-scan')" /></label>
            <label><span>中段 0.6</span><el-color-picker v-model="radarGradientMiddle" show-alpha @change="applyRunningRadialOptions('radar-scan')" /></label>
            <label><span>前沿 1</span><el-color-picker v-model="radarGradientFront" show-alpha @change="applyRunningRadialOptions('radar-scan')" /></label>
          </template>
        </div>
      </div>
      <div v-else-if="selectedType === 'center-spread'" class="animation-manager-demo__radial-options">
        <div class="animation-manager-demo__options">
          <span>Circle 波纹带</span>
          <el-radio-group v-model="centerSpreadTrailStyle" aria-label="Circle 波纹带样式" @change="applyRunningRadialOptions('center-spread')">
            <el-radio-button value="gradient">三段 gradient</el-radio-button>
            <el-radio-button value="solid">纯色</el-radio-button>
          </el-radio-group>
        </div>
        <div class="animation-manager-demo__colors">
          <label v-if="centerSpreadTrailStyle === 'solid'"
            ><span>纯色</span><el-color-picker v-model="centerSpreadColor" show-alpha @change="applyRunningRadialOptions('center-spread')"
          /></label>
          <template v-else>
            <label
              ><span>内侧 0</span><el-color-picker v-model="centerSpreadGradientTail" show-alpha @change="applyRunningRadialOptions('center-spread')"
            /></label>
            <label
              ><span>中段 0.6</span><el-color-picker v-model="centerSpreadGradientMiddle" show-alpha @change="applyRunningRadialOptions('center-spread')"
            /></label>
            <label
              ><span>前沿 1</span><el-color-picker v-model="centerSpreadGradientFront" show-alpha @change="applyRunningRadialOptions('center-spread')"
            /></label>
          </template>
          <label
            ><span>opacity</span
            ><el-input-number v-model="centerSpreadOpacity" :min="0" :max="1" :step="0.05" :precision="2" @change="applyRunningRadialOptions('center-spread')"
          /></label>
          <label
            ><span>trailLength</span
            ><el-input-number
              v-model="centerSpreadTrailLength"
              :min="0"
              :max="1"
              :step="0.02"
              :precision="2"
              @change="applyRunningRadialOptions('center-spread')"
          /></label>
        </div>
      </div>

      <div class="animation-manager-demo__gradient-summary" aria-label="渐变效果覆盖">
        <span>gradient 覆盖：</span>
        <el-tag size="small">path-travel 路径尾迹</el-tag>
        <el-tag size="small" type="success">radar-scan 扫描尾迹</el-tag>
        <el-tag size="small" type="warning">center-spread 径向波纹</el-tag>
      </div>

      <div class="example-demo__action-group animation-manager-demo__scenarios" aria-label="组合与冲突实验">
        <span>组合与冲突：</span>
        <div class="example-demo__action-buttons">
          <el-button size="small" @click="playComposition">组合 highlight + alert</el-button>
          <el-button size="small" @click="playReplace">同 channel replace</el-button>
          <el-button size="small" @click="playGrowConflict">双 grow 冲突</el-button>
        </div>
      </div>

      <div class="example-demo__action-row animation-manager-demo__toolbar">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="start">启动所选</el-button>
            <el-button :disabled="!canPause" @click="pause">暂停</el-button>
            <el-button :disabled="!canResume" @click="resume">恢复</el-button>
            <el-button :disabled="!canStop" @click="stop">停止当前</el-button>
            <el-button plain @click="stopAll">停止全部</el-button>
            <el-button plain @click="focusSelected">定位所选</el-button>
          </div>
        </div>
        <div class="example-demo__feedback animation-manager-demo__status" aria-live="polite">
          <el-tag :type="status === 'running' ? 'success' : status === 'paused' ? 'warning' : 'info'">{{ statusLabel }}</el-tag>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage animation-manager-demo__stage"></div>
    <div class="animation-manager-demo__target-grid" aria-label="十种动画独立目标">
      <el-button
        v-for="effect in effectOptions"
        :key="effect.type"
        class="animation-manager-demo__target-button"
        :class="{ 'is-selected': selectedType === effect.type }"
        :aria-pressed="selectedType === effect.type"
        @click="selectEffect(effect.type, true)"
      >
        <code>{{ effect.type }}</code>
        <span>{{ targetLabels[effect.type] }}</span>
      </el-button>
    </div>
    <p class="animation-manager-demo__feedback" aria-live="polite">{{ feedback }}</p>
    <p class="animation-manager-demo__hint">
      上排和下排共十个独立目标，不再复用重叠几何。普通模式只保留最近效果；显式组合模式仅对 blink、highlight、alert、fade 开放，并把它们放到共享 Polygon 上验证跨
      channel 合成。fade-out 自然完成后保留最后一帧，点击“停止当前/全部”清理 retained 资源。
    </p>
  </div>
</template>

<style scoped>
.animation-manager-demo__controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.animation-manager-demo__controls label,
.animation-manager-demo__colors label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--doc-muted);
  font-size: 12px;
}

.animation-manager-demo__switch {
  align-content: start;
}

.animation-manager-demo__metadata {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  background: var(--doc-surface-soft);
  color: var(--doc-muted);
  font-size: 12px;
  line-height: 1.6;
}

.animation-manager-demo__options,
.animation-manager-demo__gradient-summary,
.animation-manager-demo__scenarios {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  color: var(--doc-muted);
  font-size: 13px;
}

.animation-manager-demo__radial-options {
  padding: 10px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  background: var(--doc-surface-soft);
}

.animation-manager-demo__radial-options .animation-manager-demo__options {
  margin-bottom: 8px;
}

.animation-manager-demo__radial-options--radar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 14px 12px;
  padding: 14px;
}

.animation-manager-demo__radial-options--radar .animation-manager-demo__options {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 8px;
  min-width: 0;
  margin: 0;
}

.animation-manager-demo__radial-options--radar .animation-manager-demo__options > span {
  color: var(--doc-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.animation-manager-demo__radial-options--radar :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.animation-manager-demo__radial-options--radar :deep(.el-radio-button__inner) {
  border: 1px solid var(--el-border-color) !important;
  border-radius: 6px !important;
  box-shadow: none !important;
}

.animation-manager-demo__radial-options--radar :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  border-color: var(--el-color-primary) !important;
}

.animation-manager-demo__radial-options--radar .animation-manager-demo__colors {
  grid-column: 1 / -1;
  gap: 10px 14px;
  padding-top: 12px;
  border-top: 1px solid var(--doc-border);
}

.animation-manager-demo__radial-options--radar .animation-manager-demo__colors label {
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--doc-border);
  border-radius: 6px;
  background: var(--doc-surface);
}

.animation-manager-demo__colors {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px 18px;
}

.animation-manager-demo__colors label {
  display: flex;
  align-items: center;
}

.animation-manager-demo__toolbar {
  align-items: center;
}

.animation-manager-demo__stage {
  height: 470px;
  background: linear-gradient(var(--doc-border) 1px, transparent 1px), linear-gradient(90deg, var(--doc-border) 1px, transparent 1px), var(--doc-surface);
  background-size: 32px 32px;
}

.animation-manager-demo__target-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.animation-manager-demo__target-button.el-button {
  display: grid;
  width: 100%;
  height: auto;
  gap: 3px;
  margin: 0;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  background: var(--doc-surface);
  color: var(--doc-muted);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.animation-manager-demo__target-button.el-button:hover,
.animation-manager-demo__target-button.el-button.is-selected {
  border-color: var(--doc-primary);
  background: var(--doc-primary-soft);
}

.animation-manager-demo__target-button.el-button:focus-visible {
  outline: 2px solid var(--doc-primary-deep);
  outline-offset: 2px;
}

.animation-manager-demo__target-button.el-button code {
  overflow: hidden;
  color: var(--doc-primary-deep);
  font-size: 11px;
  text-overflow: ellipsis;
}

.animation-manager-demo__target-button.el-button span {
  font-size: 11px;
}

:deep(.animation-manager-demo__target-button.el-button > span) {
  display: grid;
  width: 100%;
  min-width: 0;
  justify-items: start;
  gap: 3px;
}

.animation-manager-demo__feedback,
.animation-manager-demo__hint {
  margin: 10px 0 0;
  color: var(--doc-muted);
  font-size: 13px;
  line-height: 1.7;
}

.animation-manager-demo__feedback {
  color: var(--doc-text);
}

@media (max-width: 1100px) {
  .animation-manager-demo__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .animation-manager-demo__target-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .animation-manager-demo__controls,
  .animation-manager-demo__target-grid {
    grid-template-columns: 1fr;
  }

  .animation-manager-demo__stage {
    height: 380px;
  }
}
</style>
