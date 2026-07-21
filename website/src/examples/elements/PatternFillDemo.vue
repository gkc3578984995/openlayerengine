<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, PatternFillSpec, StylePatch, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

type PatternName = PatternFillSpec['pattern'];
type PatternSize = 4 | 8 | 16 | 32 | 64 | 128;
type PreviewMode = 'wide' | 'narrow';

const EARTH_ID = 'docs-elements-pattern-fill';
const LAYER_ID = 'pattern-fill-elements';
const PREVIEW_ZOOM = 7;
const NARROW_PREVIEW_ZOOM = 6.25;
const patterns = [
  { value: 'diagonal', label: '斜线 diagonal', mapLabel: '斜线' },
  { value: 'cross', label: '交叉 cross', mapLabel: '交叉' },
  { value: 'dot', label: '圆点 dot', mapLabel: '圆点' },
  { value: 'horizontal', label: '水平 horizontal', mapLabel: '水平' },
  { value: 'vertical', label: '垂直 vertical', mapLabel: '垂直' }
] as const satisfies readonly { value: PatternName; label: string; mapLabel: string }[];
const patternSizes = [4, 8, 16, 32, 64, 128] as const satisfies readonly PatternSize[];
const galleryPositions = [
  [115, 40.75],
  [116.45, 40.75],
  [117.9, 40.75],
  [115.75, 39.95],
  [117.2, 39.95]
] as const;

const previewIds = ['pattern-preview-polygon', 'pattern-preview-symbol', 'pattern-preview-text-fill', 'pattern-preview-text-background'] as const;
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const focusCenter = shallowRef<Coordinate | null>(null);
const previewMode = ref<PreviewMode>('wide');
const selectedPattern = ref<PatternName>('diagonal');
const foreground = ref<string | null>('#2563eb');
const background = ref<string | null>('rgba(255, 255, 255, 0.78)');
const size = ref<PatternSize>(16);
const lineWidth = ref(3);
const dotRadius = ref(3);
const latestAction = ref<'set' | 'patch'>('set');
let previewResizeObserver: ResizeObserver | null = null;

const selectedPatternLabel = computed(() => patterns.find(({ value }) => value === selectedPattern.value)?.label ?? selectedPattern.value);
const previewModeForWidth = (width: number): PreviewMode => (width <= 520 ? 'narrow' : 'wide');
const previewZoomForMode = (mode: PreviewMode) => (mode === 'narrow' ? NARROW_PREVIEW_ZOOM : PREVIEW_ZOOM);
const previewZoom = () => previewZoomForMode(mapTarget.value === null ? previewMode.value : previewModeForWidth(mapTarget.value.clientWidth));

const patternFill = (): PatternFillSpec => ({
  type: 'pattern',
  pattern: selectedPattern.value,
  color: foreground.value ?? '#2563eb',
  size: size.value,
  ...(selectedPattern.value === 'dot' ? { dotRadius: dotRadius.value } : { lineWidth: lineWidth.value }),
  backgroundColor: background.value ?? 'rgba(255, 255, 255, 0.78)'
});

const patternPatch = (): Omit<PatternFillSpec, 'type' | 'pattern'> => ({
  color: foreground.value ?? '#2563eb',
  size: size.value,
  ...(selectedPattern.value === 'dot' ? { dotRadius: dotRadius.value } : { lineWidth: lineWidth.value }),
  backgroundColor: background.value ?? 'rgba(255, 255, 255, 0.78)'
});

const polygonAround = (earth: Earth, longitude: number, latitude: number, dx = 0.23, dy = 0.18) =>
  earth.view.toProjectedCoordinates([
    [longitude - dx, latitude - dy],
    [longitude + dx, latitude - dy],
    [longitude + dx, latitude + dy],
    [longitude - dx, latitude + dy]
  ]);

const galleryStyle = (pattern: PatternName, label: string): StyleSpec => ({
  fill: {
    type: 'pattern',
    pattern,
    color: '#2563eb',
    size: 16,
    lineWidth: 2,
    dotRadius: 2.6,
    backgroundColor: 'rgba(239, 246, 255, 0.88)'
  },
  strokes: [{ color: '#1d4ed8', width: 2 }],
  text: {
    text: label,
    fontSize: 13,
    fontWeight: 'bold',
    fill: { type: 'solid', color: '#0f172a' },
    stroke: { color: '#ffffff', width: 3 },
    backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.86)' },
    padding: [4, 7, 4, 7]
  }
});

const addGallery = (earth: Earth) => {
  patterns.forEach(({ value, mapLabel }, index) => {
    const [longitude, latitude] = galleryPositions[index] ?? [116.45, 40.75];
    earth.elements.add({
      id: `pattern-gallery-${value}`,
      layerId: LAYER_ID,
      module: 'pattern-gallery',
      geometry: { type: 'polygon', controlPoints: polygonAround(earth, longitude, latitude, 0.28, 0.18) },
      style: galleryStyle(value, mapLabel)
    });
  });
};

const addPreviewTargets = (earth: Earth) => {
  earth.elements.add({
    id: previewIds[0],
    layerId: LAYER_ID,
    module: 'pattern-preview',
    geometry: { type: 'polygon', controlPoints: polygonAround(earth, 115.2, 38.9, 0.38, 0.25) }
  });
  earth.elements.add({
    id: previewIds[1],
    layerId: LAYER_ID,
    module: 'pattern-preview',
    geometry: { type: 'point', controlPoints: earth.view.toProjectedCoordinates([[117.7, 38.9]]) }
  });
  earth.elements.add({
    id: previewIds[2],
    layerId: LAYER_ID,
    module: 'pattern-preview',
    geometry: { type: 'point', controlPoints: earth.view.toProjectedCoordinates([[115.2, 37.85]]) }
  });
  earth.elements.add({
    id: previewIds[3],
    layerId: LAYER_ID,
    module: 'pattern-preview',
    geometry: { type: 'point', controlPoints: earth.view.toProjectedCoordinates([[117.7, 37.85]]) }
  });
};

// #region pattern-fill-set
const applyPattern = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const fill = patternFill();

  earth.styles.set(
    { id: previewIds[0] },
    {
      fill,
      strokes: [{ color: '#0f766e', width: 3 }],
      text: {
        text: 'Polygon.fill',
        fontSize: 14,
        fontWeight: 'bold',
        fill: { type: 'solid', color: '#0f172a' },
        stroke: { color: '#ffffff', width: 3 }
      }
    }
  );
  earth.styles.set(
    { id: previewIds[1] },
    {
      symbol: { type: 'circle', radius: 34, fill, stroke: { color: '#0f766e', width: 4 } },
      text: {
        text: 'CircleSymbol.fill',
        fontSize: 13,
        offsetY: 52,
        fill: { type: 'solid', color: '#0f172a' },
        stroke: { color: '#ffffff', width: 3 }
      }
    }
  );
  earth.styles.set(
    { id: previewIds[2] },
    {
      text: {
        text: 'Text.fill',
        fontSize: 27,
        fontWeight: 'bold',
        fill,
        stroke: { color: '#ffffff', width: 4 },
        backgroundFill: { type: 'solid', color: 'rgba(15, 23, 42, 0.88)' },
        backgroundStroke: { color: 'rgba(255, 255, 255, 0.92)', width: 2 },
        padding: [8, 10, 8, 10]
      }
    }
  );
  earth.styles.set(
    { id: previewIds[3] },
    {
      text: {
        text: 'Text.backgroundFill',
        fontSize: 17,
        fontWeight: 'bold',
        fill: { type: 'solid', color: '#0f172a' },
        stroke: { color: '#ffffff', width: 2 },
        backgroundFill: fill,
        backgroundStroke: { color: '#0f766e', width: 2 },
        padding: [12, 14, 12, 14]
      }
    }
  );
  latestAction.value = 'set';
};
// #endregion pattern-fill-set

// #region pattern-fill-patch
const patchPatternParameters = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const patch = patternPatch();
  const patches: readonly [string, StylePatch][] = [
    [previewIds[0], { fill: patch }],
    [previewIds[1], { symbol: { fill: patch } }],
    [previewIds[2], { text: { fill: patch } }],
    [previewIds[3], { text: { backgroundFill: patch } }]
  ];
  for (const [id, stylePatch] of patches) earth.styles.patch({ id }, stylePatch);
  latestAction.value = 'patch';
};
// #endregion pattern-fill-patch

const focus = () => {
  const earth = earthRef.value;
  const center = focusCenter.value;
  if (earth === null || center === null) return;
  earth.view.animateFlyTo(center, { zoom: previewZoom(), duration: 450 });
};

const reset = () => {
  selectedPattern.value = 'diagonal';
  foreground.value = '#2563eb';
  background.value = 'rgba(255, 255, 255, 0.78)';
  size.value = 16;
  lineWidth.value = 3;
  dotRadius.value = 3;
  applyPattern();
  focus();
};

defineExpose({ reset, focus });

onMounted(() => {
  if (mapTarget.value === null) return;
  previewMode.value = previewModeForWidth(mapTarget.value.clientWidth);
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: previewZoom() },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.42 });
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 30, declutter: false });
  focusCenter.value = earth.view.toProjectedCoordinates([116.45, 39.3]);
  earthRef.value = earth;
  addGallery(earth);
  addPreviewTargets(earth);
  applyPattern();
  focus();

  previewResizeObserver = new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    const nextMode = previewModeForWidth(entry.contentRect.width);
    if (nextMode === previewMode.value) return;
    previewMode.value = nextMode;
    earth.view.setZoom(previewZoomForMode(nextMode));
  });
  previewResizeObserver.observe(mapTarget.value);
});

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect();
  previewResizeObserver = null;
  earthRef.value?.destroy();
  earthRef.value = null;
  focusCenter.value = null;
});
</script>

<template>
  <div class="example-demo pattern-fill-demo" :data-preview-mode="previewMode">
    <div class="example-demo__control-panel pattern-fill-demo__control-panel">
      <el-alert
        class="pattern-fill-demo__alert"
        type="info"
        :closable="false"
        show-icon
        title="纹理尺寸使用 4 / 8 / 16 / 32 / 64 / 128 六档缓存值；dot 调整圆点半径，其余纹理调整线宽。"
      />
      <div class="example-demo__control-grid pattern-fill-demo__controls">
        <el-form-item label="纹理类型">
          <el-select v-model="selectedPattern" aria-label="纹理类型" @change="applyPattern">
            <el-option v-for="item in patterns" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="前景色">
          <el-color-picker v-model="foreground" show-alpha aria-label="纹理前景色" />
        </el-form-item>
        <el-form-item label="背景色">
          <el-color-picker v-model="background" show-alpha aria-label="纹理背景色" />
        </el-form-item>
        <el-form-item label="单元尺寸（离散）">
          <el-select v-model="size" aria-label="纹理单元尺寸">
            <el-option v-for="item in patternSizes" :key="item" :label="`${item}px`" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="selectedPattern !== 'dot'" label="线宽">
          <el-slider v-model="lineWidth" :min="1" :max="8" :step="0.5" show-input aria-label="纹理线宽" />
        </el-form-item>
        <el-form-item v-else label="圆点半径">
          <el-slider v-model="dotRadius" :min="1" :max="8" :step="0.5" show-input aria-label="纹理圆点半径" />
        </el-form-item>
      </div>

      <div class="example-demo__action-row pattern-fill-demo__actions">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons pattern-fill-demo__action-buttons">
            <el-button type="primary" @click="applyPattern">应用 styles.set()</el-button>
            <el-button @click="patchPatternParameters">应用 styles.patch()</el-button>
          </div>
        </div>
        <div class="example-demo__feedback pattern-fill-demo__status" aria-label="纹理示例当前状态">
          <el-tag effect="plain">{{ selectedPatternLabel }}</el-tag>
          <el-tag :type="latestAction === 'set' ? 'success' : 'warning'" effect="plain">最近操作：{{ latestAction }}</el-tag>
        </div>
      </div>
    </div>

    <div class="pattern-fill-demo__stage-wrap">
      <div ref="mapTarget" class="example-stage pattern-fill-demo__stage"></div>
      <div class="pattern-fill-demo__legend">
        <span><strong>纹理画廊：</strong>地图上部按 3 + 2 排列五种纹理。</span>
        <span><strong>应用目标：</strong>地图下部按 2 + 2 展示 Polygon、CircleSymbol、Text.fill 与 Text.backgroundFill。</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pattern-fill-demo {
  container: pattern-fill / inline-size;
}

.pattern-fill-demo__alert {
  margin: 0;
}

.pattern-fill-demo__controls {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 14px 16px;
}

.pattern-fill-demo__controls :deep(.el-form-item) {
  margin: 0;
}

.pattern-fill-demo__controls :deep(.el-select),
.pattern-fill-demo__controls :deep(.el-slider) {
  width: 100%;
}

.pattern-fill-demo__stage-wrap {
  display: grid;
  gap: 10px;
}

.pattern-fill-demo__stage {
  height: 520px;
}

.pattern-fill-demo__legend {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  background: var(--doc-surface);
  color: var(--doc-text);
  font-size: 12px;
}

@container pattern-fill (max-width: 520px) {
  .pattern-fill-demo__stage {
    height: 420px;
  }
}
</style>
