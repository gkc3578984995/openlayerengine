<script setup lang="ts">
defineProps<{
  id: string;
  title: string;
  lead?: string;
}>();
</script>

<template>
  <section :id="id" class="doc-section">
    <div class="doc-section__header">
      <h2>{{ title }}</h2>
      <p v-if="lead">{{ lead }}</p>
    </div>
    <div class="doc-section__body">
      <slot />
    </div>
  </section>
</template>
