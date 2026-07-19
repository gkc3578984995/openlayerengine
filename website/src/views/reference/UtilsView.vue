<script setup lang="ts">
import ApiReference from '../../components/docs/ApiReference.vue';
import ApiTable from '../../components/docs/ApiTable.vue';
import ExampleBlock from '../../components/docs/ExampleBlock.vue';
import PageAnchor from '../../components/docs/PageAnchor.vue';
import PublicApiSection from '../../components/docs/PublicApiSection.vue';
import UtilsDemo from '../../examples/reference/UtilsDemo.vue';
import utilsSource from '../../examples/reference/UtilsDemo.vue?raw';

const anchors = [
  { id: 'overview', label: '工具边界' },
  { id: 'example-utils-runtime', label: '运行全部数学、ID 与节流工具' },
  { id: 'math-reference', label: '数学与坐标函数' },
  { id: 'id-reference', label: 'ID 函数' },
  { id: 'throttle-reference', label: 'throttle' },
  { id: 'api', label: '完整 API' }
];

const functionColumns = [
  { prop: 'name', label: '函数', width: 220, presentation: 'method' as const },
  { prop: 'params', label: '参数', width: 440, linkTypes: true },
  { prop: 'returns', label: '返回值', width: 250, linkTypes: true },
  { prop: 'desc', label: '行为', width: 420 }
];

const mathRows = [
  {
    anchor: 'api-function-to-flat-coordinates',
    name: 'toFlatCoordinates',
    params: 'coordinates: readonly (readonly number[])[]',
    returns: 'number[]',
    desc: '按顺序展开二维坐标数组；返回新数组，不修改输入'
  },
  { anchor: 'api-function-deg-to-rad', name: 'degToRad', params: 'degrees: number', returns: 'number', desc: '角度换算为弧度' },
  { anchor: 'api-function-rad-to-deg', name: 'radToDeg', params: 'radians: number', returns: 'number', desc: '弧度换算为归一化到 [0, 360) 的角度' },
  {
    anchor: 'api-function-scale-2',
    name: 'scale2',
    params: 'vector: Coordinate, factor: number',
    returns: 'Coordinate',
    desc: '二维向量按统一倍数缩放，返回新坐标'
  },
  { anchor: 'api-function-add-2', name: 'add2', params: 'left: Coordinate, right: Coordinate', returns: 'Coordinate', desc: '二维向量相加，返回新坐标' },
  {
    anchor: 'api-function-lerp-2',
    name: 'lerp2',
    params: 'start: Coordinate, end: Coordinate, ratio: number',
    returns: 'Coordinate',
    desc: '在两个坐标之间线性插值；ratio 不会被强制截断'
  },
  {
    anchor: 'api-function-quadratic-bezier-2',
    name: 'quadraticBezier2',
    params: 'start: Coordinate, control: Coordinate, end: Coordinate, ratio: number',
    returns: 'Coordinate',
    desc: '计算二次贝塞尔曲线上的坐标'
  },
  {
    anchor: 'api-function-close-ring',
    name: 'closeRing',
    params: 'coordinates: readonly Coordinate[]',
    returns: 'Coordinate[]',
    desc: '复制坐标，并在首尾不相同时补入首坐标；空数组返回空数组'
  },
  {
    anchor: 'api-function-trim-closing-coordinate',
    name: 'trimClosingCoordinate',
    params: 'coordinates: readonly Coordinate[]',
    returns: 'Coordinate[]',
    desc: '复制坐标，并移除末尾与首坐标完全相同的闭合点'
  }
];

const idRows = [
  {
    anchor: 'api-function-create-id',
    name: 'createId',
    params: '—',
    returns: 'string',
    desc: '创建 UUID 格式随机 ID；优先使用 Web Crypto，缺失时退回随机字节实现'
  }
];

const throttleRows = [
  {
    anchor: 'api-function-throttle',
    name: 'throttle',
    params: 'fn: (this: This, ...args: Args) => Result, wait?: number, options?: ThrottleOptions',
    returns: 'ThrottledFunction<This, Args, Result>',
    desc: '限制调用频率并保留 this、参数和返回值；默认 leading 与 trailing 均为 true'
  },
  {
    anchor: 'api-method-throttled-cancel',
    href: '/api/types#api-type-throttled-function-method-cancel',
    name: 'throttled.cancel',
    params: '—',
    returns: 'void',
    desc: '取消等待中的尾调用并清空节流状态；组件卸载时应调用'
  },
  {
    anchor: 'api-method-throttled-flush',
    href: '/api/types#api-type-throttled-function-method-flush',
    name: 'throttled.flush',
    params: '—',
    returns: 'Result | undefined',
    desc: '立即执行等待中的尾调用；没有等待任务时返回已有结果或 undefined'
  }
];

const relatedTypes = ['ThrottleOptions', 'ThrottledFunction'] as const;
const runtimeNames = [
  'toFlatCoordinates',
  'degToRad',
  'radToDeg',
  'scale2',
  'add2',
  'lerp2',
  'quadraticBezier2',
  'closeRing',
  'trimClosingCoordinate',
  'createId',
  'throttle'
] as const;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">工具与参考</span>
        <h1>Utils</h1>
        <p>包根导出一组无 OpenLayers 运行时依赖的坐标、角度、曲线、环、ID 与节流工具；所有函数均可独立按需导入。</p>
      </header>

      <section id="overview" class="doc-prose">
        <h2 class="doc-h2">工具边界</h2>
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><template #header><strong>数学与坐标</strong></template>
              <p>纯函数返回新数组，不修改输入；Coordinate 可以是二维或三维，但 add2、scale2 和曲线函数只计算前两个分量。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><template #header><strong>createId</strong></template>
              <p>生成适合 Element、Layer、Overlay 等身份字段的 UUID 格式随机值；业务可读 ID 仍建议由应用显式提供。</p></el-card
            >
          </el-col>
          <el-col :xs="24" :md="8">
            <el-card shadow="never"
              ><template #header><strong>throttle</strong></template>
              <p>本包实现，不依赖 lodash。返回函数携带 cancel 与 flush，必须跟随持有它的组件或服务清理。</p></el-card
            >
          </el-col>
        </el-row>
      </section>

      <section id="example-utils-runtime" class="doc-prose">
        <ExampleBlock title="运行全部数学、ID 与节流工具" :source="utilsSource">
          <template #description>
            <p>
              “运行全部纯函数”会实际调用本页 10 个数学与 ID 导出；节流面板调用第 11 个导出
              <ApiReference kind="method" to="#api-function-throttle">throttle</ApiReference>，并可观察 leading、trailing、
              <ApiReference kind="method" to="#api-method-throttled-flush">flush</ApiReference> 与
              <ApiReference kind="method" to="#api-method-throttled-cancel">cancel</ApiReference>。
            </p>
          </template>
          <template #preview><UtilsDemo /></template>
        </ExampleBlock>
      </section>

      <section id="math-reference" class="doc-prose">
        <h2 class="doc-h2">数学与坐标函数</h2>
        <ApiTable :columns="functionColumns" :rows="mathRows" />
      </section>

      <section id="id-reference" class="doc-prose">
        <h2 class="doc-h2">ID 函数</h2>
        <ApiTable :columns="functionColumns" :rows="idRows" />
      </section>

      <section id="throttle-reference" class="doc-prose">
        <h2 class="doc-h2">throttle</h2>
        <ApiTable :columns="functionColumns" :rows="throttleRows" />
        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon title="cancel 与 flush 的语义不同">
          cancel 丢弃等待中的尾调用并重置状态；flush 立即执行等待中的最后一次调用。wait 的非有限值按 0 处理，负数也归一化为 0。
        </el-alert>
      </section>

      <PublicApiSection
        :type-names="relatedTypes"
        :runtime-names="runtimeNames"
        description="这里直接列出 Utils 的全部 11 个根导出函数，以及 ThrottleOptions 和 ThrottledFunction 的属性、方法、参数与返回类型；签名中的 Coordinate 可点击进入 View 模块的唯一类型定义。"
      />
    </article>

    <aside class="doc-page-layout__aside"><PageAnchor title="Utils" :items="anchors" /></aside>
  </div>
</template>
