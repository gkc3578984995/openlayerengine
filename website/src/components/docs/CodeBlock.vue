<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { highlight } from '../../utils/highlight';

const props = withDefaults(
  defineProps<{
    code: string;
    lang?: string;
  }>(),
  { lang: 'typescript' }
);

const html = ref('');

const render = async () => {
  html.value = await highlight(props.code, props.lang);
};

onMounted(render);
watch(() => [props.code, props.lang], render);
</script>

<template>
  <div class="code-block-highlight" v-html="html"></div>
</template>
