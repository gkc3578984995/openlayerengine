<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ElementCreateDemo from '../../examples/elements/ElementCreateDemo.vue';
import elementCreateSource from '../../examples/elements/ElementCreateDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const elementCreateSnippet = extractExampleSnippet(elementCreateSource, 'element-create');

const anchors = [
  { id: 'overview', label: '创建流程' },
  { id: 'create-input', label: '创建参数' },
  { id: 'example-element-create', label: '创建业务 Element' },
  { id: 'defaults-and-coordinates', label: '默认值与坐标' },
  { id: 'api-actions', label: '创建方法' },
  { id: 'api', label: '完整 API' }
];

const fieldColumns = [
  { prop: 'name', label: '字段', width: 150, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 300, linkTypes: true },
  { prop: 'default', label: '默认值', width: 150 },
  { prop: 'desc', label: '说明', width: 390 }
];

const fieldRows = [
  { anchor: 'api-property-geometry', name: 'geometry', type: 'ShapeInput', default: '必填', desc: '图形判别字段与控制点；state.type 由 geometry.type 推导' },
  { anchor: 'api-property-id', name: 'id', type: 'string', default: '自动生成', desc: '当前 Earth 中唯一；重复 ID 抛出 DuplicateElementIdError' },
  { anchor: 'api-property-style', name: 'style', type: 'StyleInput', default: '按渲染类型选择预设', desc: '结构化样式或互斥的 nativeStyle 分支' },
  { anchor: 'api-property-data', name: 'data', type: 'T', default: 'undefined', desc: '调用方业务数据，泛型 T 会贯穿句柄与状态' },
  { anchor: 'api-property-module', name: 'module', type: 'string', default: 'undefined', desc: '业务分组，不决定图形或渲染图层' },
  { anchor: 'api-property-layer-id', name: 'layerId', type: 'string', default: 'default', desc: '必须指向当前 Earth 的矢量图层' },
  { anchor: 'api-property-visible', name: 'visible', type: 'boolean', default: 'true', desc: '初始业务可见状态' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 150, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 330, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 190, linkTypes: true },
  { prop: 'desc', label: '说明', width: 390 }
];

const methodRows = [
  {
    anchor: 'api-method-add',
    href: '/api/types#api-type-element-service-method-add',
    name: 'add',
    params: 'input: ElementCreateInput<T>',
    returns: 'Element<T>',
    desc: '校验完整输入并原子创建 Element；失败时不留下状态或渲染对象'
  }
];

const apiTypes = ['ElementCreateInput', 'ElementService'] as const;
const apiMembers = { ElementService: ['add'] } as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>创建</h1>
        <p>使用 earth.elements.add() 一次提交几何、样式、业务数据和分组。创建成功后返回稳定句柄，失败则不会产生部分状态。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">创建流程</h2>
        <el-steps :active="4" finish-status="success" align-center>
          <el-step title="准备坐标" description="转换到当前 View 投影" />
          <el-step title="声明 geometry" description="type + 控制点或圆心半径" />
          <el-step title="附加业务信息" description="data、module、layerId" />
          <el-step title="调用 add" description="获得 Element 句柄" />
        </el-steps>
      </section>

      <section id="create-input" class="doc-prose">
        <h2 class="doc-h2">创建参数</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-element-create-input">ElementCreateInput&lt;T&gt;</ApiReference>
          不接受顶层 <code>type</code>；图形类型只由 <code>geometry.type</code> 决定。
        </p>
        <ApiTable :columns="fieldColumns" :rows="fieldRows" />
      </section>

      <section id="example-element-create" class="doc-prose">
        <ExampleBlock title="创建业务 Element" :source="elementCreateSource" :snippet="elementCreateSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例使用 Element Plus 选择 Point、Polyline 或 Circle，构造
              <ApiReference kind="type" to="/api/types#api-type-element-create-input">ElementCreateInput</ApiReference>
              后调用 <ApiReference kind="method" to="#api-method-add">elements.add</ApiReference>。业务数据保留具体泛型。
            </p>
          </template>
          <template #preview><ElementCreateDemo /></template>
        </ExampleBlock>
      </section>

      <section id="defaults-and-coordinates" class="doc-prose">
        <h2 class="doc-h2">默认值与坐标</h2>
        <el-alert type="info" :closable="false" show-icon title="Element 坐标使用当前 View 投影">
          经纬度业务输入先交给 earth.view.toProjectedCoordinates()；读取持久状态后，可在保存前调用 toGeographicCoordinates() 转回 EPSG:4326。
        </el-alert>
        <ul>
          <li>扁平 controlPoints 按 XY 两两分组；三维坐标必须使用嵌套数组。</li>
          <li>Circle 使用 <code>center</code> 和米制 <code>radius</code>；点符号的 <code>style.symbol.radius</code> 才是 CSS 像素。</li>
          <li>省略 layerId 时使用 <code>default</code> 矢量图层；若它已被清理，首次隐式创建会按需重建。</li>
          <li>省略 style 时按最终渲染类别选择 point、line 或 polygon 默认预设。</li>
        </ul>
      </section>

      <section id="api-actions" class="doc-prose">
        <h2 class="doc-h2">创建方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        description="完整列出 ElementCreateInput 的全部字段和 ElementService.add 的重载、参数与返回值；字段中引用的公开类型可以继续点击查询。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="创建" :items="anchors" /></aside>
  </div>
</template>
