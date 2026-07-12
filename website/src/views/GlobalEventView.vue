<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';

const anchors = [
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-constructor', label: '构造器' },
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-type-moduleeventcallbackparams', label: 'ModuleEventCallbackParams' },
          { id: 'api-type-moduleeventcallback', label: 'ModuleEventCallback' },
          { id: 'api-type-globaleventcallback', label: 'GlobalEventCallback' }
        ]
      },
      { id: 'api-methods', label: '方法分类' },
      { id: 'api-listener-control', label: '高级：底层监听控制' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const propertyCols = [
  { prop: 'name', label: '属性名', width: 190, presentation: 'property' as const },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 260, monospace: true }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 310, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 420 },
  { prop: 'params', label: '参数', width: 100, monospace: true },
  { prop: 'returns', label: '返回值', width: 110, monospace: true }
];
const callbackParamRows = [
  { name: 'position', desc: '经纬度坐标。', type: 'Coordinate' },
  { name: 'feature', desc: '命中的 OpenLayers 要素；未命中时省略。', type: 'Feature&lt;Geometry&gt;?' },
  { name: 'layer', desc: '命中的 OpenLayers 图层；未命中时省略。', type: 'Layer?' },
  { name: 'id', desc: '命中要素的标识；未命中时省略。', type: 'any?' }
];
const listenerMethods = [
  ['enableModuleMouseMoveEvent', '启用模块鼠标移动监听', '—', 'void'],
  ['enableModuleMouseClickEvent', '启用模块点击监听', '—', 'void'],
  ['enableModuleMouseLeftDownEvent', '启用模块左键按下监听', '—', 'void'],
  ['enableModuleMouseLeftUpEvent', '启用模块左键抬起监听', '—', 'void'],
  ['enableModuleMouseDblClickEvent', '启用模块双击监听', '—', 'void'],
  ['enableModuleMouseRightClickEvent', '启用模块右键监听', '—', 'void'],
  ['enableGlobalMouseMoveEvent', '启用全局鼠标移动监听', '—', 'void'],
  ['enableGlobalMouseClickEvent', '启用全局点击监听', '—', 'void'],
  ['enableGlobalMouseLeftDownEvent', '启用全局左键按下监听', '—', 'void'],
  ['enableGlobalMouseLeftUpEvent', '启用全局左键抬起监听', '—', 'void'],
  ['enableGlobalMouseDblClickEvent', '启用全局双击监听', '—', 'void'],
  ['enableGlobalMouseRightClickEvent', '启用全局右键监听', '—', 'void'],
  ['disableModuleMouseMoveEvent', '停用模块鼠标移动监听并清空回调', '—', 'void'],
  ['disableModuleMouseClickEvent', '停用模块点击监听并清空回调', '—', 'void'],
  ['disableModuleMouseLeftDownEvent', '停用模块左键按下监听并清空回调', '—', 'void'],
  ['disableModuleMouseLeftUpEvent', '停用模块左键抬起监听并清空回调', '—', 'void'],
  ['disableModuleMouseDblClickEvent', '停用模块双击监听并清空回调', '—', 'void'],
  ['disableModuleMouseRightClickEvent', '停用模块右键监听并清空回调', '—', 'void'],
  ['disableGlobalMouseMoveEvent', '停用全局鼠标移动监听并清空回调', '—', 'void'],
  ['disableGlobalMouseClickEvent', '停用全局点击监听并清空回调', '—', 'void'],
  ['disableGlobalMouseLeftDownEvent', '停用全局左键按下监听并清空回调', '—', 'void'],
  ['disableGlobalMouseLeftUpEvent', '停用全局左键抬起监听并清空回调', '—', 'void'],
  ['disableGlobalMouseDblClickEvent', '停用全局双击监听并清空回调', '—', 'void'],
  ['disableGlobalMouseRightClickEvent', '停用全局右键监听并清空回调', '—', 'void'],
  ['enableGlobalKeyDownEvent', '启用全局键盘监听', '—', 'void'],
  ['disableGlobalKeyDownEvent', '停用全局键盘监听并清空回调', '—', 'void']
] as const;
const listenerMethodRows = listenerMethods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 全局事件</span>
        <h1>概览与初始化</h1>
        <p>统一管理地图范围和指定模块的鼠标、键盘事件，并通过注销函数安全释放回调。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          <code>new GlobalEvent(earth)</code> 也是公开可用的构造方式；推荐通过
          <a href="/guide/global-methods#api-methods"><code>earth.useGlobalEvent()</code></a> 获取实例，因为 Earth
          会缓存同一个共享实例并集中管理其生命周期。全局回调提供坐标和像素；模块回调只在命中对应 <code>module</code> 的要素时触发。
        </p>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <div id="api-constructor" class="api-constructor">
          <span class="api-constructor__label">构造器</span>
          <code class="api-constructor__signature">new GlobalEvent(earth)</code>
          <p><code>earth: Earth</code> — 地图实例。</p>
        </div>
        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-type-moduleeventcallbackparams" class="doc-h4">ModuleEventCallbackParams</h4>
        <ApiTable :columns="propertyCols" :rows="callbackParamRows" />
        <h4 id="api-type-moduleeventcallback" class="doc-h4">ModuleEventCallback</h4>
        <p>
          <code>(param: <a href="#api-type-moduleeventcallbackparams">ModuleEventCallbackParams</a>) =&gt; void</code>
        </p>
        <h4 id="api-type-globaleventcallback" class="doc-h4">GlobalEventCallback</h4>
        <p><code>(param: { position: Coordinate; pixel: number[] }) =&gt; void</code></p>
        <h3 id="api-methods" class="doc-h3">方法分类</h3>
        <ul class="doc-list">
          <li><a href="/components/global-event/global-mouse#api-methods">全局鼠标事件</a>：注册全局鼠标回调、一次性回调并查询监听状态。</li>
          <li><a href="/components/global-event/module-events#api-methods">模块要素事件</a>：按要素 module 注册、查询和移除鼠标回调。</li>
          <li><a href="/components/global-event/keyboard#api-methods">键盘事件</a>：注册、启停并查询全局键盘事件。</li>
          <li><a href="#api-listener-control">监听控制</a>：显式启用或停用模块与全局鼠标监听。</li>
        </ul>
        <h3 id="api-listener-control" class="doc-h3">高级：底层监听控制</h3>
        <p>常规代码使用 add* 注册回调，并保存其返回的注销函数以取消单次注册。</p>
        <p>disable* 会停用对应的底层监听，并清空该事件类别的全部回调。</p>
        <ApiTable :columns="methodCols" :rows="listenerMethodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>优先执行注册方法返回的注销函数，避免在路由切换后遗留回调。</li>
          <li>模块事件要求要素带有与注册值相同的 <code>module</code>。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="概览与初始化" :items="anchors" /></aside>
  </div>
</template>
