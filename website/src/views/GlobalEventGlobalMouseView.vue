<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventDemo from '../examples/GlobalEventDemo.vue';
import globalEventSource from '../examples/GlobalEventDemo.vue?raw';
import GlobalEventOnceDemo from '../examples/GlobalEventOnceDemo.vue';
import globalEventOnceSource from '../examples/GlobalEventOnceDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-persistent-global-events', label: '持续全局事件' },
      { id: 'example-once-events', label: '一次性事件与取消' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-methods', label: '日常注册与状态' },
      { id: 'api-listener-control', label: '高级：底层监听控制' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 310, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 250 },
  { prop: 'params', label: '参数', width: 300, monospace: true },
  { prop: 'returns', label: '返回值', width: 130, monospace: true }
];
const callback = '<a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>';
const methods = [
  ['addMouseMoveEventByGlobal', '注册全局鼠标移动回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseClickEventByGlobal', '注册全局点击回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseLeftDownEventByGlobal', '注册全局左键按下回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseLeftUpEventByGlobal', '注册全局左键抬起回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseDblClickEventByGlobal', '注册全局双击回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseRightClickEventByGlobal', '注册全局右键回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseOnceClickEventByGlobal', '注册一次性全局点击回调', 'callback: ' + callback, 'void'],
  ['addCancelableMouseOnceClickEventByGlobal', '注册可取消的一次性全局点击回调', 'callback: ' + callback, '() =&gt; void'],
  ['addMouseOnceRightClickEventByGlobal', '注册一次性全局右键回调', 'callback: ' + callback, 'void'],
  ['addCancelableMouseOnceRightClickEventByGlobal', '注册可取消的一次性全局右键回调', 'callback: ' + callback, '() =&gt; void'],
  ['hasGlobalMouseMoveEvent', '检查全局移动监听', '—', 'boolean'],
  ['hasGlobalMouseClickEvent', '检查全局点击监听', '—', 'boolean'],
  ['hasGlobalMouseLeftDownEvent', '检查全局左键按下监听', '—', 'boolean'],
  ['hasGlobalMouseLeftUpEvent', '检查全局左键抬起监听', '—', 'boolean'],
  ['hasGlobalMouseDblClickEvent', '检查全局双击监听', '—', 'boolean'],
  ['hasGlobalMouseRightClickEvent', '检查全局右键监听', '—', 'boolean']
] as const;
const listenerMethods = [
  ['enableGlobalMouseMoveEvent', '启用全局鼠标移动底层监听', '—', 'void'],
  ['enableGlobalMouseClickEvent', '启用全局点击底层监听', '—', 'void'],
  ['enableGlobalMouseLeftDownEvent', '启用全局左键按下底层监听', '—', 'void'],
  ['enableGlobalMouseLeftUpEvent', '启用全局左键抬起底层监听', '—', 'void'],
  ['enableGlobalMouseDblClickEvent', '启用全局双击底层监听', '—', 'void'],
  ['enableGlobalMouseRightClickEvent', '启用全局右键底层监听', '—', 'void'],
  ['disableGlobalMouseMoveEvent', '停用全局鼠标移动监听并清空回调', '—', 'void'],
  ['disableGlobalMouseClickEvent', '停用全局点击监听并清空回调', '—', 'void'],
  ['disableGlobalMouseLeftDownEvent', '停用全局左键按下监听并清空回调', '—', 'void'],
  ['disableGlobalMouseLeftUpEvent', '停用全局左键抬起监听并清空回调', '—', 'void'],
  ['disableGlobalMouseDblClickEvent', '停用全局双击监听并清空回调', '—', 'void'],
  ['disableGlobalMouseRightClickEvent', '停用全局右键监听并清空回调', '—', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
const listenerMethodRows = listenerMethods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 地图事件</span>
        <h1>全局鼠标事件</h1>
        <p>注册地图范围内的鼠标回调、一次性回调，并查询监听状态。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>回调参数使用概览页定义的 <code><a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a></code>。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-persistent-global-events">
          <ExampleBlock
            title="持续全局事件"
            :description="'通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseMoveEventByGlobal</a></code> 和 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseClickEventByGlobal</a></code> 注册持续回调，并在组件卸载前执行返回的注销函数。'"
            :source="globalEventSource"
            ><template #preview><GlobalEventDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-once-events">
          <ExampleBlock
            title="一次性事件与取消"
            :description="'通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addCancelableMouseOnceClickEventByGlobal</a></code> 和 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addCancelableMouseOnceRightClickEventByGlobal</a></code> 注册一次性回调，并可执行各自返回的取消函数。'"
            :source="globalEventOnceSource"
            ><template #preview><GlobalEventOnceDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">日常注册与状态</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <h3 id="api-listener-control" class="doc-h3">高级：底层监听控制</h3>
        <p>通常由 <code>add*</code> 自动启用监听。仅当需要整体重置某一鼠标类别时才直接调用 <code>disable*</code>；它会清空该类别的全部回调。</p>
        <pre><code>events.enableGlobalMouseClickEvent();
// 这会移除该类别全部已注册的回调。
events.disableGlobalMouseClickEvent();</code></pre>
        <ApiTable :columns="methodCols" :rows="listenerMethodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>长期监听应保存并执行返回的注销函数。</li>
          <li>页面可能提前卸载时，优先使用可取消的一次性方法。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="全局鼠标事件" :items="anchors" /></aside>
  </div>
</template>
