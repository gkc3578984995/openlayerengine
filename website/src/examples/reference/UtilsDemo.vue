<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import {
  add2,
  closeRing,
  createId,
  degToRad,
  lerp2,
  quadraticBezier2,
  radToDeg,
  scale2,
  throttle,
  toFlatCoordinates,
  trimClosingCoordinate
} from '@vrsim/earth-engine-ol';
import type { Coordinate } from '@vrsim/earth-engine-ol';

interface ResultRow {
  name: string;
  result: string;
}

const ratio = ref(0.5);
const results = ref<ResultRow[]>([]);
const wait = ref(600);
const leading = ref(true);
const trailing = ref(true);
const executionCount = ref(0);
const lastThrottleValue = ref<number | undefined>();
const throttleStatus = ref('等待触发');

const createLimitedUpdate = () =>
  throttle(
    (value: number) => {
      executionCount.value += 1;
      lastThrottleValue.value = value;
      throttleStatus.value = `实际执行第 ${executionCount.value} 次，参数 ${value}`;
      return value;
    },
    wait.value,
    { leading: leading.value, trailing: trailing.value }
  );

let limitedUpdate = createLimitedUpdate();

const format = (value: unknown): string => JSON.stringify(value);

const runUtilities = () => {
  const start: Coordinate = [0, 0];
  const end: Coordinate = [10, 20];
  const control: Coordinate = [5, 16];
  const openRing: Coordinate[] = [
    [0, 0],
    [10, 0],
    [10, 10]
  ];
  const closed = closeRing(openRing);
  const radians = degToRad(450);

  results.value = [
    { name: 'add2', result: format(add2([1, 2], [3, 4])) },
    { name: 'scale2', result: format(scale2([2, 3], 2)) },
    { name: 'lerp2', result: format(lerp2(start, end, ratio.value)) },
    { name: 'quadraticBezier2', result: format(quadraticBezier2(start, control, end, ratio.value)) },
    { name: 'degToRad', result: radians.toFixed(6) },
    { name: 'radToDeg', result: radToDeg(radians).toFixed(2) },
    { name: 'closeRing', result: format(closed) },
    { name: 'trimClosingCoordinate', result: format(trimClosingCoordinate(closed)) },
    { name: 'toFlatCoordinates', result: format(toFlatCoordinates(openRing)) },
    { name: 'createId', result: createId() }
  ];
};

const rebuildThrottle = () => {
  limitedUpdate.cancel();
  limitedUpdate = createLimitedUpdate();
  executionCount.value = 0;
  lastThrottleValue.value = undefined;
  throttleStatus.value = `已重建：wait=${wait.value}ms，leading=${leading.value}，trailing=${trailing.value}`;
};

const triggerBurst = () => {
  for (let value = 1; value <= 5; value += 1) limitedUpdate(value);
  throttleStatus.value = '已连续调用 5 次；观察 leading 立即执行与 trailing 最后参数';
};

const flushThrottle = () => {
  const value = limitedUpdate.flush();
  throttleStatus.value = `flush() 返回 ${value ?? 'undefined'}；等待中的尾调用已立即处理`;
};

const cancelThrottle = () => {
  limitedUpdate.cancel();
  throttleStatus.value = 'cancel() 已取消尾调用并清空节流状态';
};

onBeforeUnmount(() => {
  limitedUpdate.cancel();
});
</script>

<template>
  <div class="example-demo">
    <el-card shadow="never" class="utils-demo__card">
      <template #header><strong>坐标、角度、曲线与 ID</strong></template>
      <div class="example-demo__control-panel utils-demo__controls">
        <div class="example-demo__field utils-demo__ratio-field">
          <span>插值比例</span>
          <el-slider v-model="ratio" :min="0" :max="1" :step="0.05" show-input aria-label="插值比例" />
        </div>
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons utils-demo__pure-actions">
            <el-button type="primary" @click="runUtilities">运行全部纯函数</el-button>
          </div>
        </div>
      </div>
      <el-table :data="results" size="small" border empty-text="点击“运行全部纯函数”查看结果">
        <el-table-column prop="name" label="函数" min-width="190" />
        <el-table-column prop="result" label="实际返回值" min-width="300" />
      </el-table>
    </el-card>

    <el-card shadow="never" class="utils-demo__card">
      <template #header><strong>throttle 的 leading、trailing、flush 与 cancel</strong></template>
      <div class="example-demo__control-panel utils-demo__throttle-controls">
        <el-form class="example-demo__control-grid utils-demo__form" inline label-position="top">
          <el-form-item label="wait（毫秒）">
            <el-input-number v-model="wait" :min="0" :max="3000" :step="100" @change="rebuildThrottle" />
          </el-form-item>
          <el-form-item label="首调用">
            <el-switch v-model="leading" active-text="leading" @change="rebuildThrottle" />
          </el-form-item>
          <el-form-item label="尾调用">
            <el-switch v-model="trailing" active-text="trailing" @change="rebuildThrottle" />
          </el-form-item>
        </el-form>
        <div class="example-demo__action-group utils-demo__toolbar" role="group" aria-label="throttle 调用控制">
          <div class="example-demo__action-buttons utils-demo__action-buttons">
            <el-button type="primary" @click="triggerBurst">连续调用 5 次</el-button>
            <el-button @click="flushThrottle">flush</el-button>
            <el-button type="danger" plain @click="cancelThrottle">cancel</el-button>
          </div>
        </div>
      </div>
      <el-descriptions :column="1" border aria-live="polite">
        <el-descriptions-item label="实际执行次数">{{ executionCount }}</el-descriptions-item>
        <el-descriptions-item label="最近参数">{{ lastThrottleValue ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ throttleStatus }}</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.utils-demo__card + .utils-demo__card {
  margin-top: 16px;
}

.utils-demo__card {
  border-color: var(--doc-border);
  background: var(--doc-surface);
}

.utils-demo__controls {
  grid-template-columns: minmax(220px, 1fr) auto;
  align-items: end;
  gap: 14px;
  margin-bottom: 14px;
}

.utils-demo__controls > *,
.utils-demo__form :deep(.el-form-item),
.utils-demo__form :deep(.el-input-number) {
  max-width: 100%;
}

.utils-demo__ratio-field {
  width: 100%;
}

.utils-demo__form :deep(.el-form-item) {
  margin-bottom: 0;
}

@media (max-width: 640px) {
  .utils-demo__controls {
    grid-template-columns: 1fr;
  }

  .utils-demo__controls :deep(.el-slider),
  .utils-demo__controls :deep(.el-button),
  .utils-demo__form :deep(.el-form-item) {
    width: 100%;
  }

  .utils-demo__form :deep(.el-form-item) {
    margin-right: 0;
  }

  .utils-demo__form :deep(.el-input-number) {
    width: min(100%, 220px);
  }

  .utils-demo__action-buttons {
    display: grid;
    grid-template-columns: 1fr;
  }

  .utils-demo__toolbar :deep(.el-button) {
    width: 100%;
    max-width: 100%;
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
}
</style>
