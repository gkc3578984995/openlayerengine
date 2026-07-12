<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuRemoveDefaultDemo from '../examples/ContextMenuRemoveDefaultDemo.vue';
import defaultSource from '../examples/ContextMenuRemoveDefaultDemo.vue?raw';
import ContextMenuRemoveModuleDemo from '../examples/ContextMenuRemoveModuleDemo.vue';
import moduleSource from '../examples/ContextMenuRemoveModuleDemo.vue?raw';
const anchors = [
  { id: 'overview', label: '概览' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-remove-default-menu', label: '移除全局菜单' },
      { id: 'example-remove-module-menu-state', label: '移除模块菜单与清理要素状态' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      {
        id: 'api-methods',
        label: '方法',
        children: [
          { id: 'api-menu-removal', label: '菜单移除' },
          { id: 'api-lifecycle', label: '关闭与销毁' }
        ]
      }
    ]
  },
  { id: 'tips', label: '注意事项' }
];
const columns = [
  { prop: 'name', label: '方法名', width: 260, presentation: 'method' as const },
  { prop: 'desc', label: '说明', width: 250 },
  { prop: 'params', label: '参数', width: 310, monospace: true },
  { prop: 'returns', label: '返回值', width: 120, monospace: true }
];
const removalRows = [
  { name: 'removeDefaultMenu', desc: '移除全局菜单及其状态', params: '—', returns: 'boolean' },
  { name: 'removeModuleMenu', desc: '移除模块菜单及所有要素状态', params: 'module: string', returns: 'boolean' },
  { name: 'clearModuleMenuState', desc: '仅清理一个模块要素的状态', params: 'module: string, featureId: string', returns: 'boolean' },
  { name: 'remove', desc: '兼容方法：按模块或默认菜单移除', params: 'module?: string', returns: 'boolean' }
];
const lifecycleRows = [
  { name: 'close', desc: '关闭当前显示的菜单', params: '—', returns: 'void' },
  { name: 'destroy', desc: '销毁菜单 DOM、状态和事件监听', params: '—', returns: 'void' }
];
</script>
<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">ContextMenu 右键菜单</span>
        <h1>菜单移除与清理</h1>
        <p>按影响范围移除菜单定义、要素状态和菜单实例资源。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>
          移除菜单会关闭当前对应菜单；永久删除模块要素时可调用 <code class="code-fn"><a href="#api-menu-removal">clearModuleMenuState</a></code> 清理状态。
        </p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-remove-default-menu">
          <ExampleBlock title="移除全局菜单" :description="'菜单可用时右键能够添加标记；移除后不再响应，重新注册即可恢复。'" :source="defaultSource"
            ><template #preview><ContextMenuRemoveDefaultDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-remove-module-menu-state">
          <ExampleBlock
            title="移除模块菜单与清理要素状态"
            :description="'先建立并清理车辆轨迹状态，再移除模块菜单；车辆仍保留在地图中。'"
            :source="moduleSource"
            ><template #preview><ContextMenuRemoveModuleDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <h4 id="api-menu-removal" class="doc-h4">菜单移除</h4>
        <ApiTable :columns="columns" :rows="removalRows" />
        <h4 id="api-lifecycle" class="doc-h4">关闭与销毁</h4>
        <ApiTable :columns="columns" :rows="lifecycleRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>
          组件卸载前调用 <code class="code-fn"><a href="#api-lifecycle">destroy</a></code
          >清理菜单实例，再销毁 Earth。
        </p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="菜单移除与清理" :items="anchors" /></aside>
  </div>
</template>
