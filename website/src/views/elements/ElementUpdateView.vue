<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ElementUpdateDemo from '../../examples/elements/ElementUpdateDemo.vue';
import elementUpdateSource from '../../examples/elements/ElementUpdateDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const elementUpdateSnippet = extractExampleSnippet(elementUpdateSource, 'element-update');

const anchors = [
  { id: 'overview', label: '选择写入入口' },
  { id: 'patch-and-copy', label: 'Patch 与复制规则' },
  { id: 'example-element-update', label: '更新、复制与显隐' },
  { id: 'visibility', label: '业务显隐' },
  { id: 'api-actions', label: '更新方法' },
  { id: 'api', label: '完整 API' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 190, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 360, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 250, linkTypes: true },
  { prop: 'desc', label: '说明', width: 410 }
];

const methodRows = [
  {
    anchor: 'api-method-element-update',
    href: '/api/types#api-type-element-method-update',
    name: 'Element.update',
    params: 'patch: ElementPatch<T>',
    returns: 'void',
    desc: '按当前句柄 ID 原子更新一个 Element'
  },
  {
    anchor: 'api-method-service-update',
    href: '/api/types#api-type-element-service-method-update',
    name: 'elements.update',
    params: 'selector: ElementSelector<T>, patch: ElementPatch<T>',
    returns: 'readonly Element<T>[]',
    desc: '批量更新全部匹配对象并返回当前句柄'
  },
  {
    anchor: 'api-method-copy',
    href: '/api/types#api-type-element-service-method-copy',
    name: 'copy',
    params: 'id: string, overrides?: ElementCopyOptions<T>',
    returns: 'Element<T>',
    desc: '复制规范状态并自动生成新 ID；不克隆 Feature、动画或会话'
  },
  {
    anchor: 'api-method-hide',
    href: '/api/types#api-type-element-service-method-hide',
    name: 'hide',
    params: 'selector: ElementSelector',
    returns: 'readonly Element[]',
    desc: '把匹配对象的 visible 批量更新为 false'
  },
  {
    anchor: 'api-method-show',
    href: '/api/types#api-type-element-service-method-show',
    name: 'show',
    params: 'selector: ElementSelector',
    returns: 'readonly Element[]',
    desc: '把匹配对象的 visible 批量更新为 true'
  }
];

const apiTypes = ['ElementPatch', 'ElementCopyOptions', 'Element', 'ElementService'] as const;
const apiMembers = {
  Element: ['update'],
  ElementService: ['update', 'copy', 'hide', 'show']
} as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>更新、复制与显隐</h1>
        <p>单对象使用 Element.update，批量操作使用 earth.elements；所有持久变更都先生成新状态，再一次性提交并投影到 Feature。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">选择写入入口</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="已有句柄">调用 <code>element.update(patch)</code>，表达“修改这个对象”。</el-descriptions-item>
          <el-descriptions-item label="状态条件">调用 <code>earth.elements.update(selector, patch)</code>，表达“修改这一组对象”。</el-descriptions-item>
          <el-descriptions-item label="创建副本">调用 <code>earth.elements.copy(id, overrides)</code>，保留源状态并返回新句柄。</el-descriptions-item>
          <el-descriptions-item label="业务显隐">优先调用 hide/show；它们与直接提交 visible 字段使用同一个状态通道。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="patch-and-copy" class="doc-prose">
        <h2 class="doc-h2">Patch 与复制规则</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-element-patch">ElementPatch&lt;T&gt;</ApiReference>
          可以更新 geometry、style、data、module、layerId 和 visible，但不能修改 ID 或图形 Type。替换 geometry 时仍必须保持原来的 geometry.type。
        </p>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-element-copy-options">ElementCopyOptions&lt;T&gt;</ApiReference>
          使用相同可覆盖字段。副本获得自动生成的新 ID、新 Feature 和独立规范状态；动画运行态、交互会话和屏幕临时值不会复制。
        </p>
        <el-alert type="info" :closable="false" show-icon title="提交是原子的">
          选择器、几何、样式或目标图层校验失败时，整次写入不提交，也不会向 OpenLayers 留下部分投影。
        </el-alert>
      </section>

      <section id="example-element-update" class="doc-prose">
        <ExampleBlock title="更新、复制与显隐" :source="elementUpdateSource" :snippet="elementUpdateSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例分别调用 <ApiReference kind="method" to="#api-method-element-update">Element.update</ApiReference>、
              <ApiReference kind="method" to="#api-method-service-update">elements.update</ApiReference>、
              <ApiReference kind="method" to="#api-method-copy">copy</ApiReference>、hide 与
              show。移动、改色、复制和显隐会直接反映在地图上，表格只保留当前状态快照。
            </p>
          </template>
          <template #preview><ElementUpdateDemo /></template>
        </ExampleBlock>
      </section>

      <section id="visibility" class="doc-prose">
        <h2 class="doc-h2">业务显隐</h2>
        <ul>
          <li>hide/show 修改的是 ElementState.visible，不是直接操作 Feature 样式。</li>
          <li>已隐藏 Element 仍可通过 query({ visible: false }) 查询，也可继续更新或删除。</li>
          <li>动画在隐藏时暂停、重新显示时恢复；运行帧本身不写入 ElementState。</li>
          <li>批量写方法必须使用非空选择器，防止把遗漏条件误解释为“全部”。</li>
        </ul>
      </section>

      <section id="api-actions" class="doc-prose">
        <h2 class="doc-h2">更新方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        description="完整展开 ElementPatch、ElementCopyOptions，以及单对象和批量更新、复制、显隐方法。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="更新、复制与显隐" :items="anchors" /></aside>
  </div>
</template>
