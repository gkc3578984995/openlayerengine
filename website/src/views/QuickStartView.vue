<script setup lang="ts">
import CodeBlock from '../components/docs/CodeBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

const anchors: AnchorItem[] = [
  { id: 'install', label: '安装' },
  { id: 'deps', label: '外部依赖' },
  { id: 'import', label: '引入' },
  { id: 'next-step', label: '下一步' }
];

const installationCode = `npm install @vrsim/earth-engine-ol ol@^7`;

const depsCode = `{
  "dependencies": {
    "@vrsim/earth-engine-ol": "^2.0.0",
    "ol": "^7.5.2"
  }
}`;

const importCode = `import { PointLayer, useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';`;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>安装与引入</h1>
        <p>了解如何安装 earth-engine-ol、掌握地图的创建与销毁模式。</p>
      </header>

      <section id="install" class="doc-prose">
        <h2 class="doc-h2">安装</h2>
        <p>安装引擎时同时显式安装 <code>ol</code>（OpenLayers）peer dependency。</p>
        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon>
          <template #title>ESM 包</template>
          <p>2.0 仅提供 ESM 入口；OpenLayers 本身也是 ESM，请使用支持 ESM 的构建工具或运行时。</p>
        </el-alert>
        <CodeBlock :code="installationCode" lang="bash" />
      </section>

      <section id="deps" class="doc-prose">
        <h2 class="doc-h2">外部依赖</h2>
        <p>
          安装完成后，<code>package.json</code> 中应包含如下依赖条目。注意 <code>ol</code>
          不会被 tgz 包自动安装，必须显式声明。
        </p>
        <CodeBlock :code="depsCode" lang="json" />
      </section>

      <section id="import" class="doc-prose">
        <h2 class="doc-h2">引入</h2>
        <p>常规地图优先引入 <code>useEarth</code>，再按需引入 <code>PointLayer</code> 等能力；样式统一从稳定的 <code>style.css</code> 子路径导入。</p>
        <CodeBlock :code="importCode" lang="typescript" />
      </section>

      <section id="next-step" class="doc-prose">
        <h2 class="doc-h2">下一步</h2>
        <ul class="doc-list">
          <li>查看 <RouterLink to="/guide/earth-create" class="doc-link">地图创建与销毁</RouterLink> 了解默认实例、命名实例与完整 Earth 构造 API。</li>
          <li>从 1.x 升级时，查看 <RouterLink to="/guide/migration-v2" class="doc-link">2.0 迁移指南</RouterLink> 核对 ESM、子路径和样式导入变化。</li>
          <li>查看 <RouterLink to="/components/point-layer" class="doc-link">PointLayer 点图层</RouterLink> 了解添加、更新、闪烁点的完整 API。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="快速上手" :items="anchors" />
    </aside>
  </div>
</template>
