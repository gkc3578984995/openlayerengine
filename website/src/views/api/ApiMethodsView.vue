<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import TypeExpression from '../../components/docs/TypeExpression.vue';
import { apiModules, findApiModuleByMember, findApiModuleByRuntimeExport, findApiModuleByType, type ApiModuleDefinition } from '../../config/apiModules';
import * as generatedApiModel from '../../generated/api';

interface CatalogParameter {
  name: string;
  anchor: string;
  type: string;
  optional: boolean;
  defaultValue: string | null;
  summary: string;
}

interface CatalogTypeParameter {
  name: string;
  summary: string;
  constraint: string | null;
  default: string | null;
}

interface CatalogSignature {
  anchor: string;
  summary: string;
  typeParameters: CatalogTypeParameter[];
  parameters: CatalogParameter[];
  returns: string;
  throws?: string[];
}

interface CatalogCallable {
  name: string;
  anchor: string;
  summary: string;
  signatures: CatalogSignature[];
}

interface CatalogType {
  name: string;
  source: string;
  methods: CatalogCallable[];
  constructors: CatalogCallable[];
}

interface RuntimeExport {
  name: string;
  kind: 'function' | 'variable';
  anchor: string;
  summary: string;
  source: string;
  type: string | null;
  defaultValue: string | null;
  signatures: CatalogSignature[];
}

type MethodEntryKind = 'function' | 'constant' | 'constructor' | 'method';

interface MethodEntry {
  name: string;
  qualifiedName: string;
  owner?: string;
  kind: MethodEntryKind;
  anchor: string;
  summary: string;
  source: string;
  type?: string | null;
  defaultValue?: string | null;
  signatures: CatalogSignature[];
  module: ApiModuleDefinition;
}

interface MethodGroup {
  module: ApiModuleDefinition;
  entries: MethodEntry[];
}

const generated = generatedApiModel as unknown as {
  apiCatalog: readonly CatalogType[];
  apiRuntimeExports?: readonly RuntimeExport[];
};

const runtimeExports = generated.apiRuntimeExports ?? [];
const route = useRoute();
const keyword = ref('');
const selectedKind = ref<'all' | MethodEntryKind>('all');
const currentPage = ref(1);
const pageSize = ref(20);
const apiModuleOrder = new Map(apiModules.map((module, index) => [module.id, index] as const));

const entries = computed<MethodEntry[]>(() => {
  const result: MethodEntry[] = [];

  for (const item of generated.apiCatalog) {
    const module = findApiModuleByType(item.name);
    if (module === undefined) continue;

    for (const constructor of item.constructors) {
      result.push({
        name: item.name,
        qualifiedName: `new ${item.name}`,
        owner: item.name,
        kind: 'constructor',
        anchor: constructor.anchor,
        summary: constructor.summary,
        source: item.source,
        signatures: constructor.signatures,
        module: findApiModuleByMember(item.name, 'constructor') ?? module
      });
    }

    for (const method of item.methods) {
      result.push({
        name: method.name,
        qualifiedName: `${item.name}.${method.name}`,
        owner: item.name,
        kind: 'method',
        anchor: method.anchor,
        summary: method.summary,
        source: item.source,
        signatures: method.signatures,
        module: findApiModuleByMember(item.name, method.name) ?? module
      });
    }
  }

  for (const item of runtimeExports) {
    const module = findApiModuleByRuntimeExport(item.name);
    if (module === undefined) continue;
    result.push({
      name: item.name,
      qualifiedName: item.name,
      kind: item.kind === 'function' ? 'function' : 'constant',
      anchor: item.anchor,
      summary: item.summary,
      source: item.source,
      type: item.type,
      defaultValue: item.defaultValue,
      signatures: item.signatures,
      module
    });
  }

  return result.sort((left, right) => {
    const moduleOrder = (apiModuleOrder.get(left.module.id) ?? Number.MAX_SAFE_INTEGER) - (apiModuleOrder.get(right.module.id) ?? Number.MAX_SAFE_INTEGER);
    return moduleOrder || left.qualifiedName.localeCompare(right.qualifiedName, 'en');
  });
});

const normalizedKeyword = computed(() => keyword.value.trim().toLocaleLowerCase());

const searchableText = (entry: MethodEntry): string =>
  [
    entry.qualifiedName,
    entry.summary,
    entry.source,
    entry.type ?? '',
    entry.module.group,
    entry.module.label,
    ...entry.signatures.flatMap((signature) => [
      signature.summary,
      signature.returns,
      ...(signature.throws ?? []),
      ...signature.typeParameters.flatMap((parameter) => [parameter.name, parameter.summary, parameter.constraint ?? '', parameter.default ?? '']),
      ...signature.parameters.flatMap((parameter) => [parameter.name, parameter.type, parameter.defaultValue ?? '', parameter.summary])
    ])
  ]
    .join(' ')
    .toLocaleLowerCase();

const filteredEntries = computed(() =>
  entries.value.filter((entry) => {
    if (selectedKind.value !== 'all' && entry.kind !== selectedKind.value) return false;
    return normalizedKeyword.value.length === 0 || searchableText(entry).includes(normalizedKeyword.value);
  })
);

const pagedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredEntries.value.slice(start, start + pageSize.value);
});

const groups = computed<MethodGroup[]>(() =>
  apiModules.flatMap((module) => {
    const moduleEntries = pagedEntries.value.filter((entry) => entry.module === module);
    return moduleEntries.length === 0 ? [] : [{ module, entries: moduleEntries }];
  })
);

const counts = computed(() => ({
  all: entries.value.length,
  function: entries.value.filter((entry) => entry.kind === 'function').length,
  constant: entries.value.filter((entry) => entry.kind === 'constant').length,
  constructor: entries.value.filter((entry) => entry.kind === 'constructor').length,
  method: entries.value.filter((entry) => entry.kind === 'method').length
}));
const totalPages = computed(() => Math.max(1, Math.ceil(filteredEntries.value.length / pageSize.value)));

const kindLabels: Record<MethodEntryKind, string> = {
  function: '函数',
  constant: '常量',
  constructor: '构造函数',
  method: '方法'
};

const kindTagTypes: Record<MethodEntryKind, 'primary' | 'success' | 'warning' | 'info'> = {
  function: 'success',
  constant: 'info',
  constructor: 'warning',
  method: 'primary'
};

const definitionHref = (entry: MethodEntry): string => (entry.owner === undefined ? `/api/methods#${entry.anchor}` : `/api/types#${entry.anchor}`);

const reset = () => {
  keyword.value = '';
  selectedKind.value = 'all';
  currentPage.value = 1;
};

watch([keyword, selectedKind, pageSize], () => {
  currentPage.value = 1;
});

const revealHash = async (hash: string): Promise<void> => {
  const anchor = decodeURIComponent(hash.replace(/^#/, ''));
  if (!anchor.startsWith('api-')) return;
  keyword.value = '';
  selectedKind.value = 'all';
  await nextTick();
  const index = entries.value.findIndex(
    (entry) =>
      entry.anchor === anchor ||
      entry.signatures.some((signature) => signature.anchor === anchor || signature.parameters.some((parameter) => parameter.anchor === anchor))
  );
  if (index < 0) return;
  currentPage.value = Math.floor(index / pageSize.value) + 1;
  await nextTick();
  window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
};

watch(
  () => route.hash,
  (hash) => void revealHash(hash),
  { immediate: true, flush: 'post' }
);
</script>

<template>
  <article class="api-query-page">
    <header class="doc-hero api-query-hero">
      <span class="doc-hero__eyebrow">API 查询</span>
      <h1>方法</h1>
      <p>集中查询包根函数、运行时常量、公开构造函数以及实例和服务方法。签名与参数均直接来自 TypeDoc 生成数据。</p>
      <div class="api-query-stats" aria-label="公开方法统计">
        <el-tag type="success" effect="plain">{{ counts.function }} 个函数</el-tag>
        <el-tag type="info" effect="plain">{{ counts.constant }} 个常量</el-tag>
        <el-tag type="warning" effect="plain">{{ counts.constructor }} 个构造函数</el-tag>
        <el-tag effect="plain">{{ counts.method }} 个实例或服务方法</el-tag>
      </div>
    </header>

    <section class="api-query-toolbar" aria-label="方法筛选">
      <el-input v-model="keyword" clearable placeholder="搜索方法、所属类型、参数、返回值或说明" aria-label="搜索公开方法" />
      <el-select v-model="selectedKind" aria-label="按 API 种类筛选">
        <el-option label="全部种类" value="all" />
        <el-option label="函数" value="function" />
        <el-option label="常量" value="constant" />
        <el-option label="构造函数" value="constructor" />
        <el-option label="实例/服务方法" value="method" />
      </el-select>
      <el-button @click="reset">重置</el-button>
      <span class="api-query-toolbar__result">找到 {{ filteredEntries.length }} / {{ counts.all }} 项 API</span>
    </section>

    <div v-if="filteredEntries.length > pageSize" class="api-query-pagination" aria-label="方法查询分页">
      <span class="api-query-pagination__mobile-page">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="filteredEntries.length"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>

    <el-empty v-if="groups.length === 0" description="没有匹配的公开 API">
      <el-button type="primary" @click="reset">清除筛选</el-button>
    </el-empty>

    <template v-else>
      <section v-for="group in groups" :id="`api-module-${group.module.id}`" :key="group.module.id" class="api-query-group">
        <div class="api-query-group__heading">
          <div>
            <span>{{ group.module.group }}</span>
            <h2>{{ group.module.label }}</h2>
          </div>
          <el-tag type="info" effect="plain">{{ group.entries.length }} 项</el-tag>
        </div>

        <div class="api-method-list">
          <el-card v-for="entry in group.entries" :id="entry.anchor" :key="entry.anchor" class="api-method-card" shadow="never">
            <template #header>
              <div class="api-method-card__header">
                <div>
                  <el-tag :type="kindTagTypes[entry.kind]" size="small" effect="plain">{{ kindLabels[entry.kind] }}</el-tag>
                  <code>{{ entry.qualifiedName }}</code>
                </div>
                <el-link type="primary" :href="definitionHref(entry)">精确定义</el-link>
              </div>
            </template>

            <p class="api-method-card__summary">{{ entry.summary || '暂无说明。' }}</p>

            <div v-if="entry.kind === 'constant'" class="api-method-card__constant">
              <strong>类型</strong>
              <TypeExpression :value="entry.type ?? 'unknown'" />
              <span v-if="entry.defaultValue"
                >默认值：<code>{{ entry.defaultValue }}</code></span
              >
            </div>

            <template v-else>
              <div v-for="(signature, signatureIndex) in entry.signatures" :id="signature.anchor" :key="signature.anchor" class="api-method-card__signature">
                <div class="api-method-card__signature-heading">
                  <span>签名 {{ signatureIndex + 1 }}</span>
                  <span v-if="entry.signatures.length > 1">重载 {{ signatureIndex + 1 }} / {{ entry.signatures.length }}</span>
                </div>
                <p v-if="signature.summary" class="api-method-card__signature-summary">{{ signature.summary }}</p>
                <el-descriptions v-if="signature.typeParameters.length" :column="1" border size="small">
                  <el-descriptions-item v-for="parameter in signature.typeParameters" :key="parameter.name" :label="`类型参数 ${parameter.name}`">
                    <span>{{ parameter.summary || '泛型参数' }}</span>
                    <TypeExpression v-if="parameter.constraint" :value="`约束：${parameter.constraint}`" />
                    <TypeExpression v-if="parameter.default" :value="`默认：${parameter.default}`" />
                  </el-descriptions-item>
                </el-descriptions>
                <div class="api-method-card__parameters">
                  <template v-if="signature.parameters.length > 0">
                    <div v-for="parameter in signature.parameters" :id="parameter.anchor" :key="parameter.anchor" class="api-method-card__parameter">
                      <code>{{ parameter.name }}{{ parameter.optional ? '?' : '' }}</code>
                      <TypeExpression :value="parameter.type" />
                      <span v-if="parameter.defaultValue">= {{ parameter.defaultValue }}</span>
                      <small>{{ parameter.summary }}</small>
                    </div>
                  </template>
                  <span v-else class="api-method-card__empty-parameter">—</span>
                </div>
                <div class="api-method-card__returns"><strong>返回</strong><TypeExpression :value="signature.returns" /></div>
                <p v-if="signature.throws?.length" class="api-method-card__throws"><strong>异常</strong>{{ signature.throws.join('；') }}</p>
              </div>
            </template>

            <div class="api-method-card__source">
              <code>{{ entry.source }}</code>
            </div>
          </el-card>
        </div>
      </section>
    </template>

    <div v-if="filteredEntries.length > pageSize" class="api-query-pagination api-query-pagination--footer" aria-label="方法查询底部分页">
      <span class="api-query-pagination__mobile-page">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="filteredEntries.length"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </article>
</template>

<style scoped>
.api-query-pagination {
  display: flex;
  max-width: 100%;
  justify-content: flex-end;
  overflow-x: auto;
  padding: 4px 0 14px;
}

.api-query-pagination--footer {
  padding: 18px 0 0;
}

.api-query-pagination__mobile-page {
  display: none;
  color: var(--doc-muted);
  font-size: 13px;
  white-space: nowrap;
}

.api-method-card__signature-summary {
  margin: 0;
  color: var(--doc-muted);
  font-size: 13px;
  line-height: 1.65;
}

.api-method-card__throws {
  display: flex;
  gap: 8px;
  margin: 0;
  color: var(--el-color-danger);
  line-height: 1.65;
}

@media (max-width: 640px) {
  .api-query-pagination {
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    overflow-x: visible;
  }

  .api-query-pagination__mobile-page {
    display: inline;
  }

  .api-query-pagination :deep(.el-pagination__sizes),
  .api-query-pagination :deep(.el-pager) {
    display: none;
  }
}
</style>
