<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { lineStyles, useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, LineCapType, LinePattern, ShapeInput, StyleSpec, TrackedLineDecorationType } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-linework';
const PREVIEW_ID = 'linework-preview';
const GUIDE_ID = 'linework-preview-guide';
const PREVIEW_LAYER_ID = 'linework-preview-elements';

type PreviewKind = 'polyline' | 'polygon';
type TrackMode = LinePattern | 'double' | 'none';
type DecorationMode = TrackedLineDecorationType | 'inline-text';
type CenterDecorationMode = Extract<TrackedLineDecorationType, 'center-cross' | 'center-dot' | 'center-dot-pair'>;

const centerDecorationOptions: readonly CenterDecorationMode[] = ['center-cross', 'center-dot', 'center-dot-pair'];

const decorationOptions: readonly DecorationMode[] = [
  'none',
  'tick',
  'alternating-tick',
  'double-tick',
  'square',
  'circle',
  'center-cross',
  'center-dot',
  'center-dot-pair',
  'inline-text'
];

const decorationLabels: Record<DecorationMode, string> = {
  none: '无装饰',
  tick: '单侧短线',
  'alternating-tick': '交替短线',
  'double-tick': '双侧短线',
  square: '方块',
  circle: '圆环',
  'center-cross': '中心十字',
  'center-dot': '中心点',
  'center-dot-pair': '中心点对',
  'inline-text': '路径文字'
};

const trackLabels: Record<TrackMode, string> = {
  solid: '单轨实线',
  dashed: '单轨虚线',
  double: '双轨：实线 + 虚线',
  none: '无轨道，仅斜杠'
};

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const previewCenter = shallowRef<Coordinate | null>(null);
const kind = ref<PreviewKind>('polyline');
const tracks = ref<TrackMode>('solid');
const decoration = ref<DecorationMode>('center-dot');
const startCap = ref<LineCapType>('bar');
const endCap = ref<LineCapType>('arrow');
const color = ref<string | null>('#f56c6c');
const inlineText = ref('供水管线');
const repeatEnabled = ref(true);
const repeatSpacingPx = ref(96);

const capsEnabled = computed(() => kind.value === 'polyline' && tracks.value !== 'double' && tracks.value !== 'none');
const decorationLabel = computed(() => (tracks.value === 'none' ? '斜杠' : decorationLabels[decoration.value]));
const activeColor = computed(() => color.value ?? '#f56c6c');
const isCenterDecoration = (value: DecorationMode): value is CenterDecorationMode => centerDecorationOptions.includes(value as CenterDecorationMode);
const repeatableContentEnabled = computed(() => (tracks.value === 'none' ? false : decoration.value === 'inline-text' || isCenterDecoration(decoration.value)));

const colorWithAlpha = (value: string, alpha: number): string => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (match === null) return value;
  return `rgba(${Number.parseInt(match[1]!, 16)}, ${Number.parseInt(match[2]!, 16)}, ${Number.parseInt(match[3]!, 16)}, ${alpha})`;
};

// #region linework-factory
const createDefaultLineworkStyle = (): StyleSpec =>
  lineStyles.polyline({
    color: activeColor.value,
    lines: 'solid',
    caps: { start: 'bar', end: 'arrow' },
    decoration: 'tick'
  });

const createDefaultPolygonLineworkStyle = (): StyleSpec =>
  lineStyles.polygon({
    color: activeColor.value,
    lines: 'solid',
    decoration: 'tick'
  });

const createRepeatedCenterLineworkStyle = (): StyleSpec =>
  lineStyles.polyline({
    color: activeColor.value,
    lines: 'solid',
    caps: { start: 'bar', end: 'arrow' },
    decoration: 'center-dot',
    repeatSpacingPx: repeatSpacingPx.value
  });
// #endregion linework-factory

const createPolylineStyle = (): StyleSpec => {
  const trackMode = tracks.value;
  const decorationMode = decoration.value;
  if (trackMode === 'solid' && decorationMode === 'tick' && startCap.value === 'bar' && endCap.value === 'arrow') return createDefaultLineworkStyle();
  if (trackMode === 'solid' && decorationMode === 'center-dot' && startCap.value === 'bar' && endCap.value === 'arrow' && repeatEnabled.value) {
    return createRepeatedCenterLineworkStyle();
  }
  if (trackMode === 'none') return lineStyles.polyline({ color: activeColor.value, lines: 'none', decoration: 'slash' });

  if (trackMode === 'double') {
    const lines = ['solid', 'dashed'] as const;
    if (decorationMode === 'inline-text') {
      return lineStyles.polyline({
        color: activeColor.value,
        lines,
        decoration: 'inline-text',
        text: inlineText.value.trim() || '路径文字',
        textStyle: { background: { color: '#ffffff', paddingPx: 4 }, outline: { color: '#ffffff', width: 3 }, fontWeight: 'bold' },
        ...(repeatEnabled.value ? { repeatSpacingPx: repeatSpacingPx.value } : {})
      });
    }
    if (isCenterDecoration(decorationMode)) {
      return lineStyles.polyline({
        color: activeColor.value,
        lines,
        decoration: decorationMode,
        ...(repeatEnabled.value ? { repeatSpacingPx: repeatSpacingPx.value } : {})
      });
    }
    return lineStyles.polyline({ color: activeColor.value, lines, decoration: decorationMode });
  }

  const caps = { start: startCap.value, end: endCap.value };
  if (decorationMode === 'inline-text') {
    return lineStyles.polyline({
      color: activeColor.value,
      lines: trackMode,
      caps,
      decoration: 'inline-text',
      text: inlineText.value.trim() || '路径文字',
      textStyle: { background: { color: '#ffffff', paddingPx: 4 }, outline: { color: '#ffffff', width: 3 }, fontWeight: 'bold' },
      ...(repeatEnabled.value ? { repeatSpacingPx: repeatSpacingPx.value } : {})
    });
  }
  if (isCenterDecoration(decorationMode)) {
    return lineStyles.polyline({
      color: activeColor.value,
      lines: trackMode,
      caps,
      decoration: decorationMode,
      ...(repeatEnabled.value ? { repeatSpacingPx: repeatSpacingPx.value } : {})
    });
  }
  return lineStyles.polyline({ color: activeColor.value, lines: trackMode, caps, decoration: decorationMode });
};

const createPolygonStyle = (): StyleSpec => {
  const trackMode = tracks.value;
  const decorationMode = decoration.value;
  if (trackMode === 'solid' && decorationMode === 'tick') return createDefaultPolygonLineworkStyle();
  if (trackMode === 'none') return lineStyles.polygon({ color: activeColor.value, lines: 'none', decoration: 'slash' });

  const lines: LinePattern | readonly [LinePattern, LinePattern] = trackMode === 'double' ? ['solid', 'dashed'] : trackMode;
  if (decorationMode === 'inline-text') {
    return lineStyles.polygon({
      color: activeColor.value,
      lines,
      decoration: 'inline-text',
      text: inlineText.value.trim() || '路径文字',
      textStyle: { background: { color: '#ffffff', paddingPx: 4 }, outline: { color: '#ffffff', width: 3 }, fontWeight: 'bold' },
      ...(repeatEnabled.value ? { repeatSpacingPx: repeatSpacingPx.value } : {})
    });
  }
  if (isCenterDecoration(decorationMode)) {
    return lineStyles.polygon({
      color: activeColor.value,
      lines,
      decoration: decorationMode,
      ...(repeatEnabled.value ? { repeatSpacingPx: repeatSpacingPx.value } : {})
    });
  }
  return lineStyles.polygon({ color: activeColor.value, lines, decoration: decorationMode });
};

const createLineworkStyle = (): StyleSpec => (kind.value === 'polyline' ? createPolylineStyle() : createPolygonStyle());

const createGeometry = (center: Coordinate): ShapeInput => {
  if (kind.value === 'polyline') {
    return {
      type: 'curve-polyline',
      controlPoints: [
        [center[0] - 27_000, center[1] - 11_000],
        [center[0] - 9_000, center[1] + 14_000],
        [center[0] + 10_000, center[1] - 10_000],
        [center[0] + 27_000, center[1] + 13_000]
      ]
    };
  }
  return {
    type: 'polygon',
    controlPoints: [
      [center[0] - 22_000, center[1] - 15_000],
      [center[0] + 22_000, center[1] - 15_000],
      [center[0] + 18_000, center[1] + 16_000],
      [center[0] - 18_000, center[1] + 16_000]
    ]
  };
};

// #region linework-apply
const applyLinework = (focus = false) => {
  const earth = earthRef.value;
  const center = previewCenter.value;
  if (earth === null || center === null) return;

  const geometry = createGeometry(center);
  const style = createLineworkStyle();
  earth.elements.remove({ module: 'linework-preview' });

  if (tracks.value !== 'none') {
    earth.elements.add({
      id: GUIDE_ID,
      module: 'linework-preview',
      layerId: PREVIEW_LAYER_ID,
      geometry,
      style: { strokes: [{ color: 'rgba(255, 255, 255, 0.96)', width: 9, lineCap: 'round', lineJoin: 'round' }], zIndex: 1 }
    });
  }

  earth.elements.add({
    id: PREVIEW_ID,
    module: 'linework-preview',
    layerId: PREVIEW_LAYER_ID,
    geometry,
    style:
      kind.value === 'polygon' ? { ...style, fill: { type: 'solid', color: colorWithAlpha(activeColor.value, 0.14) }, zIndex: 10 } : { ...style, zIndex: 10 }
  });
  if (focus) earth.view.animateFlyTo(center, { zoom: 10.2, duration: 350 });
};
// #endregion linework-apply

watch(kind, () => applyLinework(true), { flush: 'post' });
watch([tracks, decoration, startCap, endCap, color, inlineText, repeatEnabled, repeatSpacingPx], () => applyLinework(), { flush: 'post' });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 10.2 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.48 });
  earth.layers.add({ kind: 'vector', id: PREVIEW_LAYER_ID, zIndex: 30, declutter: true });
  previewCenter.value = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earthRef.value = earth;
  applyLinework(true);
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  previewCenter.value = null;
});
</script>

<template>
  <div class="example-demo linework-demo">
    <div class="example-demo__control-panel">
      <el-form class="example-demo__control-grid linework-demo__controls" label-position="top">
        <el-form-item label="路径范围">
          <el-radio-group v-model="kind">
            <el-radio-button value="polyline">开放路径</el-radio-button>
            <el-radio-button value="polygon">闭合外环</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="轨道">
          <el-select v-model="tracks">
            <el-option v-for="(label, value) in trackLabels" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="沿线装饰">
          <el-select v-model="decoration" :disabled="tracks === 'none'">
            <el-option v-for="item in decorationOptions" :key="item" :label="`${decorationLabels[item]} · ${item}`" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="起点端帽">
          <el-select v-model="startCap" :disabled="!capsEnabled">
            <el-option label="无" value="none" /><el-option label="横杠" value="bar" /><el-option label="箭头" value="arrow" />
          </el-select>
        </el-form-item>
        <el-form-item label="终点端帽">
          <el-select v-model="endCap" :disabled="!capsEnabled">
            <el-option label="无" value="none" /><el-option label="横杠" value="bar" /><el-option label="箭头" value="arrow" />
          </el-select>
        </el-form-item>
        <el-form-item label="路径文字">
          <el-input v-model="inlineText" :disabled="decoration !== 'inline-text' || tracks === 'none'" />
        </el-form-item>
        <el-form-item label="重复铺满路径">
          <el-switch v-model="repeatEnabled" :disabled="!repeatableContentEnabled" aria-label="切换中心内容是否重复铺满路径" />
        </el-form-item>
        <el-form-item label="重复间距（CSS px）">
          <el-input-number
            v-model="repeatSpacingPx"
            :disabled="!repeatableContentEnabled || !repeatEnabled"
            :min="1"
            :max="400"
            :step="8"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="统一颜色">
          <el-color-picker v-model="color" aria-label="线饰颜色" />
        </el-form-item>
      </el-form>

      <div class="example-demo__feedback linework-demo__status" aria-live="polite">
        <el-tag type="primary" effect="dark">{{ kind === 'polyline' ? '开放路径' : '闭合外环' }}</el-tag>
        <el-tag effect="plain">轨道：{{ trackLabels[tracks] }}</el-tag>
        <el-tag type="success" effect="plain">装饰：{{ decorationLabel }}</el-tag>
        <el-tag v-if="capsEnabled" type="warning" effect="plain">端帽：{{ startCap }} → {{ endCap }}</el-tag>
        <el-tag v-if="repeatableContentEnabled" type="info" effect="plain">
          位置：{{ repeatEnabled ? `每 ${repeatSpacingPx} CSS px` : '累计长度中点一次' }}
        </el-tag>
        <span>修改任一选项，地图会立即刷新。</span>
      </div>
    </div>

    <div class="linework-demo__stage-wrap">
      <div ref="mapTarget" class="example-stage linework-demo__stage"></div>
      <div class="linework-demo__map-label">当前 Linework 效果</div>
    </div>

    <el-descriptions class="linework-demo__rules" :column="2" border size="small">
      <el-descriptions-item label="开放单轨">可同时使用起点、终点端帽和沿线装饰。</el-descriptions-item>
      <el-descriptions-item label="双轨 / 闭合环">端帽会禁用，避免产生没有明确定义的组合。</el-descriptions-item>
      <el-descriptions-item label="中心内容">三种中心 glyph 与路径文字可保持中点一次，也可按锚点间距铺满整个路径。</el-descriptions-item>
      <el-descriptions-item label="文字间距">间距不会随文字宽度自动增大；文字重叠时，对应轨道切口仍会合并。</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.linework-demo__controls {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
}

.linework-demo__controls :deep(.el-form-item) {
  min-width: 0;
  margin: 0;
}

.linework-demo__controls :deep(.el-select),
.linework-demo__controls :deep(.el-input),
.linework-demo__controls :deep(.el-input-number) {
  width: 190px;
}

.linework-demo__stage-wrap {
  position: relative;
}

.linework-demo__stage {
  height: 470px;
}

.linework-demo__map-label {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 2;
  padding: 5px 10px;
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-bg-color) 92%, transparent);
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 700;
  transform: translateX(-50%);
  pointer-events: none;
}

.linework-demo__rules {
  margin-top: 14px;
}

@media (max-width: 640px) {
  .linework-demo__controls {
    grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  }

  .linework-demo__controls :deep(.el-form-item),
  .linework-demo__controls :deep(.el-select),
  .linework-demo__controls :deep(.el-input),
  .linework-demo__controls :deep(.el-input-number) {
    width: 100%;
    margin-right: 0;
  }

  .linework-demo__stage {
    height: 400px;
  }
}
</style>
