<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import TypeExpression from '../../components/docs/TypeExpression.vue';
import { apiModules, findApiModuleByType, type ApiModuleDefinition } from '../../config/apiModules';
import { apiCatalog } from '../../generated/api';

type CatalogKind = 'class' | 'interface' | 'typeAlias';

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

interface CatalogMember {
  name: string;
  anchor: string;
  type: string;
  optional?: boolean;
  readonly: boolean;
  defaultValue?: string | null;
  summary: string;
}

interface CatalogVariant {
  label: string;
  anchor: string;
  expression: string;
  properties: CatalogMember[];
}

interface CatalogItem {
  name: string;
  kind: CatalogKind;
  anchor: string;
  summary: string;
  source: string;
  typeParameters: CatalogTypeParameter[];
  type: string | null;
  properties: CatalogMember[];
  accessors: CatalogMember[];
  methods: CatalogCallable[];
  constructors: CatalogCallable[];
  variants: CatalogVariant[];
}

interface CatalogGroup {
  module: ApiModuleDefinition;
  items: CatalogItem[];
}

const catalog = apiCatalog as unknown as readonly CatalogItem[];
const route = useRoute();
const keyword = ref('');
const selectedKind = ref<'all' | CatalogKind>('all');
const expanded = ref<string[]>([]);

const kindLabels: Record<CatalogKind, string> = {
  class: '类',
  interface: '接口',
  typeAlias: '类型别名'
};

const kindTagTypes: Record<CatalogKind, 'primary' | 'success' | 'warning'> = {
  class: 'warning',
  interface: 'success',
  typeAlias: 'primary'
};

const normalizedKeyword = computed(() => keyword.value.trim().toLocaleLowerCase());

const searchableText = (item: CatalogItem): string => {
  const typeParameters = item.typeParameters
    .flatMap((parameter) => [parameter.name, parameter.summary, parameter.constraint ?? '', parameter.default ?? ''])
    .join(' ');
  const properties = [...item.properties, ...item.accessors]
    .flatMap((member) => [member.name, member.type, member.defaultValue ?? '', member.summary])
    .join(' ');
  const callables = [...item.methods, ...item.constructors]
    .flatMap((member) => [
      member.name,
      member.summary,
      ...member.signatures.flatMap((signature) => [
        signature.summary,
        signature.returns,
        ...(signature.throws ?? []),
        ...signature.typeParameters.flatMap((parameter) => [parameter.name, parameter.summary, parameter.constraint ?? '', parameter.default ?? '']),
        ...signature.parameters.flatMap((parameter) => [parameter.name, parameter.type, parameter.defaultValue ?? '', parameter.summary])
      ])
    ])
    .join(' ');
  const variants = item.variants
    .flatMap((variant) => [
      variant.label,
      variant.expression,
      ...variant.properties.flatMap((member) => [member.name, member.type, member.defaultValue ?? '', member.summary])
    ])
    .join(' ');
  return `${item.name} ${item.summary} ${item.source} ${item.type ?? ''} ${typeParameters} ${properties} ${callables} ${variants}`.toLocaleLowerCase();
};

const filteredCatalog = computed(() =>
  catalog.filter((item) => {
    if (selectedKind.value !== 'all' && item.kind !== selectedKind.value) return false;
    return normalizedKeyword.value.length === 0 || searchableText(item).includes(normalizedKeyword.value);
  })
);

const groups = computed<CatalogGroup[]>(() => {
  const itemsByModule = new Map<ApiModuleDefinition, CatalogItem[]>();
  for (const item of filteredCatalog.value) {
    const module = findApiModuleByType(item.name);
    if (module === undefined) continue;
    const items = itemsByModule.get(module) ?? [];
    items.push(item);
    itemsByModule.set(module, items);
  }

  return apiModules.flatMap((module) => {
    const items = itemsByModule.get(module);
    return items === undefined || items.length === 0 ? [] : [{ module, items }];
  });
});

const counts = computed(() => ({
  all: catalog.length,
  class: catalog.filter((item) => item.kind === 'class').length,
  interface: catalog.filter((item) => item.kind === 'interface').length,
  typeAlias: catalog.filter((item) => item.kind === 'typeAlias').length
}));

const memberCount = (item: CatalogItem): number =>
  item.properties.length +
  item.accessors.length +
  item.methods.length +
  item.constructors.length +
  item.variants.reduce((count, variant) => count + variant.properties.length, 0);

const definitionHref = (anchor: string): string => `/api/types#${anchor}`;
const formatDefaultValue = (value: string | null | undefined): string => (value === undefined || value === null || value === '' ? '—' : value);

const containsAnchor = (item: CatalogItem, anchor: string): boolean => {
  if (item.anchor === anchor) return true;
  if (item.variants.some((variant) => variant.anchor === anchor || variant.properties.some((property) => property.anchor === anchor))) return true;
  const members = [...item.properties, ...item.accessors, ...item.methods, ...item.constructors];
  return members.some((member) => {
    if (member.anchor === anchor) return true;
    if (!('signatures' in member)) return false;
    return member.signatures.some((signature) => signature.anchor === anchor || signature.parameters.some((parameter) => parameter.anchor === anchor));
  });
};

const revealHash = async (hash: string): Promise<void> => {
  const anchor = decodeURIComponent(hash.replace(/^#/, ''));
  if (!anchor.startsWith('api-type-')) return;
  const item = catalog.find((candidate) => containsAnchor(candidate, anchor));
  if (item === undefined) return;

  keyword.value = '';
  selectedKind.value = 'all';
  if (!expanded.value.includes(item.anchor)) expanded.value = [...expanded.value, item.anchor];

  await nextTick();
  window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
};

const revealExactAnchor = (anchor: string): void => {
  void revealHash(`#${anchor}`);
};

watch(
  () => route.hash,
  (hash) => void revealHash(hash),
  { immediate: true, flush: 'post' }
);

const reset = (): void => {
  keyword.value = '';
  selectedKind.value = 'all';
};
</script>

<template>
  <article class="api-query-page">
    <header class="doc-hero api-query-hero">
      <span class="doc-hero__eyebrow">API 查询</span>
      <h1>类型</h1>
      <p>按模块查询包根导出的 class、interface、type alias 及其全部公开成员。每个类型、分支、属性、签名和参数都可使用精确链接直接定位。</p>
      <div class="api-query-stats" aria-label="公开类型统计">
        <el-tag type="warning" effect="plain">{{ counts.class }} 个类</el-tag>
        <el-tag type="success" effect="plain">{{ counts.interface }} 个接口</el-tag>
        <el-tag effect="plain">{{ counts.typeAlias }} 个类型别名</el-tag>
        <el-tag type="info" effect="plain">共 {{ counts.all }} 个类型</el-tag>
      </div>
    </header>

    <section class="api-query-toolbar" aria-label="类型筛选">
      <el-input v-model="keyword" clearable placeholder="搜索类型、属性、方法、参数、返回值或异常" aria-label="搜索公开类型" />
      <el-select v-model="selectedKind" aria-label="按类型种类筛选">
        <el-option label="全部种类" value="all" />
        <el-option label="类" value="class" />
        <el-option label="接口" value="interface" />
        <el-option label="类型别名" value="typeAlias" />
      </el-select>
      <el-button @click="reset">重置</el-button>
      <div class="api-query-toolbar__result api-type-query__result">
        <span>找到 {{ filteredCatalog.length }} / {{ counts.all }} 个类型</span>
        <el-button v-if="filteredCatalog.length > 0" text type="primary" @click="expanded = filteredCatalog.map((item) => item.anchor)">展开结果</el-button>
        <el-button v-if="expanded.length > 0" text @click="expanded = []">全部收起</el-button>
      </div>
    </section>

    <el-empty v-if="groups.length === 0" description="没有匹配的公开类型">
      <el-button type="primary" @click="reset">清除筛选</el-button>
    </el-empty>

    <template v-else>
      <section v-for="group in groups" :id="`api-module-${group.module.id}`" :key="group.module.id" class="api-query-group">
        <div class="api-query-group__heading">
          <div>
            <span>{{ group.module.group }}</span>
            <h2>{{ group.module.label }}</h2>
          </div>
          <el-tag type="info" effect="plain">{{ group.items.length }} 个类型</el-tag>
        </div>

        <el-collapse v-model="expanded" class="type-catalog__collapse api-type-query__collapse">
          <el-collapse-item v-for="item in group.items" :key="item.anchor" :name="item.anchor">
            <template #title>
              <span :id="item.anchor" class="type-catalog__type-anchor">
                <el-tag :type="kindTagTypes[item.kind]" size="small" effect="plain">{{ kindLabels[item.kind] }}</el-tag>
                <code>{{ item.name }}</code>
                <el-badge v-if="memberCount(item) > 0" :value="memberCount(item)" type="info" />
                <a
                  class="type-catalog__self-link"
                  :href="definitionHref(item.anchor)"
                  :aria-label="`${item.name} 类型的精确链接`"
                  @click.stop="revealExactAnchor(item.anchor)"
                  >#</a
                >
              </span>
            </template>

            <div v-if="expanded.includes(item.anchor)" class="type-catalog__definition">
              <p class="type-catalog__summary">{{ item.summary || '暂无说明。' }}</p>
              <div class="type-catalog__meta">
                <el-tag size="small" effect="plain">包根导出</el-tag>
                <code>{{ item.source }}</code>
              </div>

              <div v-if="item.typeParameters.length > 0" class="type-catalog__block">
                <h3>类型参数</h3>
                <el-descriptions :column="1" border>
                  <el-descriptions-item v-for="parameter in item.typeParameters" :key="parameter.name" :label="parameter.name">
                    <span>{{ parameter.summary || '泛型参数' }}</span>
                    <span v-if="parameter.constraint" class="type-catalog__returns"
                      ><strong>约束：</strong><TypeExpression :value="parameter.constraint"
                    /></span>
                    <span v-if="parameter.default" class="type-catalog__returns"><strong>默认：</strong><TypeExpression :value="parameter.default" /></span>
                  </el-descriptions-item>
                </el-descriptions>
              </div>

              <div v-if="item.type" class="type-catalog__block">
                <h3>类型表达式</h3>
                <TypeExpression :value="item.type" />
              </div>

              <div v-if="item.properties.length + item.accessors.length > 0" class="type-catalog__block">
                <h3>属性</h3>
                <el-table :data="[...item.properties, ...item.accessors]" border stripe>
                  <el-table-column label="属性" min-width="190">
                    <template #default="scope">
                      <span :id="scope.row.anchor" class="type-catalog__member-name">
                        <a :href="definitionHref(scope.row.anchor)" @click="revealExactAnchor(scope.row.anchor)">
                          <code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code>
                        </a>
                        <el-tag v-if="scope.row.readonly" size="small" effect="plain" type="info">readonly</el-tag>
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="类型" min-width="280">
                    <template #default="scope"><TypeExpression :value="scope.row.type" /></template>
                  </el-table-column>
                  <el-table-column label="默认值" min-width="120">
                    <template #default="scope">{{ formatDefaultValue(scope.row.defaultValue) }}</template>
                  </el-table-column>
                  <el-table-column prop="summary" label="说明" min-width="320" />
                </el-table>
              </div>

              <div v-if="item.variants.length > 0" class="type-catalog__block">
                <h3>联合与条件分支</h3>
                <section v-for="variant in item.variants" :key="variant.anchor" class="type-catalog__variant api-type-query__variant">
                  <h4 :id="variant.anchor">
                    <a :href="definitionHref(variant.anchor)" @click="revealExactAnchor(variant.anchor)"
                      ><code>{{ variant.label }}</code></a
                    >
                  </h4>
                  <TypeExpression :value="variant.expression" />
                  <el-table v-if="variant.properties.length > 0" :data="variant.properties" border stripe>
                    <el-table-column label="属性" min-width="190">
                      <template #default="scope">
                        <span :id="scope.row.anchor" class="type-catalog__member-name">
                          <a :href="definitionHref(scope.row.anchor)" @click="revealExactAnchor(scope.row.anchor)">
                            <code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code>
                          </a>
                          <el-tag v-if="scope.row.readonly" size="small" effect="plain" type="info">readonly</el-tag>
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="类型" min-width="280">
                      <template #default="scope"><TypeExpression :value="scope.row.type" /></template>
                    </el-table-column>
                    <el-table-column label="默认值" min-width="120">
                      <template #default="scope">{{ formatDefaultValue(scope.row.defaultValue) }}</template>
                    </el-table-column>
                    <el-table-column prop="summary" label="说明" min-width="320" />
                  </el-table>
                </section>
              </div>

              <div v-if="item.constructors.length > 0" class="type-catalog__block">
                <h3>构造函数</h3>
                <div v-for="constructor in item.constructors" :key="constructor.anchor" class="type-catalog__callable">
                  <h4 :id="constructor.anchor">
                    <a :href="definitionHref(constructor.anchor)" @click="revealExactAnchor(constructor.anchor)"
                      ><code>new {{ item.name }}</code></a
                    >
                  </h4>
                  <p v-if="constructor.summary">{{ constructor.summary }}</p>
                  <div
                    v-for="(signature, signatureIndex) in constructor.signatures"
                    :key="signature.anchor"
                    :id="signature.anchor"
                    class="type-catalog__signature"
                  >
                    <a
                      class="type-catalog__signature-index type-catalog__self-link"
                      :href="definitionHref(signature.anchor)"
                      @click="revealExactAnchor(signature.anchor)"
                      >签名 {{ signatureIndex + 1 }} #</a
                    >
                    <p v-if="signature.summary">{{ signature.summary }}</p>
                    <div v-if="signature.typeParameters.length > 0" class="type-catalog__parameter-list">
                      <div v-for="parameter in signature.typeParameters" :key="parameter.name" class="type-catalog__parameter">
                        <code>{{ parameter.name }}</code>
                        <span>{{ parameter.summary || '泛型参数' }}</span>
                        <span v-if="parameter.constraint" class="type-catalog__returns"
                          ><strong>约束：</strong><TypeExpression :value="parameter.constraint"
                        /></span>
                        <span v-if="parameter.default" class="type-catalog__returns"><strong>默认：</strong><TypeExpression :value="parameter.default" /></span>
                      </div>
                    </div>
                    <div class="type-catalog__parameter-list">
                      <template v-if="signature.parameters.length > 0">
                        <div v-for="parameter in signature.parameters" :id="parameter.anchor" :key="parameter.anchor" class="type-catalog__parameter">
                          <a :href="definitionHref(parameter.anchor)" @click="revealExactAnchor(parameter.anchor)">
                            <code>{{ parameter.name }}{{ parameter.optional ? '?' : '' }}:</code>
                          </a>
                          <TypeExpression :value="parameter.type" />
                          <span v-if="parameter.defaultValue">= {{ parameter.defaultValue }}</span>
                          <span class="type-catalog__parameter-summary">{{ parameter.summary }}</span>
                        </div>
                      </template>
                      <span v-else>—</span>
                    </div>
                    <div class="type-catalog__returns"><strong>返回：</strong><TypeExpression :value="signature.returns" /></div>
                    <p v-if="signature.throws?.length" class="type-catalog__throws"><strong>异常：</strong>{{ signature.throws.join('；') }}</p>
                  </div>
                </div>
              </div>

              <div v-if="item.methods.length > 0" class="type-catalog__block">
                <h3>方法</h3>
                <div v-for="method in item.methods" :key="method.anchor" class="type-catalog__callable">
                  <h4 :id="method.anchor">
                    <a :href="definitionHref(method.anchor)" @click="revealExactAnchor(method.anchor)"
                      ><code>{{ method.name }}</code></a
                    >
                  </h4>
                  <p v-if="method.summary">{{ method.summary }}</p>
                  <div v-for="(signature, signatureIndex) in method.signatures" :key="signature.anchor" :id="signature.anchor" class="type-catalog__signature">
                    <a
                      class="type-catalog__signature-index type-catalog__self-link"
                      :href="definitionHref(signature.anchor)"
                      @click="revealExactAnchor(signature.anchor)"
                      >签名 {{ signatureIndex + 1 }} #</a
                    >
                    <p v-if="signature.summary">{{ signature.summary }}</p>
                    <div v-if="signature.typeParameters.length > 0" class="type-catalog__parameter-list">
                      <div v-for="parameter in signature.typeParameters" :key="parameter.name" class="type-catalog__parameter">
                        <code>{{ parameter.name }}</code>
                        <span>{{ parameter.summary || '泛型参数' }}</span>
                        <span v-if="parameter.constraint" class="type-catalog__returns"
                          ><strong>约束：</strong><TypeExpression :value="parameter.constraint"
                        /></span>
                        <span v-if="parameter.default" class="type-catalog__returns"><strong>默认：</strong><TypeExpression :value="parameter.default" /></span>
                      </div>
                    </div>
                    <div class="type-catalog__parameter-list">
                      <template v-if="signature.parameters.length > 0">
                        <div v-for="parameter in signature.parameters" :id="parameter.anchor" :key="parameter.anchor" class="type-catalog__parameter">
                          <a :href="definitionHref(parameter.anchor)" @click="revealExactAnchor(parameter.anchor)">
                            <code>{{ parameter.name }}{{ parameter.optional ? '?' : '' }}:</code>
                          </a>
                          <TypeExpression :value="parameter.type" />
                          <span v-if="parameter.defaultValue">= {{ parameter.defaultValue }}</span>
                          <span class="type-catalog__parameter-summary">{{ parameter.summary }}</span>
                        </div>
                      </template>
                      <span v-else>—</span>
                    </div>
                    <div class="type-catalog__returns"><strong>返回：</strong><TypeExpression :value="signature.returns" /></div>
                    <p v-if="signature.throws?.length" class="type-catalog__throws"><strong>异常：</strong>{{ signature.throws.join('；') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </section>
    </template>
  </article>
</template>

<style scoped>
.api-type-query__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.api-type-query__collapse {
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  padding-inline: 14px;
  background: var(--doc-surface);
}

.api-type-query__variant + .api-type-query__variant {
  margin-top: 18px;
}

.api-type-query__variant h4 {
  margin: 0 0 8px;
  scroll-margin-top: 86px;
}

.api-type-query__variant h4 a,
.type-catalog__callable h4 a,
.type-catalog__parameter > a {
  color: var(--doc-primary-deep);
  text-decoration: none;
}

.type-catalog__signature > p {
  margin: 0 0 10px;
  color: var(--doc-muted);
  font-size: 13px;
  line-height: 1.6;
}

.type-catalog__throws {
  margin: 10px 0 0;
  color: var(--el-color-danger);
  line-height: 1.6;
}

@media (max-width: 560px) {
  .api-type-query__collapse {
    padding-inline: 8px;
  }
}
</style>
