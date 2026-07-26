<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import CodeBlock from '../../components/docs/CodeBlock.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import LineworkDemo from '../../examples/elements/LineworkDemo.vue';
import lineworkSource from '../../examples/elements/LineworkDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const lineworkSnippet = `${extractExampleSnippet(lineworkSource, 'linework-factory')}\n\n${extractExampleSnippet(lineworkSource, 'linework-apply')}`;
const polylineFactoryCode = `const style = lineStyles.polyline({
  color: '#000000',
  tracks: { mode: 'double', patterns: ['solid', 'dashed'], width: 3 },
  casing: { color: '#ffff00', type: 'center', width: 2 },
  decoration: 'tick'
});`;
const polygonFactoryCode = `const style = lineStyles.polygon({
  color: '#000000',
  tracks: { mode: 'single', pattern: 'solid', width: 3 },
  casing: { color: '#ffff00', type: 'outer', width: 2 },
  decoration: 'square'
});`;

const anchors = [
  { id: 'overview', label: '优先使用 lineStyles' },
  { id: 'example-linework', label: '生成路径线饰' },
  { id: 'factory-options', label: '工厂选项' },
  { id: 'casing-semantics', label: '衬色方向与宽度' },
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
  { name: 'color', type: 'Color', desc: '前景轨道、端帽和普通装饰共用颜色；默认红色' },
  {
    name: 'tracks',
    type: 'LineTracksOptions',
    desc: '正交配置 single、double 或 none 模式、实虚线节奏及每条前景轨道宽度；省略为 2px 单轨实线'
  },
  { name: 'casing', type: 'LineCasingOptions', desc: '为完整前景轨道包络增加纯色实线衬色；默认居中且每个指定方向露出 2px' },
  { name: 'caps', type: 'LineCapsOptions', desc: '仅开放单轨可用' },
  {
    name: 'decoration',
    type: 'LineDecorationOptions',
    desc: '字符串选择无附加参数的装饰；中心 glyph 与路径文字使用对象携带 repeatSpacingPx、text 和 style'
  }
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
    desc: '生成开放路径使用的轨道、衬色、端帽、装饰或路径文字'
  },
  {
    anchor: 'api-method-line-polygon',
    href: '/api/types#api-type-line-style-factories-method-polygon',
    name: 'polygon',
    params: 'options?: PolygonLineStyleOptions',
    returns: 'StyleSpec',
    desc: '生成 Polygon 闭合外环使用的轨道、衬色、装饰或路径文字'
  }
];

const apiTypes = [
  'LineStyleFactories',
  'PolylineLineStyleOptions',
  'PolygonLineStyleOptions',
  'LinePattern',
  'LineTracksOptions',
  'LineDecorationOptions',
  'LineCasingType',
  'LineCasingOptions',
  'LineCapType',
  'LineCapsOptions',
  'TrackedLineDecorationType',
  'DecorationOnlyLineType',
  'InlineTextLineDecorationType',
  'InlineLineTextStyleOptions',
  'LineworkSpec',
  'PathCasingSpec',
  'PathTrackSpec',
  'PathTrackStrokeSpec',
  'PathCapSpec',
  'PathGlyphSpec',
  'PathGlyphPrimitiveSpec',
  'PathGlyphStrokeSpec',
  'PathDecorationSpec',
  'InlinePathTextPlacementSpec',
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
        <p>
          <ApiReference kind="property" to="#api-value-line-styles">lineStyles</ApiReference> 把轨道、衬色、端帽、固定装饰与路径文字展开为完整
          StyleSpec；轨道宽度和衬色方向可独立配置，双轨间隙、端帽和装饰会随宽度正确布局，中心内容既可只放在中点，也可按 CSS 像素间距铺满路径。
        </p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">优先使用 lineStyles</h2>
        <p>
          日常代码从根入口运行时值 <ApiReference kind="property" to="#api-value-line-styles">lineStyles</ApiReference> 调用
          <ApiReference kind="method" to="#api-method-line-polyline">polyline()</ApiReference> 或
          <ApiReference kind="method" to="#api-method-line-polygon">polygon()</ApiReference>。 工厂执行严格判别校验，复制输入，并返回可以直接写入 Element 或
          Draw 的独立 StyleSpec。
        </p>
        <el-alert type="success" :closable="false" show-icon title="工厂是规范入口">
          tracks、casing、caps 与 decoration 是正交输入；双轨间隙、普通装饰尺寸、闭合缝、端帽连接、文字和衬色切口由工厂统一展开，业务代码不需要手工拼接低层
          <ApiReference kind="type" to="#api-type-linework-spec">LineworkSpec</ApiReference>。
        </el-alert>
      </section>

      <section id="example-linework" class="doc-prose">
        <ExampleBlock title="生成路径线饰" :source="lineworkSource" :snippet="lineworkSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例使用 Element Plus 组合开放/闭合轮廓、轨道、端帽与装饰，调用
              <ApiReference kind="property" to="#api-value-line-styles">lineStyles</ApiReference> 工厂后把返回的
              <ApiReference kind="type" to="/api/types#api-type-style-spec">StyleSpec</ApiReference>
              写入 Element。修改任一选项都会立即刷新地图；当前轨道、装饰和端帽会用标签明确标出。同一个 Element 可切换单轨、双轨和
              Polygon，调整每条前景轨道宽度，并逐项比较 inner、outer、center 衬色。选择中心十字、中心点、中心点对或路径文字后，
              还可以切换“累计长度中点一次”与“按 CSS 像素间距铺满”。
            </p>
          </template>
          <template #preview><LineworkDemo /></template>
        </ExampleBlock>
      </section>

      <section id="factory-options" class="doc-prose">
        <h2 class="doc-h2">工厂选项</h2>
        <h3>双轨、线条装饰与居中衬色</h3>
        <CodeBlock :code="polylineFactoryCode" lang="typescript" />
        <h3>Polygon 外侧衬色</h3>
        <CodeBlock :code="polygonFactoryCode" lang="typescript" />
        <ApiTable :columns="optionColumns" :rows="optionRows" />
        <ul>
          <li>
            <code>tracks.width</code> 是每条前景轨道的 CSS 像素宽度；单轨与双轨都要求正有限数，省略时为 2。双轨会随宽度调整 offset，始终保留 4px 透明净间隙。
          </li>
          <li>
            <code>tracks.mode</code> 为 <code>single</code> 时使用 <code>pattern</code>，为 <code>double</code> 时使用 <code>patterns</code>，两者不能混用。
          </li>
          <li><code>casing</code> 只在存在前景轨道时可用；它始终使用实线，不继承前景虚线节奏，也不参与 dash-flow 相位推进。</li>
          <li>开放单轨可组合端帽和重复装饰；双轨与 Polygon 不使用端帽，无轨道时只允许 <code>decoration: 'slash'</code>。</li>
          <li>无附加参数的 decoration 使用字符串；路径文字使用对象，并在对象中提供非空 <code>text</code> 与可选 <code>style</code>。</li>
          <li>
            decoration 对象中的 <code>repeatSpacingPx</code> 只适用于 <code>center-cross</code>、<code>center-dot</code>、<code>center-dot-pair</code> 与
            <code>inline-text</code>。省略时只在累计长度中点放置一次；传入正有限数时，相邻副本严格保持该 CSS 像素间距。
          </li>
          <li>轨道宽度、衬色宽度或重复间距为 0、负数、NaN、无穷值时会同步抛出参数错误，不会回退或自动修正。</li>
          <li>间距按相邻副本的锚点计算，不随文字宽度自动增大或抽稀；间距小于文字视觉宽度时文字可能重叠。</li>
          <li>tick、alternating-tick、double-tick、square 与 circle 会按前景轨道包络放大；默认 2px 下的尺寸和全部装饰间距保持不变。</li>
          <li>重复的中心 glyph 和文字会为每个副本同时切断前景轨道与衬色；重叠切口会合并，虚线跨过全部切口后仍延续原相位。</li>
        </ul>
      </section>

      <section id="casing-semantics" class="doc-prose">
        <h2 class="doc-h2">衬色方向与宽度</h2>
        <p>
          <code>casing.width</code> 表示单个指定方向实际露出的 CSS 像素厚度，不是最终派生 Stroke
          的总宽度。工厂按单轨或双轨的完整视觉包络计算衬色，始终先画衬色，再用前景轨道覆盖居中区域。
        </p>
        <p>
          开放单轨配置端帽时，arrow 尖端与 bar
          中心严格位于真实路径端点；前景轨道和衬色分别停止在端帽朝路径内部的边缘，不会穿入或盖住端帽。逻辑路径和透明命中走廊仍保持完整。
        </p>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="center">在完整轨道包络的两侧各露出 casing.width；单轨和双轨使用相同规则。</el-descriptions-item>
          <el-descriptions-item label="Polyline inner">沿 controlPoints 声明方向位于右法线一侧；反转 controlPoints 会与 outer 交换。</el-descriptions-item>
          <el-descriptions-item label="Polyline outer">沿 controlPoints 声明方向位于左法线一侧；它不是拓扑意义上的面外部。</el-descriptions-item>
          <el-descriptions-item label="Polygon inner">始终位于 Polygon 外环的拓扑内部，不受调用方环方向影响。</el-descriptions-item>
          <el-descriptions-item label="Polygon outer">始终位于 Polygon 外环的拓扑外部；hole 不生成前景轨道或衬色。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="shape-compatibility" class="doc-prose">
        <h2 class="doc-h2">Shape 兼容矩阵</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="lineStyles.polyline()">polyline、lune-polyline、curve-polyline；最终轮廓必须是开放路径。</el-descriptions-item>
          <el-descriptions-item label="lineStyles.polygon()"
            >polygon、ellipse、全部面箭头、rectangle、triangle、equilateral-triangle、assemble-polygon、closed-curve-polygon、sector、lune-polygon。</el-descriptions-item
          >
          <el-descriptions-item label="不支持">point 与 circle 没有路径轮廓声明，不能应用 linework。</el-descriptions-item>
          <el-descriptions-item label="Polygon 规则">只装饰最终 Polygon 的外环；重复内容在闭合缝两侧保持固定间距，并把余量集中在缝处。</el-descriptions-item>
        </el-descriptions>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="轮廓不匹配会拒绝整次写入">
          把 polyline 工厂结果写入闭合 Shape，或把 polygon 工厂结果写入开放 Shape，会在提交前抛出参数错误，不留下部分状态。
        </el-alert>
      </section>

      <section id="advanced-state" class="doc-prose">
        <h2 class="doc-h2">高级状态引用</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-linework-spec">LineworkSpec</ApiReference> 及其
          <ApiReference kind="type" to="#api-type-path-track-spec">PathTrackSpec</ApiReference>、
          <ApiReference kind="type" to="#api-type-path-casing-spec">PathCasingSpec</ApiReference>、
          <ApiReference kind="type" to="#api-type-path-cap-spec">PathCapSpec</ApiReference>、
          <ApiReference kind="type" to="#api-type-path-glyph-spec">PathGlyphSpec</ApiReference>、
          <ApiReference kind="type" to="#api-type-path-decoration-spec">PathDecorationSpec</ApiReference>、
          <ApiReference kind="type" to="#api-type-inline-path-text-placement-spec">InlinePathTextPlacementSpec</ApiReference> 与
          <ApiReference kind="type" to="#api-type-inline-path-text-spec">InlinePathTextSpec</ApiReference>
          是公开的可序列化状态协议，主要用于读取、快照、审计与高级静态互操作。常规样式配置仍应由
          <ApiReference kind="property" to="#api-value-line-styles">lineStyles</ApiReference> 工厂生成。
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
        compact
        description="先展示工厂与状态类型的用途；精确签名和属性按需展开。常规创建只需使用上方两个工厂方法。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="路径线饰（Linework）" :items="anchors" /></aside>
  </div>
</template>
