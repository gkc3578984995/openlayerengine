<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowUp, CopyDocument } from '@element-plus/icons-vue';
import CodeBlock from './CodeBlock.vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    source: string;
    lang?: string;
    langLabel?: string;
  }>(),
  { lang: 'vue', langLabel: 'Vue' }
);

const expanded = ref(false);

const toggle = () => {
  expanded.value = !expanded.value;
};

const copy = async (source: string) => {
  try {
    await navigator.clipboard.writeText(source);
    ElMessage.success('代码已复制');
  } catch {
    ElMessage.error('复制失败');
  }
};
</script>

<template>
  <div class="example-block">
    <!-- 标题和说明在外面 -->
    <h3 class="example-block__title">{{ title }}</h3>
    <p v-if="description" class="example-block__desc" v-html="description"></p>

    <!-- 纯预览卡片 -->
    <div class="example-block__card">
      <div class="example-block__preview">
        <slot name="preview" />
      </div>
      <!-- 代码切换 -->
      <div class="example-block__toggle" @click="toggle">
        <span>{{ expanded ? '隐藏源代码' : '显示源代码' }}</span>
        <el-icon :size="14">
          <ArrowUp v-if="expanded" />
          <ArrowDown v-else />
        </el-icon>
      </div>
      <transition name="example-slide">
        <div v-show="expanded" class="example-block__code">
          <div class="example-block__code-header">
            <span class="example-block__lang">{{ langLabel }}</span>
            <el-button size="small" text :icon="CopyDocument" @click.stop="copy(source)">
              复制源代码
            </el-button>
          </div>
          <CodeBlock :code="source" :lang="lang" />
        </div>
      </transition>
    </div>
  </div>
</template>
