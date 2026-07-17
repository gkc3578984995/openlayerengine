<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue';
import { Earth, type AnimationHandle, type AnimationSpec, type AnimationStatus, type AnimationType } from '@vrsim/earth-engine-ol';
import {
  animationEffectManifest,
  animationEffectManifestByType,
  type AnimationDemoTargetKey,
  type AnimationManifestDemoControls
} from '../../../.test/animationEffectManifest';
import '@vrsim/earth-engine-ol/style.css';

type FadeDirection = 'in' | 'out';
type GrowDirection = 'forward' | 'reverse';
type RadarDirection = 'clockwise' | 'counterclockwise';
type RadialTrailStyle = 'solid' | 'gradient';

const targetCatalog: Record<AnimationDemoTargetKey, { readonly id: string; readonly label: string }> = {
  point: { id: 'animation-demo-point', label: 'Point 点' },
  area: { id: 'animation-demo-area', label: 'Polygon 闭合面' },
  line: { id: 'animation-demo-line', label: 'Polyline 路径' },
  arrow: { id: 'animation-demo-arrow', label: 'FineArrow 箭头' },
  circle: { id: 'animation-demo-circle', label: 'Circle 圆形' },
  sector: { id: 'animation-demo-sector', label: 'Sector 扇面' }
};

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const latestHandle = shallowRef<AnimationHandle | null>(null);
const activeHandles = new Set<AnimationHandle>();
const selectedType = ref<AnimationType>('radar-scan');
const selectedTarget = ref<AnimationDemoTargetKey>('circle');
const channel = ref('');
const fadeDirection = ref<FadeDirection>('out');
const growDirection = ref<GrowDirection>('forward');
const radarDirection = ref<RadarDirection>('clockwise');
const radarTrailStyle = ref<RadialTrailStyle>('gradient');
const radarColor = ref('#00e676');
const radarGradientTail = ref('rgba(0, 230, 118, 0.05)');
const radarGradientMiddle = ref('rgba(0, 230, 118, 0.45)');
const radarGradientFront = ref('rgba(0, 230, 118, 1)');
const centerSpreadTrailStyle = ref<RadialTrailStyle>('gradient');
const centerSpreadColor = ref('#00e676');
const centerSpreadGradientTail = ref('rgba(0, 230, 118, 0.05)');
const centerSpreadGradientMiddle = ref('rgba(0, 230, 118, 0.45)');
const centerSpreadGradientFront = ref('rgba(0, 230, 118, 1)');
const centerSpreadOpacity = ref(0.7);
const centerSpreadTrailLength = ref(0.18);
const handleStatus = ref<AnimationStatus>('stopped');

const effectOptions = animationEffectManifest.map(({ animationType: type, label }) => ({ type, label }));
const availableTargets = computed(() => animationEffectManifestByType[selectedType.value].demoTargets.map((key) => ({ key, ...targetCatalog[key] })));
const statusLabel = computed(() => ({ running: '运行中', paused: '已暂停', stopped: '已停止', finished: '已自然完成' })[handleStatus.value]);

watch(selectedType, (type) => {
  if (type === 'center-spread') {
    selectedTarget.value = 'sector';
    return;
  }
  const targets = animationEffectManifestByType[type].demoTargets;
  if (!targets.some((target) => target === selectedTarget.value)) selectedTarget.value = targets[0];
});

const controls = (): AnimationManifestDemoControls => ({
  fadeDirection: fadeDirection.value,
  growDirection: growDirection.value,
  radarDirection: radarDirection.value,
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

const start = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const entry = animationEffectManifestByType[selectedType.value];
  const targetId = targetCatalog[selectedTarget.value].id;
  const currentControls = controls();
  if (selectedType.value === 'fade' && currentControls.fadeDirection === 'in') earth.elements.show({ id: targetId });
  const baseSpec = entry.createDemoSpec(currentControls);
  const selectedChannel = channel.value.trim();
  const spec = (selectedChannel.length === 0 ? baseSpec : { ...baseSpec, channel: selectedChannel }) as AnimationSpec;
  const handle = earth.animations.play({ id: targetId }, spec);
  latestHandle.value = handle;
  activeHandles.add(handle);
  handleStatus.value = handle.status;
  void handle.finished.then(() => {
    activeHandles.delete(handle);
    if (latestHandle.value === handle) handleStatus.value = handle.status;
  });
};

const pause = () => {
  latestHandle.value?.pause();
  if (latestHandle.value !== null) handleStatus.value = latestHandle.value.status;
};

const resume = () => {
  latestHandle.value?.resume();
  if (latestHandle.value !== null) handleStatus.value = latestHandle.value.status;
};

const stop = () => {
  latestHandle.value?.stop();
  if (latestHandle.value !== null) handleStatus.value = latestHandle.value.status;
};

const stopAll = () => {
  for (const handle of activeHandles) handle.stop();
  earthRef.value?.animations.stopAll();
  activeHandles.clear();
  latestHandle.value = null;
  handleStatus.value = 'stopped';
};

const addDemoElements = (earth: Earth) => {
  earth.elements.add({
    id: targetCatalog.point.id,
    geometry: { type: 'point', controlPoints: [[-5_600_000, -2_800_000]] },
    style: {
      symbol: { type: 'circle', radius: 8, fill: { type: 'solid', color: '#ff3b30' }, stroke: { color: '#ffffff', width: 2 } },
      text: {
        text: 'Point',
        fontSize: 13,
        offsetY: 22,
        fill: { type: 'solid', color: '#263238' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.86)' },
        padding: [3, 6, 3, 6]
      }
    }
  });
  earth.elements.add({
    id: targetCatalog.area.id,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [-6_200_000, 2_300_000],
        [-3_100_000, 2_100_000],
        [-3_500_000, 4_500_000],
        [-5_900_000, 4_700_000]
      ]
    },
    style: {
      strokes: [{ color: '#7c3aed', width: 3 }],
      fill: { type: 'solid', color: 'rgba(124,58,237,0.22)' },
      text: { text: '闭合面', fontSize: 14, fill: { type: 'solid', color: '#4c1d95' } }
    }
  });
  earth.elements.add({
    id: targetCatalog.line.id,
    geometry: {
      type: 'polyline',
      controlPoints: [
        [-6_100_000, 400_000],
        [-4_700_000, 1_200_000],
        [-3_200_000, -100_000]
      ]
    },
    style: {
      strokes: [{ color: '#0284c7', width: 4 }],
      text: {
        text: 'Polyline',
        placement: 'line',
        fontSize: 13,
        fill: { type: 'solid', color: '#075985' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.82)' },
        padding: [2, 5, 2, 5]
      }
    }
  });
  earth.elements.add({
    id: targetCatalog.arrow.id,
    geometry: {
      type: 'fine-arrow',
      controlPoints: [
        [-600_000, 3_000_000],
        [2_600_000, 4_300_000]
      ]
    },
    style: {
      strokes: [{ color: '#ea580c', width: 2 }],
      fill: { type: 'solid', color: 'rgba(249,115,22,0.4)' },
      text: { text: 'Arrow', fontSize: 13, fill: { type: 'solid', color: '#9a3412' } }
    }
  });
  earth.elements.add({
    id: targetCatalog.circle.id,
    geometry: { type: 'circle', center: [4_500_000, 1_900_000], radius: 1_250_000 },
    style: {
      strokes: [{ color: '#0891b2', width: 3 }],
      fill: { type: 'solid', color: 'rgba(6,182,212,0.16)' },
      text: { text: 'Circle', fontSize: 14, fill: { type: 'solid', color: '#155e75' } }
    }
  });
  earth.elements.add({
    id: targetCatalog.sector.id,
    geometry: {
      type: 'sector',
      controlPoints: [
        [2_600_000, -3_400_000],
        [4_900_000, -3_400_000],
        [2_600_000, -1_100_000]
      ]
    },
    style: {
      strokes: [{ color: '#059669', width: 3 }],
      fill: { type: 'solid', color: 'rgba(16,185,129,0.18)' },
      text: { text: 'Sector', fontSize: 14, fill: { type: 'solid', color: '#065f46' } }
    }
  });
};

onMounted(() => {
  const earth = new Earth({
    target: mapId,
    view: { center: [0, 0], zoom: 3 },
    controls: { attribution: false, rotate: false }
  });
  earthRef.value = earth;
  addDemoElements(earth);
  earth.map.renderSync();
});

onBeforeUnmount(() => {
  stopAll();
  const earth = earthRef.value;
  earthRef.value = null;
  earth?.elements.clear();
  earth?.destroy();
});
</script>

<template>
  <div class="example-demo animation-demo">
    <el-alert
      class="example-demo__alert"
      title="光敏提示：闪烁、呼吸和告警可能引发不适；示例不会自动播放，请在确认后手动启动。"
      type="warning"
      show-icon
      :closable="false"
    />

    <div class="animation-demo__controls">
      <label>
        <span>效果</span>
        <el-select v-model="selectedType" aria-label="动画效果">
          <el-option v-for="effect in effectOptions" :key="effect.type" :label="effect.label" :value="effect.type" />
        </el-select>
      </label>
      <label>
        <span>目标</span>
        <el-select v-model="selectedTarget" aria-label="动画目标">
          <el-option v-for="target in availableTargets" :key="target.key" :label="target.label" :value="target.key" />
        </el-select>
      </label>
      <label>
        <span>channel（留空使用 type）</span>
        <el-input v-model="channel" clearable placeholder="例如 attention" aria-label="动画 channel" />
      </label>
    </div>

    <div v-if="selectedType === 'fade'" class="animation-demo__option-row">
      <span>渐变方向</span>
      <el-radio-group v-model="fadeDirection">
        <el-radio-button value="out">渐隐 out</el-radio-button>
        <el-radio-button value="in">渐显 in</el-radio-button>
      </el-radio-group>
    </div>
    <div v-else-if="selectedType === 'grow'" class="animation-demo__option-row">
      <span>揭示方向</span>
      <el-radio-group v-model="growDirection">
        <el-radio-button value="forward">正向 forward</el-radio-button>
        <el-radio-button value="reverse">反向 reverse</el-radio-button>
      </el-radio-group>
    </div>
    <div v-else-if="selectedType === 'radar-scan'" class="animation-demo__radial-options">
      <div class="animation-demo__option-row">
        <span>扫描方向</span>
        <el-radio-group v-model="radarDirection">
          <el-radio-button value="clockwise">顺时针</el-radio-button>
          <el-radio-button value="counterclockwise">逆时针</el-radio-button>
        </el-radio-group>
      </div>
      <div class="animation-demo__option-row">
        <span>尾迹样式</span>
        <el-radio-group v-model="radarTrailStyle">
          <el-radio-button value="gradient">绿色渐变</el-radio-button>
          <el-radio-button value="solid">纯色</el-radio-button>
        </el-radio-group>
      </div>
      <div class="animation-demo__radial-colors">
        <label v-if="radarTrailStyle === 'solid'">
          <span>纯色尾迹</span>
          <el-color-picker v-model="radarColor" show-alpha aria-label="雷达纯色尾迹" />
        </label>
        <template v-else>
          <label>
            <span>最旧尾端（offset 0）</span>
            <el-color-picker v-model="radarGradientTail" show-alpha aria-label="雷达渐变最旧尾端" />
          </label>
          <label>
            <span>渐变中段（offset 0.6）</span>
            <el-color-picker v-model="radarGradientMiddle" show-alpha aria-label="雷达渐变中段" />
          </label>
          <label>
            <span>扫描前沿（offset 1）</span>
            <el-color-picker v-model="radarGradientFront" show-alpha aria-label="雷达渐变扫描前沿" />
          </label>
        </template>
      </div>
    </div>
    <div v-else-if="selectedType === 'center-spread'" class="animation-demo__radial-options">
      <div class="animation-demo__option-row">
        <span>波纹带样式</span>
        <el-radio-group v-model="centerSpreadTrailStyle">
          <el-radio-button value="gradient">绿色渐变</el-radio-button>
          <el-radio-button value="solid">纯色</el-radio-button>
        </el-radio-group>
      </div>
      <div class="animation-demo__radial-colors">
        <label v-if="centerSpreadTrailStyle === 'solid'">
          <span>纯色波纹带</span>
          <el-color-picker v-model="centerSpreadColor" show-alpha aria-label="中心扩散纯色波纹带" />
        </label>
        <template v-else>
          <label>
            <span>内侧旧尾迹（offset 0）</span>
            <el-color-picker v-model="centerSpreadGradientTail" show-alpha aria-label="中心扩散渐变内侧旧尾迹" />
          </label>
          <label>
            <span>渐变中段（offset 0.6）</span>
            <el-color-picker v-model="centerSpreadGradientMiddle" show-alpha aria-label="中心扩散渐变中段" />
          </label>
          <label>
            <span>外侧波纹前沿（offset 1）</span>
            <el-color-picker v-model="centerSpreadGradientFront" show-alpha aria-label="中心扩散渐变外侧波纹前沿" />
          </label>
        </template>
      </div>
      <div class="animation-demo__radial-numbers">
        <label>
          <span>整体透明度 opacity</span>
          <el-input-number v-model="centerSpreadOpacity" :min="0" :max="1" :step="0.05" :precision="2" aria-label="中心扩散整体透明度" />
        </label>
        <label>
          <span>径向尾迹比例 trailLength</span>
          <el-input-number v-model="centerSpreadTrailLength" :min="0" :max="1" :step="0.01" :precision="2" aria-label="中心扩散径向尾迹比例" />
        </label>
        <span class="example-demo__hint">设为 0 可对照旧版线环</span>
      </div>
    </div>

    <div class="example-demo__toolbar animation-demo__toolbar">
      <el-button type="primary" @click="start">启动</el-button>
      <el-button :disabled="latestHandle === null" @click="pause">暂停</el-button>
      <el-button :disabled="latestHandle === null" @click="resume">恢复</el-button>
      <el-button :disabled="latestHandle === null" @click="stop">停止当前</el-button>
      <el-button plain @click="stopAll">停止全部</el-button>
      <span class="example-demo__hint" aria-live="polite">最近句柄：{{ statusLabel }}</span>
    </div>

    <div :id="mapId" class="example-stage animation-demo__stage"></div>
    <p class="animation-demo__footnote">
      radar-scan 的渐变从最旧尾端（offset 0）过渡到扫描前沿（offset 1）；center-spread 的渐变从内侧旧尾迹（offset 0）过渡到外侧波纹前沿（offset 1），并默认在
      Sector 上展示径向波纹带。两种效果的纯色与渐变均为二选一。示例不会自动播放；不同效果使用同一 channel 时，后启动者会原子替换前者。
    </p>
  </div>
</template>

<style scoped>
.animation-demo__controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.animation-demo__controls label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--doc-muted);
  font-size: 12px;
}

.animation-demo__option-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--doc-muted);
  font-size: 13px;
}

.animation-demo__radial-options {
  margin-bottom: 12px;
}

.animation-demo__radial-options .animation-demo__option-row {
  margin-bottom: 8px;
}

.animation-demo__radial-colors,
.animation-demo__radial-numbers {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 8px;
  background: var(--doc-surface-soft);
}

.animation-demo__radial-colors label,
.animation-demo__radial-numbers label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--doc-muted);
  font-size: 12px;
}

.animation-demo__radial-numbers {
  align-items: center;
  margin-top: 8px;
}

.animation-demo__toolbar {
  align-items: center;
}

.animation-demo__stage {
  background: linear-gradient(var(--doc-border) 1px, transparent 1px), linear-gradient(90deg, var(--doc-border) 1px, transparent 1px), var(--doc-surface);
  background-size: 32px 32px;
}

.animation-demo__footnote {
  margin: 12px 0 0;
  color: var(--doc-muted);
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 760px) {
  .animation-demo__controls {
    grid-template-columns: 1fr;
  }
}
</style>
