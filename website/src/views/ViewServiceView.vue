<script setup lang="ts">
import ApiReference from '../components/docs/ApiReference.vue';
import ApiTable from '../components/docs/ApiTable.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PublicApiSection from '../components/docs/PublicApiSection.vue';
import ViewServiceDemo from '../examples/ViewServiceDemo.vue';
import viewServiceSource from '../examples/ViewServiceDemo.vue?raw';
import ViewWorldPixelDemo from '../examples/ViewWorldPixelDemo.vue';
import viewWorldPixelSource from '../examples/ViewWorldPixelDemo.vue?raw';
import { extractExampleSnippet } from '../utils/exampleSource';

const viewServiceSnippet = extractExampleSnippet(viewServiceSource, 'view-navigation');
const viewWorldPixelSnippet = extractExampleSnippet(viewWorldPixelSource, 'view-world-pixel');

const anchors = [
  { id: 'overview', label: '职责与坐标语义' },
  { id: 'example-view-navigation', label: '定位与视图控制' },
  { id: 'example-view-world-pixel', label: '像素与世界副本' },
  {
    id: 'api',
    label: 'ViewService API',
    children: [
      { id: 'api-properties', label: '属性' },
      { id: 'api-options', label: '动画选项' },
      { id: 'api-basic-view', label: '视图状态' },
      { id: 'api-navigation', label: '定位动画' },
      { id: 'api-coordinates', label: '坐标转换' },
      { id: 'api-world-pixel', label: '世界副本与像素' },
      { id: 'api-overloads', label: '全部重载' }
    ]
  },
  { id: 'api-complete', label: '完整公开 API' },
  { id: 'coordinate-contract', label: '坐标输入契约' },
  { id: 'related-types', label: '相关导出类型' }
];

const propertyColumns = [
  { prop: 'name', label: '属性', width: 180, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 220, linkTypes: true },
  { prop: 'desc', label: '说明', width: 360 }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 220, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 390, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 270, linkTypes: true },
  { prop: 'desc', label: '说明', width: 340 }
];

const propertyRows = [
  {
    anchor: 'api-property-ol-view',
    href: '/api/types#api-type-view-service-property-ol-view',
    name: 'olView',
    type: 'View',
    desc: '当前 OpenLayers View；面向高级集成的只读外部对象'
  }
];

const optionColumns = [
  { prop: 'name', label: '属性', width: 170, presentation: 'property' as const },
  { prop: 'required', label: '必填', width: 80 },
  { prop: 'type', label: '类型', width: 290, linkTypes: true },
  { prop: 'default', label: '默认值', width: 180 },
  { prop: 'desc', label: '说明', width: 350 }
];

const animationOptionRows = [
  {
    anchor: 'api-option-view-animation-duration',
    name: 'duration',
    required: '否',
    type: 'number',
    default: '2000',
    desc: '动画时长，单位毫秒；必须为大于或等于 0 的有限数字'
  },
  {
    anchor: 'api-option-view-animation-easing',
    name: 'easing',
    required: '否',
    type: '(progress: number) => number',
    default: 'OpenLayers 默认',
    desc: '把线性进度映射为动画进度'
  },
  {
    anchor: 'api-option-view-animation-callback',
    name: 'callback',
    required: '否',
    type: '(completed: boolean) => void',
    default: '—',
    desc: '动画自然完成时传 true，被取消时传 false'
  },
  {
    anchor: 'api-option-fly-to-zoom',
    name: 'zoom',
    required: '否',
    type: 'number',
    default: '保持当前 zoom',
    desc: '仅 FlyToOptions 提供；目标缩放级别必须是有限数字'
  }
];

const basicRows = [
  {
    anchor: 'api-method-get-center',
    href: '/api/types#api-type-view-service-method-get-center',
    name: 'getCenter',
    params: '—',
    returns: 'Coordinate | undefined',
    desc: '读取当前 View 投影下的中心点'
  },
  {
    anchor: 'api-method-set-center',
    href: '/api/types#api-type-view-service-method-set-center',
    name: 'setCenter',
    params: 'center: Coordinate',
    returns: 'void',
    desc: '立即设置当前 View 投影下的中心点'
  },
  {
    anchor: 'api-method-get-zoom',
    href: '/api/types#api-type-view-service-method-get-zoom',
    name: 'getZoom',
    params: '—',
    returns: 'number | undefined',
    desc: '读取当前缩放级别'
  },
  {
    anchor: 'api-method-set-zoom',
    href: '/api/types#api-type-view-service-method-set-zoom',
    name: 'setZoom',
    params: 'zoom: number',
    returns: 'void',
    desc: '立即设置缩放级别'
  },
  {
    anchor: 'api-method-set-cursor',
    href: '/api/types#api-type-view-service-method-set-cursor',
    name: 'setCursor',
    params: 'cursor: string',
    returns: 'void',
    desc: '设置地图容器的 CSS cursor'
  },
  {
    anchor: 'api-method-use-default-cursor',
    href: '/api/types#api-type-view-service-method-use-default-cursor',
    name: 'useDefaultCursor',
    params: '—',
    returns: 'void',
    desc: "把 cursor 恢复为 'auto'"
  },
  {
    anchor: 'api-method-use-crosshair-cursor',
    href: '/api/types#api-type-view-service-method-use-crosshair-cursor',
    name: 'useCrosshairCursor',
    params: '—',
    returns: 'void',
    desc: "把 cursor 设置为 'crosshair'"
  },
  {
    anchor: 'api-method-set-drag-enabled',
    href: '/api/types#api-type-view-service-method-set-drag-enabled',
    name: 'setDragEnabled',
    params: 'enabled: boolean',
    returns: 'void',
    desc: '切换当前地图中的 DragPan 交互'
  }
];

const navigationRows = [
  {
    anchor: 'api-method-fly-home',
    href: '/api/types#api-type-view-service-method-fly-home',
    name: 'flyHome',
    params: 'options?: ViewAnimationOptions',
    returns: 'void',
    desc: '动画返回引擎 home center，缩放级别固定为 4'
  },
  {
    anchor: 'api-method-animate-fly-to',
    href: '/api/types#api-type-view-service-method-animate-fly-to',
    name: 'animateFlyTo',
    params: 'center: Coordinate, options?: FlyToOptions',
    returns: 'void',
    desc: '动画定位；默认时长 2000 ms，省略 zoom 时保留当前级别'
  },
  {
    anchor: 'api-method-fly-to',
    href: '/api/types#api-type-view-service-method-fly-to',
    name: 'flyTo',
    params: 'center: Coordinate, zoom?: number',
    returns: 'void',
    desc: '立即定位；省略 zoom 时保留当前级别'
  }
];

const coordinateRows = [
  {
    anchor: 'api-method-to-projected-coordinates',
    href: '/api/types#api-type-view-service-method-to-projected-coordinates',
    name: 'toProjectedCoordinates',
    params: 'Coordinate | readonly number[] | readonly Coordinate[]',
    returns: '与输入层级一致的新坐标',
    desc: 'EPSG:4326 → 当前 View 投影；嵌套三维坐标保留 Z'
  },
  {
    anchor: 'api-method-to-geographic-coordinates',
    href: '/api/types#api-type-view-service-method-to-geographic-coordinates',
    name: 'toGeographicCoordinates',
    params: 'Coordinate | readonly number[] | readonly Coordinate[]',
    returns: '与输入层级一致的新坐标',
    desc: '当前 View 投影 → EPSG:4326；嵌套三维坐标保留 Z'
  }
];

const worldRows = [
  {
    anchor: 'api-method-world-width',
    href: '/api/types#api-type-view-service-method-world-width',
    name: 'worldWidth',
    params: '—',
    returns: 'number | undefined',
    desc: '读取当前投影世界宽度'
  },
  {
    anchor: 'api-method-world-index',
    href: '/api/types#api-type-view-service-method-world-index',
    name: 'worldIndex',
    params: 'x: number',
    returns: 'number | undefined',
    desc: '计算 X 坐标所在的世界副本索引'
  },
  {
    anchor: 'api-method-normalize-to-view-world',
    href: '/api/types#api-type-view-service-method-normalize-to-view-world',
    name: 'normalizeToViewWorld',
    params: 'Coordinate | readonly Coordinate[] | readonly (readonly Coordinate[])[]',
    returns: '与输入层级一致的新坐标',
    desc: '把坐标平移到当前 View 所在世界副本'
  },
  {
    anchor: 'api-method-restore-to-world',
    href: '/api/types#api-type-view-service-method-restore-to-world',
    name: 'restoreToWorld',
    params: 'coordinates, index: number | undefined',
    returns: '与输入层级一致的新坐标',
    desc: '把规范坐标恢复到指定世界副本'
  },
  {
    anchor: 'api-method-coordinate-at-pixel',
    href: '/api/types#api-type-view-service-method-coordinate-at-pixel',
    name: 'coordinateAtPixel',
    params: 'pixel: Pixel',
    returns: 'Coordinate | undefined',
    desc: '把视口像素换算为当前投影坐标'
  },
  {
    anchor: 'api-method-translate-coordinates-to-pixel',
    href: '/api/types#api-type-view-service-method-translate-coordinates-to-pixel',
    name: 'translateCoordinatesToPixel',
    params: 'pixel: Pixel, coordinates',
    returns: '与输入层级一致的新坐标 | undefined',
    desc: '以像素对应坐标为平移目标，整体移动坐标集合'
  }
];

const overloadRows = [
  {
    anchor: 'api-overload-to-projected-single',
    name: 'toProjectedCoordinates',
    params: 'coordinates: readonly [number, number]',
    returns: 'readonly [number, number]',
    desc: '单个二维经纬度坐标'
  },
  {
    anchor: 'api-overload-to-projected-flat',
    name: 'toProjectedCoordinates',
    params: 'coordinates: readonly number[]',
    returns: 'readonly number[]',
    desc: '二维扁平坐标；按 XY 两两分组'
  },
  {
    anchor: 'api-overload-to-projected-nested',
    name: 'toProjectedCoordinates',
    params: 'coordinates: readonly (readonly number[])[]',
    returns: 'readonly Coordinate[]',
    desc: '一层嵌套二维或三维坐标'
  },
  {
    anchor: 'api-overload-to-geographic-single',
    name: 'toGeographicCoordinates',
    params: 'coordinates: readonly [number, number]',
    returns: 'readonly [number, number]',
    desc: '单个二维投影坐标'
  },
  {
    anchor: 'api-overload-to-geographic-flat',
    name: 'toGeographicCoordinates',
    params: 'coordinates: readonly number[]',
    returns: 'readonly number[]',
    desc: '二维扁平投影坐标'
  },
  {
    anchor: 'api-overload-to-geographic-nested',
    name: 'toGeographicCoordinates',
    params: 'coordinates: readonly (readonly number[])[]',
    returns: 'readonly Coordinate[]',
    desc: '一层嵌套二维或三维投影坐标'
  },
  { anchor: 'api-overload-normalize-point', name: 'normalizeToViewWorld', params: 'coordinates: Coordinate', returns: 'Coordinate', desc: '单个坐标' },
  {
    anchor: 'api-overload-normalize-line',
    name: 'normalizeToViewWorld',
    params: 'coordinates: readonly Coordinate[]',
    returns: 'readonly Coordinate[]',
    desc: '一组坐标'
  },
  {
    anchor: 'api-overload-normalize-groups',
    name: 'normalizeToViewWorld',
    params: 'coordinates: readonly (readonly Coordinate[])[]',
    returns: 'readonly (readonly Coordinate[])[]',
    desc: '多组坐标'
  },
  {
    anchor: 'api-overload-restore-point',
    name: 'restoreToWorld',
    params: 'coordinates: Coordinate, index: number | undefined',
    returns: 'Coordinate',
    desc: '单个坐标'
  },
  {
    anchor: 'api-overload-restore-line',
    name: 'restoreToWorld',
    params: 'coordinates: readonly Coordinate[], index: number | undefined',
    returns: 'readonly Coordinate[]',
    desc: '一组坐标'
  },
  {
    anchor: 'api-overload-restore-groups',
    name: 'restoreToWorld',
    params: 'coordinates: readonly (readonly Coordinate[])[], index: number | undefined',
    returns: 'readonly (readonly Coordinate[])[]',
    desc: '多组坐标'
  },
  {
    anchor: 'api-overload-translate-point',
    name: 'translateCoordinatesToPixel',
    params: 'pixel: Pixel, coordinates: Coordinate',
    returns: 'Coordinate | undefined',
    desc: '平移单个坐标'
  },
  {
    anchor: 'api-overload-translate-line',
    name: 'translateCoordinatesToPixel',
    params: 'pixel: Pixel, coordinates: readonly Coordinate[]',
    returns: 'readonly Coordinate[] | undefined',
    desc: '整体平移一组坐标'
  },
  {
    anchor: 'api-overload-translate-groups',
    name: 'translateCoordinatesToPixel',
    params: 'pixel: Pixel, coordinates: readonly (readonly Coordinate[])[]',
    returns: 'readonly (readonly Coordinate[])[] | undefined',
    desc: '整体平移多组坐标'
  }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">核心</span>
        <h1>视图（View）</h1>
        <p>通过 earth.view 统一处理中心点、缩放、定位动画、坐标投影、世界副本与像素换算。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">职责与坐标语义</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="业务坐标">Element 与 View 的坐标始终使用当前 View 投影。</el-descriptions-item>
          <el-descriptions-item label="经纬度输入">显式调用 toProjectedCoordinates，把 EPSG:4326 经纬度转换到当前 View。</el-descriptions-item>
          <el-descriptions-item label="经纬度输出">显式调用 toGeographicCoordinates，把当前 View 坐标转换回 EPSG:4326。</el-descriptions-item>
          <el-descriptions-item label="OL 逃生口">olView 是外部 OpenLayers 类型；直接修改时由调用方承担状态一致性责任。</el-descriptions-item>
        </el-descriptions>
      </section>

      <section id="example-view-navigation" class="doc-prose">
        <ExampleBlock title="定位、转换与视图控制" :source="viewServiceSource" :snippet="viewServiceSnippet">
          <template #description>
            <p>
              输入经纬度后先调用 <ApiReference kind="method" to="#api-method-to-projected-coordinates">toProjectedCoordinates</ApiReference>，再使用
              <ApiReference kind="method" to="#api-method-fly-to">flyTo</ApiReference> 或
              <ApiReference kind="method" to="#api-method-animate-fly-to">animateFlyTo</ApiReference> 定位。光标与拖拽开关同样由 ViewService 管理。
            </p>
          </template>
          <template #preview><ViewServiceDemo /></template>
        </ExampleBlock>
      </section>

      <section id="example-view-world-pixel" class="doc-prose">
        <ExampleBlock title="像素换算与世界副本" :source="viewWorldPixelSource" :snippet="viewWorldPixelSnippet">
          <template #description>
            <p>
              示例读取视口中心像素，调用 <ApiReference kind="method" to="#api-method-coordinate-at-pixel">coordinateAtPixel</ApiReference> 换算坐标，再用
              <ApiReference kind="method" to="#api-method-translate-coordinates-to-pixel">translateCoordinatesToPixel</ApiReference>
              平移路径；同时展示世界宽度、世界索引和跨世界坐标恢复。
            </p>
          </template>
          <template #preview><ViewWorldPixelDemo /></template>
        </ExampleBlock>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">ViewService API</h2>
        <h3 id="api-properties" class="doc-h3">属性</h3>
        <ApiTable :columns="propertyColumns" :rows="propertyRows" />

        <h3 id="api-options" class="doc-h3">ViewAnimationOptions 与 FlyToOptions</h3>
        <p>FlyToOptions 继承前三个 ViewAnimationOptions 字段，并额外增加 zoom。</p>
        <ApiTable :columns="optionColumns" :rows="animationOptionRows" />

        <h3 id="api-basic-view" class="doc-h3">视图状态与交互</h3>
        <ApiTable :columns="methodColumns" :rows="basicRows" />

        <h3 id="api-navigation" class="doc-h3">定位动画</h3>
        <ApiTable :columns="methodColumns" :rows="navigationRows" />

        <h3 id="api-coordinates" class="doc-h3">坐标转换</h3>
        <ApiTable :columns="methodColumns" :rows="coordinateRows" />

        <h3 id="api-world-pixel" class="doc-h3">世界副本与像素</h3>
        <ApiTable :columns="methodColumns" :rows="worldRows" />

        <h3 id="api-overloads" class="doc-h3">坐标结构的全部重载</h3>
        <p>以下重载都返回新数组，不修改输入；单点、线和多组坐标会保持各自输入层级。</p>
        <ApiTable :columns="methodColumns" :rows="overloadRows" />
      </section>

      <PublicApiSection
        section-id="api-complete"
        title="完整公开 API"
        description="完整展示 ViewService 属性、所有方法重载、参数和返回值，以及两个动画选项类型与坐标、像素类型。"
        :type-names="['ViewService', 'ViewAnimationOptions', 'FlyToOptions', 'Coordinate', 'Pixel']"
      />

      <section id="coordinate-contract" class="doc-prose">
        <h2 class="doc-h2">坐标输入契约</h2>
        <el-alert type="warning" :closable="false" show-icon title="三维单点必须放在嵌套数组中">
          直接传入 <code>[x, y, z]</code> 会按“奇数长度的二维扁平数组”拒绝；三维单点应写为 <code>[[x, y, z]]</code>。
        </el-alert>
        <ul class="doc-list core-contract-list">
          <li>扁平数组必须非空、长度为偶数，并始终按二维坐标解释。</li>
          <li>嵌套坐标允许二维或三维，Z 值原样保留。</li>
          <li>输入必须是普通、稠密且只包含有限数值的数组。</li>
          <li>转换不会修改输入，返回冻结的新数组；无效输入抛出 InvalidArgumentError。</li>
        </ul>
      </section>

      <section id="related-types" class="doc-prose">
        <h2 class="doc-h2">相关导出类型</h2>
        <div class="core-type-links">
          <ApiReference kind="type" to="/api/types#api-type-view-service">ViewService</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-view-animation-options">ViewAnimationOptions</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-fly-to-options">FlyToOptions</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-coordinate">Coordinate</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-pixel">Pixel</ApiReference>
        </div>
      </section>
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="视图（View）" :items="anchors" /></aside>
  </div>
</template>
