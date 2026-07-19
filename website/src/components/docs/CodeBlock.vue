<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { CodeLanguage } from '../../utils/highlight';

const props = withDefaults(
  defineProps<{
    code: string;
    lang?: CodeLanguage;
  }>(),
  { lang: 'typescript' }
);

const html = ref('');
const status = ref<'error' | 'loading' | 'ready'>('loading');
let renderVersion = 0;

const render = async () => {
  const version = ++renderVersion;
  status.value = 'loading';
  try {
    const { highlight } = await import('../../utils/highlight');
    const rendered = await highlight(props.code, props.lang);
    if (version !== renderVersion) return;
    html.value = rendered;
    status.value = 'ready';
  } catch {
    if (version !== renderVersion) return;
    html.value = '';
    status.value = 'error';
  }
};

watch([() => props.code, () => props.lang], render, { immediate: true });
onBeforeUnmount(() => {
  renderVersion += 1;
});
</script>

<template>
  <div class="code-block-highlight" :aria-busy="status === 'loading'">
    <p v-if="status === 'loading'" class="code-block-highlight__status" role="status">正在加载代码高亮…</p>
    <template v-else-if="status === 'error'">
      <p class="code-block-highlight__status" role="status">代码高亮加载失败，已显示纯文本。</p>
      <pre class="code-block-highlight__fallback"><code>{{ code }}</code></pre>
    </template>
    <div v-else v-html="html"></div>
  </div>
</template>

<style scoped>
.code-block-highlight__status {
  margin: 0;
  padding: 18px 20px;
  color: var(--doc-muted);
  font-size: 13px;
}

.code-block-highlight__fallback {
  color: var(--doc-text);
  white-space: pre;
}
</style>
