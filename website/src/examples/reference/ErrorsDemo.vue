<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Style from 'ol/style/Style.js';
import {
  CapabilityError,
  DuplicateElementIdError,
  Earth,
  ElementProtectedError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError,
  type Coordinate,
  type DrawSession
} from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

type ErrorClass =
  | typeof InvalidArgumentError
  | typeof DuplicateElementIdError
  | typeof InvalidSelectorError
  | typeof ObjectDisposedError
  | typeof CapabilityError
  | typeof InteractionConflictError
  | typeof ElementProtectedError
  | typeof UnsupportedOperationError;

interface ErrorDefinition {
  readonly name: string;
  readonly ctor: ErrorClass;
  readonly trigger: string;
  readonly recovery: string;
  readonly run: (earth: Earth) => void;
  readonly recover: (earth: Earth) => string;
}

interface RecognitionRow {
  readonly expected: string;
  readonly apiCall: string;
  readonly matchedClass: string;
  readonly name: string;
  readonly message: string;
  readonly recovery: string;
}

const LAYER_ID = 'docs-errors-targets';
const TARGET_ID = 'docs-errors-point';
const TEMP_MODULE = 'docs-errors-temporary';
const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const mapCenter = shallowRef<Coordinate | null>(null);
const rows = ref<RecognitionRow[]>([]);
let sequence = 0;
let protectionRevision = 0;
let conflictDraw: DrawSession | undefined;

const nextId = (prefix: string) => `${prefix}-${++sequence}`;

const pointInput = (id: string) => ({
  id,
  layerId: LAYER_ID,
  module: TEMP_MODULE,
  geometry: { type: 'point' as const, controlPoints: [[0, 0]] },
  style: { symbol: { type: 'circle' as const, radius: 8, fill: { type: 'solid' as const, color: '#f97316' } } }
});

const structuredTargetStyle = () => ({
  symbol: {
    type: 'circle' as const,
    radius: 12,
    fill: { type: 'solid' as const, color: '#2563eb' },
    stroke: { color: '#ffffff', width: 3 }
  }
});

const definitions: readonly ErrorDefinition[] = [
  {
    name: 'InvalidArgumentError',
    ctor: InvalidArgumentError,
    trigger: 'elements.add() 写入没有控制点的 Point',
    recovery: '补充一个有限坐标后重新 add()',
    run: (earth) => {
      earth.elements.add({
        ...pointInput(nextId('invalid')),
        geometry: { type: 'point', controlPoints: [] }
      });
    },
    recover: (earth) => {
      const element = earth.elements.add(pointInput(nextId('valid')));
      element.remove();
      return '已用 1 个控制点创建成功，并清理临时 Element';
    }
  },
  {
    name: 'DuplicateElementIdError',
    ctor: DuplicateElementIdError,
    trigger: `elements.add() 重复使用 ${TARGET_ID}`,
    recovery: '先 get() 判断，再使用新的业务 ID',
    run: (earth) => {
      earth.elements.add(pointInput(TARGET_ID));
    },
    recover: (earth) => {
      const current = earth.elements.get(TARGET_ID);
      const replacement = earth.elements.add(pointInput(nextId('unique')));
      replacement.remove();
      return `get() 找到现有目标：${current !== undefined ? '是' : '否'}；新 ID 创建成功`;
    }
  },
  {
    name: 'InvalidSelectorError',
    ctor: InvalidSelectorError,
    trigger: 'elements.remove({}) 传入空破坏性选择器',
    recovery: '改用明确 module 选择器，清空全部则使用 clear()',
    run: (earth) => {
      earth.elements.remove({} as never);
    },
    recover: (earth) => {
      const temporary = earth.elements.add(pointInput(nextId('selector')));
      const removed = earth.elements.remove({ id: temporary.id });
      return `明确 id 后移除 ${removed} 个 Element`;
    }
  },
  {
    name: 'ObjectDisposedError',
    ctor: ObjectDisposedError,
    trigger: '移除 Element 后继续调用旧句柄 update()',
    recovery: '丢弃旧句柄，通过 add()/get() 获取当前代次句柄',
    run: (earth) => {
      const stale = earth.elements.add(pointInput(nextId('disposed')));
      stale.remove();
      stale.update({ visible: false });
    },
    recover: (earth) => {
      const current = earth.elements.add(pointInput(nextId('current')));
      current.update({ visible: false });
      current.remove();
      return '新句柄 update() 成功，旧句柄未被复用';
    }
  },
  {
    name: 'CapabilityError',
    ctor: CapabilityError,
    trigger: '对 Point 播放只支持路径目标的 path-travel',
    recovery: '查询兼容范围，改用 Point 支持的 pulse',
    run: (earth) => {
      earth.styles.set({ id: TARGET_ID }, structuredTargetStyle());
      earth.animations.play({ id: TARGET_ID }, { type: 'path-travel' });
    },
    recover: (earth) => {
      const handle = earth.animations.play({ id: TARGET_ID }, { type: 'pulse', periodMs: 300 });
      handle.stop();
      return 'pulse 已成功启动并通过 Handle.stop() 清理';
    }
  },
  {
    name: 'InteractionConflictError',
    ctor: InteractionConflictError,
    trigger: "Draw 活动时以 policy: 'reject' 启动 Measure",
    recovery: '取消旧 Draw，再启动并取消 Measure',
    run: (earth) => {
      conflictDraw = earth.draw.start({ type: 'polygon', layerId: LAYER_ID, module: TEMP_MODULE, policy: 'replace' });
      earth.measure.start({ type: 'area', policy: 'reject' });
    },
    recover: (earth) => {
      conflictDraw?.cancel();
      conflictDraw = undefined;
      const measure = earth.measure.start({ type: 'area', policy: 'reject' });
      measure.cancel();
      return '旧会话取消后 Measure 启动成功；取消后 Interaction 回到基线';
    }
  },
  {
    name: 'ElementProtectedError',
    ctor: ElementProtectedError,
    trigger: '为协同保护中的目标启动 draw.edit()',
    recovery: '应用更高 revision 的解锁消息，再重新发起并取消 Edit',
    run: (earth) => {
      earth.elements.setProtection(TARGET_ID, {
        protected: true,
        operatorId: 'remote-editor',
        operatorName: '远端协作者',
        revision: ++protectionRevision
      });
      const target = earth.elements.get(TARGET_ID);
      if (target === undefined) throw new Error('错误示例目标不存在');
      earth.draw.edit(target, { policy: 'replace' });
    },
    recover: (earth) => {
      earth.elements.setProtection(TARGET_ID, { protected: false, revision: ++protectionRevision });
      const target = earth.elements.get(TARGET_ID);
      if (target === undefined) return '目标不存在，无法恢复 Edit';
      const edit = earth.draw.edit(target, { policy: 'replace' });
      edit.cancel();
      edit.destroy();
      return '更高 revision 已解锁；Edit 启动成功并完成清理';
    }
  },
  {
    name: 'UnsupportedOperationError',
    ctor: UnsupportedOperationError,
    trigger: '把目标切到 nativeStyle 后调用结构化 styles.patch()',
    recovery: '完整替换回 StyleSpec，再执行结构化 patch()',
    run: (earth) => {
      earth.styles.set({ id: TARGET_ID }, { nativeStyle: new Style() });
      earth.styles.patch({ id: TARGET_ID }, { symbol: { scale: 1.4 } });
    },
    recover: (earth) => {
      earth.styles.set({ id: TARGET_ID }, structuredTargetStyle());
      earth.styles.patch({ id: TARGET_ID }, { symbol: { radius: 14 } });
      return '已恢复 StyleSpec，symbol.radius patch 成功';
    }
  }
];

const selected = ref(definitions[0].name);
const selectedDefinition = computed(() => definitions.find(({ name }) => name === selected.value) ?? definitions[0]);

const recognize = (error: unknown, definition: ErrorDefinition, recovery: string): RecognitionRow => {
  const matched = definitions.find(({ ctor }) => error instanceof ctor);
  return {
    expected: definition.name,
    apiCall: definition.trigger,
    matchedClass: matched?.name ?? '未识别',
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    recovery
  };
};

const execute = (definition: ErrorDefinition): RecognitionRow => {
  const earth = earthRef.value;
  if (earth === null) {
    return {
      expected: definition.name,
      apiCall: definition.trigger,
      matchedClass: '地图未就绪',
      name: 'Unavailable',
      message: 'Earth 尚未初始化',
      recovery: '等待初始化'
    };
  }
  let caught: unknown;
  try {
    definition.run(earth);
  } catch (error) {
    caught = error;
  }
  let recovery: string;
  try {
    recovery = definition.recover(earth);
  } catch (error) {
    recovery = error instanceof Error ? `恢复失败：${error.name} · ${error.message}` : `恢复失败：${String(error)}`;
  }
  return recognize(caught, definition, recovery);
};

const runOne = () => {
  rows.value = [execute(selectedDefinition.value)];
};

const runAll = () => {
  rows.value = definitions.map(execute);
};

const focus = () => {
  const earth = earthRef.value;
  const center = mapCenter.value;
  if (earth === null || center === null) return;
  earth.view.flyTo(center, 10);
};

const reset = () => {
  conflictDraw?.cancel();
  conflictDraw = undefined;
  earthRef.value?.animations.stopAll();
  earthRef.value?.measure.clear();
  earthRef.value?.elements.setProtection(TARGET_ID, { protected: false, revision: ++protectionRevision });
  earthRef.value?.elements.remove({ module: TEMP_MODULE });
  if (earthRef.value?.elements.get(TARGET_ID) !== undefined) earthRef.value.styles.set({ id: TARGET_ID }, structuredTargetStyle());
  rows.value = [];
  selected.value = definitions[0].name;
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
  earth.layers.add({ kind: 'vector', id: LAYER_ID, zIndex: 30 });
  mapCenter.value = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.elements.add({
    id: TARGET_ID,
    layerId: LAYER_ID,
    module: 'docs-errors-target',
    geometry: { type: 'point', controlPoints: [mapCenter.value] },
    style: structuredTargetStyle(),
    data: { role: 'stable-error-target' }
  });
  earthRef.value = earth;
  focus();
});

onBeforeUnmount(() => {
  conflictDraw?.cancel();
  conflictDraw = undefined;
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo errors-demo">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="每一项都调用真实 Earth API 触发错误，捕获后立即执行对应恢复路径；示例没有手工 new 或 throw 错误实例。"
    />

    <div class="example-demo__toolbar errors-demo__controls" role="group" aria-label="错误场景控制">
      <el-select v-model="selected" aria-label="选择错误类型">
        <el-option v-for="definition in definitions" :key="definition.name" :label="definition.name" :value="definition.name" />
      </el-select>
      <el-button type="primary" @click="runOne">运行所选真实失败与恢复</el-button>
      <el-button @click="runAll">依次运行全部 8 类</el-button>
    </div>

    <el-descriptions :column="1" border>
      <el-descriptions-item label="真实触发">{{ selectedDefinition.trigger }}</el-descriptions-item>
      <el-descriptions-item label="恢复动作">{{ selectedDefinition.recovery }}</el-descriptions-item>
    </el-descriptions>

    <div class="errors-demo__map-shell">
      <div ref="mapTarget" class="example-stage errors-demo__map"></div>
      <div class="errors-demo__map-guide">蓝色点是真实 API 目标；恢复完成后仍可见且可继续操作</div>
    </div>

    <el-table :data="rows" border empty-text="选择错误后运行真实 API 场景">
      <el-table-column prop="expected" label="预期类型" min-width="190" />
      <el-table-column prop="apiCall" label="真实 API 场景" min-width="280" />
      <el-table-column prop="matchedClass" label="instanceof 命中" min-width="190" />
      <el-table-column prop="name" label="error.name" min-width="190" />
      <el-table-column prop="message" label="message" min-width="260" />
      <el-table-column prop="recovery" label="恢复结果" min-width="300" />
    </el-table>
  </div>
</template>

<style scoped>
.errors-demo__controls {
  gap: 10px;
}

.errors-demo__controls :deep(.el-select) {
  width: min(100%, 280px);
}

.errors-demo__controls > *,
.errors-demo__controls :deep(.el-button) {
  max-width: 100%;
}

.errors-demo__controls :deep(.el-button + .el-button) {
  margin-left: 0;
}

.errors-demo__map-shell {
  position: relative;
  overflow: hidden;
  margin: 14px 0;
  border-radius: 8px;
}

.errors-demo__map {
  min-height: 300px;
}

.errors-demo__map-guide {
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

@media (max-width: 560px) {
  .errors-demo__controls {
    display: grid;
    grid-template-columns: 1fr;
  }

  .errors-demo__controls :deep(.el-select),
  .errors-demo__controls :deep(.el-button) {
    width: 100%;
  }

  .errors-demo__controls :deep(.el-button) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }

  .errors-demo__map-guide {
    position: static;
    max-width: none;
    border-radius: 0;
    transform: none;
  }
}
</style>
