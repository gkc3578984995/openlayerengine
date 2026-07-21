<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, measureTypes, type MeasureResult, type MeasureSession, type MeasureType } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const LAYER_ID = 'docs-measure-results';
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const sessionRef = shallowRef<MeasureSession | null>(null);
const selectedType = ref<MeasureType>('distance-segments');
const status = ref<'idle' | MeasureSession['status']>('idle');
const latestResult = shallowRef<MeasureResult | null>(null);
const precision = ref(2);
const showTotal = ref(true);
const customFormatter = ref(true);
const lineColor = ref('#ef4444');
const pointColor = ref('#facc15');
const textColor = ref('#7f1d1d');
const phase = ref('选择类型和样式后启动测量');
let disposers: Array<() => void> = [];

const typeLabels: Record<MeasureType, string> = {
  'distance-segments': '分段距离',
  'distance-total': '总距离',
  'distance-radial': '径向距离',
  area: '面积'
};
const unit = computed(() => (selectedType.value === 'area' ? ('km²' as const) : ('km' as const)));
const isActive = computed(() => status.value === 'active');
const segmentRows = computed(() =>
  (latestResult.value?.segments ?? []).map((segment, index) => ({
    index: index + 1,
    value: segment.value.toFixed(precision.value),
    formatted: segment.formatted
  }))
);

const releaseListeners = () => {
  for (const dispose of disposers.splice(0)) dispose();
};

const cancelSession = () => {
  if (sessionRef.value?.status === 'active') sessionRef.value.cancel();
  releaseListeners();
  sessionRef.value = null;
  status.value = 'idle';
};

// #region measure-options-and-results
const start = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  cancelSession();
  latestResult.value = null;

  const session = earth.measure.start({
    type: selectedType.value,
    layerId: LAYER_ID,
    unit: unit.value,
    precision: precision.value,
    formatter: customFormatter.value ? (value, resultUnit) => `${value.toFixed(precision.value)} ${resultUnit}（自定义）` : undefined,
    line: { color: lineColor.value, width: 6, lineDash: [12, 8], lineCap: 'round' },
    point: {
      type: 'circle',
      radius: 8,
      fill: { type: 'solid', color: pointColor.value },
      stroke: { color: '#ffffff', width: 3 }
    },
    text: {
      fontSize: 15,
      fontWeight: 'bold',
      fill: { type: 'solid', color: textColor.value },
      backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.94)' },
      backgroundStroke: { color: lineColor.value, width: 2 },
      padding: [5, 8, 5, 8]
    },
    showTotal: showTotal.value,
    policy: 'replace'
  });
  sessionRef.value = session;
  status.value = session.status;
  phase.value = '在地图上依次单击测量点';

  disposers = [
    session.on('change', ({ result }) => {
      latestResult.value = result;
      phase.value = `预览：${result.formatted}`;
    }),
    session.on('complete', ({ result }) => {
      latestResult.value = result;
      phase.value = `完成：${result.formatted}`;
    }),
    session.on('cancel', ({ reason }) => {
      phase.value = `已取消：${reason}`;
    })
  ];
  void session.finished.then((result) => {
    latestResult.value = result ?? latestResult.value;
    status.value = session.status;
    releaseListeners();
  });
};

const finish = () => {
  sessionRef.value?.finish();
  if (sessionRef.value !== null) status.value = sessionRef.value.status;
};

const cancel = () => {
  sessionRef.value?.cancel();
  if (sessionRef.value !== null) status.value = sessionRef.value.status;
};

const clear = () => {
  cancelSession();
  earthRef.value?.measure.clear();
  latestResult.value = null;
  phase.value = '测量图形和 Overlay 已全部清除';
};
// #endregion measure-options-and-results

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 30 });
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), 10);
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  cancelSession();
  earthRef.value?.measure.clear();
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo measure-session-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="红色虚线、黄色控制点和白底标签全部来自 MeasureOptions；修改配置后重新启动即可比较效果。"
    />
    <div class="example-demo__control-panel">
      <div class="example-demo__control-grid measure-session-demo__settings">
        <div class="example-demo__field measure-session-demo__field">
          <span>测量类型</span>
          <el-select v-model="selectedType" aria-label="测量类型" :disabled="isActive">
            <el-option v-for="type in measureTypes" :key="type" :label="typeLabels[type]" :value="type" />
          </el-select>
        </div>
        <div class="example-demo__field measure-session-demo__field">
          <span>精度</span>
          <el-input-number v-model="precision" :min="0" :max="6" :disabled="isActive" controls-position="right" />
        </div>
        <div class="example-demo__field">
          <span>线</span>
          <el-color-picker v-model="lineColor" :disabled="isActive" />
        </div>
        <div class="example-demo__field">
          <span>点</span>
          <el-color-picker v-model="pointColor" :disabled="isActive" />
        </div>
        <div class="example-demo__field">
          <span>文字</span>
          <el-color-picker v-model="textColor" :disabled="isActive" />
        </div>
      </div>
      <div class="example-demo__actions measure-session-demo__options">
        <el-checkbox v-model="customFormatter" :disabled="isActive">自定义 formatter</el-checkbox>
        <el-checkbox v-model="showTotal" :disabled="isActive">分段时显示总计</el-checkbox>
      </div>
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <span>测量会话</span>
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="start">启动测量</el-button>
            <el-button :disabled="!isActive" @click="finish">完成</el-button>
            <el-button :disabled="!isActive" @click="cancel">取消</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>测量结果</span>
          <div class="example-demo__action-buttons">
            <el-button plain type="danger" @click="clear">清除全部结果</el-button>
          </div>
        </div>
      </div>
      <div class="example-demo__feedback" aria-live="polite">
        <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
      </div>
    </div>
    <div class="measure-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="measure-session-demo__map-guide">{{ phase }}</div>
    </div>
    <el-descriptions class="measure-session-demo__result" :column="2" border>
      <el-descriptions-item label="格式化结果">{{ latestResult?.formatted ?? '等待输入' }}</el-descriptions-item>
      <el-descriptions-item label="数值 / 单位">{{
        latestResult ? `${latestResult.value.toFixed(precision)} ${latestResult.unit}` : '—'
      }}</el-descriptions-item>
      <el-descriptions-item label="投影坐标点">{{ latestResult?.coordinates.length ?? 0 }}</el-descriptions-item>
      <el-descriptions-item label="经纬度坐标点">{{ latestResult?.geographicCoordinates.length ?? 0 }}</el-descriptions-item>
    </el-descriptions>
    <el-table v-if="segmentRows.length" class="measure-session-demo__segments" :data="segmentRows" border stripe>
      <el-table-column prop="index" label="分段" width="80" />
      <el-table-column prop="value" label="数值" min-width="140" />
      <el-table-column prop="formatted" label="formatter 输出" min-width="220" />
    </el-table>
  </div>
</template>

<style scoped>
.measure-session-demo__settings {
  grid-template-columns: minmax(180px, 1.8fr) minmax(120px, 1fr) repeat(3, minmax(70px, 0.65fr));
}

.measure-session-demo__field :deep(.el-select) {
  width: 100%;
  max-width: 180px;
}

.measure-session-demo__field :deep(.el-input-number) {
  width: 100%;
  max-width: 120px;
}

.measure-session-demo__options {
  gap: 8px 16px;
}

@media (max-width: 700px) {
  .measure-session-demo__settings {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
  }
}

.measure-session-demo__map-shell {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.measure-session-demo__map-guide {
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

.measure-session-demo__result,
.measure-session-demo__segments {
  margin-top: 14px;
}
</style>
