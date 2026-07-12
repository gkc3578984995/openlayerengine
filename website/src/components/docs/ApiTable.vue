<script setup lang="ts">
interface ApiColumn {
  prop: string;
  label: string;
  width?: string | number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}

defineProps<{
  columns: ApiColumn[];
  rows: Array<Record<string, string>>;
}>();
</script>

<template>
  <el-table :data="rows" class="api-table" stripe :border="false">
    <el-table-column
      v-for="col in columns"
      :key="col.prop"
      :prop="col.prop"
      :label="col.label"
      :min-width="col.width ?? 160"
    >
      <template #default="{ row }">
        <code v-if="col.monospace" class="api-table__code" v-html="row[col.prop]"></code>
        <span v-else :class="col.presentation ? `api-table__${col.presentation}` : undefined" v-html="row[col.prop]"></span>
      </template>
    </el-table-column>
  </el-table>
</template>
