<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ElementQueryDemo from '../../examples/elements/ElementQueryDemo.vue';
import elementQuerySource from '../../examples/elements/ElementQueryDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const elementQuerySnippet = extractExampleSnippet(elementQuerySource, 'element-query');

const anchors = [
  { id: 'overview', label: '查询入口' },
  { id: 'selector', label: 'ElementSelector' },
  { id: 'example-element-query', label: '组合查询与地图高亮' },
  { id: 'screen-query', label: '像素命中与屏幕范围' },
  { id: 'api-actions', label: '查询方法' },
  { id: 'api', label: '完整 API' }
];

const selectorColumns = [
  { prop: 'name', label: '条件', width: 140, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 320, linkTypes: true },
  { prop: 'desc', label: '语义', width: 430 }
];

const selectorRows = [
  { anchor: 'api-selector-id', name: 'id', type: 'string', desc: '匹配单个 ID；不能与 ids 同时设置' },
  { anchor: 'api-selector-ids', name: 'ids', type: 'readonly string[]', desc: '匹配一组 ID；输入会形成独立查询快照' },
  { anchor: 'api-selector-module', name: 'module', type: 'string', desc: '按业务模块匹配' },
  { anchor: 'api-selector-layer-id', name: 'layerId', type: 'string', desc: '按渲染图层 ID 匹配' },
  { anchor: 'api-selector-type', name: 'type', type: 'ShapeType', desc: '按图形类型匹配' },
  { anchor: 'api-selector-visible', name: 'visible', type: 'boolean', desc: '按业务显隐状态匹配' },
  {
    anchor: 'api-selector-predicate',
    name: 'predicate',
    type: '(state: Readonly<ElementState<T>>) => boolean',
    desc: '追加自定义只读判断；与其他条件采用 AND 语义'
  }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 190, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 320, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 280, linkTypes: true },
  { prop: 'desc', label: '说明', width: 390 }
];

const methodRows = [
  {
    anchor: 'api-method-get',
    href: '/api/types#api-type-element-service-method-get',
    name: 'get',
    params: 'id: string',
    returns: 'Element<T> | undefined',
    desc: '按 ID 获取当前代次句柄；缺失返回 undefined'
  },
  {
    anchor: 'api-method-query',
    href: '/api/types#api-type-element-service-method-query',
    name: 'query',
    params: 'selector?: ElementSelector<T>',
    returns: 'readonly Element<T>[]',
    desc: '按注册顺序返回冻结数组；省略 selector 查询全部'
  },
  {
    anchor: 'api-method-at-pixel',
    href: '/api/types#api-type-element-service-method-at-pixel',
    name: 'atPixel',
    params: 'pixel: Pixel',
    returns: 'ElementHit<T> | undefined',
    desc: '返回像素位置最先命中的 Element 与所属 Layer'
  },
  {
    anchor: 'api-method-screen-extent',
    href: '/api/types#api-type-element-service-method-get-screen-extent',
    name: 'getScreenExtent',
    params: 'target: string | Element',
    returns: 'ScreenExtent | undefined',
    desc: '返回当前视口中的屏幕包围范围；不可见或缺失时返回 undefined'
  }
];

const apiTypes = ['ElementSelector', 'ElementHit', 'ScreenExtent', 'ElementService'] as const;
const apiMembers = { ElementService: ['get', 'query', 'atPixel', 'getScreenExtent'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>查询与选择器</h1>
        <p>get 负责单 ID 查找，query 负责状态条件组合，atPixel 与 getScreenExtent 则把 Element 查询连接到当前地图视口。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">查询入口</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="8"
            ><el-card shadow="never"
              ><strong>get(id)</strong>
              <p>已知唯一 ID 时使用，缺失不是异常。</p></el-card
            ></el-col
          >
          <el-col :xs="24" :md="8"
            ><el-card shadow="never"
              ><strong>query(selector?)</strong>
              <p>按业务状态组合过滤，可省略条件查询全部。</p></el-card
            ></el-col
          >
          <el-col :xs="24" :md="8"
            ><el-card shadow="never"
              ><strong>屏幕查询</strong>
              <p>按像素命中或读取 Element 的屏幕范围。</p></el-card
            ></el-col
          >
        </el-row>
      </section>

      <section id="selector" class="doc-prose">
        <h2 class="doc-h2">ElementSelector</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-element-selector">ElementSelector&lt;T&gt;</ApiReference>
          的已设置字段全部采用 AND 语义。<code>predicate</code> 接收只读状态快照，不应在回调中发起嵌套写操作。
        </p>
        <ApiTable :columns="selectorColumns" :rows="selectorRows" />
      </section>

      <section id="example-element-query" class="doc-prose">
        <ExampleBlock title="组合查询与地图高亮" :source="elementQuerySource" :snippet="elementQuerySnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例组合 module、type、visible 和 predicate 条件；匹配对象会在地图上保持高亮，未匹配对象会降弱。选择表格行后可继续调用
              <ApiReference kind="method" to="#api-method-get">get</ApiReference> 与
              <ApiReference kind="method" to="#api-method-screen-extent">getScreenExtent</ApiReference
              >，返回范围会以橙色虚线框画在地图上；也可以直接点击图形体验 <ApiReference kind="method" to="#api-method-at-pixel">atPixel</ApiReference> 命中。
            </p>
          </template>
          <template #preview><ElementQueryDemo /></template>
        </ExampleBlock>
      </section>

      <section id="screen-query" class="doc-prose">
        <h2 class="doc-h2">像素命中与屏幕范围</h2>
        <ul>
          <li><code>Pixel</code> 以地图视口左上角为原点，单位为 CSS 像素。</li>
          <li><code>atPixel()</code> 返回 Element 和 Layer 的成对结果；没有一致命中时返回 undefined。</li>
          <li><code>getScreenExtent()</code> 可接收 ID 或当前 Earth 的句柄；其他 Earth 或旧代次句柄会被拒绝。</li>
          <li>屏幕结果只描述当前渲染状态，不进入 ElementState，也不能替代业务几何。</li>
        </ul>
        <el-alert type="warning" :closable="false" show-icon title="读取与批量写入的空条件规则不同">
          query() 可以省略 selector 来读取全部；update、hide、show 和 remove 必须提供至少一个明确条件，清空全部只能调用 clear()。
        </el-alert>
      </section>

      <section id="api-actions" class="doc-prose">
        <h2 class="doc-h2">查询方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        description="完整列出选择器、命中结果、屏幕范围和四个查询方法；所有参数与返回类型都可继续点击。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="查询与选择器" :items="anchors" /></aside>
  </div>
</template>
