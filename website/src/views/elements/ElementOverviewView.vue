<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import ElementOverviewDemo from '../../examples/elements/ElementOverviewDemo.vue';
import elementOverviewSource from '../../examples/elements/ElementOverviewDemo.vue?raw';
import ShapesDemo from '../../examples/elements/ShapesDemo.vue';
import shapesSource from '../../examples/elements/ShapesDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const elementOverviewSnippet = extractExampleSnippet(elementOverviewSource, 'element-quick-start');
const shapesSnippet = extractExampleSnippet(shapesSource, 'shape-gallery');
const elementOverviewDemoRef = ref<InstanceType<typeof ElementOverviewDemo> | null>(null);
const shapesDemoRef = ref<InstanceType<typeof ShapesDemo> | null>(null);

const resetElementOverviewDemo = () => elementOverviewDemoRef.value?.reset();
const focusElementOverviewDemo = () => elementOverviewDemoRef.value?.focusSelected();
const resetShapesDemo = () => shapesDemoRef.value?.reset();
const focusShapesDemo = () => shapesDemoRef.value?.focusSelected();

const anchors = [
  { id: 'overview', label: 'Element 是什么' },
  { id: 'example-element-quick-start', label: '创建第一个 Element' },
  { id: 'example-all-shapes', label: 'Shape 视觉目录' },
  { id: 'common-workflows', label: '常用操作' },
  {
    id: 'api-element',
    label: 'Element API',
    children: [
      { id: 'api-element-properties', label: '属性' },
      { id: 'api-element-methods', label: '方法' }
    ]
  },
  { id: 'api-element-service', label: 'ElementService API' },
  {
    id: 'state-model',
    label: '状态模型与注意事项',
    children: [{ id: 'geometry-details', label: '完整静态几何与范围' }]
  },
  { id: 'api', label: '相关类型' }
];

const propertyColumns = [
  { prop: 'name', label: '属性', width: 170, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 280, linkTypes: true },
  { prop: 'desc', label: '说明', width: 460 }
];

const propertyRows = [
  {
    anchor: 'api-property-id',
    href: '/api/types#api-type-element-property-id',
    name: 'id',
    type: 'string',
    desc: '当前 Earth 中的唯一身份；句柄生命周期内保持不变'
  },
  {
    anchor: 'api-property-state',
    href: '/api/types#api-type-element-property-state',
    name: 'state',
    type: 'Readonly<ElementState<T>>',
    desc: '每次读取当前不可变业务状态快照，是持久状态的唯一真源'
  },
  {
    anchor: 'api-property-geometry-details',
    href: '/api/types#api-type-element-property-geometry-details',
    name: 'geometryDetails',
    type: 'ElementGeometryDetails',
    desc: '从最新已提交 Shape 状态派生完整静态渲染几何、二维范围、范围角点、最终轮廓点和统一控制参数'
  },
  {
    anchor: 'api-property-ol-feature',
    href: '/api/types#api-type-element-property-ol-feature',
    name: 'olFeature',
    type: 'Feature<Geometry>',
    desc: '高级 OpenLayers 逃生口；直接修改不会反向写回 ElementState'
  }
];

const methodIndexColumns = [
  { prop: 'name', label: '方法', width: 190, presentation: 'method' as const },
  { prop: 'use', label: '适用场景', width: 250 },
  { prop: 'desc', label: '说明', width: 460 }
];

const elementMethodRows = [
  {
    anchor: 'api-element-method-update',
    href: '/components/elements/update#api-method-element-update',
    name: 'update',
    use: '已经持有目标句柄',
    desc: '更新当前 Element；完整参数与返回值归属“更新、复制与显隐”页面'
  },
  {
    anchor: 'api-element-method-remove',
    href: '/components/elements/cleanup#api-method-element-remove',
    name: 'remove',
    use: '删除当前句柄',
    desc: '移除当前 Element；生命周期规则归属“删除与清理”页面'
  }
];

const serviceMethodRows = [
  {
    anchor: 'api-service-method-add',
    href: '/components/elements/create#api-method-add',
    name: 'add',
    use: '创建',
    desc: '提交完整 geometry、style 与业务字段，返回 Element 句柄'
  },
  {
    anchor: 'api-service-method-get',
    href: '/components/elements/query#api-method-get',
    name: 'get',
    use: '按 ID 查询',
    desc: '读取当前代次句柄；未找到时返回 undefined'
  },
  {
    anchor: 'api-service-method-query',
    href: '/components/elements/query#api-method-query',
    name: 'query',
    use: '组合查询',
    desc: '按 module、type、layerId、visible 等状态条件选择 Element'
  },
  {
    anchor: 'api-service-method-update',
    href: '/components/elements/update#api-method-service-update',
    name: 'update',
    use: '批量更新',
    desc: '对非空选择器命中的 Element 原子提交同一个 patch'
  },
  {
    anchor: 'api-service-method-copy',
    href: '/components/elements/update#api-method-copy',
    name: 'copy',
    use: '创建副本',
    desc: '复制规范状态并返回拥有新 ID 与新 Feature 的句柄'
  },
  {
    anchor: 'api-service-method-hide',
    href: '/components/elements/update#api-method-hide',
    name: 'hide',
    use: '批量隐藏',
    desc: '把非空选择器命中的业务 visible 状态设为 false'
  },
  {
    anchor: 'api-service-method-show',
    href: '/components/elements/update#api-method-show',
    name: 'show',
    use: '批量显示',
    desc: '把非空选择器命中的业务 visible 状态设为 true'
  },
  {
    anchor: 'api-service-method-set-protection',
    href: '/components/elements/protection#api-method-set-protection',
    name: 'setProtection',
    use: '协同保护',
    desc: '按 ID 应用保护、解锁或租约更新，并返回状态是否实际改变'
  },
  {
    anchor: 'api-service-method-get-protection',
    href: '/components/elements/protection#api-method-get-protection',
    name: 'getProtection',
    use: '读取保护',
    desc: '读取当前代次的保护快照；未保护时返回 undefined'
  },
  {
    anchor: 'api-service-method-remove',
    href: '/components/elements/cleanup#api-method-service-remove',
    name: 'remove',
    use: '批量删除',
    desc: '删除非空选择器命中的对象并返回删除数量'
  },
  {
    anchor: 'api-service-method-clear',
    href: '/components/elements/cleanup#api-method-clear',
    name: 'clear',
    use: '清空全部',
    desc: '显式移除当前 Earth 的全部 Element'
  },
  {
    anchor: 'api-service-method-at-pixel',
    href: '/components/elements/query#api-method-at-pixel',
    name: 'atPixel',
    use: '屏幕命中',
    desc: '返回指定 CSS 像素位置最先命中的 Element 与 Layer'
  },
  {
    anchor: 'api-service-method-screen-extent',
    href: '/components/elements/query#api-method-screen-extent',
    name: 'getScreenExtent',
    use: '读取屏幕范围',
    desc: '读取一个 Element 在当前视口内的 CSS 像素包围范围'
  }
];

const apiTypes = ['Element', 'ElementState', 'ElementGeometryDetails', 'ElementRenderGeometry', 'MapExtent', 'ElementService'] as const;
const apiMembers = {
  Element: ['constructor', 'id', 'state', 'geometryDetails', 'olFeature'],
  ElementService: []
} as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>Element 概览</h1>
        <p>先创建一个 Element，再通过可搜索、可分类的视觉目录查看全部 20 种 Shape，最后按任务找到查询、更新、显隐和清理 API。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">Element 是什么</h2>
        <p>
          Element 是 2.0 中统一的业务地图对象，<code>geometry.type</code> 决定它显示成哪一种 Shape。从
          <ApiReference kind="property" to="/components/core/earth#api-property-elements">earth.elements</ApiReference>
          创建或查询后，你会得到稳定的
          <ApiReference kind="type" to="/api/types#api-type-element">Element</ApiReference>
          句柄。
        </p>
        <el-alert type="info" :closable="false" show-icon title="不需要为每种图形创建一种图层">
          Point、路径、面、参数图形和箭头都能放进同一个 VectorLayer；业务分组使用 module，渲染归属使用 layerId。
        </el-alert>
      </section>

      <section id="example-element-quick-start" class="doc-prose">
        <ExampleBlock
          title="创建第一个 Element"
          :source="elementOverviewSource"
          :snippet="elementOverviewSnippet"
          source-lang="vue"
          snippet-lang="typescript"
          show-reset
          show-focus
          @reset="resetElementOverviewDemo"
          @focus="focusElementOverviewDemo"
        >
          <template #description>
            <p>
              调用
              <ApiReference kind="method" to="/components/elements/create#api-method-add">earth.elements.add</ApiReference>
              一次提交图形、样式和业务数据。示例按钮继续演示移动、显隐与删除，结果直接体现在地图上。
            </p>
          </template>
          <template #preview><ElementOverviewDemo ref="elementOverviewDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="example-all-shapes" class="doc-prose">
        <ExampleBlock
          title="全部 20 种 Shape 视觉目录"
          :source="shapesSource"
          :snippet="shapesSnippet"
          source-lang="vue"
          snippet-lang="typescript"
          show-reset
          show-focus
          @reset="resetShapesDemo"
          @focus="focusShapesDemo"
        >
          <template #description>
            <p>
              预览区一次放大一个
              <ApiReference kind="property" to="/components/elements/shapes#api-value-shape-types">shapeTypes</ApiReference>
              中的图形，并用编号标出
              <code>controlPoints</code>
              的输入顺序。可以按中文名、英文类型搜索或按类别筛选；选择卡片后，地图会重新聚焦并以宽描边高亮目标。每个图形都提供最小创建代码和
              <ApiReference kind="type" to="/api/types#api-type-shape-input">ShapeInput</ApiReference>
              等相关类型入口。选中图形后，示例还会读取
              <ApiReference kind="property" to="#api-property-geometry-details">Element.geometryDetails</ApiReference>
              ，统一显示范围角点、最终轮廓点、规范控制点以及 Circle 圆心和双单位半径；详细控制点规则见
              <a href="/components/elements/shapes">图形类型（Shapes）</a>。
            </p>
          </template>
          <template #preview><ShapesDemo ref="shapesDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="common-workflows" class="doc-prose">
        <h2 class="doc-h2">常用操作</h2>
        <p>概览只负责告诉你该选哪个入口；完整参数、边界规则与可运行示例放在对应任务页面。</p>
        <el-row :gutter="16" class="element-overview__workflow-grid">
          <el-col :xs="24" :sm="12">
            <el-card shadow="never" class="element-overview__workflow-card">
              <template #header><strong>1. 创建</strong></template>
              <p>使用 <code>elements.add(input)</code> 创建一个完整 Element。</p>
              <el-link type="primary" href="/components/elements/create">查看创建参数与示例</el-link>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-card shadow="never" class="element-overview__workflow-card">
              <template #header><strong>2. 查询与选择</strong></template>
              <p>已知 ID 用 <code>get</code>，组合条件用 <code>query</code>，屏幕命中用 <code>atPixel</code>。</p>
              <el-link type="primary" href="/components/elements/query">查看选择器与屏幕查询</el-link>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-card shadow="never" class="element-overview__workflow-card">
              <template #header><strong>3. 更新、复制与显隐</strong></template>
              <p>单个句柄调用 <code>update</code>；批量操作、复制和显隐从 <code>earth.elements</code> 进入。</p>
              <el-link type="primary" href="/components/elements/update">查看更新与显隐示例</el-link>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-card shadow="never" class="element-overview__workflow-card">
              <template #header><strong>4. 协同保护</strong></template>
              <p>按 Element ID 同步编辑占用状态，并显示操作人、遮罩与交互禁用反馈。</p>
              <el-link type="primary" href="/components/elements/protection">查看点线面保护与并发边界</el-link>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-card shadow="never" class="element-overview__workflow-card">
              <template #header><strong>5. 删除与清理</strong></template>
              <p>删除当前对象用 <code>element.remove()</code>；按条件删除用 <code>elements.remove()</code>。</p>
              <el-link type="primary" href="/components/elements/cleanup">查看清理范围与生命周期</el-link>
            </el-card>
          </el-col>
        </el-row>
      </section>

      <section id="api-element" class="doc-prose">
        <h2 class="doc-h2">Element API</h2>
        <p>Element 是由 ElementService 创建和返回的实时句柄，不能由业务代码直接构造。</p>

        <h3 id="api-element-properties" class="doc-h3">属性</h3>
        <ApiTable :columns="propertyColumns" :rows="propertyRows" />

        <h3 id="api-element-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodIndexColumns" :rows="elementMethodRows" />
      </section>

      <section id="api-element-service" class="doc-prose">
        <h2 class="doc-h2">ElementService API</h2>
        <p>下表是完整方法索引。点击方法名进入它的归属页面，查看参数、返回值、异常规则和可运行示例；完整类型签名也可从页面末尾的“相关类型”进入。</p>
        <ApiTable :columns="methodIndexColumns" :rows="serviceMethodRows" />
      </section>

      <section id="state-model" class="doc-prose">
        <h2 class="doc-h2">状态模型与注意事项</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="ID">当前 Earth 中的唯一身份；删除后用相同 ID 重建会得到新的句柄代次。</el-descriptions-item>
          <el-descriptions-item label="Type">来自 geometry.type，决定业务图形；它不等同于 OpenLayers GeometryType。</el-descriptions-item>
          <el-descriptions-item label="Module">业务分组，可用于查询、批量更新、显隐与删除。</el-descriptions-item>
          <el-descriptions-item label="Layer">渲染与资源分组；同一 VectorLayer 可以承载不同 Shape。</el-descriptions-item>
        </el-descriptions>

        <h3 id="geometry-details" class="doc-h3">完整静态几何与范围</h3>
        <p>
          <ApiReference kind="property" to="#api-property-geometry-details">Element.geometryDetails</ApiReference>
          从最新已提交的 Shape 状态计算，不会把派生坐标写回
          <ApiReference kind="property" to="#api-property-state">Element.state</ApiReference>
          。返回的
          <ApiReference kind="type" to="#api-type-element-geometry-details">ElementGeometryDetails</ApiReference>
          是一份独立的不可变快照。它保留类型为
          <ApiReference kind="type" to="#api-type-element-render-geometry">ElementRenderGeometry</ApiReference>
          的 <code>renderGeometry</code> 和 <code>extent</code> 这两个无损字段，同时提供无需再次判断 Shape 类型的统一便利字段。
        </p>
        <ul>
          <li>
            <code>extentPoints</code> 固定返回四个二维范围角点，顺序为 <code>[minX, minY]</code>、<code>[maxX, minY]</code>、<code>[maxX, maxY]</code>、<code
              >[minX, maxY]</code
            >。
          </li>
          <li>
            <code>rangePoints</code> 统一使用坐标组：Point 为 <code>[[point]]</code>，Polyline 为 <code>[path]</code>，Polygon 和 Plot 面为完整 rings；Circle
            返回冻结的空数组，不离散圆周。
          </li>
          <li><code>controlPoints</code> 返回最新已提交的规范控制点；Circle 不使用控制点，因此固定为 <code>null</code>。它与最终轮廓点含义不同。</li>
          <li>
            箭头和其他派生面会返回 <code>type: 'polygon'</code>；<code>coordinates</code> 是完整的 polygon rings，不再只是绘制时输入的
            <code>controlPoints</code>。
          </li>
          <li>
            Circle 的便利字段 <code>center</code> 返回 View 投影圆心，<code>radius</code> 同时提供米制 <code>meters</code> 和 View 投影单位下的
            <code>projected</code>；其他 Shape 的两个字段均为 <code>null</code>。
          </li>
          <li>
            <code>extent</code> 是
            <ApiReference kind="type" to="#api-type-map-extent">MapExtent</ApiReference>
            ，顺序为 <code>[minX, minY, maxX, maxY]</code>，坐标使用当前 View 投影。
          </li>
          <li>
            需要经纬度时用 <code>earth.view.toGeographicCoordinates()</code> 显式逐个转换 Coordinate；Polygon 需逐 ring 转换，Circle 只转换
            <code>center</code>，不能把投影半径当作坐标转换。
          </li>
        </ul>
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon title="范围描述规范静态几何">
          <code>geometryDetails</code> 不包含描边、文字、图标等样式外扩，也不包含动画帧、交互预览或世界环绕产生的临时副本。需要当前视口中的 CSS
          像素视觉范围时，请使用
          <ApiReference kind="method" to="/components/elements/query#api-method-screen-extent">earth.elements.getScreenExtent</ApiReference>
          。它会保留已提交的坐标，不会把第 N 个世界中的坐标自动归一化到基础世界。
        </el-alert>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="持久修改请走公开 API">
          <ApiReference kind="property" to="#api-property-state">Element.state</ApiReference>
          是最新的只读状态快照。OpenLayers Feature、Geometry 和 Style 只是渲染投影，直接修改
          <ApiReference kind="property" to="#api-property-ol-feature">olFeature</ApiReference>
          不会反向写回业务状态。
        </el-alert>
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :member-names="apiMembers"
        title="Element 完整状态 API"
        description="完整列出 Element 的受限构造函数、公开属性、静态几何详情类型和 ElementState 八个业务字段；ElementService 方法在上方总索引中按任务进入各自规范页面。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="Element 概览" :items="anchors" /></aside>
  </div>
</template>

<style scoped>
.element-overview__workflow-grid {
  row-gap: 16px;
}

.element-overview__workflow-card {
  height: 100%;
  border-color: var(--doc-border);
  background: var(--doc-surface);
}

.element-overview__workflow-card p {
  min-height: 48px;
  margin-top: 0;
}
</style>
