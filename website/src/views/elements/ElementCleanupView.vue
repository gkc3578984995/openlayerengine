<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ElementCleanupDemo from '../../examples/elements/ElementCleanupDemo.vue';
import elementCleanupSource from '../../examples/elements/ElementCleanupDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const elementCleanupSnippet = extractExampleSnippet(elementCleanupSource, 'element-cleanup');

const anchors = [
  { id: 'overview', label: '三种清理范围' },
  { id: 'selector-safety', label: '选择器安全规则' },
  { id: 'example-element-cleanup', label: '按句柄、模块与全部清理' },
  { id: 'stale-handles', label: '旧句柄与生命周期' },
  { id: 'api-actions', label: '删除方法' },
  { id: 'api', label: '完整 API' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 190, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 300, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 210, linkTypes: true },
  { prop: 'desc', label: '说明', width: 430 }
];

const methodRows = [
  {
    anchor: 'api-method-element-remove',
    href: '/api/types#api-type-element-method-remove',
    name: 'Element.remove',
    params: '—',
    returns: 'void',
    desc: '移除当前句柄对应的 Element；同一句柄重复 remove 幂等'
  },
  {
    anchor: 'api-method-service-remove',
    href: '/api/types#api-type-element-service-method-remove',
    name: 'elements.remove',
    params: 'selector: ElementSelector',
    returns: 'number',
    desc: '删除全部匹配对象并返回数量；未命中返回 0'
  },
  {
    anchor: 'api-method-clear',
    href: '/api/types#api-type-element-service-method-clear',
    name: 'clear',
    params: '—',
    returns: 'void',
    desc: '显式清空当前 Earth 的全部 Element，并使旧句柄失效'
  }
];

const apiTypes = ['Element', 'ElementService'] as const;
const apiMembers = {
  Element: ['remove'],
  ElementService: ['remove', 'clear']
} as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>删除与清理</h1>
        <p>按句柄删除单个对象，按选择器删除一组对象，只有 clear 明确表示“全部”。Earth.destroy 则负责整个实例的最终兜底清理。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">三种清理范围</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="8"
            ><el-card shadow="never"
              ><strong>element.remove()</strong>
              <p>已经持有句柄，只移除当前对象。</p></el-card
            ></el-col
          >
          <el-col :xs="24" :md="8"
            ><el-card shadow="never"
              ><strong>elements.remove(selector)</strong>
              <p>按 module、layerId、type 等条件批量删除。</p></el-card
            ></el-col
          >
          <el-col :xs="24" :md="8"
            ><el-card shadow="never"
              ><strong>elements.clear()</strong>
              <p>显式清空当前 Earth 的全部 Element。</p></el-card
            ></el-col
          >
        </el-row>
      </section>

      <section id="selector-safety" class="doc-prose">
        <h2 class="doc-h2">选择器安全规则</h2>
        <p>
          <ApiReference kind="method" to="#api-method-service-remove">elements.remove</ApiReference> 必须接收至少一个已设置条件的
          <ApiReference kind="type" to="/api/types#api-type-element-selector">ElementSelector</ApiReference>。
          空对象不会被解释成“全部”，而是抛出 InvalidSelectorError。
        </p>
        <el-alert type="warning" :closable="false" show-icon title="不要用空选择器模拟 clear">
          同一保护也适用于 update、hide 和 show。需要清空全部时调用 clear()，让代码审查和运行行为都保持明确。
        </el-alert>
      </section>

      <section id="example-element-cleanup" class="doc-prose">
        <ExampleBlock
          title="按句柄、模块与全部清理"
          :source="elementCleanupSource"
          :snippet="elementCleanupSnippet"
          source-lang="vue"
          snippet-lang="typescript"
        >
          <template #description>
            <p>
              示例比较 <ApiReference kind="method" to="#api-method-element-remove">Element.remove</ApiReference>、
              <ApiReference kind="method" to="#api-method-service-remove">elements.remove</ApiReference> 和
              <ApiReference kind="method" to="#api-method-clear">clear</ApiReference>。橙色 temporary 与蓝色 permanent
              在地图中清晰区分，删除后直接观察剩余对象和本次删除数量。
            </p>
          </template>
          <template #preview><ElementCleanupDemo /></template>
        </ExampleBlock>
      </section>

      <section id="stale-handles" class="doc-prose">
        <h2 class="doc-h2">旧句柄与生命周期</h2>
        <ul>
          <li>删除后，旧句柄的 state、olFeature 和 update 进入失效状态；继续访问会抛出 ObjectDisposedError。</li>
          <li>同一个句柄自身重复调用 remove 是幂等的；被其他入口删除后的旧句柄不应继续使用。</li>
          <li>相同 ID 以后可以重新创建，但会得到新 Feature、新代次和新 Element 句柄，旧句柄不会“复活”。</li>
          <li>Element 删除会同步终止其动画、解除渲染投影，并清理与该对象关联的服务状态。</li>
          <li>组件卸载时仍应调用 earth.destroy()，统一清理剩余 Element、图层、会话、监听与地图资源。</li>
        </ul>
      </section>

      <section id="api-actions" class="doc-prose">
        <h2 class="doc-h2">删除方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        description="完整列出句柄删除、选择器批量删除和显式清空方法；失效句柄错误统一链接到错误类型页面。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="删除与清理" :items="anchors" /></aside>
  </div>
</template>
