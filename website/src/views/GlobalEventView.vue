<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import GlobalEventDemo from '../examples/GlobalEventDemo.vue';
import globalEventSource from '../examples/GlobalEventDemo.vue?raw';

interface ApiColumn {
  prop: string;
  label: string;
  width?: number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}
const anchors = [
  { id: 'examples', label: '代码演示', children: [{ id: 'example-global-events', label: '全局与模块回调' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-type-moduleeventcallbackparams', label: 'ModuleEventCallbackParams' },
          { id: 'api-type-moduleeventcallback', label: 'ModuleEventCallback' },
          { id: 'api-type-globaleventcallback', label: 'GlobalEventCallback' }
        ]
      },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const propertyCols: ApiColumn[] = [
  { prop: 'name', label: '属性名', width: 190, presentation: 'property' },
  { prop: 'desc', label: '说明', width: 300 },
  { prop: 'type', label: '类型', width: 260, monospace: true }
];
const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 300, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 260 },
  { prop: 'params', label: '参数', width: 300, monospace: true },
  { prop: 'returns', label: '返回值', width: 150, monospace: true }
];
const callbackParamRows = [
  { name: 'position', desc: '经纬度坐标。', type: 'Coordinate' },
  { name: 'feature', desc: '命中的 OpenLayers 要素；未命中时省略。', type: 'Feature&lt;Geometry&gt;?' },
  { name: 'layer', desc: '命中的 OpenLayers 图层；未命中时省略。', type: 'Layer?' },
  { name: 'id', desc: '命中要素的标识；未命中时省略。', type: 'any?' }
];
const methods = [
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
  ['enableGlobalKeyDownEvent', '启用全局键盘监听', '—', 'void'],
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
  ['disableGlobalKeyDownEvent', '停用全局键盘监听并清空回调', '—', 'void'],
  [
    'addMouseMoveEventByModule',
    '注册模块鼠标移动回调',
    'module: string, callback: <a href="#api-type-moduleeventcallback">ModuleEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseClickEventByModule',
    '注册模块点击回调',
    'module: string, callback: <a href="#api-type-moduleeventcallback">ModuleEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseLeftDownEventByModule',
    '注册模块左键按下回调',
    'module: string, callback: <a href="#api-type-moduleeventcallback">ModuleEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseLeftUpEventByModule',
    '注册模块左键抬起回调',
    'module: string, callback: <a href="#api-type-moduleeventcallback">ModuleEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseDblClickEventByModule',
    '注册模块双击回调',
    'module: string, callback: <a href="#api-type-moduleeventcallback">ModuleEventCallback</a>',
    '() =&gt; void'
  ],
  [
    'addMouseRightClickEventByModule',
    '注册模块右键回调',
    'module: string, callback: <a href="#api-type-moduleeventcallback">ModuleEventCallback</a>',
    '() =&gt; void'
  ],
  ['addMouseMoveEventByGlobal', '注册全局鼠标移动回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', '() =&gt; void'],
  ['addMouseClickEventByGlobal', '注册全局点击回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', '() =&gt; void'],
  ['addMouseLeftDownEventByGlobal', '注册全局左键按下回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', '() =&gt; void'],
  ['addMouseLeftUpEventByGlobal', '注册全局左键抬起回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', '() =&gt; void'],
  ['addMouseDblClickEventByGlobal', '注册全局双击回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', '() =&gt; void'],
  ['addMouseRightClickEventByGlobal', '注册全局右键回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', '() =&gt; void'],
  ['addKeyDownEventByGlobal', '注册全局键盘回调', 'callback: KeyboardEvent =&gt; void', '() =&gt; void'],
  ['addMouseOnceClickEventByGlobal', '注册一次性全局点击回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', 'void'],
  [
    'addCancelableMouseOnceClickEventByGlobal',
    '注册可取消的一次性全局点击回调',
    'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  ['addMouseOnceRightClickEventByGlobal', '注册一次性全局右键回调', 'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>', 'void'],
  [
    'addCancelableMouseOnceRightClickEventByGlobal',
    '注册可取消的一次性全局右键回调',
    'callback: <a href="#api-type-globaleventcallback">GlobalEventCallback</a>',
    '() =&gt; void'
  ],
  ['hasModuleMouseMoveEvent', '检查模块移动回调', 'module: string', 'boolean'],
  ['hasModuleMouseClickEvent', '检查模块点击回调', 'module: string', 'boolean'],
  ['hasModuleMouseLeftDownEvent', '检查模块左键按下回调', 'module: string', 'boolean'],
  ['hasModuleMouseLeftUpEvent', '检查模块左键抬起回调', 'module: string', 'boolean'],
  ['hasModuleMouseDblClickEvent', '检查模块双击回调', 'module: string', 'boolean'],
  ['hasModuleMouseRightClickEvent', '检查模块右键回调', 'module: string', 'boolean'],
  ['hasGlobalMouseMoveEvent', '检查全局移动监听', '—', 'boolean'],
  ['hasGlobalMouseClickEvent', '检查全局点击监听', '—', 'boolean'],
  ['hasGlobalMouseLeftDownEvent', '检查全局左键按下监听', '—', 'boolean'],
  ['hasGlobalMouseLeftUpEvent', '检查全局左键抬起监听', '—', 'boolean'],
  ['hasGlobalMouseDblClickEvent', '检查全局双击监听', '—', 'boolean'],
  ['hasGlobalMouseRightClickEvent', '检查全局右键监听', '—', 'boolean'],
  ['hasGlobalKeyDownEvent', '检查全局键盘监听', '—', 'boolean'],
  ['removeModuleEvent', '移除模块的一类事件', "module: string, type: 'move' | 'click' | 'leftDown' | 'leftUp' | 'dblClick' | 'rightClick'", 'boolean'],
  ['removeAllModuleEvents', '移除模块的全部事件', 'module: string', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>GlobalEvent 全局事件</h1>
        <p>统一注册地图范围和指定模块的鼠标、键盘事件，并通过注销函数安全地释放回调。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>全局回调提供坐标和像素；模块回调只在命中对应 <code>module</code> 的要素时触发，并提供要素与图层信息。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-global-events">
          <ExampleBlock
            title="全局与模块回调"
            :description="`同时注册 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>addMouseClickEventByGlobal</a></code> 和模块回调；组件卸载时执行两个注销函数。`"
            :source="globalEventSource"
            ><template #preview><GlobalEventDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-type-moduleeventcallbackparams" class="doc-h4">ModuleEventCallbackParams</h4>
        <ApiTable :columns="propertyCols" :rows="callbackParamRows" />
        <h4 id="api-type-moduleeventcallback" class="doc-h4">ModuleEventCallback</h4>
        <p>
          <code>(param: <a href="#api-type-moduleeventcallbackparams">ModuleEventCallbackParams</a>) =&gt; void</code>
        </p>
        <h4 id="api-type-globaleventcallback" class="doc-h4">GlobalEventCallback</h4>
        <p><code>(param: { position: Coordinate; pixel: number[] }) =&gt; void</code></p>
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>使用 <code>add*</code> 返回的注销函数；路由切换前应执行它们。</li>
          <li>模块事件要求要素带有与注册值相同的 <code>module</code>。</li>
          <li>一次性事件若页面可能提前卸载，优先使用可取消版本。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="GlobalEvent 全局事件" :items="anchors" /></aside>
  </div>
</template>
