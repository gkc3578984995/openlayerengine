<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, ElementCreateInput, ShapeType, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-create';
const BUSINESS_LAYER_ID = 'create-demo-elements';
const FOCUS_ZOOM = 10;
const CREATION_OFFSETS = [
  [0, 0],
  [12_000, 0],
  [-12_000, 0],
  [0, 11_000],
  [0, -11_000],
  [13_000, 9_000],
  [-13_000, 9_000],
  [13_000, -9_000],
  [-13_000, -9_000]
] as const;

interface DemoData {
  label: string;
  sequence: number;
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const originRef = shallowRef<Coordinate | null>(null);
const shape = ref<Extract<ShapeType, 'point' | 'polyline' | 'circle'>>('point');
const label = ref('巡检目标');
const color = ref<string | null>('#409eff');
const currentId = ref<string | null>(null);
const createdCount = ref(0);
const activeColor = computed(() => color.value ?? '#409eff');
let sequence = 0;

const colorWithAlpha = (value: string, alpha: number): string => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (match === null) return value;
  return `rgba(${Number.parseInt(match[1]!, 16)}, ${Number.parseInt(match[2]!, 16)}, ${Number.parseInt(match[3]!, 16)}, ${alpha})`;
};

const createTextStyle = (text: string, offsetY = 0): NonNullable<StyleSpec['text']> => ({
  text,
  fontSize: 14,
  fontWeight: 'bold',
  offsetY,
  padding: [5, 8, 5, 8],
  fill: { type: 'solid', color: '#1f2937' },
  stroke: { color: '#ffffff', width: 3 },
  backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.88)' },
  backgroundStroke: { color: 'rgba(255, 255, 255, 0.98)', width: 2 }
});

const createStyle = (displayLabel: string): StyleSpec => {
  if (shape.value === 'point') {
    return {
      symbol: {
        type: 'circle',
        radius: 16,
        fill: { type: 'solid', color: activeColor.value },
        stroke: { color: '#ffffff', width: 4 }
      },
      text: createTextStyle(displayLabel, 38)
    };
  }
  if (shape.value === 'polyline') {
    return {
      strokes: [
        { color: '#ffffff', width: 10, lineCap: 'round', lineJoin: 'round' },
        { color: activeColor.value, width: 5, lineCap: 'round', lineJoin: 'round' }
      ],
      text: createTextStyle(displayLabel, 26)
    };
  }
  return {
    strokes: [
      { color: '#ffffff', width: 8 },
      { color: activeColor.value, width: 4 }
    ],
    fill: { type: 'solid', color: colorWithAlpha(activeColor.value, 0.48) },
    text: createTextStyle(displayLabel)
  };
};

const createElement = () => {
  const earth = earthRef.value;
  const origin = originRef.value;
  if (earth === null || origin === null) return;
  sequence += 1;
  const offset = CREATION_OFFSETS[(sequence - 1) % CREATION_OFFSETS.length]!;
  const center: Coordinate = [origin[0] + offset[0], origin[1] + offset[1]];
  const displayLabel = label.value.trim() || `Element ${sequence}`;
  // #region element-create
  const common = {
    id: `create-demo-${sequence}`,
    module: 'inspection',
    layerId: BUSINESS_LAYER_ID,
    data: { label: displayLabel, sequence },
    style: createStyle(displayLabel)
  };

  let input: ElementCreateInput<DemoData>;
  if (shape.value === 'point') {
    input = { ...common, geometry: { type: 'point', controlPoints: [center] } };
  } else if (shape.value === 'polyline') {
    input = {
      ...common,
      geometry: {
        type: 'polyline',
        controlPoints: [[center[0] - 9_000, center[1] - 5_000], center, [center[0] + 9_000, center[1] + 6_000]]
      }
    };
  } else {
    input = { ...common, geometry: { type: 'circle', center, radius: 8_000 } };
  }

  const element = earth.elements.add(input);
  // #endregion element-create
  currentId.value = element.id;
  createdCount.value += 1;
  earth.view.animateFlyTo(center, { zoom: FOCUS_ZOOM, duration: 450 });
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: FOCUS_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.5 });
  earth.layers.add({ kind: 'vector', id: BUSINESS_LAYER_ID, zIndex: 30, declutter: true });
  const origin = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  originRef.value = origin;
  earth.view.flyTo(origin, FOCUS_ZOOM);
  earthRef.value = earth;
  createElement();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  originRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <el-form class="example-demo__control-panel element-create-demo__form" label-position="top">
      <div class="example-demo__control-grid element-create-demo__fields">
        <el-form-item label="图形">
          <el-radio-group v-model="shape">
            <el-radio-button value="point">Point</el-radio-button>
            <el-radio-button value="polyline">Polyline</el-radio-button>
            <el-radio-button value="circle">Circle</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="业务名称"><el-input v-model="label" maxlength="20" /></el-form-item>
        <el-form-item label="颜色"><el-color-picker v-model="color" /></el-form-item>
      </div>
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <strong>操作</strong>
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="createElement">调用 elements.add()</el-button>
          </div>
        </div>
        <div class="example-demo__feedback element-create-demo__feedback element-create-demo__status" aria-live="polite">
          <strong class="element-create-demo__feedback-label">当前状态</strong>
          <el-tag type="success" effect="plain">当前 ID：{{ currentId ?? '尚未创建' }}</el-tag>
          <el-tag effect="plain">已创建 {{ createdCount }} 个</el-tag>
        </div>
      </div>
    </el-form>

    <div ref="mapTarget" class="example-stage"></div>
  </div>
</template>

<style scoped>
.element-create-demo__fields {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 14px 16px;
}

.element-create-demo__form :deep(.el-form-item) {
  min-width: 0;
  margin: 0;
}

.element-create-demo__form :deep(.el-input) {
  width: 100%;
  max-width: 180px;
}

.element-create-demo__feedback-label {
  color: var(--doc-text);
  font-size: 12px;
}
</style>
