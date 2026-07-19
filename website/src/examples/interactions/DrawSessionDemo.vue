<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, type DrawSession, type ShapeType } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

type DemoShapeType = Extract<ShapeType, 'point' | 'polyline' | 'polygon' | 'circle'>;

const RESULT_LAYER_ID = 'docs-draw-results';
const MODULE = 'docs-draw';
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const sessionRef = shallowRef<DrawSession | null>(null);
const selectedType = ref<DemoShapeType>('polygon');
const status = ref<'idle' | DrawSession['status']>('idle');
const stage = ref('等待启动');
const controlPointCount = ref(0);
const sessionResultCount = ref(0);
const queryCount = ref(0);
const historyResult = ref('尚未操作');

let disposers: Array<() => void> = [];

const isActive = computed(() => status.value === 'active');

const releaseListeners = () => {
  for (const dispose of disposers.splice(0)) dispose();
};

const styleFor = (type: DemoShapeType) => {
  if (type === 'point') {
    return {
      symbol: {
        type: 'circle' as const,
        radius: 11,
        fill: { type: 'solid' as const, color: '#f97316' },
        stroke: { color: '#ffffff', width: 3 }
      }
    };
  }
  if (type === 'polyline') return { strokes: [{ color: '#f97316', width: 6 }] };
  return {
    strokes: [{ color: '#ea580c', width: 4 }],
    fill: { type: 'solid' as const, color: 'rgba(249, 115, 22, 0.32)' }
  };
};

const refreshQueryCount = () => {
  queryCount.value = earthRef.value?.draw.query({ module: MODULE }).length ?? 0;
};

const destroySession = () => {
  releaseListeners();
  sessionRef.value?.destroy();
  sessionRef.value = null;
  status.value = 'idle';
  stage.value = 'Session 已释放';
  controlPointCount.value = 0;
  sessionResultCount.value = 0;
};

// #region draw-session-lifecycle
const start = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  destroySession();

  const session = earth.draw.start({
    type: selectedType.value,
    layerId: RESULT_LAYER_ID,
    module: MODULE,
    style: styleFor(selectedType.value),
    keepGraphics: true,
    policy: 'replace'
  });
  sessionRef.value = session;
  status.value = session.status;
  stage.value = '移动指针并在地图上添加控制点';
  historyResult.value = '可使用按钮或 Ctrl/Cmd + Z / Y';

  disposers = [
    session.on('start', () => {
      stage.value = '草图已开始';
    }),
    session.on('click', ({ controlPointCount: count }) => {
      controlPointCount.value = count;
      stage.value = `已接受 ${count} 个控制点`;
    }),
    session.on('change', ({ geometry }) => {
      stage.value = `${geometry.type} 预览中（尚未写入 Store）`;
    }),
    session.on('complete', () => {
      sessionResultCount.value = session.results.length;
      refreshQueryCount();
      stage.value = '结果已提交为 Element';
    }),
    session.on('cancel', ({ reason }) => {
      stage.value = `已取消：${reason}`;
    })
  ];

  void session.finished.then((results) => {
    status.value = session.status;
    sessionResultCount.value = results.length;
    refreshQueryCount();
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

const undo = () => {
  historyResult.value = sessionRef.value?.undo() === true ? '已撤销一个控制点' : '当前没有可撤销步骤';
};

const redo = () => {
  historyResult.value = sessionRef.value?.redo() === true ? '已恢复一个控制点' : '当前没有可重做步骤';
};
// #endregion draw-session-lifecycle

// #region draw-query-clear
const queryResults = () => {
  refreshQueryCount();
  stage.value = `query() 找到 ${queryCount.value} 个绘制成果`;
};

const clearResults = () => {
  const removed = earthRef.value?.draw.clear({ module: MODULE }) ?? 0;
  queryCount.value = 0;
  sessionResultCount.value = sessionRef.value?.results.length ?? 0;
  stage.value = `clear() 已移除 ${removed} 个成果`;
};
// #endregion draw-query-clear

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: RESULT_LAYER_ID, zIndex: 30 });
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), 10);
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  destroySession();
  earthRef.value?.draw.clear({ module: MODULE });
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo draw-session-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="橙色粗描边是已提交成果；半透明草图、控制点与 Tooltip 只属于当前 Session。"
    />
    <div class="draw-session-demo__controls">
      <el-select v-model="selectedType" aria-label="绘制图形类型" :disabled="isActive">
        <el-option label="点 Point" value="point" />
        <el-option label="折线 Polyline" value="polyline" />
        <el-option label="多边形 Polygon" value="polygon" />
        <el-option label="圆 Circle" value="circle" />
      </el-select>
      <el-button type="primary" @click="start">启动绘制</el-button>
      <el-button :disabled="!isActive" @click="undo">撤销</el-button>
      <el-button :disabled="!isActive" @click="redo">重做</el-button>
      <el-button :disabled="!isActive" @click="finish">完成</el-button>
      <el-button :disabled="!isActive" @click="cancel">取消</el-button>
      <el-button :disabled="sessionRef === null" @click="destroySession">销毁 Session</el-button>
    </div>
    <div class="draw-session-demo__controls">
      <el-button plain @click="queryResults">查询成果</el-button>
      <el-button plain type="danger" @click="clearResults">清空成果</el-button>
      <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
      <el-tag effect="plain">{{ stage }}</el-tag>
    </div>

    <div class="draw-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="draw-session-demo__map-guide">在地图中心附近单击；折线、面和圆可点击“完成”结束</div>
    </div>

    <el-descriptions class="draw-session-demo__summary" :column="2" border>
      <el-descriptions-item label="当前控制点">{{ controlPointCount }}</el-descriptions-item>
      <el-descriptions-item label="Session.results">{{ sessionResultCount }}</el-descriptions-item>
      <el-descriptions-item label="draw.query()">{{ queryCount }}</el-descriptions-item>
      <el-descriptions-item label="撤销 / 重做">{{ historyResult }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.draw-session-demo__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.draw-session-demo__controls :deep(.el-select) {
  width: 190px;
}

.draw-session-demo__map-shell {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}

.draw-session-demo__map-guide {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 2;
  max-width: calc(100% - 32px);
  padding: 7px 12px;
  border: 1px solid var(--doc-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--doc-surface) 92%, transparent);
  color: var(--doc-text);
  font-size: 12px;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.draw-session-demo__summary {
  margin-top: 14px;
}
</style>
