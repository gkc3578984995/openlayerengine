<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import TransformDemo from '../examples/TransformDemo.vue';
import transformSource from '../examples/TransformDemo.vue?raw';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '概述' },
  { id: 'usage', label: '何时使用' },
  {
    id: 'examples',
    label: '代码演示',
    children: [{ id: 'example-transform-workflow', label: '交互变换与历史记录' }]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造器' },
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-type-itransformparams', label: 'ITransformParams' },
          { id: 'api-type-itransformcallback', label: 'ITransformCallback' },
          { id: 'api-type-etransform', label: 'ETransform' },
          { id: 'api-type-etranslatetype', label: 'ETranslateType' }
        ]
      },
      { id: 'api-properties', label: '属性' },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];

const propertyCols = [
  { prop: 'name', label: '属性名', width: 190, presentation: 'property' as const },
  { prop: 'desc', label: '说明', width: 330 },
  { prop: 'type', label: '类型', width: 290, monospace: true },
  { prop: 'default', label: '默认值', width: 120 }
];

const methodCols = [
  { prop: 'name', label: '方法名', width: 210, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 350 },
  { prop: 'params', label: '参数', width: 310, monospace: true },
  { prop: 'returns', label: '返回值', width: 140, monospace: true }
];

const constructorRows = [{ name: 'options', desc: '图形变换配置', type: '<a href="#api-type-itransformparams">ITransformParams</a>', default: '—' }];

const transformParamRows = [
  {
    name: 'earth',
    desc: '地图实例；多地图场景应显式传入，不传时回退到 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 默认实例',
    type: 'Earth?',
    default: '默认实例'
  },
  { name: 'hitTolerance', desc: '点选容差，即鼠标命中范围向外扩展的像素数', type: 'number?', default: '2' },
  {
    name: 'translateType',
    desc: '平移触发方式',
    type: '<a href="#api-type-etranslatetype">ETranslateType</a>?',
    default: 'ETranslateType.Feature'
  },
  { name: 'scale', desc: '是否允许缩放', type: 'boolean?', default: 'true' },
  { name: 'stretch', desc: '是否允许拉伸；scale 为 false 时无效，点要素不适用', type: 'boolean?', default: 'true' },
  { name: 'rotate', desc: '是否允许旋转；圆要素不适用', type: 'boolean?', default: 'true' },
  { name: 'beforeTransform', desc: '返回要素是否允许参与变换', type: '((feature: Feature) =&gt; boolean)?', default: '—' },
  {
    name: 'transformLayers',
    desc: '限制可参与变换的 OpenLayers 矢量图层',
    type: 'VectorLayer&lt;VectorSource&lt;Geometry&gt;&gt;[]?',
    default: '全部图层'
  },
  { name: 'transformFeatures', desc: '限制可参与变换的 OpenLayers 要素', type: 'Feature[]?', default: '全部要素' },
  { name: 'historyLimit', desc: '一次选中周期内保留的历史记录上限', type: 'number?', default: '10' }
];

const transformCallbackRows = [
  { name: 'type', desc: '当前变换事件类型', type: '<a href="#api-type-etransform">ETransform</a>', default: '—' },
  { name: 'eventPixel', desc: '事件发生位置的地图像素坐标', type: 'number[]?', default: '—' },
  { name: 'cursor', desc: '进入或离开控制点时的鼠标样式', type: 'ECursor?', default: '—' },
  { name: 'eventPosition', desc: '事件发生位置的地图坐标', type: 'Coordinate | Coordinate[]?', default: '—' },
  { name: 'featureId', desc: '变换要素 id', type: 'string?', default: '—' },
  { name: 'feature', desc: '变换要素', type: 'Feature&lt;Geometry&gt;?', default: '—' },
  { name: 'featurePosition', desc: '变换要素的当前坐标', type: 'Coordinate | Coordinate[]?', default: '—' },
  { name: 'plotParam', desc: '标绘图形编辑事件载荷', type: 'IPlotEditEventPayload?', default: '—' }
];

const transformEventRows = [
  ['Select', 'select', '选中要素'],
  ['SelectEnd', 'selectend', '退出选中'],
  ['EnterHandle', 'enterHandle', '进入变换控制点'],
  ['LeaveHandle', 'leaveHandle', '离开变换控制点'],
  ['TranslateStart', 'translatestart', '开始平移'],
  ['Translating', 'translating', '平移中'],
  ['TranslateEnd', 'translateend', '结束平移'],
  ['RotateStart', 'rotatestart', '开始旋转'],
  ['Rotating', 'rotating', '旋转中'],
  ['RotateEnd', 'rotateend', '结束旋转'],
  ['ScaleStart', 'scalestart', '开始缩放'],
  ['Scaling', 'scaling', '缩放中'],
  ['ScaleEnd', 'scaleend', '结束缩放'],
  ['Undo', 'undo', '撤销'],
  ['Redo', 'redo', '重做'],
  ['Remove', 'remove', '删除要素'],
  ['Copy', 'copy', '复制要素'],
  ['ModifyStart', 'modifystart', '开始修改标绘图形'],
  ['Modifying', 'modifying', '修改标绘图形中'],
  ['ModifyEnd', 'modifyend', '结束修改标绘图形']
].map(([name, value, desc]) => ({ name, desc, type: `<code>'${value}'</code>`, default: '—' }));

const translateTypeRows = [
  { name: 'None', desc: '禁止平移', type: "<code>'none'</code>", default: '—' },
  { name: 'Center', desc: '仅拖动中心控制点时平移', type: "<code>'center'</code>", default: '—' },
  { name: 'Feature', desc: '拖动要素任意位置时平移', type: "<code>'feature'</code>", default: '默认' }
];

const propertyRows = [{ name: 'checkLayer', desc: '当前选中要素所属的业务图层；未选中时为 null', type: 'Base | null', default: 'null' }];

const methodRows = [
  {
    name: 'replaceEditingFeature',
    desc: '外部重绘后，将当前编辑引用切换到新要素，并选择是否保留历史',
    params: 'newFeature: Feature, options?: { retainHistory?: boolean }',
    returns: 'boolean'
  },
  { name: 'undo', desc: '回到当前选中周期的上一条快照；无历史时返回 null', params: '—', returns: 'null | void' },
  { name: 'redo', desc: '恢复当前选中周期内已撤销的下一条快照；无记录时返回 null', params: '—', returns: 'null | void' },
  {
    name: 'on',
    desc: '注册一个或多个变换事件；返回实例本身，不返回注销函数',
    params: 'eventName: ETransform | ETransform[], callback: (e: ITransformCallback) => void',
    returns: 'this'
  },
  {
    name: 'off',
    desc: '取消指定回调；省略 callback 时清空该事件的全部外部监听',
    params: 'eventName: ETransform, callback?: (e: ITransformCallback) => void',
    returns: 'this'
  },
  { name: 'remove', desc: '从地图移除底层变换交互，但不执行完整资源销毁', params: '—', returns: 'boolean' },
  { name: 'destroy', desc: '完整销毁交互、监听、提示覆盖物、工具栏和历史记录', params: '—', returns: 'void' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>Transform 图形变换</h1>
        <p>为地图要素提供选择、平移、缩放、拉伸、旋转、历史回退和事件同步能力。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          Transform 在 OpenLayers 交互之上统一管理控制点、快捷操作和编辑状态，可通过
          <code><a href="#api-type-itransformparams">ITransformParams</a></code> 限定参与变换的图层或要素，并通过
          <code class="code-fn"><a href="#api-methods">on</a></code> 订阅标准化事件。
        </p>
      </section>

      <section id="usage" class="doc-prose">
        <h2 class="doc-h2">何时使用</h2>
        <ul class="doc-list">
          <li>需要直接拖动业务要素并通过控制点调整尺寸、方向或顶点。</li>
          <li>需要在一次选中编辑周期内提供撤销和重做。</li>
          <li>外部表单、属性面板或重绘流程需要同步当前要素与变换事件。</li>
        </ul>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-transform-workflow">
          <ExampleBlock
            title="交互变换与历史记录"
            :description="`点击图形进入编辑，拖动图形或控制点完成变换；示例通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>on</a></code> 输出事件，并调用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>undo</a></code> / <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>redo</a></code> 管理当前选中周期的历史。`"
            :source="transformSource"
          >
            <template #preview>
              <TransformDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>

        <div id="api-constructor" class="api-constructor">
          <span class="api-constructor__label">构造器</span>
          <code class="api-constructor__signature">new Transform(options)</code>
        </div>
        <ApiTable :columns="propertyCols" :rows="constructorRows" />

        <h3 id="api-types" class="doc-h3">类型定义</h3>

        <h4 id="api-type-itransformparams" class="doc-h4">ITransformParams</h4>
        <p class="doc-prose__hint">构造 Transform 时使用的完整配置。</p>
        <ApiTable :columns="propertyCols" :rows="transformParamRows" />

        <h4 id="api-type-itransformcallback" class="doc-h4">ITransformCallback</h4>
        <p class="doc-prose__hint">变换事件向外分发的统一载荷。</p>
        <ApiTable :columns="propertyCols" :rows="transformCallbackRows" />

        <h4 id="api-type-etransform" class="doc-h4">ETransform</h4>
        <p class="doc-prose__hint">
          可传给 <code class="code-fn"><a href="#api-methods">on</a></code> 和 <code class="code-fn"><a href="#api-methods">off</a></code> 的事件枚举。
        </p>
        <ApiTable :columns="propertyCols" :rows="transformEventRows" />

        <h4 id="api-type-etranslatetype" class="doc-h4">ETranslateType</h4>
        <p class="doc-prose__hint">控制要素是否可平移以及平移的触发区域。</p>
        <ApiTable :columns="propertyCols" :rows="translateTypeRows" />

        <h3 id="api-properties" class="doc-h3">属性</h3>
        <ApiTable :columns="propertyCols" :rows="propertyRows" />

        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>Transform 没有 Earth 便捷访问器，请使用公开构造器并在多地图场景显式传入 <code>earth</code>。</li>
          <li>历史记录只在一次 Select 到 SelectEnd 的选中周期内有效，退出编辑后会清空。</li>
          <li>
            <code class="code-fn"><a href="#api-methods">remove</a></code> 只移除底层交互；组件卸载时应使用
            <code class="code-fn"><a href="#api-methods">off</a></code> 注销回调，再调用
            <code class="code-fn"><a href="#api-methods">destroy</a></code> 完整清理。
          </li>
          <li>
            外部删除并重绘当前要素后，应立即调用 <code class="code-fn"><a href="#api-methods">replaceEditingFeature</a></code> 维持编辑引用。
          </li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="Transform 图形变换" :items="anchors" />
    </aside>
  </div>
</template>
