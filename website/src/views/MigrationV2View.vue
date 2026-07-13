<script setup lang="ts">
import CodeBlock from '../components/docs/CodeBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';

interface AnchorItem {
  id: string;
  label: string;
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '迁移概览' },
  { id: 'signature', label: '调用签名' },
  { id: 'earth-instances', label: 'Earth 实例' },
  { id: 'styles', label: '样式入口' },
  { id: 'subpaths', label: '导出子路径' },
  { id: 'esm', label: '仅 ESM' },
  { id: 'dependencies', label: '依赖清理' },
  { id: 'destroy', label: '销毁与重建' }
];

const signatureCode = `// 1.x：useEarth(viewOptions?, options?)
useEarth({ center, zoom }, { target: 'map', zoom: true });

// 2.0：useEarth({ view, target, controls })
useEarth({
  view: { center, zoom },
  target: 'map',
  controls: { zoom: true }
});`;

const instanceCode = `import { destroyEarth, useEarth } from '@vrsim/earth-engine-ol';

const defaultEarth = useEarth({ target: 'map' });
console.assert(useEarth() === defaultEarth);

const overview = useEarth({ id: 'overview', target: 'overview' });
console.assert(useEarth('overview') === overview);`;

const destroyCode = `destroyEarth('overview'); // 销毁命名实例
destroyEarth(); // 销毁默认实例

// 也可以直接调用 earth.destroy()
// 相同 key 已注销，因此会创建新实例
const nextOverview = useEarth({ id: 'overview', target: 'overview' });`;

const styleCode = `// 1.x：不再使用 dist/index*.css
// 2.0：从公开样式子路径导入
import '@vrsim/earth-engine-ol/style.css';`;

const subpathCode = `import { Earth, useEarth } from '@vrsim/earth-engine-ol';
import { Earth as CoreEarth } from '@vrsim/earth-engine-ol/core';
import { PointLayer } from '@vrsim/earth-engine-ol/layers';
import { DynamicDraw } from '@vrsim/earth-engine-ol/draw';
import { Measure } from '@vrsim/earth-engine-ol/measure';
import { TransformInteraction } from '@vrsim/earth-engine-ol/transform';
import { PlotDraw } from '@vrsim/earth-engine-ol/plot';`;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>2.0 迁移指南</h1>
        <p>从 1.x 迁移时，重点核对实例注册、公开导出路径、样式入口和 ESM 运行环境。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">迁移概览</h2>
        <ul class="doc-list">
          <li>
            常规单地图继续使用 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth()</a></code> 获取或创建默认实例。
          </li>
          <li>
            多地图使用 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(id)</a></code> 或带 id 的
            <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(options)</a></code> 创建和复用命名实例。
          </li>
          <li>样式改从公开的 <code>/style.css</code> 子路径导入，所有 <code>./dist/*</code> 深路径导入均已移除。</li>
          <li>JavaScript 入口改为仅 ESM；包导出会把公开入口映射到显式的 <code>.mjs</code> 文件。</li>
        </ul>
      </section>

      <section id="signature" class="doc-prose">
        <h2 class="doc-h2">调用签名</h2>
        <p>
          1.x 的 <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(viewOptions?, options?)</a></code> 已移除；2.0 必须改为单个
          <code><a href="/guide/earth-create#api-type-use-earth-options">UseEarthOptions</a></code> 对象，即
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth({ view, target, controls })</a></code
          >。
        </p>
        <p>2.0 运行时只读取第一个参数，旧两参调用的第二个参数会被忽略，放在第一参顶层的 center、zoom 等视图字段也不会生效。</p>
        <CodeBlock :code="signatureCode" lang="typescript" />
      </section>

      <section id="earth-instances" class="doc-prose">
        <h2 class="doc-h2">Earth 实例</h2>
        <p>
          <code><a href="/guide/earth-create#api-constructor">Earth</a></code> 实例由
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth()</a></code>
          获取或创建：默认实例仍然活动时返回同一个对象。<code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(id)</a></code>
          使用字符串作为注册键和首次创建时的默认挂载目标；
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(options)</a></code> 可通过 id、target、view 与 controls
          完整配置实例，其中带 id 的配置创建或复用命名实例。
        </p>
        <p>
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(options)</a></code> 的 target、view 和 controls
          在复用已有实例时不会更新配置。target、view 和 controls 仅在首次创建时生效；如需应用新配置，请先销毁同一注册键的活动实例。
        </p>
        <CodeBlock :code="instanceCode" lang="typescript" />
        <p>图层和工具内部采用显式 Earth 传递来隔离多地图上下文；这不会给常规单地图用法增加样板代码。省略构造参数时，支持该行为的图层仍会回退到默认实例。</p>
      </section>

      <section id="styles" class="doc-prose">
        <h2 class="doc-h2">样式入口</h2>
        <p>1.x 的 <code>dist/index*.css</code> 深路径不再是公共接口。2.0 使用稳定的包导出 <code>@vrsim/earth-engine-ol/style.css</code>：</p>
        <CodeBlock :code="styleCode" lang="typescript" />
      </section>

      <section id="subpaths" class="doc-prose">
        <h2 class="doc-h2">导出子路径</h2>
        <p>
          2.0 支持包根入口以及 <code>/core</code>、<code>/layers</code>、<code>/draw</code>、<code>/measure</code>、<code>/transform</code>、<code>/plot</code>
          功能子路径。
        </p>
        <CodeBlock :code="subpathCode" lang="typescript" />
        <p>只从这些公开导出和 <code>/style.css</code> 导入；不要依赖包内 <code>./dist/*</code> 文件布局。</p>
      </section>

      <section id="esm" class="doc-prose">
        <h2 class="doc-h2">仅 ESM</h2>
        <p>
          2.0 仅发布 ESM，因为 OpenLayers 本身就是 ESM。公开 exports 的 JavaScript 条件使用显式 <code>.mjs</code> 文件，不再提供 require/CJS 入口。 为兼容
          <code>ol-wind</code> 1.1.2，构建仅将 <code>ol-wind</code> 及其 <code>wind-core</code> 依赖作为窄兼容例外打包；这不会改变包的 ESM-only 契约。
        </p>
      </section>

      <section id="dependencies" class="doc-prose">
        <h2 class="doc-h2">依赖清理</h2>
        <p>
          2.0 移除了本库未使用的直接依赖 <code>heatmap.js</code>、<code>mitt</code> 和
          <code>@types/heatmap.js</code>。业务直接使用这些包时需自行显式安装，不要依赖传递安装；其中 <code>@types/heatmap.js</code> 应按业务 TypeScript
          配置作为开发依赖安装。
        </p>
        <p>
          <code>WindLayer.add()</code>、<code>set()</code> 和 <code>get()</code> 的运行时对象与调用方式不变，但公开返回声明改为本包导出的
          <code>WindLayerInstance</code>，以隔离旧版 <code>ol-wind</code> 与 OpenLayers 7 的类型冲突。如果业务显式标注了第三方
          <code>ol-wind.WindLayer</code> 返回类型，请改用 <code>WindLayerInstance</code>。
        </p>
      </section>

      <section id="destroy" class="doc-prose">
        <h2 class="doc-h2">销毁与重建</h2>
        <p>
          <code class="code-fn"><a href="/guide/earth-create#api-methods">earth.destroy</a></code>
          除清理地图资源外，还会注销对应的默认或命名实例。销毁完成后，再次调用相同形式的
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth()</a></code
          >、<code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(id)</a></code> 或
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(options)</a></code> 会创建新的实例。
        </p>
        <p>
          也可以使用公开的 <code class="code-fn"><a href="/guide/earth-create#api-destroy-earth">destroyEarth()</a></code> 销毁默认实例，或使用
          <code class="code-fn"><a href="/guide/earth-create#api-destroy-earth">destroyEarth(id)</a></code>
          销毁命名实例；不存在对应实例时不会抛错。两种辅助调用与
          <code class="code-fn"><a href="/guide/earth-create#api-methods">earth.destroy</a></code> 一样会注销注册键，之后以相同 key 调用
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 会创建新实例。
        </p>
        <CodeBlock :code="destroyCode" lang="typescript" />
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="2.0 迁移指南" :items="anchors" />
    </aside>
  </div>
</template>
