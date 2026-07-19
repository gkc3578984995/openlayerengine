<script setup lang="ts">
import type { ScrollbarInstance } from 'element-plus';
import { Moon, Sunny } from '@element-plus/icons-vue';
import { computed, nextTick, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BackToTop from '../components/BackToTop.vue';
import { apiNavItems, getTopNavIndex, topNavItems, type TopNavIndex } from '../config/navigation';
import { getTheme, toggleTheme, type Theme } from '../utils/theme';

const route = useRoute();
const router = useRouter();
const mainScrollbar = ref<ScrollbarInstance>();
const mainScrollTop = ref(0);
const theme = ref<Theme>(getTheme(window.localStorage));
const docVersion = __OL_DOC_VERSION__;

const isDark = computed(() => theme.value === 'dark');
const activeTopMenu = computed(() => getTopNavIndex(route.path));
const mainScrollContainer = computed(() => mainScrollbar.value?.wrapRef ?? null);

provide('docsMainScrollContainer', mainScrollContainer);

const onTopMenuSelect = (index: string) => {
  const target = topNavItems.find((item) => getTopNavIndex(item.to) === (index as TopNavIndex));
  if (target && route.path !== target.to) void router.push(target.to);
};

const onApiMenuSelect = (path: string) => {
  if (route.path !== path) void router.push(path);
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
</script>

<template>
  <div class="docs-shell api-query-shell">
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

    <div class="docs-body api-query-body">
      <aside class="docs-sidebar api-query-sidebar">
        <div class="api-query-sidebar__inner">
          <p class="docs-sidebar__title">API 查询</p>
          <el-menu class="api-query-menu" :default-active="route.path" @select="onApiMenuSelect">
            <el-menu-item v-for="item in apiNavItems" :key="item.to" :index="item.to">
              {{ item.label }}
            </el-menu-item>
          </el-menu>
        </div>
      </aside>

      <main class="docs-main api-query-main">
        <el-scrollbar ref="mainScrollbar" class="docs-main__scrollbar" @scroll="onMainScroll">
          <div class="docs-main__content api-query-main__content">
            <RouterView />
          </div>
        </el-scrollbar>
      </main>
    </div>

    <BackToTop :scroll-container="mainScrollContainer" :scroll-top="mainScrollTop" />
  </div>
</template>
