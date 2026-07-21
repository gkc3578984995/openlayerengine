<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { stylePresets, useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, ShapeInput, StylePatch, StylePresetName } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-styles';
const PREVIEW_ID = 'style-preview';
const PREVIEW_LAYER_ID = 'style-preview-elements';
const presetNames = Object.keys(stylePresets) as StylePresetName[];
const pointPresetNames = new Set<StylePresetName>(['point-default', 'icon-default', 'transform-handle']);

const presetLabels: Record<StylePresetName, string> = {
  'point-default': '默认圆点',
  'icon-default': '默认图标',
  'line-default': '默认线',
  'arrow-default': '末端箭头',
  'polygon-default': '默认面',
  'measure-default': '测量样式',
  'draw-preview': '绘制预览',
  'transform-handle': '变换锚点'
};

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const previewCenter = shallowRef<Coordinate | null>(null);
const presetName = ref<StylePresetName>('point-default');
const accentColor = ref<string | null>('#f56c6c');
const currentAction = ref<'set' | 'patch'>('set');

const isPointPreset = computed(() => pointPresetNames.has(presetName.value));
const currentActionLabel = computed(() => (currentAction.value === 'set' ? '完整替换 set()' : '局部合并 patch()'));

const geometryForPreset = (center: Coordinate): ShapeInput => {
  if (pointPresetNames.has(presetName.value)) return { type: 'point', controlPoints: [center] };
  if (presetName.value === 'polygon-default') {
    return {
      type: 'polygon',
      controlPoints: [
        [center[0] - 22_000, center[1] - 15_000],
        [center[0] + 22_000, center[1] - 15_000],
        [center[0] + 17_000, center[1] + 17_000],
        [center[0] - 17_000, center[1] + 17_000]
      ]
    };
  }
  return {
    type: 'polyline',
    controlPoints: [[center[0] - 30_000, center[1] - 13_000], center, [center[0] + 30_000, center[1] + 13_000]]
  };
};

const focusPreview = () => {
  const earth = earthRef.value;
  const center = previewCenter.value;
  if (earth === null || center === null) return;
  earth.view.animateFlyTo(center, { zoom: isPointPreset.value ? 12 : 10.2, duration: 450 });
};

// #region style-preset
const applyPreset = () => {
  const earth = earthRef.value;
  const center = previewCenter.value;
  if (earth === null || center === null) return;

  earth.elements.remove({ id: PREVIEW_ID });
  earth.elements.add({
    id: PREVIEW_ID,
    module: 'style-preview',
    layerId: PREVIEW_LAYER_ID,
    geometry: geometryForPreset(center)
  });
  earth.styles.set({ id: PREVIEW_ID }, stylePresets[presetName.value]);
  currentAction.value = 'set';
  focusPreview();
};
// #endregion style-preset

// #region style-patch
const patchAccent = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const patchColor = accentColor.value ?? '#f56c6c';
  let patch: StylePatch;
  if (presetName.value === 'point-default' || presetName.value === 'transform-handle') {
    patch = { symbol: { fill: { color: patchColor } } };
  } else if (presetName.value === 'icon-default') {
    patch = { symbol: { color: patchColor } };
  } else if (presetName.value === 'polygon-default') {
    patch = { fill: { color: patchColor } };
  } else {
    patch = { strokes: [{ color: patchColor, width: 5, lineCap: 'round', lineJoin: 'round' }] };
  }
  earth.styles.patch({ id: PREVIEW_ID }, patch);
  currentAction.value = 'patch';
  focusPreview();
};
// #endregion style-patch

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 12 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.5 });
  earth.layers.add({ kind: 'vector', id: PREVIEW_LAYER_ID, zIndex: 20, declutter: true });
  previewCenter.value = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earthRef.value = earth;
  applyPreset();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  previewCenter.value = null;
});
</script>

<template>
  <div class="example-demo styles-demo">
    <div class="example-demo__control-panel">
      <el-form class="example-demo__control-grid styles-demo__controls" label-position="top">
        <div class="example-demo__action-group styles-demo__control-group">
          <strong>完整替换</strong>
          <el-form-item label="样式预设">
            <el-select v-model="presetName" @change="applyPreset">
              <el-option v-for="name in presetNames" :key="name" :label="`${presetLabels[name]} · ${name}`" :value="name" />
            </el-select>
          </el-form-item>
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="applyPreset">应用 styles.set()</el-button>
          </div>
        </div>
        <div class="example-demo__action-group styles-demo__control-group">
          <strong>保留其余字段</strong>
          <el-form-item label="局部颜色">
            <el-color-picker v-model="accentColor" aria-label="局部更新颜色" />
          </el-form-item>
          <div class="example-demo__action-buttons">
            <el-button @click="patchAccent">应用 styles.patch()</el-button>
          </div>
        </div>
      </el-form>

      <div class="example-demo__feedback styles-demo__status" aria-live="polite">
        <el-tag type="primary" effect="dark">{{ presetLabels[presetName] }}</el-tag>
        <el-tag effect="plain"
          ><code>{{ presetName }}</code></el-tag
        >
        <el-tag :type="currentAction === 'set' ? 'success' : 'warning'" effect="plain">当前结果：{{ currentActionLabel }}</el-tag>
      </div>
    </div>

    <div class="styles-demo__stage-wrap">
      <div ref="mapTarget" class="example-stage styles-demo__stage"></div>
      <div class="styles-demo__map-label">预览对象</div>
      <div v-if="isPointPreset" class="styles-demo__spotlight" aria-hidden="true"></div>
    </div>

    <el-descriptions class="styles-demo__semantics" :column="2" border size="small">
      <el-descriptions-item label="styles.set()">用选中的 <code>StyleSpec</code> 完整替换当前样式。</el-descriptions-item>
      <el-descriptions-item label="styles.patch()">只合并颜色等局部字段，未提供的字段继续保留。</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.styles-demo__controls {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
}

.styles-demo__control-group {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
}

.styles-demo__control-group > strong {
  grid-column: 1 / -1;
}

.styles-demo__control-group :deep(.el-form-item) {
  min-width: 0;
  margin: 0;
}

.styles-demo__control-group :deep(.el-select) {
  width: 100%;
  max-width: 250px;
}

.styles-demo__stage-wrap {
  position: relative;
}

.styles-demo__stage {
  height: 460px;
}

.styles-demo__map-label {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 2;
  padding: 5px 10px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-bg-color) 92%, transparent);
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 700;
  transform: translateX(-50%);
  pointer-events: none;
}

.styles-demo__spotlight {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  width: 58px;
  height: 58px;
  border: 2px dashed var(--el-color-primary);
  border-radius: 50%;
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--el-color-primary) 15%, transparent);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.styles-demo__semantics {
  margin-top: 14px;
}

@media (max-width: 640px) {
  .styles-demo__control-group {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .styles-demo__control-group :deep(.el-form-item),
  .styles-demo__control-group :deep(.el-select) {
    width: 100%;
    max-width: 100%;
  }

  .styles-demo__stage {
    height: 380px;
  }
}
</style>
