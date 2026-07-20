<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import LineworkDemo from '../../examples/elements/LineworkDemo.vue';
import lineworkSource from '../../examples/elements/LineworkDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const lineworkSnippet = `${extractExampleSnippet(lineworkSource, 'linework-factory')}\n\n${extractExampleSnippet(lineworkSource, 'linework-apply')}`;

const anchors = [
  { id: 'overview', label: '优先使用 lineStyles' },
  { id: 'example-linework', label: '生成路径线饰' },
  { id: 'factory-options', label: '工厂选项' },
  { id: 'shape-compatibility', label: 'Shape 兼容矩阵' },
  { id: 'advanced-state', label: '高级状态引用' },
  { id: 'api-actions', label: '工厂方法' },
  { id: 'api', label: '完整 API' }
];

const optionColumns = [
  { prop: 'name', label: '选项', width: 150, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 360, linkTypes: true },
  { prop: 'desc', label: '规则', width: 450 }
];

const optionRows = [
  { name: 'color', type: 'Color', desc: '轨道、端帽和装饰共用颜色；默认红色' },
  { name: 'lines', type: 'LinePattern | readonly [LinePattern, LinePattern] | "none"', desc: '单轨、双轨或无轨道；省略为单轨实线' },
  { name: 'caps', type: 'LineCapsOptions', desc: '只允许开放的单轨路径；对应端帽会跳过该端首枚重复装饰，Polygon、双轨和纯装饰路径禁止端帽' },
  {
    name: 'decoration',
    type: 'TrackedLineDecorationType | DecorationOnlyLineType | InlineTextLineDecorationType',
    desc: '固定内置装饰；无轨道时只能使用 slash'
  },
  { name: 'text', type: 'string', desc: '只在 decoration 为 inline-text 时必填，固定放在累计长度中点' },
  { name: 'textStyle', type: 'InlineLineTextStyleOptions', desc: '只控制中点文字外观；位置、旋转和轨道切口由引擎固定' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 190, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 350, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 190, linkTypes: true },
  { prop: 'desc', label: '说明', width: 420 }
];

const methodRows = [
  {
    anchor: 'api-method-line-polyline',
    href: '/api/types#api-type-line-style-factories-method-polyline',
    name: 'polyline',
    params: 'options?: PolylineLineStyleOptions',
    returns: 'StyleSpec',
    desc: '生成开放路径使用的轨道、端帽、装饰或中点文字'
  },
  {
    anchor: 'api-method-line-polygon',
    href: '/api/types#api-type-line-style-factories-method-polygon',
    name: 'polygon',
    params: 'options?: PolygonLineStyleOptions',
    returns: 'StyleSpec',
    desc: '生成 Polygon 闭合外环使用的轨道、装饰或中点文字'
  }
];

const apiTypes = [
  'LineStyleFactories',
  'PolylineLineStyleOptions',
  'PolygonLineStyleOptions',
  'LinePattern',
  'LineCapType',
  'LineCapsOptions',
  'TrackedLineDecorationType',
  'DecorationOnlyLineType',
  'InlineTextLineDecorationType',
  'InlineLineTextStyleOptions',
  'LineworkSpec',
  'PathTrackSpec',
  'PathTrackStrokeSpec',
  'PathCapSpec',
  'PathGlyphSpec',
  'PathGlyphPrimitiveSpec',
  'PathGlyphStrokeSpec',
  'PathDecorationSpec',
  'InlinePathTextSpec',
  'PathContourPolicySpec'
] as const;
const runtimeApi = ['lineStyles'] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>路径线饰（Linework）</h1>
        <p>lineStyles 把单轨、双轨、端帽、固定装饰与中点文字展开为完整 StyleSpec，适合开放路径和 Polygon 外环的稳定线饰。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">优先使用 lineStyles</h2>
        <p>
          日常代码从根入口运行时值 <code>lineStyles</code> 调用 <ApiReference kind="method" to="#api-method-line-polyline">polyline()</ApiReference> 或
          <ApiReference kind="method" to="#api-method-line-polygon">polygon()</ApiReference>。 工厂执行严格判别校验，复制输入，并返回可以直接写入 Element 或
          Draw 的独立 StyleSpec。
        </p>
        <el-alert type="success" :closable="false" show-icon title="工厂是规范入口">
          固定间距、glyph 尺寸、闭合缝、文字切口和轮廓策略由工厂统一展开，业务代码不需要手工拼接低层 LineworkSpec。
        </el-alert>
      </section>

      <section id="example-linework" class="doc-prose">
        <ExampleBlock title="生成路径线饰" :source="lineworkSource" :snippet="lineworkSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例使用 Element Plus 组合开放/闭合轮廓、轨道、端帽与装饰，调用 lineStyles 工厂后把返回的
              <ApiReference kind="type" to="/api/types#api-type-style-spec">StyleSpec</ApiReference>
              写入 Element。修改任一选项都会立即刷新地图；当前轨道、装饰和端帽会用标签明确标出。
            </p>
          </template>
          <template #preview><LineworkDemo /></template>
        </ExampleBlock>
      </section>

      <section id="factory-options" class="doc-prose">
        <h2 class="doc-h2">工厂选项</h2>
        <ApiTable :columns="optionColumns" :rows="optionRows" />
        <p>带轨道装饰包括 none、tick、alternating-tick、double-tick、square、circle、center-cross、center-dot 和 center-dot-pair。</p>
        <p>开放路径配置起点或终点端帽时，会分别跳过该端的首枚或末枚重复装饰，避免两类 glyph 重叠；无端帽和中点装饰的布局不变。</p>
      </section>

      <section id="shape-compatibility" class="doc-prose">
        <h2 class="doc-h2">Shape 兼容矩阵</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="lineStyles.polyline()">polyline、lune-polyline、curve-polyline；最终轮廓必须是开放路径。</el-descriptions-item>
          <el-descriptions-item label="lineStyles.polygon()"
            >polygon、ellipse、全部面箭头、rectangle、triangle、equilateral-triangle、assemble-polygon、closed-curve-polygon、sector、lune-polygon。</el-descriptions-item
          >
          <el-descriptions-item label="不支持">point 与 circle 没有路径轮廓声明，不能应用 linework。</el-descriptions-item>
          <el-descriptions-item label="Polygon 规则">只装饰最终 Polygon 的外环；闭合缝保持固定间距，并把余量集中在缝处。</el-descriptions-item>
        </el-descriptions>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="轮廓不匹配会拒绝整次写入">
          把 polyline 工厂结果写入闭合 Shape，或把 polygon 工厂结果写入开放 Shape，会在提交前抛出参数错误，不留下部分状态。
        </el-alert>
      </section>

      <section id="advanced-state" class="doc-prose">
        <h2 class="doc-h2">高级状态引用</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-linework-spec">LineworkSpec</ApiReference> 及其
          PathTrack、PathCap、PathGlyph、PathDecoration、InlinePathText
          子类型是公开的可序列化状态协议，主要用于读取、快照、审计与高级静态互操作。常规样式配置仍应由 lineStyles 工厂生成。
        </p>
        <p>
          这些低层类型不包含运行时回调，不引用 OpenLayers，也不会从 Feature 反向恢复；修改 Element 样式时仍通过 StyleSpec、styles.set() 或 styles.patch() 提交。
        </p>
      </section>

      <section id="api-actions" class="doc-prose">
        <h2 class="doc-h2">工厂方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :runtime-names="runtimeApi"
        description="完整列出 lineStyles、两个工厂方法、严格判别选项，以及 Track、Cap、Glyph、Decoration、InlineText 和 Contour 类型树。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="路径线饰（Linework）" :items="anchors" /></aside>
  </div>
</template>
