<script setup lang="ts">
import CodeBlock from '../components/docs/CodeBlock.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import ElementCoordinateStorageDemo from '../examples/ElementCoordinateStorageDemo.vue';
import elementCoordinateStorageSource from '../examples/ElementCoordinateStorageDemo.vue?raw';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '迁移概览' },
  { id: 'signature', label: '调用签名' },
  { id: 'earth-instances', label: 'Earth 实例' },
  { id: 'styles', label: '样式入口' },
  {
    id: 'element-coordinates',
    label: '元素坐标',
    children: [
      { id: 'example-flat-coordinate-storage', label: '经纬度坐标读写' },
      { id: 'circle-radius', label: '圆半径固定使用米' },
      { id: 'api-to-flat-coordinates', label: 'toFlatCoordinates' }
    ]
  },
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

const instanceCode = `import { useEarth } from '@vrsim/earth-engine-ol';

const defaultEarth = useEarth({ target: 'map' });
console.assert(useEarth() === defaultEarth);

const overview = useEarth({ id: 'overview', target: 'overview' });
console.assert(useEarth('overview') === overview);`;

const destroyCode = `overview.destroy(); // 销毁并注销命名实例
defaultEarth.destroy(); // 销毁并注销默认实例

// 相同 key 已注销，因此会创建新实例
const nextOverview = useEarth({ id: 'overview', target: 'overview' });`;

const styleCode = `// 1.x：不再使用 dist/index*.css
// 2.0：从公开样式子路径导入
import '@vrsim/earth-engine-ol/style.css';`;

const subpathCode = `import { Earth, useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

// 2.0 已删除 /core、/layers、/draw、/measure、/transform 和 /plot 功能子路径。`;
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
          <li>外部经纬度通过 <code>earth.view</code> 显式双向转换；几何圆的 <code>radius</code> 固定使用米。</li>
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
        <p>引擎内部通过实例级上下文显式传递依赖，不会从深层模块读取默认 Earth；多个地图的元素、图层、交互和投影换算彼此隔离。</p>
      </section>

      <section id="styles" class="doc-prose">
        <h2 class="doc-h2">样式入口</h2>
        <p>1.x 的 <code>dist/index*.css</code> 深路径不再是公共接口。2.0 使用稳定的包导出 <code>@vrsim/earth-engine-ol/style.css</code>：</p>
        <CodeBlock :code="styleCode" lang="typescript" />
      </section>

      <section id="element-coordinates" class="doc-prose">
        <h2 class="doc-h2">元素坐标</h2>
        <p>
          <code>earth.elements.add()</code>、<code>earth.elements.update()</code>、<code>Element.update()</code> 和复制接口都接受扁平的二维
          <code>controlPoints</code>。例如 <code>[120, 0, 110, 0]</code> 会按 <code>XY</code> 两两分组；通过 <code>Element.state</code> 读取时仍返回
          <code>[[120, 0], [110, 0]]</code> 这样的规范坐标。
        </p>
        <p>
          这项能力只转换数组结构，不会转换坐标投影。经纬度写入元素前，使用
          <code class="code-fn"><a href="/guide/global-methods#api-view-methods">earth.view.toProjectedCoordinates()</a></code> 转成当前 Earth 的 View
          投影坐标；从 <code>Element.state</code> 读取后，使用
          <code class="code-fn"><a href="/guide/global-methods#api-view-methods">earth.view.toGeographicCoordinates()</a></code> 转回 EPSG:4326 经纬度。
        </p>
        <p>
          两个转换方法都支持 <code>[120, 0, 110, 0]</code> 这样的扁平二维数组，也支持
          <code>[[120, 0], [110, 0, 500]]</code> 这样的一层嵌套坐标。转换会保留输入结构和 Z 值，并返回新数组。空数组、奇数长度的扁平数组或非有限数值会抛出
          <code>InvalidArgumentError</code>。
        </p>

        <div id="example-flat-coordinate-storage">
          <ExampleBlock
            title="经纬度坐标读写"
            description="用 <code class='code-fn'><a href='/guide/global-methods#api-view-methods'>toProjectedCoordinates()</a></code> 转换经纬度并创建元素，从 state 读取后用 <code class='code-fn'><a href='/guide/global-methods#api-view-methods'>toGeographicCoordinates()</a></code> 转回经纬度，最后用 <code class='code-fn'><a href='#api-to-flat-coordinates'>toFlatCoordinates()</a></code> 展平保存。"
            :source="elementCoordinateStorageSource"
          >
            <template #preview>
              <ElementCoordinateStorageDemo />
            </template>
          </ExampleBlock>
        </div>

        <h3 id="circle-radius" class="doc-h3">圆半径固定使用米</h3>
        <p>
          2.0 的几何圆在创建、更新、复制、Draw、Edit 和 Transform 中都使用米制 <code>geometry.radius</code>。圆心仍要传入 View 投影坐标，例如
          <code>center: earth.view.toProjectedCoordinates([120, 0])</code>；<code>radius: 1000</code> 表示 1000 米。
        </p>
        <p>
          <code>Element.state.geometry.radius</code> 是业务米制半径，<code>element.olFeature</code> 中原生 OL Circle 的半径是 View 投影单位，两者不能混用。<code
            >style.symbol.radius</code
          >
          仍然表示 CSS 像素。
        </p>

        <h3 id="api-to-flat-coordinates" class="doc-h3">toFlatCoordinates</h3>
        <p><code>toFlatCoordinates(coordinates: readonly (readonly number[])[]): number[]</code></p>
        <p>
          按原顺序把二维数字数组展开成新的一维数组。原数组不会被修改，坐标值和投影也不会被转换；保存经纬度时，应先调用
          <code class="code-fn"><a href="/guide/global-methods#api-view-methods">toGeographicCoordinates()</a></code
          >。
        </p>
      </section>

      <section id="subpaths" class="doc-prose">
        <h2 class="doc-h2">导出子路径</h2>
        <p>
          2.0 只保留包根入口和 <code>/style.css</code> 样式入口。旧
          <code>/core</code>、<code>/layers</code>、<code>/draw</code>、<code>/measure</code>、<code>/transform</code>、<code>/plot</code> 功能子路径均已删除。
        </p>
        <CodeBlock :code="subpathCode" lang="typescript" />
        <p>JavaScript 和类型只从包根导入；不要依赖包内 <code>./dist/*</code> 文件布局。</p>
      </section>

      <section id="esm" class="doc-prose">
        <h2 class="doc-h2">仅 ESM</h2>
        <p>
          2.0 仅发布 ESM，因为 OpenLayers 本身就是 ESM。公开 exports 的 JavaScript 条件使用显式 <code>.mjs</code> 文件，不再提供 require/CJS 入口。OpenLayers
          作为运行时必需、安装时可选的 peer 由业务项目单独准备，不会打入 engine 包。
        </p>
      </section>

      <section id="dependencies" class="doc-prose">
        <h2 class="doc-h2">依赖清理</h2>
        <p>
          2.0 移除了 <code>heatmap.js</code>、<code>lodash</code>、<code>mitt</code>、<code>ol-wind</code>、<code>wind-core</code>、<code
            >@types/heatmap.js</code
          >
          和 <code>@types/lodash</code>。业务直接使用这些包时需自行显式安装，不要依赖传递安装。
        </p>
        <p>
          <code>WindLayer</code>、<code>WindLayerInstance</code>、<code>ol-wind</code> 和 <code>wind-core</code> 已全部删除，没有 V2 替代 API。engine tarball
          不包含普通、可选或打包运行时依赖。
        </p>
      </section>

      <section id="destroy" class="doc-prose">
        <h2 class="doc-h2">销毁与重建</h2>
        <p>
          <code class="code-fn"><a href="/guide/earth-create#api-methods">earth.destroy()</a></code>
          除清理地图资源外，还会注销对应的默认或命名实例。销毁完成后，再次调用相同形式的
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth()</a></code
          >、<code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(id)</a></code> 或
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth(options)</a></code> 会创建新的实例。
        </p>
        <p>
          1.x 的 <code>destroyEarth()</code> 和 <code>destroyEarth(id)</code> 已删除。2.0 统一调用所属实例的
          <code class="code-fn"><a href="/guide/earth-create#api-methods">earth.destroy()</a></code
          >；销毁会注销对应注册键，之后以相同 key 调用
          <code class="code-fn"><a href="/guide/earth-create#api-use-earth">useEarth</a></code> 会创建新实例。查询不到实例时无需调用额外的全局销毁函数。
        </p>
        <CodeBlock :code="destroyCode" lang="typescript" />
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="2.0 迁移指南" :items="anchors" />
    </aside>
  </div>
</template>
