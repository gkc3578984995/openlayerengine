<script setup lang="ts">
interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

defineProps<{
  title?: string;
  items: AnchorItem[];
}>();
</script>

<template>
  <el-affix class="page-anchor" :offset="80" target=".docs-main">
    <p v-if="title" class="page-anchor__title">{{ title }}</p>
    <el-anchor
      :offset="80"
      :bound="24"
      :duration="300"
      direction="vertical"
    >
      <template v-for="item in items" :key="item.id">
        <el-anchor-link :href="`#${item.id}`" :title="item.label" />
        <el-anchor-link
          v-for="child in item.children"
          :key="child.id"
          :href="`#${child.id}`"
          :title="child.label"
          class="page-anchor__child"
        />
      </template>
    </el-anchor>
  </el-affix>
</template>
