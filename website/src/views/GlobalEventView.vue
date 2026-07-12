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
      { id: 'api-methods', label: '方法分类' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const propertyCols = [
  { prop: 'name', label: '属性名', width: 190, presentation: 'property' as const },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 260, monospace: true }
];
const callbackParamRows = [
  { name: 'position', desc: '经纬度坐标。', type: 'Coordinate' },
  { name: 'feature', desc: '命中的 OpenLayers 要素；未命中时省略。', type: 'Feature&lt;Geometry&gt;?' },
  { name: 'layer', desc: '命中的 OpenLayers 图层；未命中时省略。', type: 'Layer?' },
  { name: 'id', desc: '命中要素的标识；未命中时省略。', type: 'any?' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 全局事件</span>
        <h1>GlobalEvent 概览与初始化</h1>
        <p>统一管理地图范围和指定模块的鼠标、键盘事件，并通过注销函数安全释放回调。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          推荐通过 <a href="/guide/global-methods#api-methods"><code>earth.useGlobalEvent()</code></a> 获取由 Earth
          管理的实例。全局回调提供坐标和像素；模块回调只在命中对应 <code>module</code> 的要素时触发。
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
          <li><a href="/components/global-event/listener-control#api-methods">监听控制</a>：显式启用或停用模块与全局鼠标监听。</li>
        </ul>
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>优先执行注册方法返回的注销函数，避免在路由切换后遗留回调。</li>
          <li>模块事件要求要素带有与注册值相同的 <code>module</code>。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="GlobalEvent 概览与初始化" :items="anchors" /></aside>
  </div>
</template>
