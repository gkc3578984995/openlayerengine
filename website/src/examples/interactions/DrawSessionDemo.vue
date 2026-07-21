<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth, shapeTypes, type Coordinate, type DrawSession, type ShapeType, type StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';
import { shapeExampleByType } from '../../config/shapeExamples';

type DrawCategoryId = 'basic' | 'parameter' | 'plot';

interface DrawShapeEntry {
  readonly type: ShapeType;
  readonly label: string;
  readonly points: string;
  readonly render: string;
  readonly description: string;
  readonly finish: string;
}

const RESULT_LAYER_ID = 'docs-draw-results';
const MODULE = 'docs-draw';
const DEFAULT_TYPE: ShapeType = 'polygon';
const autoFinishCounts: Readonly<Partial<Record<ShapeType, number>>> = Object.freeze({
  point: 1,
  circle: 2,
  ellipse: 2,
  'fine-arrow': 2,
  'tailed-squad-combat-arrow': 2,
  'assault-direction-arrow': 2,
  'double-arrow': 4,
  rectangle: 2,
  triangle: 3,
  'equilateral-triangle': 2,
  'assemble-polygon': 3,
  sector: 3,
  'lune-polygon': 3,
  'lune-polyline': 3
});
const basicTypes = new Set<ShapeType>(['point', 'polyline', 'polygon']);
const parameterTypes = new Set<ShapeType>(['circle', 'ellipse']);

const completionText = (type: ShapeType) => {
  if (type === 'double-arrow') return '第 4 次单击后自动补齐规范状态的第 5 个控制点并完成';
  const count = autoFinishCounts[type];
  return count === undefined ? '达到最少控制点后，右击地图或点击“完成”提交' : `接受 ${count} 个控制点后自动完成`;
};

const categoryFor = (type: ShapeType): DrawCategoryId => {
  if (basicTypes.has(type)) return 'basic';
  if (parameterTypes.has(type)) return 'parameter';
  return 'plot';
};

const drawShapeEntries: readonly DrawShapeEntry[] = Object.freeze(
  shapeTypes.map((type) => {
    const example = shapeExampleByType[type];
    return Object.freeze({
      type,
      label: example.label,
      points: example.points,
      render: example.render,
      description: example.description,
      finish: completionText(type)
    });
  })
);

const drawCategories = Object.freeze([
  { id: 'basic' as const, label: '基础图形', entries: drawShapeEntries.filter(({ type }) => categoryFor(type) === 'basic') },
  { id: 'parameter' as const, label: '参数图形', entries: drawShapeEntries.filter(({ type }) => categoryFor(type) === 'parameter') },
  { id: 'plot' as const, label: 'Plot 标绘', entries: drawShapeEntries.filter(({ type }) => categoryFor(type) === 'plot') }
]);

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const sessionRef = shallowRef<DrawSession | null>(null);
const selectedCategory = ref<DrawCategoryId>('basic');
const selectedType = ref<ShapeType>(DEFAULT_TYPE);
const status = ref<'idle' | DrawSession['status']>('idle');
const stage = ref('先从目录选择 Shape，再启动绘制');
const controlPointCount = ref(0);
const sessionResultCount = ref(0);
const queryCount = ref(0);
const historyResult = ref('尚未操作');
const mapCenter = shallowRef<Coordinate | null>(null);

let disposers: Array<() => void> = [];

const isActive = computed(() => status.value === 'active');
const selectedEntry = computed(() => drawShapeEntries.find(({ type }) => type === selectedType.value) ?? drawShapeEntries[0]);

const releaseListeners = () => {
  for (const dispose of disposers.splice(0)) dispose();
};

const styleFor = (type: ShapeType): StyleSpec => {
  const render = shapeExampleByType[type].render;
  if (render === 'Point') {
    return {
      symbol: {
        type: 'circle',
        radius: 11,
        fill: { type: 'solid', color: '#f97316' },
        stroke: { color: '#ffffff', width: 3 }
      }
    };
  }
  if (render === 'LineString') return { strokes: [{ color: '#f97316', width: 6 }] };
  return {
    strokes: [{ color: '#ea580c', width: 4 }],
    fill: { type: 'solid', color: 'rgba(249, 115, 22, 0.32)' }
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
  controlPointCount.value = 0;
  sessionResultCount.value = 0;
};

const selectShape = (entry: DrawShapeEntry) => {
  if (isActive.value) return;
  selectedType.value = entry.type;
  selectedCategory.value = categoryFor(entry.type);
  controlPointCount.value = 0;
  historyResult.value = '尚未操作';
  stage.value = `已选择 ${entry.label}，${entry.finish}`;
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
  stage.value = `正在绘制 ${selectedEntry.value.label}：${selectedEntry.value.finish}`;
  historyResult.value = '可使用按钮或 Ctrl/Cmd + Z / Y';

  disposers = [
    session.on('start', () => {
      stage.value = '草图已开始，临时预览尚未写入 Store';
    }),
    session.on('click', ({ controlPointCount: count }) => {
      controlPointCount.value = count;
      stage.value = `已接受 ${count} 个控制点；${selectedEntry.value.finish}`;
    }),
    session.on('change', ({ geometry }) => {
      stage.value = `${geometry.type} 工作预览中（最终渲染为 ${selectedEntry.value.render}）`;
    }),
    session.on('complete', () => {
      sessionResultCount.value = session.results.length;
      refreshQueryCount();
      stage.value = `${selectedEntry.value.label} 已提交为 Element`;
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

const focus = () => {
  const earth = earthRef.value;
  const center = mapCenter.value;
  if (earth === null || center === null) return;
  earth.view.flyTo(center, 10);
};

const reset = () => {
  destroySession();
  earthRef.value?.draw.clear({ module: MODULE });
  selectedCategory.value = 'basic';
  selectedType.value = DEFAULT_TYPE;
  queryCount.value = 0;
  historyResult.value = '尚未操作';
  stage.value = '示例已重置：请选择 Shape 并启动绘制';
  focus();
};

defineExpose({ reset, focus });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: RESULT_LAYER_ID, zIndex: 30 });
  mapCenter.value = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.view.flyTo(mapCenter.value, 10);
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
      title="20 种公开 Shape 共用同一个 earth.draw.start()；目录同时说明输入规则、完成方式与最终几何。"
    />

    <el-tabs v-model="selectedCategory" class="draw-session-demo__catalog-tabs">
      <el-tab-pane v-for="category in drawCategories" :key="category.id" :name="category.id" :label="`${category.label}（${category.entries.length}）`">
        <el-scrollbar max-height="260px">
          <div class="draw-session-demo__catalog" :aria-label="`${category.label} Shape 目录`">
            <el-button
              v-for="entry in category.entries"
              :key="entry.type"
              class="draw-session-demo__shape-card"
              :class="{ 'is-selected': selectedType === entry.type }"
              :type="selectedType === entry.type ? 'primary' : 'default'"
              :plain="selectedType !== entry.type"
              :disabled="isActive"
              :aria-pressed="selectedType === entry.type"
              @click="selectShape(entry)"
            >
              <span class="draw-session-demo__shape-name">{{ entry.label }}</span>
              <code>{{ entry.type }}</code>
              <small>{{ entry.points }}</small>
            </el-button>
          </div>
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>

    <el-descriptions class="draw-session-demo__shape-detail" :column="2" border>
      <el-descriptions-item label="当前 Shape">{{ selectedEntry.label }} · {{ selectedEntry.type }}</el-descriptions-item>
      <el-descriptions-item label="输入规则">{{ selectedEntry.points }}</el-descriptions-item>
      <el-descriptions-item label="完成方式">{{ selectedEntry.finish }}</el-descriptions-item>
      <el-descriptions-item label="最终 geometry">{{ selectedEntry.render }}</el-descriptions-item>
      <el-descriptions-item label="形状说明" :span="2">{{ selectedEntry.description }}</el-descriptions-item>
    </el-descriptions>

    <div class="example-demo__control-panel">
      <div class="example-demo__control-grid draw-session-demo__controls">
        <div class="example-demo__action-group">
          <span>会话启动</span>
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="start">启动 {{ selectedEntry.label }}</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>历史</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!isActive" @click="undo">撤销</el-button>
            <el-button :disabled="!isActive" @click="redo">重做</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>会话结束</span>
          <div class="example-demo__action-buttons">
            <el-button :disabled="!isActive" @click="finish">完成</el-button>
            <el-button :disabled="!isActive" @click="cancel">取消</el-button>
            <el-button :disabled="sessionRef === null" @click="destroySession">销毁 Session</el-button>
          </div>
        </div>
        <div class="example-demo__action-group">
          <span>成果</span>
          <div class="example-demo__action-buttons">
            <el-button plain @click="queryResults">查询成果</el-button>
            <el-button plain type="danger" @click="clearResults">清空成果</el-button>
          </div>
        </div>
      </div>
      <div class="example-demo__feedback" aria-live="polite">
        <el-tag :type="isActive ? 'success' : 'info'">{{ status }}</el-tag>
        <span>{{ stage }}</span>
      </div>
    </div>

    <div class="draw-session-demo__map-shell">
      <div ref="mapTarget" class="example-stage"></div>
      <div class="draw-session-demo__map-guide">{{ selectedEntry.finish }}</div>
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
.draw-session-demo__catalog-tabs {
  margin-bottom: 12px;
}

.draw-session-demo__catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  padding: 2px 4px 8px 2px;
}

.draw-session-demo__shape-card.el-button {
  min-width: 0;
  height: auto;
  margin: 0;
  padding: 10px 12px;
  white-space: normal;
}

.draw-session-demo__shape-card :deep(span) {
  display: grid;
  width: 100%;
  justify-items: start;
  gap: 3px;
  text-align: left;
}

.draw-session-demo__shape-card code,
.draw-session-demo__shape-card small {
  overflow-wrap: anywhere;
}

.draw-session-demo__shape-name {
  font-weight: 650;
}

.draw-session-demo__shape-detail {
  margin-bottom: 12px;
}

.draw-session-demo__controls {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
  align-items: stretch;
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

@media (max-width: 640px) {
  .draw-session-demo__catalog {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .draw-session-demo__shape-detail :deep(.el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
