<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ApiReference from '../components/docs/ApiReference.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import TypeExpression from '../components/docs/TypeExpression.vue';
import { findApiModuleByType } from '../config/apiModules';
import { apiCatalog } from '../generated/api';

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

const catalog = apiCatalog as unknown as readonly CatalogItem[];
const route = useRoute();
const keyword = ref('');
const selectedDomain = ref('全部模块');
const selectedKind = ref<'all' | CatalogKind>('all');
const expanded = ref<string[]>([]);

const anchors = [
  { id: 'overview', label: '目录说明' },
  { id: 'type-filter', label: '筛选导出类型' },
  { id: 'type-catalog', label: '类型定义' },
  { id: 'link-rules', label: '链接规则' }
];

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

const resolveDomain = (item: CatalogItem): string => {
  const module = findApiModuleByType(item.name);
  return module === undefined ? '其他公开类型' : `${module.group} / ${module.label}`;
};

const domains = computed(() => ['全部模块', ...new Set(catalog.map(resolveDomain).sort((left, right) => left.localeCompare(right, 'zh-CN')))]);

const normalizedKeyword = computed(() => keyword.value.trim().toLocaleLowerCase());

const searchableText = (item: CatalogItem): string => {
  const properties = [...item.properties, ...item.accessors]
    .flatMap((member) => [member.name, member.summary, member.type, member.defaultValue ?? ''])
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
      ...variant.properties.flatMap((property) => [property.name, property.type, property.defaultValue ?? '', property.summary])
    ])
    .join(' ');
  const typeParameters = item.typeParameters
    .flatMap((parameter) => [parameter.name, parameter.summary, parameter.constraint ?? '', parameter.default ?? ''])
    .join(' ');
  return `${item.name} ${item.summary} ${item.source} ${item.type ?? ''} ${typeParameters} ${properties} ${callables} ${variants}`.toLocaleLowerCase();
};

const filteredCatalog = computed(() =>
  catalog.filter((item) => {
    if (selectedDomain.value !== '全部模块' && resolveDomain(item) !== selectedDomain.value) return false;
    if (selectedKind.value !== 'all' && item.kind !== selectedKind.value) return false;
    return normalizedKeyword.value.length === 0 || searchableText(item).includes(normalizedKeyword.value);
  })
);

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
  selectedDomain.value = '全部模块';
  selectedKind.value = 'all';
  if (!expanded.value.includes(item.anchor)) expanded.value = [...expanded.value, item.anchor];

  await nextTick();
  window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
};

watch(
  () => route.hash,
  (hash) => void revealHash(hash),
  { immediate: true, flush: 'post' }
);

const resetFilters = (): void => {
  keyword.value = '';
  selectedDomain.value = '全部模块';
  selectedKind.value = 'all';
};
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">API 参考</span>
        <h1>所有导出类型</h1>
        <p>集中查询包根导出的类、接口和类型别名。每次 API 同步都从 TypeDoc 根导出生成，不手工维护重复清单。</p>
        <div class="type-catalog__stats" aria-label="导出类型统计">
          <el-tag type="warning" effect="plain">{{ counts.class }} 个类</el-tag>
          <el-tag type="success" effect="plain">{{ counts.interface }} 个接口</el-tag>
          <el-tag effect="plain">{{ counts.typeAlias }} 个类型别名</el-tag>
          <el-tag type="info" effect="plain">共 {{ counts.all }} 个类型</el-tag>
        </div>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">目录说明</h2>
        <p>
          核心页面中的参数和返回值会自动识别包根导出类型。例如点击
          <ApiReference kind="type" to="#api-type-use-earth-options">UseEarthOptions</ApiReference>，可直接展开它的属性；访问
          <ApiReference kind="property" to="#api-type-use-earth-options-property-target">UseEarthOptions.target</ApiReference>
          则会定位到精确成员。
        </p>
        <el-alert type="info" :closable="false" show-icon title="没有链接的类型不是漏项">
          string、HTMLElement 等平台类型，以及 Map、View、Graticule 等 OpenLayers 外部类型不属于本包根导出，因此不会伪造站内类型页。
        </el-alert>
      </section>

      <section id="type-filter" class="doc-prose">
        <h2 class="doc-h2">筛选导出类型</h2>
        <div class="type-catalog__filters">
          <el-input v-model="keyword" clearable placeholder="搜索类型、属性、方法或说明" aria-label="搜索导出类型" />
          <el-select v-model="selectedDomain" aria-label="按模块筛选">
            <el-option v-for="domain in domains" :key="domain" :label="domain" :value="domain" />
          </el-select>
          <el-select v-model="selectedKind" aria-label="按类型种类筛选">
            <el-option label="全部种类" value="all" />
            <el-option label="类" value="class" />
            <el-option label="接口" value="interface" />
            <el-option label="类型别名" value="typeAlias" />
          </el-select>
          <el-button @click="resetFilters">重置</el-button>
        </div>
        <div class="type-catalog__result-line">
          <span>找到 {{ filteredCatalog.length }} / {{ counts.all }} 个类型</span>
          <el-button v-if="filteredCatalog.length > 0" text type="primary" @click="expanded = filteredCatalog.map((item) => item.anchor)">展开结果</el-button>
          <el-button v-if="expanded.length > 0" text @click="expanded = []">全部收起</el-button>
        </div>
      </section>

      <section id="type-catalog" class="doc-prose">
        <h2 class="doc-h2">类型定义</h2>
        <el-empty v-if="filteredCatalog.length === 0" description="没有匹配的导出类型">
          <el-button type="primary" @click="resetFilters">清除筛选</el-button>
        </el-empty>

        <el-collapse v-else v-model="expanded" class="type-catalog__collapse">
          <el-collapse-item v-for="item in filteredCatalog" :key="item.anchor" :name="item.anchor">
            <template #title>
              <span :id="item.anchor" class="type-catalog__type-anchor">
                <el-tag :type="kindTagTypes[item.kind]" size="small" effect="plain">{{ kindLabels[item.kind] }}</el-tag>
                <code>{{ item.name }}</code>
                <span class="type-catalog__domain">{{ resolveDomain(item) }}</span>
                <el-badge v-if="memberCount(item) > 0" :value="memberCount(item)" type="info" />
                <a class="type-catalog__self-link" :href="`#${item.anchor}`" :aria-label="`${item.name} 类型的直接链接`" @click.stop>#</a>
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
                        <code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code>
                        <el-tag v-if="scope.row.readonly" size="small" effect="plain" type="info">readonly</el-tag>
                        <a :href="`#${scope.row.anchor}`" :aria-label="`${item.name}.${scope.row.name} 的直接链接`">#</a>
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
                <section v-for="variant in item.variants" :key="variant.anchor" class="type-catalog__variant">
                  <h4 :id="variant.anchor">
                    <code>{{ variant.label }}</code>
                    <a class="type-catalog__self-link" :href="`#${variant.anchor}`" :aria-label="`${item.name} ${variant.label} 的直接链接`">#</a>
                  </h4>
                  <TypeExpression :value="variant.expression" />
                  <el-table v-if="variant.properties.length > 0" :data="variant.properties" border stripe>
                    <el-table-column label="属性" min-width="190">
                      <template #default="scope">
                        <span :id="scope.row.anchor" class="type-catalog__member-name">
                          <code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code>
                          <el-tag v-if="scope.row.readonly" size="small" effect="plain" type="info">readonly</el-tag>
                          <a :href="`#${scope.row.anchor}`" :aria-label="`${item.name}.${scope.row.name} 的直接链接`">#</a>
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
                    <code>new {{ item.name }}</code>
                    <a :href="`#${constructor.anchor}`" :aria-label="`${item.name} 构造函数的直接链接`">#</a>
                  </h4>
                  <p v-if="constructor.summary">{{ constructor.summary }}</p>
                  <div
                    v-for="(signature, signatureIndex) in constructor.signatures"
                    :key="signature.anchor"
                    :id="signature.anchor"
                    class="type-catalog__signature"
                  >
                    <span class="type-catalog__signature-index">
                      签名 {{ signatureIndex + 1 }}
                      <a class="type-catalog__self-link" :href="`#${signature.anchor}`" :aria-label="`${item.name} 构造签名 ${signatureIndex + 1} 的直接链接`"
                        >#</a
                      >
                    </span>
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
                          <code>{{ parameter.name }}{{ parameter.optional ? '?' : '' }}:</code>
                          <TypeExpression :value="parameter.type" />
                          <span v-if="parameter.defaultValue">= {{ parameter.defaultValue }}</span>
                          <a class="type-catalog__self-link" :href="`#${parameter.anchor}`" :aria-label="`${item.name} 构造参数 ${parameter.name} 的直接链接`"
                            >#</a
                          >
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
                    <code>{{ method.name }}</code>
                    <a :href="`#${method.anchor}`" :aria-label="`${item.name}.${method.name} 的直接链接`">#</a>
                  </h4>
                  <p v-if="method.summary">{{ method.summary }}</p>
                  <div v-for="(signature, signatureIndex) in method.signatures" :key="signature.anchor" :id="signature.anchor" class="type-catalog__signature">
                    <span class="type-catalog__signature-index">
                      签名 {{ signatureIndex + 1 }}
                      <a
                        class="type-catalog__self-link"
                        :href="`#${signature.anchor}`"
                        :aria-label="`${item.name}.${method.name} 签名 ${signatureIndex + 1} 的直接链接`"
                        >#</a
                      >
                    </span>
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
                          <code>{{ parameter.name }}{{ parameter.optional ? '?' : '' }}:</code>
                          <TypeExpression :value="parameter.type" />
                          <span v-if="parameter.defaultValue">= {{ parameter.defaultValue }}</span>
                          <a
                            class="type-catalog__self-link"
                            :href="`#${parameter.anchor}`"
                            :aria-label="`${item.name}.${method.name} 参数 ${parameter.name} 的直接链接`"
                            >#</a
                          >
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

      <section id="link-rules" class="doc-prose">
        <h2 class="doc-h2">链接规则</h2>
        <ul class="doc-list">
          <li><code>#api-type-use-earth-options</code> 指向一个导出类型。</li>
          <li><code>#api-type-use-earth-options-property-target</code> 指向类型中的精确属性。</li>
          <li><code>#api-type-view-service-method-fly-to</code> 指向类型中的精确方法。</li>
          <li>方法参数中的本包类型会继续链接到自己的定义，形成可连续浏览的 API 关系。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="所有导出类型" :items="anchors" /></aside>
  </div>
</template>
