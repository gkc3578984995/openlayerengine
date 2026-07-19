<script setup lang="ts">
import TypeExpression from './TypeExpression.vue';

interface LegacyApiColumnPresentation {
  presentation?: 'property' | 'method';
}

type ApiColumnPresentation = NonNullable<LegacyApiColumnPresentation['presentation']> | 'type';

interface ApiColumn {
  prop: string;
  label: string;
  width?: string | number;
  monospace?: boolean;
  linkTypes?: boolean;
  presentation?: ApiColumnPresentation;
}

defineProps<{
  columns: ApiColumn[];
  rows: Array<Record<string, string | undefined>>;
}>();

function formatCellValue(column: ApiColumn, value: string | undefined) {
  const displayValue = value ?? '—';
  return column.prop === 'desc' ? displayValue.replace(/[。.]$/u, '') : displayValue;
}
</script>

<template>
  <el-table :data="rows" class="api-table" stripe :border="false">
    <el-table-column v-for="(col, columnIndex) in columns" :key="col.prop" :prop="col.prop" :label="col.label" :min-width="col.width ?? 160">
      <template #default="{ row }">
        <div :id="columnIndex === 0 ? row.anchor : undefined" class="api-table__cell" :class="{ 'api-table__cell--anchored': columnIndex === 0 && row.anchor }">
          <TypeExpression v-if="col.linkTypes" :value="row[col.prop] || '—'" />
          <code v-else-if="col.monospace" class="api-table__code" v-html="row[col.prop] || '—'"></code>
          <a
            v-else-if="columnIndex === 0 && row.href"
            :href="row.href"
            :class="col.presentation ? `api-table__${col.presentation}` : undefined"
            :aria-label="`查看 ${row.name} 的完整 API 定义`"
            v-html="formatCellValue(col, row[col.prop])"
          ></a>
          <span v-else :class="col.presentation ? `api-table__${col.presentation}` : undefined" v-html="formatCellValue(col, row[col.prop])"></span>
          <el-link
            v-if="columnIndex === 0 && row.anchor"
            class="api-table__self-link"
            :href="`#${row.anchor}`"
            underline="never"
            :aria-label="`${row.name} ${col.label}的直接链接`"
          >
            <span aria-hidden="true">#</span>
          </el-link>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>
