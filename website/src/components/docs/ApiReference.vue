<script setup lang="ts">
type ApiReferenceKind = 'method' | 'property' | 'type' | 'constructor';

const props = defineProps<{
  kind: ApiReferenceKind;
  to: string;
}>();

defineSlots<{
  default(): unknown;
}>();

const kindLabels: Record<ApiReferenceKind, string> = {
  method: '方法',
  property: '属性',
  type: '类型',
  constructor: '构造'
};
</script>

<template>
  <a :href="props.to" class="api-reference" :class="`api-reference--${props.kind}`" :data-api-kind="props.kind">
    <span class="api-reference__kind">{{ kindLabels[props.kind] }}</span>
    <code class="api-reference__name"><slot /></code>
  </a>
</template>
