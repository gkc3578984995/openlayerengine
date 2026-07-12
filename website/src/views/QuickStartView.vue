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

const installationCode = `# 安装引擎本地 tgz 包
npm install ./vrsim-earth-engine-ol-1.0.3.tgz

# 安装 OpenLayers 依赖
npm install ol@^7`;

const depsCode = `{
  "dependencies": {
    "@vrsim/earth-engine-ol": "file:./vrsim-earth-engine-ol-1.0.3.tgz",
    "ol": "^7.5.2"
  }
}`;

const importCode = `import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';`;
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
        <p>
          earth-engine-ol 目前以本地 <code>.tgz</code> 包形式分发，安装时需指定本地文件路径。
          同时需要安装 <code>ol</code>（OpenLayers）作为外部依赖。
        </p>
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon>
          <template #title>注意版本号与路径</template>
          <p>请根据实际的 tgz 文件名和路径调整安装命令。ol 版本推荐 <code>^7.5</code>，与引擎内部使用的 OpenLayers 主版本保持一致。</p>
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
        <p>
          在 Vue 组件或 TypeScript 文件中按需引入 <code>Earth</code>、<code>PointLayer</code>
          等需要的模块，同时不要忘记引入引擎的样式文件。
        </p>
        <CodeBlock :code="importCode" lang="typescript" />
      </section>

      <section id="next-step" class="doc-prose">
        <h2 class="doc-h2">下一步</h2>
        <ul class="doc-list">
          <li>查看 <RouterLink to="/components/point-layer" class="doc-link">PointLayer 点图层</RouterLink> 了解添加、更新、闪烁点的完整 API。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="快速上手" :items="anchors" />
    </aside>
  </div>
</template>
