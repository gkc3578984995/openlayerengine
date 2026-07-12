<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <el-card class="demo-card" shadow="never">
    <template #header>
      <div class="demo-card__header">
        <div>
          <h3>{{ title }}</h3>
          <p v-if="description">{{ description }}</p>
        </div>
        <slot name="actions" />
      </div>
    </template>

    <div class="demo-card__preview">
      <slot name="preview" />
    </div>

    <div v-if="$slots.default" class="demo-card__extra">
      <slot />
    </div>
  </el-card>
</template>
