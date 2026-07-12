<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventLifecycleDemo from '../examples/GlobalEventLifecycleDemo.vue';
import globalEventLifecycleSource from '../examples/GlobalEventLifecycleDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'listener-management', label: '重要提示：监听自动管理' },
  {
    id: 'examples',
    label: '代码演示',
    children: [{ id: 'example-minimal-lifecycle', label: '最小完整生命周期' }]
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
          { id: 'api-type-moduleeventcallbackparams', label: 'ModuleEventCallbackParams' },
          { id: 'api-type-moduleeventcallback', label: 'ModuleEventCallback' },
          { id: 'api-type-globaleventcallback', label: 'GlobalEventCallback' }
        ]
      }
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
        <span class="doc-hero__eyebrow">GlobalEvent 地图事件</span>
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

      <section id="listener-management" class="doc-prose">
        <h2 class="doc-h2">重要提示：监听自动管理</h2>
        <p>
          日常使用无需先调用 <code>enable*</code>：add* 会自动启用对应的底层监听，返回的注销函数只清理本次注册。
          disable* 会停止对应底层监听并清空该类别的全部回调，属于高级批量控制；模块事件的定向清理请使用对应的 <code>remove*</code> 方法。
        </p>
        <pre><code>const onClick = () =&gt; {};
const dispose = earth.useGlobalEvent().addMouseClickEventByGlobal(onClick);

dispose();</code></pre>
      </section>

      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-minimal-lifecycle">
          <ExampleBlock
            title="最小完整生命周期"
            :description="'通过 <code class=&quot;code-fn&quot;><a href=&quot;/guide/global-methods#api-methods&quot;>earth.useGlobalEvent</a></code> 获取实例，调用 add* 注册回调、保存返回的注销函数，并在卸载前执行它。'"
            :source="globalEventLifecycleSource"
            ><template #preview><GlobalEventLifecycleDemo /></template
          ></ExampleBlock>
        </div>
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
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>优先执行注册方法返回的注销函数，避免在路由切换后遗留回调。</li>
          <li>模块事件要求要素带有与注册值相同的 <code>module</code>。</li>
          <li>需要手动启停或批量清理时，请进入对应的鼠标或键盘事件页面阅读高级控制说明。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="概览与初始化" :items="anchors" /></aside>
  </div>
</template>
