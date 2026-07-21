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

const stylesSnippet = `${extractExampleSnippet(stylesSource, 'style-preset')}\n\n${extractExampleSnippet(stylesSource, 'style-patch')}`;
const patternFillSnippet = `${extractExampleSnippet(patternFillSource, 'pattern-fill-set')}\n\n${extractExampleSnippet(patternFillSource, 'pattern-fill-patch')}`;
const patternFillDemoRef = ref<InstanceType<typeof PatternFillDemo> | null>(null);
const resetPatternFillDemo = () => patternFillDemoRef.value?.reset();
const focusPatternFillDemo = () => patternFillDemoRef.value?.focus();

const anchors = [
  { id: 'overview', label: '结构化样式模型' },
  { id: 'style-fields', label: 'StyleSpec 字段' },
  { id: 'presets', label: '内置 stylePresets' },
  { id: 'example-element-styles', label: '预设、set 与 patch' },
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
  { anchor: 'api-style-strokes', name: 'strokes', type: 'StrokeSpec[]', desc: '一层或多层描边，按数组顺序叠加' },
  {
    anchor: 'api-style-fill',
    name: 'fill',
    type: 'SolidFillSpec | PatternFillSpec',
    desc: '面图形的纯色或纹理填充'
  },
  { anchor: 'api-style-text', name: 'text', type: 'TextSpec', desc: '文字内容与外观' },
  { anchor: 'api-style-decorations', name: 'decorations', type: 'ArrowDecorationSpec[]', desc: '普通路径箭头；固定线饰使用 linework' },
  { anchor: 'api-style-linework', name: 'linework', type: 'LineworkSpec', desc: '由 lineStyles 生成的路径线饰' },
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
        <ExampleBlock title="预设、set 与 patch" :source="stylesSource" :snippet="stylesSnippet" source-lang="vue" snippet-lang="typescript">
          <template #description>
            <p>
              示例从 stylePresets 选择独立样式，通过 <ApiReference kind="method" to="#api-method-style-set">styles.set</ApiReference> 完整替换，再用
              <ApiReference kind="method" to="#api-method-style-patch">styles.patch</ApiReference>
              只修改颜色。地图始终聚焦预览对象，上方标签明确区分完整替换与局部合并。
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
          <el-descriptions-item label="更新能力">可以用 styles.set() 完整替换；styles.patch()、结构化属性动画与序列化不支持原生样式。</el-descriptions-item>
          <el-descriptions-item label="兼容承诺">原生样式是高级逃生口，不承诺跨 OpenLayers 主版本可移植。</el-descriptions-item>
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
