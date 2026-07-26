<script setup lang="ts">
import { ref } from 'vue';
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import PatternFillDemo from '../../examples/elements/PatternFillDemo.vue';
import patternFillSource from '../../examples/elements/PatternFillDemo.vue?raw';
import StylesDemo from '../../examples/elements/StylesDemo.vue';
import stylesSource from '../../examples/elements/StylesDemo.vue?raw';
import { extractExampleSnippet } from '../../utils/exampleSource';

const stylesSnippet = [
  extractExampleSnippet(stylesSource, 'style-preset'),
  extractExampleSnippet(stylesSource, 'callout-style'),
  extractExampleSnippet(stylesSource, 'style-patch'),
  extractExampleSnippet(stylesSource, 'native-style-boundary')
].join('\n\n');
const patternFillSnippet = `${extractExampleSnippet(patternFillSource, 'pattern-fill-set')}\n\n${extractExampleSnippet(patternFillSource, 'pattern-fill-patch')}`;
const patternFillDemoRef = ref<InstanceType<typeof PatternFillDemo> | null>(null);
const resetPatternFillDemo = () => patternFillDemoRef.value?.reset();
const focusPatternFillDemo = () => patternFillDemoRef.value?.focus();

const anchors = [
  { id: 'overview', label: '结构化样式模型' },
  { id: 'style-fields', label: 'StyleSpec 字段' },
  { id: 'presets', label: '内置 stylePresets' },
  { id: 'example-element-styles', label: '预设、Callout 结构化样式与 nativeStyle 边界' },
  { id: 'example-pattern-fill', label: '五种纹理与应用目标' },
  { id: 'native-style', label: 'nativeStyle 边界' },
  { id: 'api-actions', label: '样式方法' },
  { id: 'api', label: '完整 API' }
];

const fieldColumns = [
  { prop: 'name', label: '字段', width: 150, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 320, linkTypes: true },
  { prop: 'desc', label: '说明', width: 430 }
];

const styleFields = [
  { anchor: 'api-style-symbol', name: 'symbol', type: 'CircleSymbolSpec | IconSymbolSpec', desc: 'Point 的圆点或图标' },
  { anchor: 'api-style-strokes', name: 'strokes', type: 'StrokeSpec[]', desc: '同一 Geometry 上的一层或多层普通描边，按数组顺序叠加' },
  {
    anchor: 'api-style-fill',
    name: 'fill',
    type: 'SolidFillSpec | PatternFillSpec',
    desc: '面图形的纯色或纹理填充'
  },
  { anchor: 'api-style-text', name: 'text', type: 'TextSpec', desc: '文字内容与外观' },
  { anchor: 'api-style-decorations', name: 'decorations', type: 'ArrowDecorationSpec[]', desc: '普通路径箭头；固定像素路径装饰使用 linework' },
  { anchor: 'api-style-linework', name: 'linework', type: 'LineworkSpec', desc: '由 lineStyles 生成的偏移轨道、衬色、端帽与固定像素装饰' },
  { anchor: 'api-style-z-index', name: 'zIndex', type: 'number', desc: '同一图层内的样式绘制顺序' }
];

const presetRows = [
  { name: 'point-default', type: 'Point', desc: '蓝色圆点与白色边框' },
  { name: 'icon-default', type: 'Point', desc: '内置 Data URL 定位图标' },
  { name: 'line-default', type: '路径', desc: '蓝色圆角实线' },
  { name: 'arrow-default', type: '路径', desc: '蓝色实线与末端箭头' },
  { name: 'polygon-default', type: '闭合面', desc: '蓝色边框与半透明填充' },
  { name: 'measure-default', type: '测量', desc: '双层虚线、控制点与测量文字' },
  { name: 'draw-preview', type: '绘制', desc: '绘制预览使用的高对比样式' },
  { name: 'transform-handle', type: '交互锚点', desc: '橙色边框的白色控制点' }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 170, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 390, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 150, linkTypes: true },
  { prop: 'desc', label: '说明', width: 410 }
];

const methodRows = [
  {
    anchor: 'api-method-style-set',
    href: '/api/types#api-type-style-service-method-set',
    name: 'set',
    params: 'selector: ElementSelector, style: StyleInput',
    returns: 'void',
    desc: '完整替换全部匹配 Element 的样式'
  },
  {
    anchor: 'api-method-style-patch',
    href: '/api/types#api-type-style-service-method-patch',
    name: 'patch',
    params: 'selector: ElementSelector, patch: StylePatch',
    returns: 'void',
    desc: '逐层合并结构化样式；数组整体替换，undefined 删除字段'
  }
];

const apiTypes = [
  'StyleInput',
  'StyleSpec',
  'StylePatch',
  'ElementStyleState',
  'StyleService',
  'StylePresetName',
  'CircleSymbolSpec',
  'IconSymbolSpec',
  'StrokeSpec',
  'SolidFillSpec',
  'PatternFillSpec',
  'TextSpec',
  'ArrowDecorationSpec',
  'Color',
  'NativeStyleRef'
] as const;
const runtimeApi = ['stylePresets'] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图元素</span>
        <h1>样式（Styles）</h1>
        <p>StyleSpec 是可校验、可复制、可更新的业务样式；earth.styles 负责按 ElementSelector 完整替换或局部合并。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">结构化样式模型</h2>
        <p>
          <ApiReference kind="type" to="/api/types#api-type-style-input">StyleInput</ApiReference>
          是结构化 <ApiReference kind="type" to="/api/types#api-type-style-spec">StyleSpec</ApiReference> 与 OpenLayers
          <code>nativeStyle</code> 的互斥联合。日常业务优先使用结构化分支，它能参与快照、复制、StylePatch 和动画。
        </p>
        <el-alert type="success" :closable="false" show-icon title="样式也服从状态真源">
          ElementState.style 保存规范样式或受控原生引用。直接修改 olFeature.getStyle() 不会反向写入业务状态，并可能在下一次投影时被覆盖。
        </el-alert>
      </section>

      <section id="style-fields" class="doc-prose">
        <h2 class="doc-h2">StyleSpec 字段</h2>
        <ApiTable :columns="fieldColumns" :rows="styleFields" />
        <p>
          <ApiReference kind="property" to="#api-style-strokes">strokes</ApiReference> 适合在同一 Geometry 上按数组顺序叠加普通描边；
          <ApiReference kind="property" to="#api-style-linework">linework</ApiReference>
          还持有法向偏移轨道、共享切口、端帽与固定像素装饰。两套描边内核不能同时出现在一个 StyleSpec 中；需要为 Linework 增加底衬时，使用
          <RouterLink class="doc-link" to="/components/elements/linework#factory-options">lineStyles 的 casing 选项</RouterLink>，无需复制 Geometry 或创建第二个
          Element。
        </p>
        <el-alert type="info" :closable="false" show-icon title="Callout 使用结构化 fill / strokes / text">
          顶层 <ApiReference kind="property" to="#api-style-fill">fill</ApiReference> 与
          <ApiReference kind="property" to="#api-style-strokes">strokes</ApiReference> 同时绘制文本框和尾巴；
          <ApiReference kind="property" to="#api-style-text">text</ApiReference> 绘制框体中心文字。
          <ApiReference kind="property" to="/api/types#api-type-text-spec-property-max-width">TextSpec.maxWidth</ApiReference>
          是两点 Draw 自动计算初始内容宽度的 CSS px 上限，省略时使用 240px；缩放后会按当前框宽重新换行。 为保持文字居中、屏幕正向且不越界，Callout 不接受沿线
          placement、文字 offset、旋转、随 View 旋转或文字背景；scale 只能省略或使用数值 <code>1</code>。背景与边框应继续使用顶层 <code>fill / strokes</code>。
        </el-alert>
      </section>

      <section id="presets" class="doc-prose">
        <h2 class="doc-h2">内置 stylePresets</h2>
        <p>
          根入口运行时值 <ApiReference kind="property" to="#api-value-style-presets">stylePresets</ApiReference>
          提供八个命名预设。每次读取属性都会得到独立 StyleSpec，调用方修改一份对象不会污染以后读取的结果。
        </p>
        <div id="api-value-style-presets"></div>
        <ApiTable
          :columns="[
            { prop: 'name', label: '预设名', width: 220, presentation: 'property' },
            { prop: 'type', label: '适用对象', width: 150 },
            { prop: 'desc', label: '默认外观', width: 430 }
          ]"
          :rows="presetRows"
        />
      </section>

      <section id="example-element-styles" class="doc-prose">
        <ExampleBlock
          title="预设、Callout 结构化样式与 nativeStyle 边界"
          :source="stylesSource"
          :snippet="stylesSnippet"
          source-lang="vue"
          snippet-lang="typescript"
        >
          <template #description>
            <p>
              示例从 stylePresets 选择独立样式，通过 <ApiReference kind="method" to="#api-method-style-set">styles.set</ApiReference> 完整替换，再用
              <ApiReference kind="method" to="#api-method-style-patch">styles.patch</ApiReference>
              修改局部颜色；线样式会提供完整 <code>strokes</code> 数组，保留多层描边、宽度与虚线配置。原生边界闭环会正向应用 OpenLayers
              Style，捕获原生状态上结构化 patch 的预期错误并验证 NativeStyleRef 不变，最后在同一 Element 上恢复所选结构化预设。 “Callout
              自动换行”控件会运行同一组件中的 <code>fill + strokes + text</code> 示例，可调整
              <ApiReference kind="property" to="/api/types#api-type-text-spec-property-max-width">text.maxWidth</ApiReference> 后重新创建预览。
            </p>
          </template>
          <template #preview><StylesDemo /></template>
        </ExampleBlock>
      </section>

      <section id="example-pattern-fill" class="doc-prose">
        <ExampleBlock
          title="五种纹理与应用目标"
          :source="patternFillSource"
          :snippet="patternFillSnippet"
          source-lang="vue"
          snippet-lang="typescript"
          show-reset
          show-focus
          @reset="resetPatternFillDemo"
          @focus="focusPatternFillDemo"
        >
          <template #description>
            <p>
              上排同时展示 <code>diagonal</code>、<code>cross</code>、<code>dot</code>、<code>horizontal</code> 与 <code>vertical</code> 五种
              <ApiReference kind="type" to="/api/types#api-type-pattern-fill-spec">PatternFillSpec</ApiReference>。下排把同一纹理应用到
              <ApiReference kind="property" to="/api/types#api-type-style-spec-property-fill">Polygon.fill</ApiReference>、
              <ApiReference kind="property" to="/api/types#api-type-circle-symbol-spec-property-fill">CircleSymbol.fill</ApiReference>、
              <ApiReference kind="property" to="/api/types#api-type-text-spec-property-fill">Text.fill</ApiReference> 与
              <ApiReference kind="property" to="/api/types#api-type-text-spec-property-background-fill">Text.backgroundFill</ApiReference>，并可用
              <ApiReference kind="method" to="#api-method-style-set">styles.set</ApiReference> 完整替换或
              <ApiReference kind="method" to="#api-method-style-patch">styles.patch</ApiReference> 局部调整颜色、尺寸、线宽和圆点半径。
            </p>
          </template>
          <template #preview><PatternFillDemo ref="patternFillDemoRef" /></template>
        </ExampleBlock>
      </section>

      <section id="native-style" class="doc-prose">
        <h2 class="doc-h2">nativeStyle 边界</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="输入形式"
            ><code>{ nativeStyle }</code> 必须是唯一字段，不能和 symbol、strokes、fill 等结构化字段混用。</el-descriptions-item
          >
          <el-descriptions-item label="状态形式"
            >ElementState 只保存当前 Earth 签发的 NativeStyleRef，不把 OpenLayers Style 放入 Core 状态。</el-descriptions-item
          >
          <el-descriptions-item label="更新能力">
            可以用 styles.set() 完整替换；styles.patch()、结构化属性动画与序列化不支持原生样式。patch 会在事务提交前抛出
            <ApiReference kind="type" to="/components/reference/errors#api-error-unsupported-operation">UnsupportedOperationError</ApiReference>，原
            NativeStyleRef 保持不变。
          </el-descriptions-item>
          <el-descriptions-item label="兼容承诺">原生样式是高级逃生口，不承诺跨 OpenLayers 主版本可移植。</el-descriptions-item>
          <el-descriptions-item label="Callout">必须使用结构化 <code>StyleSpec.text</code>；Callout 不接受 <code>nativeStyle</code>。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="api-actions" class="doc-prose">
        <h2 class="doc-h2">样式方法</h2>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
      </section>

      <PublicApiSection
        :type-names="apiTypes"
        :runtime-names="runtimeApi"
        compact
        description="先展示每个类型的用途；精确签名、联合分支和属性按需展开。日常配置优先参考上方字段表与示例。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="样式（Styles）" :items="anchors" /></aside>
  </div>
</template>
