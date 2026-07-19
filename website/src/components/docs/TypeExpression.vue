<script setup lang="ts">
import { computed } from 'vue';
import { publicTypeAnchors } from '../../generated/api';

interface TypePart {
  text: string;
  anchor?: string;
}

const props = defineProps<{
  value: string;
}>();

const anchors = publicTypeAnchors as Readonly<Record<string, string>>;

const parts = computed<TypePart[]>(() => {
  const result: TypePart[] = [];
  const matcher = /[A-Za-z_$][\w$]*/g;
  let offset = 0;

  for (const match of props.value.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > offset) result.push({ text: props.value.slice(offset, index) });

    const text = match[0];
    result.push({ text, anchor: anchors[text] });
    offset = index + text.length;
  }

  if (offset < props.value.length) result.push({ text: props.value.slice(offset) });
  return result;
});
</script>

<template>
  <code class="type-expression">
    <template v-for="(part, index) in parts" :key="`${index}-${part.text}`">
      <RouterLink
        v-if="part.anchor"
        class="type-expression__link"
        :to="{ path: '/api/types', hash: `#${part.anchor}` }"
        :aria-label="`查看 ${part.text} 类型定义`"
      >
        {{ part.text }}
      </RouterLink>
      <span v-else>{{ part.text }}</span>
    </template>
  </code>
</template>
