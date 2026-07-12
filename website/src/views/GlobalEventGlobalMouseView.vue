<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventDemo from '../examples/GlobalEventDemo.vue';
import globalEventSource from '../examples/GlobalEventDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  { id: 'examples', label: '代码演示', children: [{ id: 'example-global-mouse-events', label: '全局移动与点击' }] },
  { id: 'api-methods', label: '方法' },
  { id: 'tips', label: '注意事项' }
];
const methodCols = [
  { prop: 'name', label: '方法名', width: 310, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 250 },
  { prop: 'params', label: '参数', width: 300, monospace: true },
  { prop: 'returns', label: '返回值', width: 130, monospace: true }
];
const methods = [
  [
    'addMouseMoveEventByGlobal',
    '注册全局鼠标移动回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseClickEventByGlobal',
    '注册全局点击回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseLeftDownEventByGlobal',
    '注册全局左键按下回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseLeftUpEventByGlobal',
    '注册全局左键抬起回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseDblClickEventByGlobal',
    '注册全局双击回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseRightClickEventByGlobal',
    '注册全局右键回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseOnceClickEventByGlobal',
    '注册一次性全局点击回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    'void'
  ],
  [
    'addCancelableMouseOnceClickEventByGlobal',
    '注册可取消的一次性全局点击回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseOnceRightClickEventByGlobal',
    '注册一次性全局右键回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    'void'
  ],
  [
    'addCancelableMouseOnceRightClickEventByGlobal',
    '注册可取消的一次性全局右键回调',
    'callback: <a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  ['hasGlobalMouseMoveEvent', '检查全局移动监听', '—', 'boolean'],
  ['hasGlobalMouseClickEvent', '检查全局点击监听', '—', 'boolean'],
  ['hasGlobalMouseLeftDownEvent', '检查全局左键按下监听', '—', 'boolean'],
  ['hasGlobalMouseLeftUpEvent', '检查全局左键抬起监听', '—', 'boolean'],
  ['hasGlobalMouseDblClickEvent', '检查全局双击监听', '—', 'boolean'],
  ['hasGlobalMouseRightClickEvent', '检查全局右键监听', '—', 'boolean']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 全局事件</span>
        <h1>全局鼠标事件</h1>
        <p>注册地图范围内的鼠标回调、一次性回调，并查询监听状态。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          回调参数使用概览页定义的 <code><a href="/components/global-event#api-type-globaleventcallback">GlobalEventCallback</a></code
          >。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-global-mouse-events">
          <ExampleBlock
            title="全局移动与点击"
            :description="`通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseMoveEventByGlobal</a></code> 和 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseClickEventByGlobal</a></code> 更新可见状态，并用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>hasGlobalMouseClickEvent</a></code> 查询注册状态。`"
            :source="globalEventSource"
            ><template #preview><GlobalEventDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section class="doc-prose">
        <h2 id="api-methods" class="doc-h2">方法</h2>
        <ApiTable :columns="methodCols" :rows="methodRows" />
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
