<script setup lang="ts">
import { ArrowRight, Guide, Box, FolderOpened } from '@element-plus/icons-vue';

const features = [
  {
    icon: Guide,
    bg: 'linear-gradient(135deg, #409eff 0%, #337ecc 100%)',
    title: '指南',
    description: '了解设计理念，帮助你快速上手地图引擎文档站的结构与约定。',
    to: '/'
  },
  {
    icon: Box,
    bg: 'linear-gradient(135deg, #67c23a 0%, #529b2e 100%)',
    title: '组件',
    description: '基于真实打包产物的交互式示例，提供可直接拷贝的代码与详细的 API 说明。',
    to: '/components/point-layer'
  },
  {
    icon: FolderOpened,
    bg: 'linear-gradient(135deg, #e6a23c 0%, #d48806 100%)',
    title: '资源',
    description: '下载 Sketch / Figma 设计资源，或获取引擎类型定义辅助 IDE 智能提示。',
    to: '/'
  }
];

const sponsors = {
  platinum: [
    {
      name: 'VRSIM 引擎团队',
      logo: null,
      description: '提供 earth-engine-ol 核心库与持续迭代',
      tag: 'CORE'
    },
    {
      name: 'OpenLayers',
      logo: null,
      description: '底层地图渲染与投影变换基础设施',
      tag: 'FOUNDATION'
    }
  ]
};
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <section class="home-hero">
      <div class="home-hero__inner">
        <h1 class="home-hero__title">ol-doc</h1>
        <p class="home-hero__desc">
          基于 Vue 3 + TypeScript + Element Plus，面向地图业务的引擎文档站原型。
        </p>
        <div class="home-hero__actions">
          <el-button type="primary" size="large" round @click="$router.push('/components/point-layer')">
            快速开始
            <el-icon class="el-icon--right"><ArrowRight /></el-icon>
          </el-button>
          <el-button size="large" round>设计资源</el-button>
        </div>
      </div>
    </section>

    <!-- Sponsors -->
    <section class="home-sponsors">
      <div class="home-sponsors__inner">
        <h2 class="home-section-title">赞助商</h2>
        <div class="home-sponsors__tier">
          <div
            v-for="s in sponsors.platinum"
            :key="s.name"
            class="home-sponsor-card home-sponsor-card--platinum"
          >
            <span class="home-sponsor-card__tag">{{ s.tag }}</span>
            <h3>{{ s.name }}</h3>
            <p>{{ s.description }}</p>
          </div>
        </div>
        <div class="home-sponsors__cta">
          <el-link type="primary" :underline="false">成为赞助商！</el-link>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="home-features">
      <div class="home-features__grid">
        <RouterLink
          v-for="f in features"
          :key="f.title"
          :to="f.to"
          class="home-feature-card"
        >
          <div class="home-feature-card__icon" :style="{ background: f.bg }">
            <el-icon :size="24" color="#fff"><component :is="f.icon" /></el-icon>
          </div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.description }}</p>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
