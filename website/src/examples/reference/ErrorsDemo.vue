<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  CapabilityError,
  DuplicateElementIdError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError
} from '@vrsim/earth-engine-ol';

interface ErrorClass {
  new (message?: string): Error;
}

interface ErrorDefinition {
  name: string;
  ctor: ErrorClass;
  sample: string;
}

interface RecognitionRow {
  thrown: string;
  instanceOfError: boolean;
  matchedClass: string;
  name: string;
  message: string;
}

const definitions: readonly ErrorDefinition[] = [
  { name: 'InvalidArgumentError', ctor: InvalidArgumentError, sample: '示例参数不符合契约' },
  { name: 'DuplicateElementIdError', ctor: DuplicateElementIdError, sample: 'Element demo-marker 已存在' },
  { name: 'InvalidSelectorError', ctor: InvalidSelectorError, sample: '破坏性操作需要明确选择条件' },
  { name: 'ObjectDisposedError', ctor: ObjectDisposedError, sample: '旧句柄已经失效' },
  { name: 'CapabilityError', ctor: CapabilityError, sample: '目标没有声明所需能力' },
  { name: 'InteractionConflictError', ctor: InteractionConflictError, sample: 'reject 策略拒绝交互冲突' },
  { name: 'UnsupportedOperationError', ctor: UnsupportedOperationError, sample: '当前场景不支持该操作' }
];

const selected = ref(definitions[0].name);
const rows = ref<RecognitionRow[]>([]);

const selectedDefinition = computed(() => definitions.find(({ name }) => name === selected.value) ?? definitions[0]);

const recognize = (error: unknown, thrown: string): RecognitionRow => {
  const matched = definitions.find(({ ctor }) => error instanceof ctor);
  return {
    thrown,
    instanceOfError: error instanceof Error,
    matchedClass: matched?.name ?? '未识别',
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error)
  };
};

const runOne = () => {
  const definition = selectedDefinition.value;
  try {
    throw new definition.ctor(definition.sample);
  } catch (error) {
    rows.value = [recognize(error, definition.name)];
  }
};

const runAll = () => {
  rows.value = definitions.map((definition) => {
    try {
      throw new definition.ctor(definition.sample);
    } catch (error) {
      return recognize(error, definition.name);
    }
  });
};
</script>

<template>
  <div class="example-demo">
    <el-alert type="info" :closable="false" show-icon title="优先使用 instanceof 分支处理；name 适合日志和跨边界诊断，不要解析可能变化的 message。" />

    <div class="errors-demo__controls">
      <el-select v-model="selected" aria-label="选择错误类型">
        <el-option v-for="definition in definitions" :key="definition.name" :label="definition.name" :value="definition.name" />
      </el-select>
      <el-button type="primary" @click="runOne">抛出并识别所选错误</el-button>
      <el-button @click="runAll">依次运行全部 7 类</el-button>
    </div>

    <el-table :data="rows" border empty-text="选择错误后运行示例">
      <el-table-column prop="thrown" label="抛出类型" min-width="190" />
      <el-table-column label="instanceof Error" width="150">
        <template #default="scope">
          <el-tag :type="scope.row.instanceOfError ? 'success' : 'danger'" effect="plain">{{ scope.row.instanceOfError ? 'true' : 'false' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="matchedClass" label="instanceof 命中" min-width="190" />
      <el-table-column prop="name" label="error.name" min-width="190" />
      <el-table-column prop="message" label="message" min-width="250" />
    </el-table>
  </div>
</template>

<style scoped>
.errors-demo__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0;
}

.errors-demo__controls :deep(.el-select) {
  width: min(100%, 280px);
}
</style>
