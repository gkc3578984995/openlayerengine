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
  { id: 'api-methods', label: '方法' },
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
  ['addMouseMoveEventByModule', '注册模块鼠标移动回调', `module: string, callback: ${callback}`, '() =&gt; void'],
  ['addMouseClickEventByModule', '注册模块点击回调', `module: string, callback: ${callback}`, '() =&gt; void'],
  ['addMouseLeftDownEventByModule', '注册模块左键按下回调', `module: string, callback: ${callback}`, '() =&gt; void'],
  ['addMouseLeftUpEventByModule', '注册模块左键抬起回调', `module: string, callback: ${callback}`, '() =&gt; void'],
  ['addMouseDblClickEventByModule', '注册模块双击回调', `module: string, callback: ${callback}`, '() =&gt; void'],
  ['addMouseRightClickEventByModule', '注册模块右键回调', `module: string, callback: ${callback}`, '() =&gt; void'],
  ['hasModuleMouseMoveEvent', '检查模块移动回调', 'module: string', 'boolean'],
  ['hasModuleMouseClickEvent', '检查模块点击回调', 'module: string', 'boolean'],
  ['hasModuleMouseLeftDownEvent', '检查模块左键按下回调', 'module: string', 'boolean'],
  ['hasModuleMouseLeftUpEvent', '检查模块左键抬起回调', 'module: string', 'boolean'],
  ['hasModuleMouseDblClickEvent', '检查模块双击回调', 'module: string', 'boolean'],
  ['hasModuleMouseRightClickEvent', '检查模块右键回调', 'module: string', 'boolean'],
  ['removeModuleEvent', '移除模块的一类事件', "module: string, type: 'move' | 'click' | 'leftDown' | 'leftUp' | 'dblClick' | 'rightClick'", 'boolean'],
  ['removeAllModuleEvents', '移除模块的全部事件', 'module: string', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">GlobalEvent 全局事件</span>
        <h1>模块要素事件</h1>
        <p>按要素的 module 标识注册、查询和移除鼠标回调。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          模块回调使用概览页定义的 <code><a href="/components/global-event#api-type-moduleeventcallback">ModuleEventCallback</a></code
          >，其参数结构见 <code><a href="/components/global-event#api-type-moduleeventcallbackparams">ModuleEventCallbackParams</a></code
          >。
        </p>
        <p>
          匹配时读取命中要素的 <code>module</code> 属性。<code class="code-fn"><a href="#api-methods">add*EventByModule</a></code
          >（例如 <code class="code-fn"><a href="#api-methods">addMouseClickEventByModule</a></code
          >）返回的注销函数只移除本次注册的回调，不影响其他事件类别；<code class="code-fn"><a href="#api-methods">removeModuleEvent</a></code>
          只移除该模块指定名称的一类事件；<code class="code-fn"><a href="#api-methods">removeAllModuleEvents</a></code>
          移除该模块已注册的全部事件类别。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-module-lifecycle">
          <ExampleBlock
            title="模块回调生命周期"
            :description="`为可见模块点注册 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseClickEventByModule</a></code> 与 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseDblClickEventByModule</a></code>，并独立执行每次注册返回的注销函数。`"
            :source="globalEventModuleSource"
            ><template #preview><GlobalEventModuleDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-module-cleanup-scope">
          <ExampleBlock
            title="模块事件清理范围"
            :description="`比较单次注册返回的注销函数、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>removeModuleEvent</a></code> 的单一类别清理，以及 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>removeAllModuleEvents</a></code> 的模块级批量清理。`"
            :source="globalEventModuleCleanupSource"
            ><template #preview><GlobalEventModuleCleanupDemo /></template
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
          <li><code>module</code> 必须与命中要素上的标识一致。</li>
          <li>不再使用模块时，可调用批量移除方法清理其全部回调。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="模块要素事件" :items="anchors" /></aside>
  </div>
</template>
