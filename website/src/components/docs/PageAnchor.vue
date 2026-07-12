<script setup lang="ts">
import type { Ref } from 'vue';
import { inject, ref } from 'vue';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

defineProps<{
  title?: string;
  items: AnchorItem[];
}>();

const scrollContainer = inject<Readonly<Ref<HTMLElement | null>>>('docsMainScrollContainer', ref(null));
</script>

<template>
  <el-affix class="page-anchor" :offset="80" target=".docs-main">
    <p v-if="title" class="page-anchor__title">{{ title }}</p>
    <el-anchor
      :container="scrollContainer"
      :offset="80"
      :bound="24"
      :duration="300"
      direction="vertical"
    >
      <template v-for="item in items" :key="item.id">
        <el-anchor-link :href="`#${item.id}`" :title="item.label" />
        <template v-for="child in item.children" :key="child.id">
          <el-anchor-link :href="`#${child.id}`" :title="child.label" class="page-anchor__child" />
          <el-anchor-link v-for="grandchild in child.children" :key="grandchild.id" :href="`#${grandchild.id}`" :title="grandchild.label" class="page-anchor__grandchild" />
        </template>
      </template>
    </el-anchor>
  </el-affix>
</template>
