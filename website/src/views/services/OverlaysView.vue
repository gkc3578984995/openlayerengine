<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import OverlaysDemo from '../../examples/services/OverlaysDemo.vue';
import overlaysSource from '../../examples/services/OverlaysDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const overlaysSnippet = extractExampleSnippet(overlaysSource, 'overlay-create');

const anchors = [
  { id: 'overview', label: '普通 Overlay' },
  { id: 'example-overlay-lifecycle', label: '创建、查询、更新与清理' },
  { id: 'dom-ownership', label: 'DOM 所有权' },
  { id: 'selector-safety', label: '查询与批量清理' },
  { id: 'method-reference', label: '服务与句柄方法' },
  { id: 'api', label: '完整 API' }
];

const ownershipColumns = [
  { prop: 'name', label: 'ownership', width: 140 },
  { prop: 'detach', label: '销毁时', width: 310 },
  { prop: 'caller', label: '调用方责任', width: 410 }
];

const ownershipRows = [
  { name: 'external（默认）', detach: '从地图 Overlay 容器解绑，不主动 element.remove()', caller: '保留 HTMLElement 业务所有权；自行清理内容、监听和外部引用' },
  { name: 'earth', detach: '最终引用释放时由 Earth 调用 element.remove()', caller: '表示把页面节点移除责任交给 Earth；不要在销毁后继续复用该节点' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 210, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 380, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 240, linkTypes: true },
  { prop: 'desc', label: '说明', width: 400 }
];

const serviceRows = [
  {
    anchor: 'api-service-add',
    href: '/api/types#api-type-overlay-service-method-add',
    name: 'add',
    params: 'spec: OverlaySpec<T>',
    returns: 'OverlayHandle<T>',
    desc: '创建并注册普通 Overlay；省略 id 时自动生成'
  },
  {
    anchor: 'api-service-get',
    href: '/api/types#api-type-overlay-service-method-get',
    name: 'get',
    params: 'id: string',
    returns: 'OverlayHandle<T> | undefined',
    desc: '按 ID 获取仍有效的普通 Overlay；查询缺失不是异常'
  },
  {
    anchor: 'api-service-query',
    href: '/api/types#api-type-overlay-service-method-query',
    name: 'query',
    params: 'selector?: OverlaySelector<T>',
    returns: 'readonly OverlayHandle<T>[]',
    desc: '按 id、ids、module、visible 或 predicate 查询；省略选择器返回全部普通 Overlay'
  },
  {
    anchor: 'api-service-remove',
    href: '/api/types#api-type-overlay-service-method-remove',
    name: 'remove',
    params: 'selector: OverlaySelector',
    returns: 'number',
    desc: '销毁匹配的普通 Overlay 并返回数量；必须至少提供一个条件'
  },
  {
    anchor: 'api-service-clear',
    href: '/api/types#api-type-overlay-service-method-clear',
    name: 'clear',
    params: '—',
    returns: 'void',
    desc: '显式清空当前 Earth 管理的全部普通 Overlay 和 Descriptor'
  }
];

const handleRows = [
  {
    anchor: 'api-handle-update',
    href: '/api/types#api-type-overlay-handle-method-update',
    name: 'update',
    params: 'patch: OverlayPatch<T>',
    returns: 'void',
    desc: '原子更新 element、position、offset、positioning、visible、data 或 ownership'
  },
  {
    anchor: 'api-handle-set-position',
    href: '/api/types#api-type-overlay-handle-method-set-position',
    name: 'setPosition',
    params: 'position: Coordinate | undefined',
    returns: 'void',
    desc: '设置地图坐标；传 undefined 清除定位并隐藏'
  },
  {
    anchor: 'api-handle-show',
    href: '/api/types#api-type-overlay-handle-method-show',
    name: 'show',
    params: '—',
    returns: 'void',
    desc: '显示已有定位的 Overlay'
  },
  {
    anchor: 'api-handle-hide',
    href: '/api/types#api-type-overlay-handle-method-hide',
    name: 'hide',
    params: '—',
    returns: 'void',
    desc: '隐藏但保留句柄、DOM、位置和数据'
  },
  {
    anchor: 'api-handle-pan-into-view',
    href: '/api/types#api-type-overlay-handle-method-pan-into-view',
    name: 'panIntoView',
    params: 'options?: PanIntoViewSpec',
    returns: 'void',
    desc: '按 CSS 像素边距和动画配置平移 View，使 Overlay 完整进入视口'
  },
  {
    anchor: 'api-handle-destroy',
    href: '/api/types#api-type-overlay-handle-method-destroy',
    name: 'destroy',
    params: '—',
    returns: 'void',
    desc: '幂等销毁当前 Overlay；其他非清理操作随后会失效'
  }
];

const relatedTypes = [
  'OverlayService',
  'OverlayHandle',
  'OverlaySpec',
  'OverlayPatch',
  'OverlaySelector',
  'OverlayOwnership',
  'OverlayPositioning',
  'PanIntoViewSpec'
] as const;
const apiMembers = { OverlayService: ['add', 'get', 'query', 'remove', 'clear'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图服务</span>
        <h1>覆盖物（Overlays）</h1>
        <p>普通 Overlay 把调用方提供的 HTMLElement 定位到地图坐标，并通过 OverlayService 与 OverlayHandle 管理查询、更新、显隐、视口平移和销毁。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">普通 Overlay 与 Descriptor</h2>
        <p>
          <ApiReference kind="method" to="#api-service-add">earth.overlays.add</ApiReference> 创建普通 Overlay；需要标题、列表、拖动、关闭策略或固定连线时，使用
          <ApiReference kind="method" to="/components/services/descriptor#api-service-create-descriptor">createDescriptor</ApiReference>。 Descriptor 是“Overlay
          + 可选连接线 Element”的复合对象，不会出现在普通 Overlay 的 get/query 结果中。
        </p>
        <el-alert type="info" :closable="false" show-icon title="坐标跟随当前 View 投影">
          position 使用当前 View 投影坐标；offset、PanIntoViewSpec.margin 和 DOM 尺寸使用 CSS 像素。没有 position 的 Overlay 保持隐藏。
        </el-alert>
      </section>

      <section id="example-overlay-lifecycle" class="doc-prose">
        <ExampleBlock title="创建、查询、更新与清理" :source="overlaysSource" :snippet="overlaysSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例实际运行 <ApiReference kind="method" to="#api-service-add">add</ApiReference>、get、query、remove、clear，以及句柄的
              update、setPosition、show、hide、panIntoView 和 destroy。销毁外部所有权节点后，示例再次触发调用方监听，证明引擎没有替调用方清理业务监听。
            </p>
          </template>
          <template #preview><OverlaysDemo /></template>
        </ExampleBlock>
      </section>

      <section id="dom-ownership" class="doc-prose">
        <h2 class="doc-h2">DOM 所有权</h2>
        <ApiTable :columns="ownershipColumns" :rows="ownershipRows" />
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="替换 element 时重新确认所有权">
          <ApiReference kind="method" to="#api-handle-update">update</ApiReference> 替换 element 而没有同时指定 ownership 时，新节点按 external
          处理。所有权只决定节点移除责任，不会清空 textContent，也不会替调用方逐个 removeEventListener。
        </el-alert>
      </section>

      <section id="selector-safety" class="doc-prose">
        <h2 class="doc-h2">查询与批量清理</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="get(id)">不存在时返回 undefined；这是正常查询结果。</el-descriptions-item>
          <el-descriptions-item label="query()">可以省略选择器查看全部普通 Overlay，也可组合 module、visible 与 predicate。</el-descriptions-item>
          <el-descriptions-item label="remove(selector)"
            >破坏性操作必须包含 id、ids、module、visible 或 predicate；空选择器会抛出 InvalidSelectorError。</el-descriptions-item
          >
          <el-descriptions-item label="clear()">清空全部必须显式调用 clear；它同时销毁 Descriptor 及其连接线、DOM 与事件资源。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="method-reference" class="doc-prose">
        <h2 class="doc-h2">服务与句柄方法</h2>
        <h3 class="doc-h3">OverlayService</h3>
        <ApiTable :columns="methodColumns" :rows="serviceRows" />
        <h3 class="doc-h3">OverlayHandle</h3>
        <ApiTable :columns="methodColumns" :rows="handleRows" />
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        :member-names="apiMembers"
        title="Overlays 完整 API"
        description="这里直接列出普通 Overlay 的配置、查询条件、所有权、定位方式，以及 OverlayService 与 OverlayHandle 的全部相关成员；createDescriptor 由独立 Descriptor 页面说明。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="覆盖物（Overlays）" :items="anchors" /></aside>
  </div>
</template>
