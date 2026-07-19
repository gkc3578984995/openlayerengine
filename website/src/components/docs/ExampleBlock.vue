<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, useSlots } from 'vue';
import { Aim, ArrowDown, ArrowUp, CopyDocument, RefreshRight } from '@element-plus/icons-vue';
import CodeBlock from './CodeBlock.vue';
import type { CodeLanguage } from '../../utils/highlight';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    source: string;
    snippet?: string;
    sourceLang?: CodeLanguage;
    snippetLang?: CodeLanguage;
    showReset?: boolean;
    showFocus?: boolean;
  }>(),
  { sourceLang: 'vue', snippetLang: 'typescript', showReset: false, showFocus: false }
);

const emit = defineEmits<{
  reset: [];
  focus: [];
}>();
const slots = useSlots();
const expanded = ref(false);
const sourceMode = ref<'snippet' | 'source'>('source');
const copyState = ref<'error' | 'idle' | 'success'>('idle');
const sourcePanelId = `example-source-${useId()}`;
const hasPreview = computed(() => slots.preview !== undefined);
const hasSnippet = computed(() => props.snippet !== undefined);
const displaysSnippet = computed(() => hasSnippet.value && sourceMode.value === 'snippet');
const displayedSource = computed(() => (displaysSnippet.value ? (props.snippet ?? '') : props.source));
const displayedLanguage = computed(() => (displaysSnippet.value ? props.snippetLang : props.sourceLang));
const languageLabels: Record<CodeLanguage, string> = {
  bash: 'Shell',
  json: 'JSON',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  vue: 'Vue'
};
const displayedLanguageLabel = computed(() => languageLabels[displayedLanguage.value]);
const sourceOptions = [
  { label: '核心代码', value: 'snippet' },
  { label: '完整文件', value: 'source' }
];
const copyButtonLabel = computed(() => {
  if (copyState.value === 'success') return '已复制';
  if (copyState.value === 'error') return '复制失败';
  return '复制代码';
});
let copyStateTimer: ReturnType<typeof setTimeout> | undefined;

const toggle = () => {
  expanded.value = !expanded.value;
};

const copy = async (source: string) => {
  if (copyStateTimer !== undefined) clearTimeout(copyStateTimer);
  try {
    await navigator.clipboard.writeText(source);
    copyState.value = 'success';
  } catch {
    copyState.value = 'error';
  }
  copyStateTimer = setTimeout(() => {
    copyState.value = 'idle';
    copyStateTimer = undefined;
  }, 1600);
};

onBeforeUnmount(() => {
  if (copyStateTimer !== undefined) clearTimeout(copyStateTimer);
});
</script>

<template>
  <div class="example-block">
    <h3 class="example-block__title">{{ title }}</h3>
    <div v-if="description || slots.description" class="example-block__desc">
      <slot name="description">
        <span v-html="description"></span>
      </slot>
    </div>

    <div class="example-block__card">
      <div class="example-block__preview">
        <slot name="preview" />
      </div>
      <div class="example-block__toggle" role="group" :aria-label="`${title}示例工具栏`">
        <div v-if="hasPreview && (showReset || showFocus)" class="example-block__toolbar-section" role="group" aria-label="运行示例操作">
          <el-button
            v-if="showReset"
            class="example-block__toolbar-button"
            size="small"
            text
            :icon="RefreshRight"
            :aria-label="`重置${title}运行示例`"
            @click="emit('reset')"
          >
            重置示例
          </el-button>
          <el-button
            v-if="showFocus"
            class="example-block__toolbar-button"
            size="small"
            text
            :icon="Aim"
            :aria-label="`定位${title}运行示例`"
            @click="emit('focus')"
          >
            定位示例
          </el-button>
        </div>
        <div class="example-block__toolbar-section example-block__toolbar-section--code" role="group" aria-label="示例代码操作">
          <el-button
            class="example-block__toolbar-button example-block__copy"
            size="small"
            text
            :icon="CopyDocument"
            :aria-label="`${copyButtonLabel}：${title}${displaysSnippet ? '核心代码' : '完整代码'}`"
            @click.stop="copy(displayedSource)"
          >
            <span aria-live="polite">{{ copyButtonLabel }}</span>
          </el-button>
          <el-button
            class="example-block__toolbar-button example-block__toggle-button"
            size="small"
            text
            :aria-expanded="expanded"
            :aria-controls="sourcePanelId"
            :aria-label="expanded ? `收起${title}完整代码` : `展开${title}完整代码`"
            @click="toggle"
          >
            <span>{{ expanded ? '收起完整代码' : '展开完整代码' }}</span>
            <el-icon :size="14" aria-hidden="true">
              <ArrowUp v-if="expanded" />
              <ArrowDown v-else />
            </el-icon>
          </el-button>
        </div>
      </div>
      <transition name="example-slide">
        <div :id="sourcePanelId" v-show="expanded" class="example-block__code" role="region" :aria-label="`${title}源代码`">
          <div class="example-block__code-header">
            <div class="example-block__code-meta">
              <el-segmented
                v-if="hasSnippet"
                v-model="sourceMode"
                class="example-block__source-switch"
                :options="sourceOptions"
                size="small"
                :aria-label="`选择${title}代码范围`"
              />
              <span class="example-block__lang">{{ displayedLanguageLabel }}</span>
            </div>
          </div>
          <el-scrollbar class="example-block__code-scrollbar" max-height="520px">
            <CodeBlock v-if="expanded" :code="displayedSource" :lang="displayedLanguage" />
          </el-scrollbar>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.example-block__toggle {
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  padding: 6px 8px;
}

.example-block__toolbar-section {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.example-block__toolbar-section--code {
  margin-left: auto;
}

.example-block__toolbar-button.el-button,
.example-block__toggle-button.el-button {
  width: auto;
  min-width: 0;
  padding: 8px 10px;
}

.example-block__toolbar-button.el-button:focus-visible {
  outline: 2px solid var(--doc-primary-deep);
  outline-offset: 1px;
}

.example-block__code-meta {
  display: flex;
  min-width: 0;
  width: 100%;
  align-items: center;
  gap: 12px;
}

.example-block__source-switch {
  flex: 0 0 auto;
}

.example-block__copy {
  flex: 0 0 auto;
}

@media (max-width: 560px) {
  .example-block__toggle {
    align-items: stretch;
  }

  .example-block__toolbar-section {
    width: 100%;
  }

  .example-block__toolbar-section--code {
    justify-content: flex-end;
    margin-left: 0;
  }

  .example-block__toolbar-button.el-button {
    flex: 1 1 auto;
  }

  .example-block__code-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .example-block__code-meta {
    width: 100%;
    justify-content: space-between;
  }

  .example-block__source-switch {
    max-width: 100%;
  }
}
</style>
