<script setup lang="ts">
import type { ScrollbarInstance } from 'element-plus';
import { Moon, Sunny } from '@element-plus/icons-vue';
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTopNavIndex, sideGroups, topNavItems, type TopNavIndex } from '../config/navigation';
import BackToTop from '../components/BackToTop.vue';
import { getTheme, toggleTheme, type Theme } from '../utils/theme';

const route = useRoute();
const router = useRouter();
const mainScrollbar = ref<ScrollbarInstance>();
const mainScrollTop = ref(0);
const theme = ref<Theme>(getTheme(window.localStorage));
const docVersion = __OL_DOC_VERSION__;

const isDark = computed(() => theme.value === 'dark');

const mainScrollContainer = computed(() => mainScrollbar.value?.wrapRef ?? null);

provide('docsMainScrollContainer', mainScrollContainer);

const isHome = computed(() => route.path === '/');

const activeTopMenu = computed(() => getTopNavIndex(route.path));

const isParentActive = (item: { to: string }) => route.path === item.to || route.path.startsWith(`${item.to}/`);

const onTopMenuSelect = (index: string) => {
  const target = topNavItems.find((item) => getTopNavIndex(item.to) === (index as TopNavIndex));
  if (target && route.path !== target.to) void router.push(target.to);
};

const onMainScroll = ({ scrollTop }: { scrollTop: number }) => {
  mainScrollTop.value = scrollTop;
};

const switchTheme = () => {
  theme.value = toggleTheme(theme.value, window.localStorage, document.documentElement);
};

const scrollToRoutePosition = async () => {
  await nextTick();

  if (route.hash) {
    const target = document.getElementById(decodeURIComponent(route.hash.slice(1)));
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  mainScrollContainer.value?.scrollTo({ top: 0, behavior: 'auto' });
};

watch(
  () => route.fullPath,
  () => void scrollToRoutePosition(),
  { flush: 'post' }
);

onMounted(() => void scrollToRoutePosition());

const pageTitle = computed(() => {
  if (route.path === '/guide/earth-create') {
    return '地图创建与销毁';
  }
  if (route.path === '/guide/global-methods') {
    return 'Earth 实例方法';
  }
  if (route.path === '/components/layer-common') {
    return '图层通用操作';
  }
  if (route.path === '/components/point-layer') {
    return 'PointLayer 点图层';
  }
  const globalEventTitles: Record<string, string> = {
    '/components/global-event': 'GlobalEvent 概览与初始化',
    '/components/global-event/global-mouse': 'GlobalEvent 全局鼠标事件',
    '/components/global-event/module-events': 'GlobalEvent 模块鼠标事件',
    '/components/global-event/keyboard': 'GlobalEvent 全局键盘事件'
  };
  if (globalEventTitles[route.path]) return globalEventTitles[route.path];
  const contextMenuTitles: Record<string, string> = {
    '/components/context-menu': 'ContextMenu 概览与初始化',
    '/components/context-menu/default-menu': 'ContextMenu 全局菜单',
    '/components/context-menu/module-menu': 'ContextMenu 模块菜单',
    '/components/context-menu/cascade-menu': 'ContextMenu 级联菜单',
    '/components/context-menu/menu-state': 'ContextMenu 菜单状态',
    '/components/context-menu/cleanup': 'ContextMenu 菜单移除与清理'
  };
  if (contextMenuTitles[route.path]) return contextMenuTitles[route.path];
  const measureTitles: Record<string, string> = {
    '/components/measure': 'Measure 概览',
    '/components/measure/distance': 'Measure 量距离',
    '/components/measure/area': 'Measure 量面积',
    '/components/measure/remove': 'Measure 移除测量'
  };
  if (measureTitles[route.path]) return measureTitles[route.path];
  const dynamicDrawTitles: Record<string, string> = {
    '/components/dynamic-draw': 'DynamicDraw 概览与接入',
    '/components/dynamic-draw/basic-geometry': 'DynamicDraw 基础几何绘制',
    '/components/dynamic-draw/advanced-geometry': 'DynamicDraw 高级几何绘制',
    '/components/dynamic-draw/editing': 'DynamicDraw 几何编辑',
    '/components/dynamic-draw/management': 'DynamicDraw 图形管理'
  };
  if (dynamicDrawTitles[route.path]) return dynamicDrawTitles[route.path];
  if (route.path === '/guide/quick-start') {
    return '安装与引入';
  }
  return '';
});
</script>

<template>
  <div class="docs-shell">
    <header class="docs-header">
      <div class="docs-header__inner">
        <RouterLink class="docs-header__logo" to="/" :aria-label="`OL-DOC v${docVersion}`">
          <span class="docs-header__logo-text">OL-DOC</span>
          <span class="docs-header__version">v{{ docVersion }}</span>
        </RouterLink>
        <div class="docs-header__spacer" />
        <el-menu class="docs-header__nav" mode="horizontal" :ellipsis="false" :default-active="activeTopMenu" @select="onTopMenuSelect">
          <el-menu-item v-for="item in topNavItems" :key="item.to" :index="getTopNavIndex(item.to)">
            {{ item.label }}
          </el-menu-item>
        </el-menu>
        <button
          class="docs-header__theme"
          type="button"
          :aria-label="isDark ? '切换为浅色主题' : '切换为深色主题'"
          :title="isDark ? '切换为浅色主题' : '切换为深色主题'"
          @click="switchTheme"
        >
          <el-icon :size="20"><Sunny v-if="isDark" /><Moon v-else /></el-icon>
        </button>
        <a class="docs-header__gh" href="https://github.com" target="_blank" rel="noopener" title="GitHub">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
    </header>

    <div class="docs-body" :class="{ 'docs-body--home': isHome }">
      <aside v-if="!isHome" class="docs-sidebar">
        <el-scrollbar class="docs-sidebar__scrollbar">
          <div class="docs-sidebar__inner">
            <div v-for="group in sideGroups" :key="group.title" class="docs-sidebar__group">
              <p class="docs-sidebar__title">{{ group.title }}</p>
              <div v-for="item in group.items" :key="item.to + item.label" class="docs-sidebar__item">
                <RouterLink class="docs-sidebar__link" :class="{ 'is-active': isParentActive(item) }" :to="item.to">
                  {{ item.label }}
                </RouterLink>
                <div v-if="item.children" class="docs-sidebar__children">
                  <RouterLink
                    v-for="child in item.children"
                    :key="child.to + child.label"
                    class="docs-sidebar__child-link"
                    :class="{ 'is-active': route.path === child.to }"
                    :to="child.to"
                  >
                    {{ child.label }}
                  </RouterLink>
                </div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </aside>

      <main class="docs-main" :class="{ 'docs-main--full': isHome }">
        <el-scrollbar ref="mainScrollbar" class="docs-main__scrollbar" @scroll="onMainScroll">
          <div class="docs-main__content">
            <div v-if="pageTitle" class="docs-main__page-title">{{ pageTitle }}</div>
            <RouterView />
          </div>

          <footer v-if="isHome" class="docs-footer">
            <div class="docs-footer__inner">
              <div class="docs-footer__col">
                <h4>链接</h4>
                <a href="https://openlayers.org/" target="_blank" rel="noopener">OpenLayers</a>
                <a href="https://element-plus.org/zh-CN/" target="_blank" rel="noopener">Element Plus</a>
              </div>
              <div class="docs-footer__col">
                <h4>社区</h4>
                <a href="https://github.com" target="_blank" rel="noopener">GitHub</a>
                <RouterLink to="/">反馈建议</RouterLink>
              </div>
              <div class="docs-footer__col docs-footer__col--license">
                <p>Released under the MIT License.</p>
                <p>Made with ❤️ by ol-doc</p>
              </div>
            </div>
          </footer>
        </el-scrollbar>
      </main>
    </div>

    <BackToTop :scroll-container="mainScrollContainer" :scroll-top="mainScrollTop" />
  </div>
</template>
