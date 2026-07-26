<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import { shapeExamples } from '../../config/shapeExamples';
import ShapesDemo from '../../examples/elements/ShapesDemo.vue';
import shapesSource from '../../examples/elements/ShapesDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const shapesSnippet = extractExampleSnippet(shapesSource, 'shape-gallery');

const anchors = [
  { id: 'overview', label: '怎样选择 Shape' },
  { id: 'example-shape-catalog', label: '全部内置 Shape（逐个放大）' },
  { id: 'shape-catalog', label: '类型与控制点规则' },
  { id: 'callout-sizing', label: 'Callout 尺寸模式' },
  { id: 'coordinates', label: '输入、状态与单位' },
  { id: 'api-values', label: '运行时类型列表' },
  { id: 'api', label: '完整 API' }
];

const shapeColumns = [
  { prop: 'name', label: 'ShapeType', width: 230, presentation: 'type' as const },
  { prop: 'group', label: '类别', width: 130 },
  { prop: 'points', label: '完整输入', width: 190 },
  { prop: 'render', label: '最终渲染几何', width: 170 },
  { prop: 'desc', label: '说明', width: 380 }
];

const shapeRows = shapeExamples.map((example) => ({
  name: example.type,
  href: '/api/types#api-type-shape-type',
  group: example.group,
  points: example.points,
  render: example.render,
  desc: example.description
}));

const valueColumns = [
  { prop: 'name', label: '导出值', width: 180, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 360, linkTypes: true },
  { prop: 'desc', label: '说明', width: 430 }
];

const valueRows = [
  { anchor: 'api-value-shape-types', name: 'shapeTypes', type: 'readonly ShapeType[]', desc: '按稳定顺序列出全部内置图形名称，可用于表单选项与能力枚举' }
];

const calloutModeRows = [
  {
    mode: "省略 / 'map'",
    behavior: '默认模式；框体、尾巴、文字、padding 与描边按地图分辨率同比缩放，地图空间尺度保持稳定',
    state: '不改写 size 或 referenceResolution'
  },
  {
    mode: "'screen'",
    behavior: '框体、尾巴和文字保持固定 CSS 像素尺寸，不随地图层级改变视觉大小',
    state: '只改变 Style，随时可无损切回 map'
  }
];

const apiTypes = ['ShapeType', 'ShapeInput', 'ShapeState'] as const;
const runtimeApi = ['shapeTypes'] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>图形类型（Shapes）</h1>
        <p>选择任意类型后，地图会放大显示图形、编号控制点和控制路径；所有 Shape 都通过同一个 elements.add() 创建。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">怎样选择 Shape</h2>
        <p>
          只需在
          <ApiReference kind="type" to="/api/types#api-type-shape-input">ShapeInput</ApiReference>
          中选择 <code>type</code> 并提供完整控制点。读取 Element 时会得到规范化的
          <ApiReference kind="type" to="/api/types#api-type-shape-state">ShapeState</ApiReference>， 业务 Shape 名称不会因为最终渲染成 Polygon 或 LineString
          而改变。
        </p>
        <el-alert type="info" :closable="false" show-icon title="Point 的外观由 Style 决定">
          普通圆点与图标标牌都使用 <code>geometry.type: 'point'</code>；通过
          <ApiReference kind="property" to="/api/types#api-type-style-spec-property-symbol">StyleSpec.symbol</ApiReference>
          选择 circle 或 icon，不需要额外的 Billboard ShapeType。
        </el-alert>
      </section>

      <section id="example-shape-catalog" class="doc-prose">
        <ExampleBlock title="全部内置 Shape（逐个放大）" :source="shapesSource" :snippet="shapesSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              预览区默认放大一个
              <ApiReference kind="property" to="#api-value-shape-types">shapeTypes</ApiReference>
              中的图形；编号表示规范输入点的顺序，虚线表示输入骨架。目录卡片按点、开放路径、参数图形、文本标注、闭合面和面箭头分组，点击即可切换全部内置类型。结果区通过
              <ApiReference kind="property" to="/components/elements/overview#api-property-geometry-details">Element.geometryDetails</ApiReference>
              同时展示范围角点、最终轮廓点、规范控制点以及 Circle 的圆心和双单位半径，并实际调用
              <ApiReference kind="method" to="/components/core/view#api-method-to-geographic-coordinates">earth.view.toGeographicCoordinates()</ApiReference>
              把一个 View Coordinate 转回经纬度。面箭头展示的是最终 polygon ring，不是绘制时的控制点；Callout 的静态几何详情只返回
              <code>[anchor, center]</code> 骨架，框体、尾巴和自动换行属于当前 View 的展示结果。
            </p>
          </template>
          <template #preview><ShapesDemo /></template>
        </ExampleBlock>
      </section>

      <section id="shape-catalog" class="doc-prose">
        <h2 class="doc-h2">类型与控制点规则</h2>
        <p>表格与上方画廊共用同一份运行时清单；新增 ShapeType 时，类型检查会要求补齐示例说明和输入模板。</p>
        <ApiTable :columns="shapeColumns" :rows="shapeRows" />
      </section>

      <section id="callout-sizing" class="doc-prose">
        <h2 class="doc-h2">Callout 尺寸模式</h2>
        <p>
          Callout 的 <code>size</code> 表示 <code>referenceResolution</code> 下的逻辑 CSS 像素。写入
          <ApiReference kind="type" to="/api/types#api-type-shape-input">ShapeInput</ApiReference>
          时通常无需提供 <code>referenceResolution</code>：引擎会在 Store 前从当前 View 捕获一次；更新已有 Callout 时省略该字段则保留原基准值。规范化的
          <ApiReference kind="type" to="/api/types#api-type-shape-state">ShapeState</ApiReference>
          始终保存这个正有限值，因此复制、历史和模式切换不会累计尺寸误差。
        </p>
        <p>
          通过
          <ApiReference kind="property" to="/api/types#api-type-style-spec-property-callout">StyleSpec.callout</ApiReference>
          的 <ApiReference kind="type" to="/api/types#api-type-callout-size-mode">CalloutSizeMode</ApiReference> 选择展示行为：
        </p>
        <el-table :data="calloutModeRows" border>
          <el-table-column prop="mode" label="sizeMode" min-width="150" />
          <el-table-column prop="behavior" label="展示行为" min-width="360" />
          <el-table-column prop="state" label="状态边界" min-width="240" />
        </el-table>
        <el-alert type="info" :closable="false" show-icon title="缩放或旋转期间只门控 Callout 文字">
          持久 Callout 在连续缩放或旋转开始时暂时隐藏独立文字层；View 稳定后仅按最终分辨率重排一次，并在下一帧恢复。框体与尾巴继续复用 OpenLayers 缓存，普通业务
          VectorLayer 不会因此开启持续刷新；纯平移不会触发文字门控。
        </el-alert>
      </section>

      <section id="coordinates" class="doc-prose">
        <h2 class="doc-h2">输入、状态与单位</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="坐标系">controlPoints 与 circle.center 使用当前 View 投影；经纬度先调用 toProjectedCoordinates()。</el-descriptions-item>
          <el-descriptions-item label="普通图形">使用 type + controlPoints；扁平数组严格按二维 XY 分组，三维坐标必须使用嵌套数组。</el-descriptions-item>
          <el-descriptions-item label="圆">使用 type + center + radius；radius 固定为米，不是 CSS 像素。</el-descriptions-item>
          <el-descriptions-item label="文本标注框">
            使用 <code>type + anchor + center + size</code>；两个坐标使用当前 View 投影，<code>size</code> 是基准分辨率下的 <code>[width, height]</code> 逻辑
            CSS 像素。直接创建时传正尺寸，Draw 会从文字自动计算初始尺寸；<code>referenceResolution</code>
            通常省略并交由引擎物化。
          </el-descriptions-item>
          <el-descriptions-item label="闭合面">控制点无需重复首点；规范状态不会保存重复的闭合点。</el-descriptions-item>
          <el-descriptions-item label="完整性">elements.add() 只接受完整输入；交互式收集控制点、自动补点和结束规则归属 DrawService。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="api-values" class="doc-prose">
        <h2 class="doc-h2">运行时类型列表</h2>
        <ApiTable :columns="valueColumns" :rows="valueRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :runtime-names="runtimeApi"
        description="完整展开 ShapeType、Circle、Callout 与普通 controlPoints 输入和状态分支，以及 shapeTypes 的运行时导出。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="图形类型（Shapes）" :items="anchors" /></aside>
  </div>
</template>
