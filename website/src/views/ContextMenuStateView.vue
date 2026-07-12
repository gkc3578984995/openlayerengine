<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ContextMenuVisibilityDemo from '../examples/ContextMenuVisibilityDemo.vue';
import visibilitySource from '../examples/ContextMenuVisibilityDemo.vue?raw';
import ContextMenuStateToggleDemo from '../examples/ContextMenuStateToggleDemo.vue';
import toggleSource from '../examples/ContextMenuStateToggleDemo.vue?raw';
import ContextMenuThemeDemo from '../examples/ContextMenuThemeDemo.vue';
import themeSource from '../examples/ContextMenuThemeDemo.vue?raw';
const anchors = [
  { id: 'overview', label: '概览' },
  {
    id: 'examples',
    label: '代码演示',
    children: [
      { id: 'example-menu-visibility', label: '菜单项显示与隐藏' },
      { id: 'example-menu-state-toggle', label: '菜单项状态切换' },
      { id: 'example-menu-theme', label: '菜单主题切换' }
    ]
  },
  {
    id: 'api',
    label: 'API',
    children: [
      { id: 'api-default-menu-state', label: '默认菜单状态' },
      { id: 'api-module-menu-state', label: '模块菜单状态' },
      { id: 'api-theme', label: '菜单主题' }
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
const defaultRows = [
  { name: 'getDefaultMenuState', desc: '读取默认菜单项可见状态。', params: 'menuKey: string', returns: 'boolean' },
  { name: 'setDefaultMenuState', desc: '设置默认菜单项可见状态。', params: 'menuKey: string, visible: boolean', returns: 'boolean' },
  { name: 'toggleDefaultMenuState', desc: '切换默认菜单项可见状态。', params: 'menuKey: string', returns: 'boolean' }
];
const moduleRows = [
  { name: 'getModuleMenuState', desc: '读取模块要素的菜单状态。', params: 'module, featureId, menuKey: string', returns: 'boolean' },
  { name: 'setModuleMenuState', desc: '设置模块要素的菜单状态。', params: 'module, featureId, menuKey: string, visible: boolean', returns: 'boolean' },
  { name: 'toggleModuleMenuState', desc: '切换模块要素的菜单状态。', params: 'module, featureId, menuKey: string', returns: 'boolean' }
];
const themeRows = [
  { name: 'setTheme', desc: '显式设置深色或浅色主题。', params: 'isDarkTheme: boolean', returns: 'void' },
  { name: 'toggleTheme', desc: '切换主题并返回切换后的深色状态。', params: '—', returns: 'boolean' }
];
</script>
<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">ContextMenu 右键菜单</span>
        <h1>菜单状态</h1>
        <p>控制菜单项可见性，并在不重新注册菜单的情况下切换菜单主题。</p>
      </header>
      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概览</h2>
        <p>默认菜单以 menuKey 保存状态；模块菜单按 module、featureId 和 menuKey 保存，因此不同要素互不影响。</p>
      </section>
      <section id="examples" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>
        <div id="example-menu-visibility">
          <ExampleBlock title="菜单项显示与隐藏" :description="'通过 setDefaultMenuState 隐藏指定默认菜单项。'" :source="visibilitySource"
            ><template #preview><ContextMenuVisibilityDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-menu-state-toggle">
          <ExampleBlock title="菜单项状态切换" :description="'通过 toggleModuleMenuState 切换某个模块要素的菜单项。'" :source="toggleSource"
            ><template #preview><ContextMenuStateToggleDemo /></template
          ></ExampleBlock>
        </div>
        <div id="example-menu-theme">
          <ExampleBlock title="菜单主题切换" :description="'初始化时可使用 isDarkTheme；运行时使用 setTheme 或 toggleTheme。'" :source="themeSource"
            ><template #preview><ContextMenuThemeDemo /></template
          ></ExampleBlock>
        </div>
      </section>
      <section id="api" class="doc-prose">
        <h2 class="doc-h2">API</h2>
        <h3 id="api-default-menu-state" class="doc-h3">默认菜单状态</h3>
        <ApiTable :columns="columns" :rows="defaultRows" />
        <h3 id="api-module-menu-state" class="doc-h3">模块菜单状态</h3>
        <ApiTable :columns="columns" :rows="moduleRows" />
        <h3 id="api-theme" class="doc-h3">菜单主题</h3>
        <ApiTable :columns="columns" :rows="themeRows" />
      </section>
      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <p>状态方法不存在目标菜单项时返回 false；主题是整个 ContextMenu 实例的状态。</p>
      </section>
    </article>
    <aside class="doc-page-layout__aside"><PageAnchor title="菜单状态" :items="anchors" /></aside>
  </div>
</template>
