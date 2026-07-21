<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiCatalog, apiRuntimeExports } from '../../generated/api';
import TypeExpression from './TypeExpression.vue';

type CatalogKind = 'class' | 'interface' | 'typeAlias';

interface ApiParameter {
  name: string;
  anchor: string;
  type: string;
  optional: boolean;
  defaultValue: string;
  summary: string;
}

interface ApiTypeParameter {
  name: string;
  summary: string;
  constraint: string;
  default: string;
}

interface ApiSignature {
  anchor: string;
  summary: string;
  typeParameters: ApiTypeParameter[];
  parameters: ApiParameter[];
  returns: string;
  throws?: string[];
}

interface ApiCallable {
  name: string;
  anchor: string;
  summary: string;
  signatures: ApiSignature[];
}

interface ApiProperty {
  name: string;
  anchor: string;
  type: string;
  optional?: boolean;
  readonly: boolean;
  defaultValue?: string;
  summary: string;
}

interface ApiVariant {
  label: string;
  anchor: string;
  expression: string;
  properties: ApiProperty[];
}

interface ApiTypeEntry {
  name: string;
  kind: CatalogKind;
  anchor: string;
  summary: string;
  type: string | null;
  typeParameters: ApiTypeParameter[];
  properties: ApiProperty[];
  accessors: ApiProperty[];
  methods: ApiCallable[];
  constructors: ApiCallable[];
  variants: ApiVariant[];
}

interface RuntimeEntry {
  name: string;
  kind: 'function' | 'variable';
  anchor: string;
  summary: string;
  type: string | null;
  defaultValue: string;
  signatures: ApiSignature[];
}

const props = withDefaults(
  defineProps<{
    typeNames?: readonly string[];
    runtimeNames?: readonly string[];
    title?: string;
    description?: string;
    sectionId?: string;
    memberNames?: Readonly<Record<string, readonly string[]>>;
    compact?: boolean;
  }>(),
  {
    typeNames: () => [],
    runtimeNames: () => [],
    title: '完整 API',
    description: '以下签名、属性和联合分支由包根公开声明生成；类型名称可以继续进入 API 查询。',
    sectionId: 'api',
    memberNames: () => ({}),
    compact: false
  }
);

const types = apiCatalog as unknown as readonly ApiTypeEntry[];
const runtime = apiRuntimeExports as unknown as readonly RuntimeEntry[];

const selectedTypes = computed(() =>
  props.typeNames
    .map((name) => types.find((entry) => entry.name === name))
    .filter((entry): entry is ApiTypeEntry => entry !== undefined)
    .map((entry) => {
      const members = props.memberNames[entry.name];
      if (members === undefined) return entry;
      const allowed = new Set(members);
      return {
        ...entry,
        properties: entry.properties.filter((member) => allowed.has(member.name)),
        accessors: entry.accessors.filter((member) => allowed.has(member.name)),
        methods: entry.methods.filter((member) => allowed.has(member.name)),
        constructors: entry.constructors.filter((member) => allowed.has(member.name) || allowed.has('constructor'))
      };
    })
);
const selectedRuntime = computed(() =>
  props.runtimeNames.map((name) => runtime.find((entry) => entry.name === name)).filter((entry): entry is RuntimeEntry => entry !== undefined)
);
const missingNames = computed(() => [
  ...props.typeNames.filter((name) => !types.some((entry) => entry.name === name)),
  ...props.runtimeNames.filter((name) => !runtime.some((entry) => entry.name === name))
]);
const expandedEntries = ref<ReadonlySet<string>>(new Set());

const entryDetailsId = (anchor: string) => `${anchor}-details`;
const isEntryExpanded = (anchor: string) => !props.compact || expandedEntries.value.has(anchor);
const toggleEntry = (anchor: string) => {
  const next = new Set(expandedEntries.value);
  if (next.has(anchor)) next.delete(anchor);
  else next.add(anchor);
  expandedEntries.value = next;
};

const revealHashTarget = () => {
  if (!props.compact || window.location.hash.length <= 1) return;
  const encodedTarget = window.location.hash.slice(1);
  let targetId = encodedTarget;
  try {
    targetId = decodeURIComponent(encodedTarget);
  } catch {
    return;
  }

  const target = document.getElementById(targetId);
  const entry = target?.closest<HTMLElement>('[data-api-entry]');
  const entryAnchor = entry?.dataset.apiEntry;
  if (entryAnchor === undefined) return;

  if (!expandedEntries.value.has(entryAnchor)) {
    expandedEntries.value = new Set([...expandedEntries.value, entryAnchor]);
  }
  void nextTick(() => document.getElementById(targetId)?.scrollIntoView({ block: 'start' }));
};

onMounted(() => {
  window.addEventListener('hashchange', revealHashTarget);
  revealHashTarget();
});

onBeforeUnmount(() => window.removeEventListener('hashchange', revealHashTarget));

const kindLabel: Record<CatalogKind, string> = {
  class: '类',
  interface: '接口',
  typeAlias: '类型'
};

const kindTag: Record<CatalogKind, 'primary' | 'success' | 'warning'> = {
  class: 'warning',
  interface: 'success',
  typeAlias: 'primary'
};

const propertyRows = (entry: ApiTypeEntry): ApiProperty[] => [...entry.properties, ...entry.accessors];
</script>

<template>
  <section :id="sectionId" class="doc-prose public-api-section">
    <h2 class="doc-h2">{{ title }}</h2>
    <p>{{ description }}</p>

    <el-alert
      v-if="missingNames.length"
      class="public-api-section__missing"
      type="error"
      :closable="false"
      show-icon
      :title="`公开 API 数据缺少：${missingNames.join('、')}`"
    />

    <article
      v-for="entry in selectedRuntime"
      :key="entry.anchor"
      class="public-api-section__entry"
      :class="{ 'public-api-section__entry--compact': compact }"
      :data-api-entry="entry.anchor"
    >
      <header :id="entry.anchor" class="public-api-section__entry-header">
        <el-tag :type="entry.kind === 'function' ? 'primary' : 'info'" effect="plain">{{ entry.kind === 'function' ? '函数' : '常量' }}</el-tag>
        <h3>{{ entry.name }}</h3>
        <a :href="`#${entry.anchor}`" :aria-label="`${entry.name} 的直接链接`">#</a>
      </header>
      <p>{{ entry.summary }}</p>

      <el-button
        v-if="compact"
        class="public-api-section__details-toggle"
        size="small"
        plain
        :aria-expanded="isEntryExpanded(entry.anchor)"
        :aria-controls="entryDetailsId(entry.anchor)"
        :aria-label="`${isEntryExpanded(entry.anchor) ? '收起' : '展开'} ${entry.name} 的详细定义`"
        @click="toggleEntry(entry.anchor)"
      >
        {{ isEntryExpanded(entry.anchor) ? '收起详细定义' : '查看详细定义' }}
      </el-button>

      <div :id="entryDetailsId(entry.anchor)" v-show="isEntryExpanded(entry.anchor)" class="public-api-section__details">
        <div v-if="entry.kind === 'variable'" class="public-api-section__type-line">
          <strong>类型：</strong><TypeExpression :value="entry.type || 'unknown'" />
        </div>
        <div v-for="(signature, signatureIndex) in entry.signatures" :id="signature.anchor" :key="signature.anchor" class="public-api-section__signature">
          <h4>签名 {{ signatureIndex + 1 }}</h4>
          <el-descriptions v-if="signature.typeParameters.length" :column="1" border>
            <el-descriptions-item v-for="parameter in signature.typeParameters" :key="parameter.name" :label="`类型参数 ${parameter.name}`">
              <span>{{ parameter.summary || '泛型参数' }}</span>
              <TypeExpression v-if="parameter.constraint" :value="`约束：${parameter.constraint}`" />
              <TypeExpression v-if="parameter.default" :value="`默认：${parameter.default}`" />
            </el-descriptions-item>
          </el-descriptions>
          <el-table v-if="signature.parameters.length" :data="signature.parameters" border stripe>
            <el-table-column label="参数" min-width="180">
              <template #default="scope">
                <span :id="scope.row.anchor"
                  ><code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code></span
                >
              </template>
            </el-table-column>
            <el-table-column label="类型" min-width="260"
              ><template #default="scope"><TypeExpression :value="scope.row.type" /></template
            ></el-table-column>
            <el-table-column label="默认值" min-width="120"
              ><template #default="scope">{{ scope.row.defaultValue || '—' }}</template></el-table-column
            >
            <el-table-column prop="summary" label="说明" min-width="300" />
          </el-table>
          <p v-else class="public-api-section__empty-parameters"><strong>参数：</strong>—</p>
          <p><strong>返回：</strong><TypeExpression :value="signature.returns" /></p>
          <p v-if="signature.throws?.length"><strong>异常：</strong>{{ signature.throws.join('；') }}</p>
        </div>
      </div>
    </article>

    <article
      v-for="entry in selectedTypes"
      :key="entry.anchor"
      class="public-api-section__entry"
      :class="{ 'public-api-section__entry--compact': compact }"
      :data-api-entry="entry.anchor"
    >
      <header :id="entry.anchor" class="public-api-section__entry-header">
        <el-tag :type="kindTag[entry.kind]" effect="plain">{{ kindLabel[entry.kind] }}</el-tag>
        <h3>{{ entry.name }}</h3>
        <a :href="`#${entry.anchor}`" :aria-label="`${entry.name} 的直接链接`">#</a>
      </header>
      <p>{{ entry.summary }}</p>

      <el-button
        v-if="compact"
        class="public-api-section__details-toggle"
        size="small"
        plain
        :aria-expanded="isEntryExpanded(entry.anchor)"
        :aria-controls="entryDetailsId(entry.anchor)"
        :aria-label="`${isEntryExpanded(entry.anchor) ? '收起' : '展开'} ${entry.name} 的详细定义`"
        @click="toggleEntry(entry.anchor)"
      >
        {{ isEntryExpanded(entry.anchor) ? '收起详细定义' : '查看详细定义' }}
      </el-button>

      <div :id="entryDetailsId(entry.anchor)" v-show="isEntryExpanded(entry.anchor)" class="public-api-section__details">
        <el-descriptions v-if="entry.typeParameters.length" :column="1" border class="public-api-section__type-parameters">
          <el-descriptions-item v-for="parameter in entry.typeParameters" :key="parameter.name" :label="`类型参数 ${parameter.name}`">
            <span>{{ parameter.summary || '泛型参数' }}</span>
            <TypeExpression v-if="parameter.constraint" :value="`约束：${parameter.constraint}`" />
            <TypeExpression v-if="parameter.default" :value="`默认：${parameter.default}`" />
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="entry.type" class="public-api-section__type-line"><strong>类型表达式：</strong><TypeExpression :value="entry.type" /></div>

        <div v-for="constructor in entry.constructors" :key="constructor.anchor" class="public-api-section__block">
          <h4 :id="constructor.anchor" class="public-api-section__subheading"><span>构造函数</span><a :href="`#${constructor.anchor}`">#</a></h4>
          <p v-if="constructor.summary">{{ constructor.summary }}</p>
          <div
            v-for="(signature, signatureIndex) in constructor.signatures"
            :id="signature.anchor"
            :key="signature.anchor"
            class="public-api-section__signature"
          >
            <h5>重载 {{ signatureIndex + 1 }}</h5>
            <el-descriptions v-if="signature.typeParameters.length" :column="1" border>
              <el-descriptions-item v-for="parameter in signature.typeParameters" :key="parameter.name" :label="`类型参数 ${parameter.name}`">
                <span>{{ parameter.summary || '泛型参数' }}</span>
                <TypeExpression v-if="parameter.constraint" :value="`约束：${parameter.constraint}`" />
                <TypeExpression v-if="parameter.default" :value="`默认：${parameter.default}`" />
              </el-descriptions-item>
            </el-descriptions>
            <el-table v-if="signature.parameters.length" :data="signature.parameters" border stripe>
              <el-table-column label="参数" min-width="180">
                <template #default="scope"
                  ><code :id="scope.row.anchor">{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code></template
                >
              </el-table-column>
              <el-table-column label="类型" min-width="260"
                ><template #default="scope"><TypeExpression :value="scope.row.type" /></template
              ></el-table-column>
              <el-table-column label="默认值" min-width="120"
                ><template #default="scope">{{ scope.row.defaultValue || '—' }}</template></el-table-column
              >
              <el-table-column prop="summary" label="说明" min-width="300" />
            </el-table>
            <p v-else><strong>参数：</strong>—</p>
            <p><strong>返回：</strong><TypeExpression :value="signature.returns" /></p>
          </div>
        </div>

        <div v-if="propertyRows(entry).length" class="public-api-section__block">
          <h4 class="public-api-section__subheading">属性</h4>
          <el-table :data="propertyRows(entry)" border stripe>
            <el-table-column label="属性" min-width="190">
              <template #default="scope">
                <span :id="scope.row.anchor" class="public-api-section__member-name">
                  <code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code>
                  <el-tag v-if="scope.row.readonly" size="small" type="info" effect="plain">readonly</el-tag>
                  <a :href="`#${scope.row.anchor}`">#</a>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="类型" min-width="280"
              ><template #default="scope"><TypeExpression :value="scope.row.type" /></template
            ></el-table-column>
            <el-table-column label="默认值" min-width="120"
              ><template #default="scope">{{ scope.row.defaultValue || '—' }}</template></el-table-column
            >
            <el-table-column prop="summary" label="说明" min-width="340" />
          </el-table>
        </div>

        <div v-for="variant in entry.variants" :key="variant.anchor" class="public-api-section__block">
          <h4 :id="variant.anchor" class="public-api-section__subheading">
            <span>{{ variant.label }}</span
            ><a :href="`#${variant.anchor}`">#</a>
          </h4>
          <div class="public-api-section__type-line"><TypeExpression :value="variant.expression" /></div>
          <el-table :data="variant.properties" border stripe>
            <el-table-column label="属性" min-width="190">
              <template #default="scope">
                <span :id="scope.row.anchor" class="public-api-section__member-name">
                  <code>{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code>
                  <el-tag v-if="scope.row.readonly" size="small" type="info" effect="plain">readonly</el-tag>
                  <a :href="`#${scope.row.anchor}`">#</a>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="类型" min-width="280"
              ><template #default="scope"><TypeExpression :value="scope.row.type" /></template
            ></el-table-column>
            <el-table-column label="默认值" min-width="120"
              ><template #default="scope">{{ scope.row.defaultValue || '—' }}</template></el-table-column
            >
            <el-table-column prop="summary" label="说明" min-width="340" />
          </el-table>
        </div>

        <div v-if="entry.methods.length" class="public-api-section__block">
          <h4 class="public-api-section__subheading">方法</h4>
          <section v-for="method in entry.methods" :id="method.anchor" :key="method.anchor" class="public-api-section__method">
            <header>
              <el-tag size="small" type="primary" effect="plain">方法</el-tag>
              <code>{{ method.name }}</code>
              <a :href="`#${method.anchor}`">#</a>
            </header>
            <p v-if="method.summary">{{ method.summary }}</p>
            <div v-for="(signature, signatureIndex) in method.signatures" :id="signature.anchor" :key="signature.anchor" class="public-api-section__signature">
              <h5>重载 {{ signatureIndex + 1 }}</h5>
              <el-descriptions v-if="signature.typeParameters.length" :column="1" border>
                <el-descriptions-item v-for="parameter in signature.typeParameters" :key="parameter.name" :label="`类型参数 ${parameter.name}`">
                  <span>{{ parameter.summary || '泛型参数' }}</span>
                  <TypeExpression v-if="parameter.constraint" :value="`约束：${parameter.constraint}`" />
                  <TypeExpression v-if="parameter.default" :value="`默认：${parameter.default}`" />
                </el-descriptions-item>
              </el-descriptions>
              <el-table v-if="signature.parameters.length" :data="signature.parameters" border stripe>
                <el-table-column label="参数" min-width="180">
                  <template #default="scope"
                    ><code :id="scope.row.anchor">{{ scope.row.name }}{{ scope.row.optional ? '?' : '' }}</code></template
                  >
                </el-table-column>
                <el-table-column label="类型" min-width="280"
                  ><template #default="scope"><TypeExpression :value="scope.row.type" /></template
                ></el-table-column>
                <el-table-column label="默认值" min-width="120"
                  ><template #default="scope">{{ scope.row.defaultValue || '—' }}</template></el-table-column
                >
                <el-table-column prop="summary" label="说明" min-width="340" />
              </el-table>
              <p v-else><strong>参数：</strong>—</p>
              <p><strong>返回：</strong><TypeExpression :value="signature.returns" /></p>
              <p v-if="signature.throws?.length"><strong>异常：</strong>{{ signature.throws.join('；') }}</p>
            </div>
          </section>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.public-api-section {
  display: grid;
  gap: 18px;
}

.public-api-section > .doc-h2,
.public-api-section > p {
  margin-block: 0;
}

.public-api-section__missing {
  margin: 0;
}

.public-api-section__entry {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  background: var(--doc-surface);
}

.public-api-section__entry--compact {
  padding: 18px 20px;
}

.public-api-section__entry--compact > p {
  margin-bottom: 0;
}

.public-api-section__details-toggle {
  margin-top: 12px;
}

.public-api-section__details {
  min-width: 0;
}

.public-api-section__entry-header,
.public-api-section__member-name,
.public-api-section__method > header,
.public-api-section__subheading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.public-api-section__entry-header h3 {
  margin: 0;
  font-size: 20px;
}

.public-api-section__entry-header a,
.public-api-section__member-name a,
.public-api-section__method a,
.public-api-section__subheading a {
  color: var(--doc-primary-deep);
  text-decoration: none;
}

.public-api-section__block {
  margin-top: 22px;
}

.public-api-section__subheading {
  margin: 0 0 12px;
  font-size: 16px;
}

.public-api-section__type-line,
.public-api-section__signature {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter, var(--doc-surface-soft));
}

.public-api-section__signature h4,
.public-api-section__signature h5 {
  margin: 0 0 10px;
}

.public-api-section__signature p:last-child {
  margin-bottom: 0;
}

.public-api-section__method {
  padding-block: 14px;
  border-top: 1px solid var(--doc-border);
  scroll-margin-top: 86px;
}

.public-api-section__method:first-of-type {
  border-top: 0;
}

@media (max-width: 720px) {
  .public-api-section__entry {
    padding: 16px;
  }
}
</style>
