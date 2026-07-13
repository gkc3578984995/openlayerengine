<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PointLayerBasicDemo from '../examples/PointLayerBasicDemo.vue';
import PointLayerStyleDemo from '../examples/PointLayerStyleDemo.vue';
import PointLayerFlashDemo from '../examples/PointLayerFlashDemo.vue';
import PointLayerUpdateDemo from '../examples/PointLayerUpdateDemo.vue';
import pointBasicSource from '../examples/PointLayerBasicDemo.vue?raw';
import pointStyleSource from '../examples/PointLayerStyleDemo.vue?raw';
import pointFlashSource from '../examples/PointLayerFlashDemo.vue?raw';
import pointUpdateSource from '../examples/PointLayerUpdateDemo.vue?raw';
import { getBaseMethodRows, getPointLayerInterfaceRows, getPointLayerMethodRows } from '../docs/pointLayerApi';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

interface ApiColumn {
  prop: string;
  label: string;
  width?: string | number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}

const anchors: AnchorItem[] = [
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-basic', label: '基础用法' },
      { id: 'example-style', label: '自定义样式' },
      { id: 'example-flash', label: '闪烁点' },
      { id: 'example-update', label: '更新位置' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造参数' },
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-pointparam', label: 'IPointParam' },
          { id: 'api-setpointparam', label: 'ISetPointParam' },
          { id: 'api-type-irgbcolor', label: 'IRgbColor' },
          { id: 'api-type-ifill', label: 'IFill' },
          { id: 'api-type-istroke', label: 'IStroke' },
          { id: 'api-type-ilabel', label: 'ILabel' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 140, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 160, monospace: true },
  { prop: 'options', label: '可选值', width: 130 },
  { prop: 'default', label: '默认值', width: 110 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 240, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 280 },
  { prop: 'params', label: '参数', width: 220, monospace: true },
  { prop: 'returns', label: '返回值', width: 160, monospace: true }
];

const typeCols: ApiColumn[] = [
  { prop: 'name', label: '属性', width: 160, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 160, monospace: true },
  { prop: 'default', label: '默认值', width: 120 }
];

const constructorRows = [
  {
    name: 'earth',
    desc: '地图实例；不传时回退到 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 默认实例',
    type: 'Earth',
    options: '—',
    default: '—'
  },
  { name: 'options.register', desc: '是否注册到全局管理（多地图场景建议设为 <code>false</code>）', type: 'boolean', options: 'true / false', default: '—' },
  { name: 'options.wrapX', desc: '是否允许要素在 180° 经线换行显示', type: 'boolean', options: 'true / false', default: '—' }
];

const manualMethodRows = [
  {
    name: 'add(param)',
    desc: '新增点要素',
    params: '<a href="#api-pointparam">IPointParam</a>',
    returns: 'Feature&lt;Point&gt;'
  },
  {
    name: 'set(param)',
    desc: '更新点的样式、标签或坐标，仅传入需要变更的字段',
    params: '<a href="#api-setpointparam">ISetPointParam</a>',
    returns: 'Feature&lt;Point&gt;[]'
  },
  {
    name: 'setPosition(id, position)',
    desc: '单独更新点坐标',
    params: 'string, Coordinate',
    returns: 'Feature&lt;Point&gt;[]'
  },
  {
    name: 'continueFlash(id?)',
    desc: '继续闪烁；不传 id 则对所有暂停的点生效',
    params: 'string?',
    returns: 'void'
  },
  {
    name: 'stopFlash(id?)',
    desc: '停止闪烁；不传 id 则停止所有点',
    params: 'string?',
    returns: 'void'
  },
  {
    name: 'remove(id?)',
    desc: '删除指定点；不传 id 时清空整个图层',
    params: 'string?',
    returns: 'void'
  }
];

const pointLayerMethodRows = getPointLayerMethodRows(manualMethodRows);

const inheritedMethodRows = getBaseMethodRows([
  { name: 'getUpdatedParam(feature)', desc: '读取要素的最新状态并返回参数快照', params: '', returns: '' },
  { name: 'get(id?)', desc: '获取全部要素，或按 id 获取指定要素', params: '', returns: '' },
  { name: 'hide(id?)', desc: '隐藏整个图层，或隐藏指定要素', params: '', returns: '' },
  { name: 'show(id?)', desc: '显示整个图层，或恢复指定要素', params: '', returns: '' },
  { name: 'setLayerOpacity(opacity)', desc: '设置图层透明度', params: '', returns: '' },
  { name: 'setLayerIndex(index)', desc: '设置图层层级', params: '', returns: '' },
  { name: 'getLayer()', desc: '获取底层 OpenLayers VectorLayer', params: '', returns: '' },
  { name: 'destroy()', desc: '销毁图层并清理资源', params: '', returns: '' }
]).map((row) => ({ ...row, name: `${row.name} <span class="api-table__tag">继承</span>` }));

const methodRows = [...pointLayerMethodRows, ...inheritedMethodRows];

const manualPointParamRows = [
  { name: 'id', desc: '点唯一标识', type: 'string', options: '—', default: '—' },
  { name: 'center', desc: '点坐标（地图投影坐标系）', type: 'Coordinate', options: '—', default: '—' },
  { name: 'size', desc: '点大小（像素）', type: 'number', options: '—', default: '—' },
  { name: 'fill', desc: '填充样式，详见 <a href="#api-type-ifill">IFill</a>', type: '<a href="#api-type-ifill">IFill</a>', options: '—', default: '—' },
  {
    name: 'stroke',
    desc: '描边样式，详见 <a href="#api-type-istroke">IStroke</a>',
    type: '<a href="#api-type-istroke">IStroke</a>',
    options: '—',
    default: '—'
  },
  { name: 'label', desc: '标签样式，详见 <a href="#api-type-ilabel">ILabel</a>', type: '<a href="#api-type-ilabel">ILabel</a>', options: '—', default: '—' },
  { name: 'isFlash', desc: '是否开启闪烁', type: 'boolean', options: 'true / false', default: 'false' },
  {
    name: 'flashColor',
    desc: '闪烁颜色，详见 <a href="#api-type-irgbcolor">IRgbColor</a>',
    type: '<a href="#api-type-irgbcolor">IRgbColor</a>',
    options: '—',
    default: '{ R:255, G:0, B:0 }'
  },
  { name: 'duration', desc: '闪烁单次持续时间（ms）', type: 'number', options: '—', default: '1000' },
  { name: 'isRepeat', desc: '是否重复闪烁（<code>isFlash</code> 为 <code>true</code> 时生效）', type: 'boolean', options: 'true / false', default: 'true' }
];

const manualSetPointParamRows = [
  { name: 'id', desc: '点唯一标识（必填）', type: 'string', options: '—', default: '—' },
  { name: 'center', desc: '更新点坐标', type: 'Coordinate', options: '—', default: '—' },
  { name: 'size', desc: '更新点大小', type: 'number', options: '—', default: '—' },
  { name: 'fill', desc: '更新填充样式，详见 <a href="#api-type-ifill">IFill</a>', type: '<a href="#api-type-ifill">IFill</a>', options: '—', default: '—' },
  {
    name: 'stroke',
    desc: '更新描边样式，详见 <a href="#api-type-istroke">IStroke</a>',
    type: '<a href="#api-type-istroke">IStroke</a>',
    options: '—',
    default: '—'
  },
  {
    name: 'label',
    desc: '更新标签样式，详见 <a href="#api-type-ilabel">ILabel</a>',
    type: '<a href="#api-type-ilabel">ILabel</a>',
    options: '—',
    default: '—'
  },
  { name: 'isFlash', desc: '更新是否闪烁', type: 'boolean', options: 'true / false', default: 'false' },
  {
    name: 'flashColor',
    desc: '更新闪烁颜色，详见 <a href="#api-type-irgbcolor">IRgbColor</a>',
    type: '<a href="#api-type-irgbcolor">IRgbColor</a>',
    options: '—',
    default: '{ R:255, G:0, B:0 }'
  },
  { name: 'duration', desc: '更新闪烁单次时长（ms）', type: 'number', options: '—', default: '1000' },
  { name: 'isRepeat', desc: '更新是否重复闪烁', type: 'boolean', options: 'true / false', default: 'true' }
];

/* ===== 类型定义 ===== */

const pointParamRows = getPointLayerInterfaceRows('IPointParam', manualPointParamRows);
const setPointParamRows = getPointLayerInterfaceRows('ISetPointParam', manualSetPointParamRows);

const manualRgbColorRows = [
  { name: 'R', desc: '红色通道（0-255）', type: 'number', default: '—' },
  { name: 'G', desc: '绿色通道（0-255）', type: 'number', default: '—' },
  { name: 'B', desc: '蓝色通道（0-255）', type: 'number', default: '—' }
];

const manualFillRows = [{ name: 'color', desc: '填充颜色', type: 'string', default: '—' }];

const manualStrokeRows = [
  { name: 'color', desc: '描边颜色', type: 'string', default: '—' },
  { name: 'width', desc: '描边宽度', type: 'number', default: '—' },
  { name: 'lineDash', desc: '虚线样式，如 <code>[20, 20, 20, 20]</code>', type: 'number[]', default: '—' },
  { name: 'lineDashOffset', desc: '虚线偏移量', type: 'number', default: '—' },
  { name: 'fitPatternOnce', desc: '是否将 lineDash 视为等比模式，单次适配整条线', type: 'boolean', default: '—' }
];

const manualLabelRows = [
  { name: 'text', desc: '文本内容', type: 'string', default: '—' },
  { name: 'font', desc: "CSS 字体，如 <code>'bold 13px sans-serif'</code>", type: 'string', default: '—' },
  { name: 'offsetX', desc: '水平偏移（px），正值向右', type: 'number', default: '—' },
  { name: 'offsetY', desc: '垂直偏移（px），正值向上（与 OL 原生相反）', type: 'number', default: '—' },
  { name: 'scale', desc: '缩放比例', type: 'number', default: '—' },
  { name: 'textAlign', desc: '文本对齐方式', type: "'left' | 'right' | 'center' | 'end'", default: '—' },
  { name: 'textBaseline', desc: '文本基线', type: "'bottom' | 'top' | 'middle' | 'alphabetic' | 'hanging' | 'ideographic'", default: '—' },
  { name: 'fill', desc: '文本填充颜色，详见 <a href="#api-type-ifill">IFill</a>', type: '<a href="#api-type-ifill">IFill</a>', default: '—' },
  { name: 'stroke', desc: '文本描边，详见 <a href="#api-type-istroke">IStroke</a>', type: '<a href="#api-type-istroke">IStroke</a>', default: '—' },
  { name: 'backgroundFill', desc: '文本背景填充，详见 <a href="#api-type-ifill">IFill</a>', type: '<a href="#api-type-ifill">IFill</a>', default: '—' },
  {
    name: 'backgroundStroke',
    desc: '文本背景描边，详见 <a href="#api-type-istroke">IStroke</a>',
    type: '<a href="#api-type-istroke">IStroke</a>',
    default: '—'
  },
  { name: 'padding', desc: '文本内边距', type: 'number[]', default: '—' },
  { name: 'rotation', desc: '顺时针旋转角度（0-360）', type: 'number', default: '—' }
];
const rgbColorRows = getPointLayerInterfaceRows('IRgbColor', manualRgbColorRows);
const fillRows = getPointLayerInterfaceRows('IFill', manualFillRows);
const strokeRows = getPointLayerInterfaceRows('IStroke', manualStrokeRows);
const labelRows = getPointLayerInterfaceRows('ILabel', manualLabelRows);
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>PointLayer 点图层</h1>
        <p>用于快速创建、更新、闪烁和清理点要素，是构建地图标记、监测点和轻量图层交互的基础能力。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>PointLayer 对 OpenLayers 点图层的常见业务动作做了直接封装，支持点要素的添加，以及尺寸、描边、填充、标签和闪烁效果的更新。</p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>地图定位点、监测站点、告警位置或设备点位展示。</li>
          <li>需要快速切换点样式、标签文案或坐标位置的业务页面。</li>
          <li>需要通过闪烁突出异常点、活动点或当前选中点的场景。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>

        <div id="example-basic">
          <ExampleBlock
            title="基础用法"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>add</a></code> 新增一个带填充与描边的点，再用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>remove</a></code> 移除。`"
            :source="pointBasicSource"
          >
            <template #preview>
              <PointLayerBasicDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="example-style">
          <ExampleBlock
            title="自定义样式"
            :description="`通过 <code><a href=&quot;#api-pointparam&quot;>size</a></code>、<code><a href=&quot;#api-type-ifill&quot;>fill</a></code>、<code><a href=&quot;#api-type-istroke&quot;>stroke</a></code>、<code><a href=&quot;#api-type-ilabel&quot;>label</a></code> 自定义点外观，并用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code> 动态切换样式。`"
            :source="pointStyleSource"
          >
            <template #preview>
              <PointLayerStyleDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="example-flash">
          <ExampleBlock
            title="闪烁点"
            :description="`配置 <code><a href=&quot;#api-pointparam&quot;>isFlash</a></code>、<code><a href=&quot;#api-type-irgbcolor&quot;>flashColor</a></code>、<code><a href=&quot;#api-pointparam&quot;>duration</a></code>、<code><a href=&quot;#api-pointparam&quot;>isRepeat</a></code>，配合 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>continueFlash</a></code> / <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>stopFlash</a></code> 控制闪烁。`"
            :source="pointFlashSource"
          >
            <template #preview>
              <PointLayerFlashDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="example-update">
          <ExampleBlock
            title="更新位置"
            :description="`用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setPosition</a></code> 移动点坐标，用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code> 同步更新标签文案。`"
            :source="pointUpdateSource"
          >
            <template #preview>
              <PointLayerUpdateDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>

        <!-- 1. 构造参数 -->
        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">构造参数</h3>
          <p class="api-constructor__signature"><code>new PointLayer(earth?, options?)</code></p>
        </div>
        <ApiTable :columns="attrCols" :rows="constructorRows" />

        <!-- 2. 类型定义 -->
        <h3 id="api-types" class="doc-h3">类型定义</h3>

        <h4 id="api-pointparam" class="doc-h4">IPointParam</h4>
        <p class="doc-prose__hint"><code class="code-fn-inline">add(param)</code> 的参数类型。</p>
        <ApiTable :columns="attrCols" :rows="pointParamRows" />

        <h4 id="api-setpointparam" class="doc-h4">ISetPointParam</h4>
        <p class="doc-prose__hint"><code class="code-fn-inline">set(param)</code> 的参数类型。除 <code>id</code> 外字段均可选。</p>
        <ApiTable :columns="attrCols" :rows="setPointParamRows" />

        <h4 id="api-type-irgbcolor" class="doc-h4">IRgbColor</h4>
        <p class="doc-prose__hint">RGB 颜色对象。</p>
        <ApiTable :columns="typeCols" :rows="rgbColorRows" />

        <h4 id="api-type-ifill" class="doc-h4">IFill</h4>
        <p class="doc-prose__hint">填充样式。</p>
        <ApiTable :columns="typeCols" :rows="fillRows" />

        <h4 id="api-type-istroke" class="doc-h4">IStroke</h4>
        <p class="doc-prose__hint">描边样式。</p>
        <ApiTable :columns="typeCols" :rows="strokeRows" />

        <h4 id="api-type-ilabel" class="doc-h4">ILabel</h4>
        <p class="doc-prose__hint">文本标签样式。注意 <code>offsetY</code> 正向为屏幕上方（与 OL 原生相反）。</p>
        <ApiTable :columns="typeCols" :rows="labelRows" />

        <!-- 3. 方法 -->
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>多地图场景下建议显式传入 <code>Earth</code> 实例，避免共享默认地图上下文。</li>
          <li>示例里统一复用一个点 id，便于演示 <code>set</code>、<code>setPosition</code> 和闪烁控制。</li>
          <li>页面销毁时要同步销毁 <code>Earth</code> 实例，避免切路由后残留地图和监听。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="PointLayer 点图层" :items="anchors" />
    </aside>
  </div>
</template>
