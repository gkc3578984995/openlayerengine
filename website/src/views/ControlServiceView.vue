<script setup lang="ts">
import ApiReference from '../components/docs/ApiReference.vue';
import ApiTable from '../components/docs/ApiTable.vue';
import CodeBlock from '../components/docs/CodeBlock.vue';
import ExampleBlock from '../components/docs/ExampleBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';
import PublicApiSection from '../components/docs/PublicApiSection.vue';
import ControlServiceDemo from '../examples/ControlServiceDemo.vue';
import controlServiceSource from '../examples/ControlServiceDemo.vue?raw';
import { extractExampleSnippet } from '../utils/exampleSource';

const controlServiceSnippet = extractExampleSnippet(controlServiceSource, 'runtime-controls');

const anchors = [
  { id: 'overview', label: '两类控件配置' },
  { id: 'example-runtime-controls', label: '运行期控件' },
  {
    id: 'api',
    label: 'ControlService API',
    children: [
      { id: 'api-properties', label: '属性' },
      { id: 'api-methods', label: '方法' }
    ]
  },
  { id: 'api-complete', label: '完整公开 API' },
  { id: 'option-defaults', label: '选项与默认值' },
  { id: 'related-types', label: '相关导出类型' }
];

const initialControlsCode = `const earth = useEarth({
  target: 'map',
  controls: {
    zoom: true,
    rotate: false,
    attribution: true
  }
});`;

const propertyColumns = [
  { prop: 'name', label: '属性', width: 180, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 290, linkTypes: true },
  { prop: 'desc', label: '说明', width: 350 }
];

const propertyRows = [
  {
    anchor: 'api-property-graticule',
    href: '/api/types#api-type-control-service-property-graticule',
    name: 'graticule',
    type: 'Graticule | undefined',
    desc: '当前经纬网图层；Graticule 是 OpenLayers 外部类型'
  },
  {
    anchor: 'api-property-scale-line',
    href: '/api/types#api-type-control-service-property-scale-line',
    name: 'scaleLine',
    type: 'ScaleLine | undefined',
    desc: '当前比例尺控件；ScaleLine 是 OpenLayers 外部类型'
  }
];

const methodColumns = [
  { prop: 'name', label: '方法', width: 230, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 280, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 230, linkTypes: true },
  { prop: 'desc', label: '说明', width: 360 }
];

const methodRows = [
  {
    anchor: 'api-method-enable-graticule',
    href: '/api/types#api-type-control-service-method-enable-graticule',
    name: 'enableGraticule',
    params: 'options?: GraticuleOptions',
    returns: 'Graticule',
    desc: '启用经纬网；重复调用时先移除旧实例再创建'
  },
  {
    anchor: 'api-method-disable-graticule',
    href: '/api/types#api-type-control-service-method-disable-graticule',
    name: 'disableGraticule',
    params: '—',
    returns: 'void',
    desc: '关闭经纬网；未启用时幂等'
  },
  {
    anchor: 'api-method-enable-scale-line',
    href: '/api/types#api-type-control-service-method-enable-scale-line',
    name: 'enableScaleLine',
    params: 'options?: ScaleLineOptions',
    returns: 'ScaleLine',
    desc: '启用比例尺；重复调用时先移除旧实例再创建'
  },
  {
    anchor: 'api-method-disable-scale-line',
    href: '/api/types#api-type-control-service-method-disable-scale-line',
    name: 'disableScaleLine',
    params: '—',
    returns: 'void',
    desc: '关闭比例尺；未启用时幂等'
  }
];

const optionColumns = [
  { prop: 'name', label: '属性', width: 190, presentation: 'property' as const },
  { prop: 'type', label: '类型', width: 280, linkTypes: true },
  { prop: 'default', label: '默认值', width: 220 },
  { prop: 'desc', label: '说明', width: 320 }
];

const graticuleOptionRows = [
  { name: 'className', type: 'string', default: "'ol-layer'", desc: '图层容器类名' },
  { name: 'opacity', type: 'number', default: '1', desc: '整体透明度' },
  { name: 'visible', type: 'boolean', default: 'true', desc: '初始可见状态' },
  { name: 'extent', type: 'Extent', default: 'undefined', desc: 'OpenLayers 外部范围类型' },
  { name: 'zIndex', type: 'number', default: '9999（引擎）', desc: '经纬网图层层级' },
  { name: 'minResolution', type: 'number', default: '0', desc: '最小分辨率' },
  { name: 'maxResolution', type: 'number', default: 'Infinity', desc: '最大分辨率' },
  { name: 'minZoom', type: 'number', default: '-Infinity', desc: '最小缩放级别' },
  { name: 'maxZoom', type: 'number', default: 'Infinity', desc: '最大缩放级别' },
  { name: 'maxLines', type: 'number', default: '100', desc: '单方向最大线数' },
  { name: 'strokeStyle', type: 'Stroke', default: 'rgba(0, 0, 0, 0.3)，宽 1（引擎）', desc: 'OpenLayers 外部描边类型' },
  { name: 'targetSize', type: 'number', default: '100', desc: '目标网格像素尺寸' },
  { name: 'showLabels', type: 'boolean', default: 'true（引擎）', desc: '显示经纬度标签' },
  { name: 'lonLabelFormatter', type: '(longitude: number) => string', default: 'OpenLayers 默认', desc: '经度标签格式化函数' },
  { name: 'latLabelFormatter', type: '(latitude: number) => string', default: 'OpenLayers 默认', desc: '纬度标签格式化函数' },
  { name: 'lonLabelPosition', type: 'number', default: '0.985（引擎）', desc: '经度标签相对位置' },
  { name: 'latLabelPosition', type: 'number', default: '0.985（引擎）', desc: '纬度标签相对位置' },
  { name: 'lonLabelStyle', type: 'Text', default: 'OpenLayers 默认', desc: '经度标签的外部文字样式' },
  { name: 'latLabelStyle', type: 'Text', default: 'OpenLayers 默认', desc: '纬度标签的外部文字样式' },
  { name: 'intervals', type: 'number[]', default: 'OpenLayers 默认', desc: '候选经纬网间隔' },
  { name: 'wrapX', type: 'boolean', default: 'true（引擎）', desc: '跨世界副本显示' },
  { name: 'properties', type: 'Record<string, unknown>', default: '{}', desc: '自定义图层属性；引擎追加 layerType' }
];

const scaleLineOptionRows = [
  { name: 'className', type: 'string', default: "'ol-scale-bar'", desc: 'bar 为 true 时的默认类名' },
  { name: 'minWidth', type: 'number', default: '100（引擎）', desc: '比例尺最小像素宽度' },
  { name: 'maxWidth', type: 'number', default: 'undefined', desc: '比例尺最大像素宽度' },
  { name: 'render', type: '(event: MapEvent) => void', default: 'OpenLayers 默认', desc: '自定义渲染函数；MapEvent 是外部类型' },
  { name: 'target', type: 'string | HTMLElement', default: 'undefined', desc: '控件挂载目标' },
  { name: 'units', type: "'degrees' | 'imperial' | 'nautical' | 'metric' | 'us'", default: "'metric'", desc: '显示单位' },
  { name: 'bar', type: 'boolean', default: 'true（引擎）', desc: '显示比例尺条' },
  { name: 'steps', type: 'number', default: '4', desc: '比例尺条分段数' },
  { name: 'text', type: 'boolean', default: 'true（引擎）', desc: '显示比例文字' },
  { name: 'dpi', type: 'number', default: 'undefined', desc: '输出设备 DPI' }
];
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">核心</span>
        <h1>地图控件（Controls）</h1>
        <p>EarthOptions.controls 配置创建时的 OpenLayers 默认控件；earth.controls 则在运行期管理经纬网与比例尺。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">先区分两类控件配置</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-card class="core-choice-card" shadow="never">
              <template #header><strong>EarthOptions.controls</strong></template>
              <p>只在 Earth 首次创建时配置 OpenLayers 的 Zoom、Rotate 与 Attribution 默认控件。</p>
              <CodeBlock :code="initialControlsCode" lang="ts" />
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card class="core-choice-card" shadow="never">
              <template #header><strong>earth.controls</strong></template>
              <p>ControlService 的运行期入口，可随时启用、替换或关闭 Graticule 与 ScaleLine。</p>
              <div class="core-type-links">
                <ApiReference kind="method" to="#api-method-enable-graticule">enableGraticule</ApiReference>
                <ApiReference kind="method" to="#api-method-enable-scale-line">enableScaleLine</ApiReference>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </section>

      <section id="example-runtime-controls" class="doc-prose">
        <ExampleBlock title="经纬网与比例尺" :source="controlServiceSource" :snippet="controlServiceSnippet">
          <template #description>
            <p>
              使用 Element Plus 开关驱动 <ApiReference kind="method" to="#api-method-enable-graticule">enableGraticule</ApiReference>、
              <ApiReference kind="method" to="#api-method-disable-graticule">disableGraticule</ApiReference>、
              <ApiReference kind="method" to="#api-method-enable-scale-line">enableScaleLine</ApiReference> 与对应关闭方法。
            </p>
          </template>
          <template #preview><ControlServiceDemo /></template>
        </ExampleBlock>
      </section>

      <section id="api" class="doc-prose">
        <h2 class="doc-h2">ControlService API</h2>
        <h3 id="api-properties" class="doc-h3">属性</h3>
        <ApiTable :columns="propertyColumns" :rows="propertyRows" />
        <h3 id="api-methods" class="doc-h3">方法</h3>
        <ApiTable :columns="methodColumns" :rows="methodRows" />
        <el-alert type="info" :closable="false" show-icon title="清理由 Earth 统一负责">
          ControlService 没有公开 destroy()。组件卸载时调用 earth.destroy()，会一并移除已启用的经纬网和比例尺。
        </el-alert>
      </section>

      <PublicApiSection
        section-id="api-complete"
        title="完整公开 API"
        description="完整展示 ControlService 的两个只读属性、四个运行期方法和两个公开选项别名；下方表格继续展开 OpenLayers 选项的全部字段和引擎默认值。"
        :type-names="['ControlService', 'GraticuleOptions', 'ScaleLineOptions']"
      />

      <section id="option-defaults" class="doc-prose">
        <h2 class="doc-h2">选项与默认值</h2>
        <el-collapse>
          <el-collapse-item name="graticule">
            <template #title><strong>GraticuleOptions</strong></template>
            <p>
              这是包根导出的 OpenLayers 选项别名；类型目录可查询它的导出身份与别名表达式：
              <ApiReference kind="type" to="/api/types#api-type-graticule-options">GraticuleOptions</ApiReference>。
            </p>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="showLabels">true</el-descriptions-item>
              <el-descriptions-item label="wrapX">true</el-descriptions-item>
              <el-descriptions-item label="zIndex">9999</el-descriptions-item>
              <el-descriptions-item label="标签位置">lon / lat 均为 0.985</el-descriptions-item>
              <el-descriptions-item label="默认描边" :span="2">rgba(0, 0, 0, 0.3)，宽度 1</el-descriptions-item>
            </el-descriptions>
            <h3 class="doc-h3">全部公开选项</h3>
            <ApiTable :columns="optionColumns" :rows="graticuleOptionRows" />
          </el-collapse-item>
          <el-collapse-item name="scale-line">
            <template #title><strong>ScaleLineOptions</strong></template>
            <p>
              这是包根导出的 OpenLayers 选项别名；类型目录可查询它的导出身份与别名表达式：
              <ApiReference kind="type" to="/api/types#api-type-scale-line-options">ScaleLineOptions</ApiReference>。
            </p>
            <el-descriptions :column="3" border>
              <el-descriptions-item label="bar">true</el-descriptions-item>
              <el-descriptions-item label="text">true</el-descriptions-item>
              <el-descriptions-item label="minWidth">100</el-descriptions-item>
            </el-descriptions>
            <h3 class="doc-h3">全部公开选项</h3>
            <ApiTable :columns="optionColumns" :rows="scaleLineOptionRows" />
          </el-collapse-item>
        </el-collapse>
      </section>

      <section id="related-types" class="doc-prose">
        <h2 class="doc-h2">相关导出类型</h2>
        <div class="core-type-links">
          <ApiReference kind="type" to="/api/types#api-type-control-service">ControlService</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-graticule-options">GraticuleOptions</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-scale-line-options">ScaleLineOptions</ApiReference>
          <ApiReference kind="type" to="/api/types#api-type-earth-options-property-controls">EarthOptions.controls</ApiReference>
        </div>
      </section>
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="地图控件（Controls）" :items="anchors" /></aside>
  </div>
</template>
