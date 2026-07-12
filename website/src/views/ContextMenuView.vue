<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuDemo from '../examples/ContextMenuDemo.vue';
import contextMenuSource from '../examples/ContextMenuDemo.vue?raw';

interface ApiColumn {
  prop: string;
  label: string;
  width?: number;
  monospace?: boolean;
  presentation?: 'property' | 'method';
}
const anchors = [
  { id: 'examples', label: '代码演示', children: [{ id: 'example-default-and-module', label: '默认与模块菜单' }] },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-types',
        label: '类型定义',
        children: [
          { id: 'api-type-icontextmenuoption', label: 'IContextMenuOption' },
          { id: 'api-type-icontextmenuitem', label: 'IContextMenuItem' },
          { id: 'api-type-icontextmenucallbackparam', label: 'IContextMenuCallbackParam' },
          { id: 'api-type-contextmenucallback', label: 'ContextMenuCallback' },
          { id: 'api-type-contextmenubefore', label: 'ContextMenuBefore' }
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
  { prop: 'type', label: '类型', width: 280, monospace: true }
];
const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 240, presentation: 'method' },
  { prop: 'desc', label: '说明', width: 290 },
  { prop: 'params', label: '参数', width: 300, monospace: true },
  { prop: 'returns', label: '返回值', width: 130, monospace: true }
];
const optionRows = [{ name: 'isDarkTheme', desc: '是否使用深色主题。', type: 'boolean?' }];
const itemRows = [
  { name: 'key', desc: '同一菜单树内唯一的键。', type: 'string' },
  { name: 'label', desc: '显示文本。', type: 'string' },
  { name: 'visible', desc: '初始可见状态。', type: 'boolean?' },
  { name: 'disabled', desc: '是否禁用叶子菜单项。', type: 'boolean?' },
  { name: 'mutexKey', desc: '与当前项互斥的叶子菜单键。', type: 'string?' },
  { name: 'child', desc: '子菜单。', type: '<a href="#api-type-icontextmenuitem">IContextMenuItem</a>[]?' }
];
const callbackRows = [
  { name: 'menu', desc: '当前被选菜单项。', type: '<a href="#api-type-icontextmenuitem">IContextMenuItem</a>' },
  { name: 'scope', desc: '菜单来源。', type: "'default' | 'module'" },
  { name: 'position', desc: '右键经纬度坐标。', type: 'Coordinate' },
  { name: 'pixel', desc: '右键像素坐标。', type: 'number[]' },
  { name: 'module', desc: '模块名称。', type: 'string?' },
  { name: 'featureId', desc: '命中要素标识。', type: 'string?' },
  { name: 'param', desc: '命中要素参数。', type: 'unknown?' },
  { name: 'feature', desc: '命中的 OpenLayers 要素。', type: 'Feature&lt;Geometry&gt;?' },
  { name: 'layer', desc: '命中的 OpenLayers 图层。', type: 'Layer?' }
];
const methods = [
  [
    'addDefaultMenu',
    '注册或替换默认菜单',
    'items: <a href="#api-type-icontextmenuitem">IContextMenuItem</a>[], callback?: <a href="#api-type-contextmenucallback">ContextMenuCallback</a>',
    'boolean'
  ],
  [
    'addModuleMenu',
    '注册或替换模块菜单',
    'module: string, items: <a href="#api-type-icontextmenuitem">IContextMenuItem</a>[], callback?: <a href="#api-type-contextmenucallback">ContextMenuCallback</a>, before?: <a href="#api-type-contextmenubefore">ContextMenuBefore</a>',
    'boolean'
  ],
  ['removeDefaultMenu', '移除默认菜单及状态', '—', 'boolean'],
  ['removeModuleMenu', '移除模块菜单及状态', 'module: string', 'boolean'],
  ['clearModuleMenuState', '清理一个模块要素的菜单状态', 'module: string, featureId: string', 'boolean'],
  ['getDefaultMenuState', '读取默认菜单项可见状态', 'menuKey: string', 'boolean'],
  ['setDefaultMenuState', '设置默认菜单项可见状态', 'menuKey: string, visible: boolean', 'boolean'],
  ['toggleDefaultMenuState', '切换默认菜单项可见状态', 'menuKey: string', 'boolean'],
  ['getModuleMenuState', '读取模块菜单项可见状态', 'module: string, featureId: string, menuKey: string', 'boolean'],
  ['setModuleMenuState', '设置模块菜单项可见状态', 'module: string, featureId: string, menuKey: string, visible: boolean', 'boolean'],
  ['toggleModuleMenuState', '切换模块菜单项可见状态', 'module: string, featureId: string, menuKey: string', 'boolean'],
  ['setTheme', '设置菜单主题', 'isDarkTheme: boolean', 'void'],
  ['toggleTheme', '切换菜单主题', '—', 'boolean'],
  ['close', '关闭当前打开的菜单', '—', 'void'],
  ['remove', '兼容方法：按模块或默认菜单移除', 'module?: string', 'boolean'],
  ['destroy', '销毁菜单、DOM 和监听', '—', 'void'],
  ['destory', '@deprecated 已废弃：请使用 destroy', '—', 'void']
] as const;
const methodRows = methods.map(([name, desc, params, returns]) => ({ name, desc, params, returns }));
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">地图交互</span>
        <h1>ContextMenu 右键菜单</h1>
        <p>为地图空白处或带模块标识的要素注册层级右键菜单，并管理菜单项状态、主题和清理。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>模块菜单优先于默认菜单。回调接收命中要素和右键位置；<code>before</code> 可让模块菜单项在展示前变为不可用。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-default-and-module">
          <ExampleBlock
            title="默认与模块菜单"
            :description="`登记默认和模块菜单，并用 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>toggleTheme</a></code>、<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>toggleDefaultMenuState</a></code> 控制状态。`"
            :source="contextMenuSource"
            ><template #preview><ContextMenuDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-types" class="doc-h3">类型定义</h3>
        <h4 id="api-type-icontextmenuoption" class="doc-h4">IContextMenuOption</h4>
        <ApiTable :columns="propertyCols" :rows="optionRows" />
        <h4 id="api-type-icontextmenuitem" class="doc-h4">IContextMenuItem</h4>
        <ApiTable :columns="propertyCols" :rows="itemRows" />
        <h4 id="api-type-icontextmenucallbackparam" class="doc-h4">IContextMenuCallbackParam</h4>
        <ApiTable :columns="propertyCols" :rows="callbackRows" />
        <h4 id="api-type-contextmenucallback" class="doc-h4">ContextMenuCallback</h4>
        <p>
          <code>(param: <a href="#api-type-icontextmenucallbackparam">IContextMenuCallbackParam</a>) =&gt; void</code>
        </p>
        <h4 id="api-type-contextmenubefore" class="doc-h4">ContextMenuBefore</h4>
        <p>
          <code>(param: <a href="#api-type-icontextmenucallbackparam">IContextMenuCallbackParam</a>) =&gt; boolean</code>
        </p>
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li>菜单项 <code>key</code> 在同一菜单树内必须唯一；含子项的菜单项不能配置 <code>disabled</code> 或 <code>mutexKey</code>。</li>
          <li>
            组件卸载时调用 <code class="code-fn"><a href="#api-methods">destroy</a></code
            >，再销毁 <code>Earth</code>。
          </li>
          <li>销毁后不要通过缓存的 Earth 访问器立即重建菜单；应改为销毁并重新创建 Earth 生命周期。</li>
        </ul>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="ContextMenu 右键菜单" :items="anchors" /></aside>
  </div>
</template>
