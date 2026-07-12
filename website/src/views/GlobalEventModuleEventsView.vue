<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventModuleDemo from '../examples/GlobalEventModuleDemo.vue';
import globalEventModuleSource from '../examples/GlobalEventModuleDemo.vue?raw';
import GlobalEventModuleCleanupDemo from '../examples/GlobalEventModuleCleanupDemo.vue';
import globalEventModuleCleanupSource from '../examples/GlobalEventModuleCleanupDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '概述' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-module-lifecycle', label: '模块回调生命周期' },
      { id: 'example-module-cleanup-scope', label: '模块事件清理范围' }
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
  { prop: 'name', label: '方法名', width: 300, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 250 },
  { prop: 'params', label: '参数', width: 330, monospace: true },
  { prop: 'returns', label: '返回值', width: 130, monospace: true }
];
const callback = '<a href="/components/global-event#api-type-moduleeventcallback">ModuleEventCallback</a>';
const methods = [
  ['addMouseMoveEventByModule', '注册模块鼠标移动回调', 'module: string, callback: ' + callback, '() =&gt; void'],
  ['addMouseClickEventByModule', '注册模块点击回调', 'module: string, callback: ' + callback, '() =&gt; void'],
  ['addMouseLeftDownEventByModule', '注册模块左键按下回调', 'module: string, callback: ' + callback, '() =&gt; void'],
  ['addMouseLeftUpEventByModule', '注册模块左键抬起回调', 'module: string, callback: ' + callback, '() =&gt; void'],
  ['addMouseDblClickEventByModule', '注册模块双击回调', 'module: string, callback: ' + callback, '() =&gt; void'],
  ['addMouseRightClickEventByModule', '注册模块右键回调', 'module: string, callback: ' + callback, '() =&gt; void'],
  ['hasModuleMouseMoveEvent', '检查模块移动回调', 'module: string', 'boolean'],
  ['hasModuleMouseClickEvent', '检查模块点击回调', 'module: string', 'boolean'],
  ['hasModuleMouseLeftDownEvent', '检查模块左键按下回调', 'module: string', 'boolean'],
  ['hasModuleMouseLeftUpEvent', '检查模块左键抬起回调', 'module: string', 'boolean'],
  ['hasModuleMouseDblClickEvent', '检查模块双击回调', 'module: string', 'boolean'],
  ['hasModuleMouseRightClickEvent', '检查模块右键回调', 'module: string', 'boolean'],
  ['removeModuleEvent', '移除模块的一类事件', "module: string, type: 'move' | 'click' | 'leftDown' | 'leftUp' | 'dblClick' | 'rightClick'", 'boolean'],
  ['removeAllModuleEvents', '移除模块的全部事件', 'module: string', 'void']
] as const;
const listenerMethods = [
  ['enableModuleMouseMoveEvent', '启用模块鼠标移动底层监听', '—', 'void'],
  ['enableModuleMouseClickEvent', '启用模块点击底层监听', '—', 'void'],
  ['enableModuleMouseLeftDownEvent', '启用模块左键按下底层监听', '—', 'void'],
  ['enableModuleMouseLeftUpEvent', '启用模块左键抬起底层监听', '—', 'void'],
  ['enableModuleMouseDblClickEvent', '启用模块双击底层监听', '—', 'void'],
  ['enableModuleMouseRightClickEvent', '启用模块右键底层监听', '—', 'void'],
  ['disableModuleMouseMoveEvent', '停用模块鼠标移动监听并清空回调', '—', 'void'],
  ['disableModuleMouseClickEvent', '停用模块点击监听并清空回调', '—', 'void'],
  ['disableModuleMouseLeftDownEvent', '停用模块左键按下监听并清空回调', '—', 'void'],
  ['disableModuleMouseLeftUpEvent', '停用模块左键抬起监听并清空回调', '—', 'void'],
  ['disableModuleMouseDblClickEvent', '停用模块双击监听并清空回调', '—', 'void'],
  ['disableModuleMouseRightClickEvent', '停用模块右键监听并清空回调', '—', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
const listenerMethodRows = listenerMethods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 地图事件</span>
        <h1>模块鼠标事件</h1>
        <p>按要素的 <code>module</code> 注册鼠标回调，并在模块不再使用时定向清理。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>模块回调参数使用概览页定义的 <code><a href="/components/global-event#api-type-moduleeventcallback">ModuleEventCallback</a></code>。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-module-lifecycle">
          <ExampleBlock
            title="模块回调生命周期"
            :description="'通过 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseClickEventByModule</a></code> 和 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseDblClickEventByModule</a></code> 注册模块回调，并在卸载时执行各自的注销函数。'"
            :source="globalEventModuleSource"
            ><template #preview><GlobalEventModuleDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-module-cleanup-scope">
          <ExampleBlock
            title="模块事件清理范围"
            :description="'使用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>removeModuleEvent</a></code> 移除模块的一种事件类别，或用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>removeAllModuleEvents</a></code> 清理该模块全部事件。'"
            :source="globalEventModuleCleanupSource"
            ><template #preview><GlobalEventModuleCleanupDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">日常注册与状态</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
        <h3 id="api-listener-control" class="doc-h3">高级：底层监听控制</h3>
        <p><code>add*</code> 会自动管理相应监听。若直接调用 <code>disable*</code>，会停止底层监听并清空所有模块在该事件类别中的回调；它不同于只处理指定模块的 <code>remove*</code>。</p>
        <pre><code>events.enableModuleMouseClickEvent();
// 这会清空所有模块的点击回调。
events.disableModuleMouseClickEvent();</code></pre>
        <ApiTable :columns="methodCols" :rows="listenerMethodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>module</code> 必须与命中要素上的标识一致。</li>
          <li>不再使用一个模块时，可使用 <code>removeAllModuleEvents</code> 清理其全部回调。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="模块鼠标事件" :items="anchors" /></aside>
  </div>
</template>
