<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import DescriptorDemo from '../examples/DescriptorDemo.vue';
import descriptorSource from '../examples/DescriptorDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概览' },
  { id: 'usage', label: '使用方式' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-list-descriptor', label: '列表标牌生命周期' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造器' },
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-type-idescriptorparams', label: 'IDescriptorParams' },
          { id: 'api-type-idescriptorsetparams', label: 'IDescriptorSetParams' },
          { id: 'api-type-iproperties', label: 'IProperties' },
          { id: 'api-type-ipropertiesbase', label: 'IPropertiesBase' },
          { id: 'api-type-ikeyvalue', label: 'IKeyValue' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const propertyCols = [
  { prop: 'name', label: '属性名', width: 190, presentation: 'property' as const },
  { prop: 'desc', label: '说明', width: 340 },
  { prop: 'type', label: '类型', width: 250, monospace: true },
  { prop: 'default', label: '默认值', width: 120, monospace: true }
];

const methodCols = [
  { prop: 'name', label: '方法名', width: 150, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 360 },
  { prop: 'params', label: '参数', width: 260, monospace: true },
  { prop: 'returns', label: '返回值', width: 100, monospace: true }
];

const descriptorParamRows = [
  { name: 'type', desc: '标牌内容类型；当前可靠用法是 list', type: "'list' | 'custom'", default: '—' },
  { name: 'isShowFixedline', desc: '拖动时是否显示标牌与定位点之间的连线', type: 'boolean?', default: 'true' },
  { name: 'fixedLineColor', desc: '定位线颜色', type: 'string?', default: "'#aef'" },
  { name: 'fixedModel', desc: '按地图位置或屏幕像素保持标牌位置', type: "'position' | 'pixel'?", default: "'position'" },
  { name: 'drag', desc: '是否允许拖动标牌', type: 'boolean?', default: 'true' },
  { name: 'isShowClose', desc: '是否生成关闭按钮；当前内置图片资源缺失，建议设为 false', type: 'boolean?', default: 'true' },
  { name: 'header', desc: '列表头部文本', type: 'string?', default: '—' },
  { name: 'footer', desc: '列表底部文本', type: 'string?', default: '—' },
  { name: 'close', desc: '声明的关闭回调；当前版本不会触发', type: '((arg: { data?: T }) =&gt; void)?', default: '—' }
];

const descriptorSetParamRows = [
  { name: 'position', desc: '标牌定位点，使用地图投影坐标', type: 'Coordinate', default: '—' },
  {
    name: 'element',
    desc: '标牌内容；list 模式传入属性数组，custom 字符串当前版本不会渲染',
    type: '(<a href="#api-type-iproperties">IProperties</a>&lt;string | number&gt;[] | string)?',
    default: '—'
  },
  { name: 'offset', desc: 'Overlay 像素偏移量', type: 'number[]?', default: '[0, 0]' },
  { name: 'data', desc: '与标牌关联的业务数据', type: 'T?', default: '—' }
];

const propertyRows = [
  { name: 'label', desc: '字段标签，继承自 IKeyValue', type: 'string', default: '—' },
  { name: 'value', desc: '字段值，继承自 IKeyValue', type: 'T', default: '—' },
  { name: 'key', desc: '可选字段标识，继承自 IPropertiesBase', type: 'string?', default: '—' },
  { name: 'parent', desc: '可选父字段标识，继承自 IPropertiesBase', type: 'string?', default: '—' },
  { name: 'type', desc: 'text 项当前不会生成列表行', type: "'text'?", default: '—' },
  { name: 'options', desc: '声明的键值选项；当前列表渲染未使用', type: '<a href="#api-type-ikeyvalue">IKeyValue</a>&lt;T&gt;[]?', default: '—' },
  { name: 'color', desc: '字段值的 CSS 颜色', type: 'string?', default: '—' },
  { name: 'class', desc: '列表项附加的 CSS 类名', type: 'string?', default: '—' }
];

const propertyBaseRows = [
  { name: 'label', desc: '字段标签，继承自 IKeyValue', type: 'string', default: '—' },
  { name: 'value', desc: '字段值，继承自 IKeyValue', type: 'T', default: '—' },
  { name: 'key', desc: '可选字段标识', type: 'string?', default: '—' },
  { name: 'parent', desc: '可选父字段标识', type: 'string?', default: '—' }
];

const keyValueRows = [
  { name: 'label', desc: '字段标签', type: 'string', default: '—' },
  { name: 'value', desc: '字段值', type: 'T', default: '—' }
];

const methods = [
  ['set', '创建或重建标牌内容、位置和关联数据', 'params: <a href="#api-type-idescriptorsetparams">IDescriptorSetParams</a>&lt;T&gt;', 'void'],
  ['show', '显示标牌及其定位线；必须先完成 set', '—', 'void'],
  ['hide', '隐藏标牌及其定位线；必须先完成 set', '—', 'void'],
  ['destroy', '移除 Overlay、定位线和已登记事件', '—', 'void']
] as const;

const methodAnchors = {
  set: '<span id="api-method-set">set</span>',
  show: '<span id="api-method-show">show</span>',
  hide: '<span id="api-method-hide">hide</span>',
  destroy: '<span id="api-method-destroy">destroy</span>'
} as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name: methodAnchors[name], desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>Descriptor 标牌</h1>
        <p>在地图坐标旁展示可拖动的列表标牌，并用定位线连接标牌与业务位置。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>
          <code>Descriptor</code> 是需要显式创建和销毁的地图交互组件。当前可靠用法是 <code>type: 'list'</code>：通过
          <code class="code-fn"><a href="#api-method-set">set</a></code> 写入列表数据，再用 <code class="code-fn"><a href="#api-method-show">show</a></code> 和
          <code class="code-fn"><a href="#api-method-hide">hide</a></code>
          控制可见性。
        </p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">使用方式</h2>
        <ol class="doc-list">
          <li>使用 <code>new Descriptor(earth, options)</code> 创建实例；Earth 当前没有对应的 <code>use*</code> 便捷入口。</li>
          <li>
            必须先调用 <code class="code-fn"><a href="#api-method-set">set</a></code> 初始化 DOM 和 Overlay，之后才能调用
            <code class="code-fn"><a href="#api-method-show">show</a></code> 或 <code class="code-fn"><a href="#api-method-hide">hide</a></code
            >。
          </li>
          <li>
            组件卸载时先调用 <code class="code-fn"><a href="#api-method-destroy">destroy</a></code
            >，再销毁 Earth。
          </li>
        </ol>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-list-descriptor">
          <ExampleBlock
            title="列表标牌生命周期"
            :description="'示例使用 <code><a href=&quot;#api-type-iproperties&quot;>IProperties</a></code> 生成站点列表，并演示 <code class=&quot;code-fn&quot;><a href=&quot;#api-method-set&quot;>set</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-method-show&quot;>show</a></code> 和 <code class=&quot;code-fn&quot;><a href=&quot;#api-method-hide&quot;>hide</a></code>。'"
            :source="descriptorSource"
          >
            <template #preview><DescriptorDemo /></template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div id="api-constructor" class="api-constructor">
          <span class="api-constructor__label">构造器</span>
          <code class="api-constructor__signature">new Descriptor(earth, options)</code>
          <p>
            <code>earth: Earth</code> — 地图实例；<code>options: <a href="#api-type-idescriptorparams">IDescriptorParams</a>&lt;T&gt;</code> — 标牌配置。
          </p>
        </div>

        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-type-idescriptorparams" class="doc-h4">IDescriptorParams&lt;T&gt;</h4>
        <ApiTable :columns="propertyCols" :rows="descriptorParamRows" />

        <h4 id="api-type-idescriptorsetparams" class="doc-h4">IDescriptorSetParams&lt;T&gt;</h4>
        <ApiTable :columns="propertyCols" :rows="descriptorSetParamRows" />

        <h4 id="api-type-iproperties" class="doc-h4">IProperties&lt;T&gt;</h4>
        <p class="doc-prose__hint">
          继承 <code><a href="#api-type-ipropertiesbase">IPropertiesBase</a>&lt;T&gt;</code>，用于描述列表中的单个字段。
        </p>
        <ApiTable :columns="propertyCols" :rows="propertyRows" />

        <h4 id="api-type-ipropertiesbase" class="doc-h4">IPropertiesBase&lt;T&gt;</h4>
        <p class="doc-prose__hint">
          继承 <code><a href="#api-type-ikeyvalue">IKeyValue</a>&lt;T&gt;</code>。
        </p>
        <ApiTable :columns="propertyCols" :rows="propertyBaseRows" />

        <h4 id="api-type-ikeyvalue" class="doc-h4">IKeyValue&lt;T&gt;</h4>
        <ApiTable :columns="propertyCols" :rows="keyValueRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>type: 'custom'</code> 虽已出现在公开类型中，但当前版本不会渲染字符串内容。</li>
          <li><code>close</code> 回调已声明，但点击内置关闭按钮时当前版本不会触发该回调。</li>
          <li>内置关闭按钮引用的关闭图标资源当前缺失；需要稳定展示时请设置 <code>isShowClose: false</code>。</li>
          <li><code>show</code> 和 <code>hide</code> 依赖已经初始化的 DOM，因此不能在首次 <code>set</code> 之前调用。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="Descriptor 标牌" :items="anchors" />
    </aside>
  </div>
</template>
