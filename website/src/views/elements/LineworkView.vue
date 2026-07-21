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
  { name: 'caps', type: 'LineCapsOptions', desc: '仅开放单轨可用' },
  {
    name: 'decoration',
    type: 'TrackedLineDecorationType | DecorationOnlyLineType | InlineTextLineDecorationType',
    desc: '选择沿线装饰、斜杠或路径文字'
  },
  { name: 'repeatSpacingPx', type: 'number', desc: '仅三种中心 glyph 与 inline-text 可用；省略时位于累计长度中点，传正有限数时按该 CSS px 间距铺满 contour' },
  { name: 'text', type: 'string', desc: '仅 inline-text 必填；显示在一个或多个路径锚点' },
  { name: 'textStyle', type: 'InlineLineTextStyleOptions', desc: '仅调整路径文字外观，不改变间距或旋转' }
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
    desc: '生成开放路径使用的轨道、端帽、装饰或路径文字'
  },
  {
    anchor: 'api-method-line-polygon',
    href: '/api/types#api-type-line-style-factories-method-polygon',
    name: 'polygon',
    params: 'options?: PolygonLineStyleOptions',
    returns: 'StyleSpec',
    desc: '生成 Polygon 闭合外环使用的轨道、装饰或路径文字'
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
        <p>lineStyles 把单轨、双轨、端帽、固定装饰与路径文字展开为完整 StyleSpec；中心内容既可只放在中点，也可按 CSS 像素间距铺满路径。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">优先使用 lineStyles</h2>
        <p>
          日常代码从根入口运行时值 <code>lineStyles</code> 调用 <ApiReference kind="method" to="#api-method-line-polyline">polyline()</ApiReference> 或
          <ApiReference kind="method" to="#api-method-line-polygon">polygon()</ApiReference>。 工厂执行严格判别校验，复制输入，并返回可以直接写入 Element 或
          Draw 的独立 StyleSpec。
        </p>
        <el-alert type="success" :closable="false" show-icon title="工厂是规范入口">
          普通装饰间距、glyph 尺寸、闭合缝、文字切口和轮廓策略由工厂统一展开。只有中心十字、中心点、中心点对和路径文字通过 repeatSpacingPx
          开放重复间距，业务代码不需要手工拼接低层 LineworkSpec。
        </el-alert>
      </section>

      <section id="example-linework" class="doc-prose">
        <ExampleBlock title="生成路径线饰" :source="lineworkSource" :snippet="lineworkSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例使用 Element Plus 组合开放/闭合轮廓、轨道、端帽与装饰，调用 lineStyles 工厂后把返回的
              <ApiReference kind="type" to="/api/types#api-type-style-spec">StyleSpec</ApiReference>
              写入 Element。修改任一选项都会立即刷新地图；当前轨道、装饰和端帽会用标签明确标出。
              选择中心十字、中心点、中心点对或路径文字后，还可以切换“累计长度中点一次”与“按 CSS 像素间距铺满”。
            </p>
          </template>
          <template #preview><LineworkDemo /></template>
        </ExampleBlock>
      </section>

      <section id="factory-options" class="doc-prose">
        <h2 class="doc-h2">工厂选项</h2>
        <ApiTable :columns="optionColumns" :rows="optionRows" />
        <ul>
          <li>开放单轨可组合端帽和重复装饰；端帽会避让对应端点的首枚或末枚装饰。</li>
          <li>双轨与 Polygon 不使用端帽；无轨道时只允许 <code>slash</code>。</li>
          <li>选择 <code>inline-text</code> 时必须提供文字，并且不能再组合其他沿线装饰。</li>
          <li>
            <code>repeatSpacingPx</code> 只适用于 <code>center-cross</code>、<code>center-dot</code>、<code>center-dot-pair</code> 与
            <code>inline-text</code>。省略时只在累计长度中点放置一次；传入大于 0 的有限数时，相邻副本严格保持该 CSS 像素间距。
          </li>
          <li><code>repeatSpacingPx</code> 为 0、负数、NaN、无穷值，或用于其他 decoration 时会同步抛出参数错误，不会回退或自动修正。</li>
          <li>间距按相邻副本的锚点计算，不随文字宽度自动增大或抽稀；间距小于文字视觉宽度时文字可能重叠。</li>
          <li>重复的中心 glyph 和文字会为每个副本切断轨道；重叠切口会合并，虚线跨过全部切口后仍延续原相位。</li>
        </ul>
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
          PathTrack、PathCap、PathGlyph、PathDecoration、InlinePathTextPlacement、InlinePathText
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
        compact
        description="先展示工厂与状态类型的用途；精确签名和属性按需展开。常规创建只需使用上方两个工厂方法。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="路径线饰（Linework）" :items="anchors" /></aside>
  </div>
</template>
