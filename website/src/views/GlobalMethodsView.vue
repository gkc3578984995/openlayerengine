<script setup lang="ts">
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import CameraDemo from '../examples/CameraDemo.vue';
import ControlsDemo from '../examples/ControlsDemo.vue';
import MouseDemo from '../examples/MouseDemo.vue';
import cameraSource from '../examples/CameraDemo.vue?raw';
import controlsSource from '../examples/ControlsDemo.vue?raw';
import mouseSource from '../examples/MouseDemo.vue?raw';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

interface ApiColumn {
  prop: string;
  label: string;
  width?: string | number;
  monospace?: boolean;
}

const anchors: AnchorItem[] = [
  { id: 'overview', label: '概述' },
  {
    id: 'demo',
    label: '代码演示',
    children: [
      { id: 'demo-camera', label: '相机控制' },
      { id: 'demo-controls', label: '辅助控件' },
      { id: 'demo-mouse', label: '鼠标与拖拽' }
    ]
  },
  { id: 'api-methods', label: '方法' },
  { id: 'tips', label: '注意事项' }
];

const methodCols: ApiColumn[] = [
  { prop: 'name', label: '方法名', width: 280 },
  { prop: 'desc', label: '说明', width: 340 },
  { prop: 'params', label: '参数', width: 200, monospace: true },
  { prop: 'returns', label: '返回值', width: 160, monospace: true }
];

const methodRows = [
  { name: 'flyTo(position, zoom?)', desc: '无动画移动到指定位置', params: 'Coordinate, number?', returns: 'void' },
  { name: 'animateFlyTo(position, zoom?, duration?)', desc: '带动画移动到指定位置', params: 'Coordinate, number?, number?', returns: 'void' },
  { name: 'flyHome()', desc: '移动相机到构造时所设的默认位置', params: '—', returns: 'void' },
  {
    name: '<code class="code-fn"><a href="#api-methods">enableGraticule</a></code>(options?)',
    desc: '使用 <code>GraticuleOptions</code> 启用网格线；每次调用会移除旧网格并按新参数重建。',
    params: 'GraticuleOptions?',
    returns: 'Graticule'
  },
  { name: 'disableGraticule()', desc: '禁用网格线控件', params: '—', returns: 'void' },
  {
    name: '<code class="code-fn"><a href="#api-methods">enableScaleLine</a></code>(options?)',
    desc: '使用 <code>ScaleLineOptions</code> 启用比例尺；每次调用会移除旧比例尺并按新参数重建。',
    params: 'ScaleLineOptions?',
    returns: 'ScaleLine'
  },
  { name: 'disableScaleLine()', desc: '禁用比例尺控件', params: '—', returns: 'void' },
  { name: 'setMouseStyle(cursor)', desc: '设置鼠标样式（CSS cursor 值）', params: 'string', returns: 'void' },
  { name: 'setMouseStyleToCrosshair()', desc: '设置鼠标样式为十字准线', params: '—', returns: 'void' },
  { name: 'setMouseStyleToDefault()', desc: '恢复鼠标默认样式', params: '—', returns: 'void' },
  { name: 'disabledMapDrag()', desc: '禁用地图拖拽平移', params: '—', returns: 'void' },
  { name: 'enableMapDrag()', desc: '启用地图拖拽平移', params: '—', returns: 'void' },
  { name: 'getFeatureAtPixel(pixel)', desc: '根据像素坐标获取该位置的 feature 信息', params: 'number[]', returns: 'IFeatureAtPixel' },
  { name: 'getLayerAtFeature(feature)', desc: '根据 feature 获取其所属图层', params: 'Feature&lt;Geometry&gt;', returns: 'Layer | undefined' },
  { name: 'useGlobalEvent()', desc: '获取全局事件管理器', params: '—', returns: 'GlobalEvent' },
  { name: 'useContextMenu(option?)', desc: '启用/配置右键菜单', params: 'IContextMenuOption?', returns: 'ContextMenu' },
  { name: 'useDrawTool()', desc: '获取动态绘制工具', params: '—', returns: 'DynamicDraw' },
  { name: 'useMeasure()', desc: '获取测量工具', params: '—', returns: 'Measure' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>全局方法</h1>
        <p>Earth 实例上的公共方法：相机控制、辅助控件、鼠标样式、拖拽、事件与工具等。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">概述</h2>
        <p>
          <code>Earth</code> 提供了丰富的实例方法来操控地图。除创建/销毁和图层管理（已在
          <RouterLink to="/guide/earth-create" class="doc-link">地图创建与销毁</RouterLink>
          中介绍）外，还包括相机定位、网格线与比例尺、鼠标样式、拖拽控制、右键菜单、测量绘制等功能。
        </p>
      </section>

      <section id="demo" class="doc-prose">
        <h2 class="doc-h2">代码演示</h2>

        <div id="demo-camera">
          <ExampleBlock
            title="相机控制"
            :description="`<code class=&quot;code-fn-inline&quot;>flyTo</code> 无动画跳转、<code class=&quot;code-fn-inline&quot;>animateFlyTo</code> 带动画过渡、<code class=&quot;code-fn-inline&quot;>flyHome</code> 复位。`"
            :source="cameraSource"
          >
            <template #preview>
              <CameraDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="demo-controls">
          <ExampleBlock
            title="辅助控件"
            :description="`<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>enableGraticule</a></code> 与 <code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>enableScaleLine</a></code> 接收 OpenLayers 原生选项；示例通过重复调用切换网格标签与比例尺单位，旧实例会自动销毁并重建。`"
            :source="controlsSource"
          >
            <template #preview>
              <ControlsDemo />
            </template>
          </ExampleBlock>
        </div>

        <div id="demo-mouse">
          <ExampleBlock
            title="鼠标与拖拽"
            :description="`<code class=&quot;code-fn-inline&quot;>setMouseStyleToCrosshair</code> 十字准线、<code class=&quot;code-fn-inline&quot;>disabledMapDrag</code> 禁用拖拽。`"
            :source="mouseSource"
          >
            <template #preview>
              <MouseDemo />
            </template>
          </ExampleBlock>
        </div>
      </section>

      <section id="api-methods" class="doc-prose">
        <h2 class="doc-h2">方法</h2>
        <ApiTable :columns="methodCols" :rows="methodRows" />
      </section>

      <section id="tips" class="doc-prose">
        <h2 class="doc-h2">注意事项</h2>
        <ul class="doc-list">
          <li><code>flyHome()</code> 将相机移动到构造 <code>Earth</code> 时所设的中心点和缩放级别。</li>
          <li>
            重复调用 <code class="code-fn"><a href="#api-methods">enableGraticule</a></code> 或
            <code class="code-fn"><a href="#api-methods">enableScaleLine</a></code> 会使用新参数重建实例；无需手动调用禁用方法。
          </li>
          <li>右键菜单、绘制工具、测量工具需单独调用对应方法初始化，首次调用后缓存实例。</li>
          <li><code>getFeatureAtPixel</code> 接收的是屏幕像素坐标（相对于地图容器），非地理坐标。</li>
        </ul>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="全局方法" :items="anchors" />
    </aside>
  </div>
</template>
