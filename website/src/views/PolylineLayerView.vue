<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PolylineLayerBasicDemo from '../examples/PolylineLayerBasicDemo.vue';
import PolylineLayerArrowFlowDemo from '../examples/PolylineLayerArrowFlowDemo.vue';
import PolylineLayerFlightDemo from '../examples/PolylineLayerFlightDemo.vue';
import PolylineLayerUpdateDemo from '../examples/PolylineLayerUpdateDemo.vue';
import polylineBasicSource from '../examples/PolylineLayerBasicDemo.vue?raw';
import polylineArrowFlowSource from '../examples/PolylineLayerArrowFlowDemo.vue?raw';
import polylineFlightSource from '../examples/PolylineLayerFlightDemo.vue?raw';
import polylineUpdateSource from '../examples/PolylineLayerUpdateDemo.vue?raw';
import { getPolylineLayerInterfaceRows, getPolylineLayerMethodRows } from '../docs/polylineLayerApi';

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
      { id: 'example-arrow-flow', label: '箭头线与流动线' },
      { id: 'example-flight', label: '飞行线' },
      { id: 'example-update', label: '更新与显隐' }
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
          { id: 'api-polylineparam', label: 'IPolylineParam' },
          { id: 'api-setpolylineparam', label: 'ISetPolylineParam' },
          { id: 'api-polylineflyparam', label: 'IPolylineFlyParam' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const attrCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 160, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 330 },
  { prop: 'type', label: '类型', width: 180, monospace: true },
  { prop: 'options', label: '可选值', width: 130 },
  { prop: 'default', label: '默认值', width: 120 }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 190, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 320 },
  { prop: 'params', label: '参数', width: 250, monospace: true },
  { prop: 'returns', label: '返回值', width: 180, monospace: true }
];

const constructorRows = [
  {
    name: 'earth',
    desc: '地图实例；不传时回退到 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 默认实例',
    type: 'Earth',
    options: '—',
    default: '—'
  },
  { name: 'options.register', desc: '是否注册到全局管理（多地图场景建议设为 <code>false</code>）', type: 'boolean', options: 'true / false', default: 'true' },
  { name: 'options.wrapX', desc: '是否允许要素跨 180° 经线换行显示', type: 'boolean', options: 'true / false', default: 'true' }
];

const manualMethodRows = [
  { name: 'add(param)', desc: '添加普通线、箭头线或流动虚线', params: '', returns: '' },
  { name: 'addFlightLine(param)', desc: '添加一条曲线飞行动画', params: '', returns: '' },
  { name: 'setPosition(id, position)', desc: '更新普通线、箭头线或流动线坐标', params: '', returns: '' },
  {
    name: 'remove(id?)',
    desc: '普通线/箭头线按 id 删除；流动线传 id 时只停止动画并留下透明要素，须用无参 remove() 清空后重建',
    params: '',
    returns: ''
  },
  {
    name: 'setFlightPosition(id, position)',
    desc: '更新飞行线坐标，但当前实现会重新注册 postrender 监听；避免对同一实例重复调用',
    params: '',
    returns: ''
  },
  {
    name: 'removeFlightLine(id?)',
    desc: '移除飞行要素与缓存，但当前实现不会解绑飞行线的 postrender 监听',
    params: '',
    returns: ''
  },
  { name: 'set(param)', desc: '更新非飞行线的坐标、样式或行为配置', params: '', returns: '' },
  { name: 'hide(id?)', desc: '普通线/箭头线可按 id 隐藏；流动线按 id 隐藏无法保留动画状态；无参时隐藏图层', params: '', returns: '' },
  { name: 'show(id?)', desc: '恢复普通线/箭头线或显示图层；流动线不能通过 hide(id) / show(id) 保留并恢复动画', params: '', returns: '' }
];

const methodRows = getPolylineLayerMethodRows(manualMethodRows);

const polylineParamRows = getPolylineLayerInterfaceRows('IPolylineParam', [
  { name: 'id', desc: '线唯一标识；省略时自动生成', type: '', options: '—', default: '自动生成' },
  { name: 'positions', desc: '线坐标集合（地图投影坐标系）', type: '', options: '—', default: '—' },
  {
    name: 'width',
    desc: '已弃用：请改用 <code><a href="/components/point-layer#api-type-istroke">stroke.width</a></code>；仅在其未设置时兼容兜底',
    type: '',
    options: '—',
    default: '2'
  },
  { name: 'stroke', desc: '主描边样式，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '—' },
  {
    name: 'backgroundStroke',
    desc: '绘制在主描边下方的背景描边，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>',
    type: '',
    options: '—',
    default: '—'
  },
  { name: 'label', desc: '文本标签，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '—' },
  { name: 'isArrow', desc: '是否绘制方向箭头', type: '', options: 'true / false', default: 'false' },
  { name: 'arrowIsRepeat', desc: '箭头是否在每一线段重复绘制，仅在 isArrow 为 true 时生效', type: '', options: 'true / false', default: 'false' },
  { name: 'isFlowingDash', desc: '是否启用流动虚线动画', type: '', options: 'true / false', default: 'false' },
  { name: 'fullLineColor', desc: '流动线底部实线颜色', type: '', options: 'CSS 颜色', default: 'rgba(30,144,255,1)' },
  { name: 'dottedLineColor', desc: '流动虚线颜色', type: '', options: 'CSS 颜色', default: 'rgba(255,250,250,1)' },
  { name: 'module', desc: '业务模块标识', type: '', options: '—', default: '—' },
  { name: 'data', desc: '随要素保存的业务数据', type: '', options: '—', default: '—' }
]);

const setPolylineParamRows = getPolylineLayerInterfaceRows('ISetPolylineParam', [
  { name: 'id', desc: '待更新线的唯一标识（必填）', type: '', options: '—', default: '—' },
  { name: 'positions', desc: '更新线坐标集合', type: '', options: '—', default: '保留原值' },
  {
    name: 'width',
    desc: '已弃用：请改用 <code><a href="/components/point-layer#api-type-istroke">stroke.width</a></code>；仅在其未设置时兼容兜底',
    type: '',
    options: '—',
    default: '保留原值'
  },
  { name: 'stroke', desc: '更新主描边，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>', type: '', options: '—', default: '保留原值' },
  {
    name: 'backgroundStroke',
    desc: '更新背景描边，详见 <a href="/components/point-layer#api-type-istroke">IStroke</a>',
    type: '',
    options: '—',
    default: '保留原值'
  },
  { name: 'label', desc: '更新文本标签，详见 <a href="/components/point-layer#api-type-ilabel">ILabel</a>', type: '', options: '—', default: '保留原值' },
  { name: 'isArrow', desc: '更新是否绘制箭头', type: '', options: 'true / false', default: '保留原值' },
  { name: 'arrowIsRepeat', desc: '更新箭头是否重复', type: '', options: 'true / false', default: '保留原值' },
  { name: 'isFlowingDash', desc: '更新是否启用流动虚线', type: '', options: 'true / false', default: '保留原值' },
  { name: 'fullLineColor', desc: '更新流动线底部实线颜色', type: '', options: 'CSS 颜色', default: '保留原值' },
  { name: 'dottedLineColor', desc: '更新流动虚线颜色', type: '', options: 'CSS 颜色', default: '保留原值' }
]);

const polylineFlyParamRows = getPolylineLayerInterfaceRows('IPolylineFlyParam', [
  { name: 'id', desc: '飞行线唯一标识；省略时自动生成', type: '', options: '—', default: '自动生成' },
  { name: 'position', desc: '飞行线起点与终点坐标（地图投影坐标系）', type: '', options: '—', default: '—' },
  { name: 'width', desc: '飞行线宽度；此字段仍是飞行线的有效配置', type: '', options: '—', default: '2' },
  { name: 'isRepeat', desc: '是否循环播放飞行动画', type: '', options: 'true / false', default: 'true' },
  { name: 'isShowAnchorPoint', desc: '是否显示起点和终点定位点', type: '', options: 'true / false', default: 'true' },
  { name: 'isShowAnchorLine', desc: '非循环播放结束后是否保留定位线', type: '', options: 'true / false', default: 'false' },
  { name: 'isShowArrow', desc: '是否显示飞行箭头', type: '', options: 'true / false', default: 'true' },
  { name: 'color', desc: '飞行线纯色或径向渐变色配置', type: '', options: 'CSS 颜色 / 渐变对象', default: '内置渐变' },
  { name: 'anchorLineColor', desc: '定位线颜色', type: '', options: 'CSS 颜色', default: '#ffcc33' },
  { name: 'arrowColor', desc: '箭头颜色', type: '', options: 'CSS 颜色', default: '—' },
  { name: 'splitLength', desc: '曲线分段数；值越高越平滑', type: '', options: '—', default: '180' },
  { name: 'oneFrameLimitTime', desc: '每帧最小耗时；值越大播放越慢', type: '', options: '—', default: '0' },
  { name: 'controlRatio', desc: '曲线弯曲程度', type: '', options: '—', default: '1' },
  { name: 'module', desc: '业务模块标识', type: '', options: '—', default: '—' },
  { name: 'data', desc: '随飞行线保存的业务数据', type: '', options: '—', default: '—' }
]);
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">基础图层</span>
        <h1>PolylineLayer 线图层</h1>
        <p>用于绘制、更新和清理普通线、方向箭头、流动虚线与飞行线动画。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>PolylineLayer 封装了常见线要素样式与生命周期操作，并将飞行线作为独立资源管理。</p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>展示道路、轨迹、迁徙路径或设备连接关系。</li>
          <li>通过箭头或流动虚线表达线路方向与实时状态。</li>
          <li>通过飞行线动画强调两地之间的动态连接。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-basic">
          <ExampleBlock
            title="基础用法"
            :description="`使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>add</a></code> 创建带描边与标签的基础线路。`"
            :source="polylineBasicSource"
          >
            <template #preview><PolylineLayerBasicDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-arrow-flow">
          <ExampleBlock
            title="箭头线与流动线"
            :description="`分别配置 <code><a href=&quot;#api-polylineparam&quot;>isArrow</a></code> 与 <code><a href=&quot;#api-polylineparam&quot;>isFlowingDash</a></code>，演示方向箭头和流动虚线。`"
            :source="polylineArrowFlowSource"
          >
            <template #preview><PolylineLayerArrowFlowDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-flight">
          <ExampleBlock
            title="飞行线"
            :description="`限制演示：只用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addFlightLine</a></code> 实际创建一次非循环飞行线；<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setFlightPosition</a></code> 与 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>removeFlightLine</a></code> 使用不存在的 id 执行一次安全空操作，避免当前实现累积无法公开解绑的监听。`"
            :source="polylineFlightSource"
          >
            <template #preview><PolylineLayerFlightDemo /></template>
          </ExampleBlock>
        </div>
        <div id="example-update">
          <ExampleBlock
            title="更新与显隐"
            :description="`组合 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>setPosition</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>set</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>hide</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>show</a></code> 与 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>remove</a></code> 管理线路。`"
            :source="polylineUpdateSource"
          >
            <template #preview><PolylineLayerUpdateDemo /></template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div class="api-constructor">
          <h3 id="api-constructor" class="doc-h3">构造参数</h3>
          <p class="api-constructor__signature"><code>new PolylineLayer(earth?, options?)</code></p>
        </div>
        <ApiTable :columns="attrCols" :rows="constructorRows" />

        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-polylineparam" class="doc-h4">IPolylineParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">add</a></code> 的普通线参数。共享描边与标签定义请参阅 PointLayer。
        </p>
        <ApiTable :columns="attrCols" :rows="polylineParamRows" />

        <h4 id="api-setpolylineparam" class="doc-h4">ISetPolylineParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">set</a></code> 的更新参数；除 <code>id</code> 外字段均可选，且不适用于飞行线。
        </p>
        <ApiTable :columns="attrCols" :rows="setPolylineParamRows" />

        <h4 id="api-polylineflyparam" class="doc-h4">IPolylineFlyParam</h4>
        <p class="doc-prose__hint">
          <code class="code-fn"><a href="#api-methods">addFlightLine</a></code> 的飞行线动画参数。
        </p>
        <ApiTable :columns="attrCols" :rows="polylineFlyParamRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <p class="doc-prose__hint">继承自 Base 的通用方法请参阅 <a href="/components/layer-common#api-methods">图层通用操作</a>。</p>
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>
            <code><a href="#api-polylineparam">IPolylineParam.width</a></code> 与
            <code><a href="#api-setpolylineparam">ISetPolylineParam.width</a></code> 已弃用，请使用
            <code><a href="/components/point-layer#api-type-istroke">stroke.width</a></code
            >；飞行线的 <code><a href="#api-polylineflyparam">width</a></code> 仍然有效。
          </li>
          <li>
            流动线调用 <code class="code-fn"><a href="#api-methods">remove</a></code
            ><code>(id)</code> 时只注销动画 key，仍会在数据源留下透明要素；请保存参数，调用无参
            <code class="code-fn"><a href="#api-methods">remove</a></code> 清空图层后再重建需要保留的线。
          </li>
          <li>流动线不能通过 hide(id) / show(id) 保留并恢复动画；需要显隐整个图层时使用无参调用，需要单线显隐时采用“无参 remove → 按保存参数重建”。</li>
          <li>
            当前 <code class="code-fn"><a href="#api-methods">setFlightPosition</a></code> 会重新注册监听，而
            <code class="code-fn"><a href="#api-methods">removeFlightLine</a></code> 不会解绑飞行线的 postrender
            监听。页面应避免重复创建或更新飞行线；卸载时仍按“移除飞行要素 → 销毁图层 → 销毁 Earth”收尾，但不要将其描述为完整监听清理。
          </li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="PolylineLayer 线图层" :items="anchors" />
    </aside>
  </div>
</template>
