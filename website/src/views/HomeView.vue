<script setup lang="ts">
interface HeroAction {
  label: string;
  to: string;
  primary: boolean;
}

interface CapabilityHighlight {
  eyebrow: string;
  title: string;
  description: string;
}

interface CoreModule {
  name: string;
  title: string;
  description: string;
  to: string;
}

interface WorkbenchLayer {
  label: string;
}

const heroActions: HeroAction[] = [
  { label: '快速开始', to: '/guide/quick-start', primary: true },
  { label: '创建地图', to: '/guide/earth-create', primary: false }
];

const workbenchLayers: WorkbenchLayer[] = [{ label: '路线规划' }, { label: '业务区域' }, { label: '基础地图' }];

const capabilityHighlights: CapabilityHighlight[] = [
  {
    eyebrow: 'TYPE FIRST',
    title: '类型安全',
    description: '完整的 TypeScript 类型贯穿地图创建、图层配置与交互流程。'
  },
  {
    eyebrow: 'COMPOSABLE',
    title: '模块化能力',
    description: '按需组合图层、绘制与测量模块，让业务能力保持清晰边界。'
  },
  {
    eyebrow: 'LEARN BY DOING',
    title: '可运行示例',
    description: '文档示例与真实组件同步，复制代码即可开始验证地图场景。'
  }
];

const coreModules: CoreModule[] = [
  {
    name: '01 / FOUNDATION',
    title: '创建 Earth',
    description: '创建具名地图实例，理解生命周期、服务访问与完整销毁。',
    to: '/components/core/earth'
  },
  {
    name: '02 / LAYER',
    title: '组织图层',
    description: '配置底图与业务图层，明确 Earth 托管和外部图层的所有权。',
    to: '/components/core/layers'
  },
  {
    name: '03 / ELEMENT',
    title: '添加 Element',
    description: '使用统一 Element 模型创建 Shape，并配置样式、查询和更新。',
    to: '/components/elements/overview'
  },
  {
    name: '04 / INTERACTION',
    title: '接入地图交互',
    description: '从 Draw 开始，继续组合 Edit、Measure 与 Transform。',
    to: '/components/interactions/draw'
  }
];
</script>

<template>
  <div class="home">
    <section class="home-hero">
      <div class="home-hero__inner">
        <div class="home-hero__copy">
          <p class="home-hero__eyebrow">OPENLAYERS CAPABILITY ENGINE</p>
          <h1 class="home-hero__title">
            <span class="home-hero__title-scope">@vrsim/</span>
            <span class="home-hero__title-name">earth-engine-ol</span>
          </h1>
          <p class="home-hero__desc">面向工程化地图应用的 OpenLayers + TypeScript 地图能力库。</p>
          <div class="home-hero__actions">
            <RouterLink v-for="action in heroActions" :key="action.to" :to="action.to" class="home-hero__action" :class="{ 'is-primary': action.primary }">
              {{ action.label }}
              <span aria-hidden="true">→</span>
            </RouterLink>
          </div>
        </div>

        <div class="home-workbench" aria-hidden="true">
          <div class="home-workbench__toolbar">
            <span></span>
            <span></span>
            <span></span>
            <strong>MAP WORKBENCH</strong>
          </div>
          <div class="home-workbench__stage">
            <svg class="home-workbench__map" viewBox="0 0 640 400" role="presentation">
              <path class="home-workbench__water" d="M-30 88 C120 35 164 142 282 105 S470 30 680 104 L680 -20 L-30 -20 Z" />
              <path class="home-workbench__area" d="M340 95 L535 135 L488 292 L302 248 Z" />
              <path class="home-workbench__route" d="M42 328 C132 252 177 317 248 226 S380 192 452 120 S555 94 610 42" />
              <g class="home-workbench__marker" transform="translate(248 226)">
                <path d="M0 -18 C-11 -18 -17 -10 -17 0 C-17 13 0 28 0 28 C0 28 17 13 17 0 C17 -10 11 -18 0 -18 Z" />
                <circle cy="-1" r="5" />
              </g>
              <g class="home-workbench__marker" transform="translate(452 120)">
                <path d="M0 -18 C-11 -18 -17 -10 -17 0 C-17 13 0 28 0 28 C0 28 17 13 17 0 C17 -10 11 -18 0 -18 Z" />
                <circle cy="-1" r="5" />
              </g>
            </svg>

            <div class="home-workbench__layers">
              <strong>图层</strong>
              <span v-for="layer in workbenchLayers" :key="layer.label"><i></i> {{ layer.label }}</span>
            </div>

            <div class="home-workbench__zoom">
              <span>+</span>
              <span>−</span>
            </div>
            <code class="home-workbench__coordinates">120.1536° E · 30.2875° N</code>
          </div>
        </div>
      </div>
    </section>

    <section class="home-capabilities" aria-labelledby="home-capabilities-title">
      <div class="home-section-heading">
        <p>WHY EARTH ENGINE OL</p>
        <h2 id="home-capabilities-title">从类型到交互，专注地图业务交付</h2>
      </div>
      <div class="home-capabilities__grid">
        <article v-for="capability in capabilityHighlights" :key="capability.title" class="home-capability-card">
          <span>{{ capability.eyebrow }}</span>
          <h3>{{ capability.title }}</h3>
          <p>{{ capability.description }}</p>
        </article>
      </div>
    </section>

    <section class="home-modules" aria-labelledby="home-modules-title">
      <div class="home-section-heading">
        <p>CORE MODULES</p>
        <h2 id="home-modules-title">沿着核心路径开始构建</h2>
      </div>
      <div class="home-modules__grid">
        <RouterLink v-for="module in coreModules" :key="module.to" :to="module.to" class="home-module-card">
          <span>{{ module.name }}</span>
          <h3>{{ module.title }}</h3>
          <p>{{ module.description }}</p>
          <strong>查看文档 →</strong>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
