<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { sideGroups, topNavItems } from '../config/navigation';
import BackToTop from '../components/BackToTop.vue';

const route = useRoute();

const isHome = computed(() => route.path === '/');
const expandedItems = ref(new Set<string>());

watch(
  () => route.path,
  (path) => {
    if (path === '/components/global-event' || path.startsWith('/components/global-event/')) {
      expandedItems.value.add('/components/global-event');
    }
  },
  { immediate: true }
);

const toggleItem = (to: string) => {
  const next = new Set(expandedItems.value);
  if (next.has(to)) next.delete(to);
  else next.add(to);
  expandedItems.value = next;
};

const isParentActive = (item: { to: string }) => route.path === item.to || route.path.startsWith(`${item.to}/`);

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
    '/components/global-event/module-events': 'GlobalEvent 模块要素事件',
    '/components/global-event/keyboard': 'GlobalEvent 键盘事件',
    '/components/global-event/listener-control': 'GlobalEvent 监听控制'
  };
  if (globalEventTitles[route.path]) return globalEventTitles[route.path];
  if (route.path === '/components/context-menu') {
    return 'ContextMenu 右键菜单';
  }
  if (route.path === '/components/dynamic-draw') {
    return 'DynamicDraw 动态绘制';
  }
  if (route.path === '/components/measure') {
    return 'Measure 测量工具';
  }
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
        <RouterLink class="docs-header__logo" to="/">
          <span class="docs-header__logo-text">ol-doc</span>
        </RouterLink>
        <div class="docs-header__spacer" />
        <nav class="docs-header__nav">
          <RouterLink
            v-for="item in topNavItems"
            :key="item.to"
            class="docs-header__nav-item"
            :class="{ 'is-active': route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to)) }"
            :to="item.to"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
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
        <div class="docs-sidebar__inner">
          <div v-for="group in sideGroups" :key="group.title" class="docs-sidebar__group">
            <p class="docs-sidebar__title">{{ group.title }}</p>
            <div v-for="item in group.items" :key="item.to + item.label" class="docs-sidebar__item">
              <div class="docs-sidebar__item-row">
                <RouterLink class="docs-sidebar__link" :class="{ 'is-active': isParentActive(item) }" :to="item.to">
                  {{ item.label }}
                </RouterLink>
                <button
                  v-if="item.children"
                  class="docs-sidebar__toggle"
                  type="button"
                  :aria-expanded="expandedItems.has(item.to)"
                  :aria-label="`${expandedItems.has(item.to) ? '收起' : '展开'}${item.label}`"
                  @click="toggleItem(item.to)"
                >
                  <span aria-hidden="true">{{ expandedItems.has(item.to) ? '−' : '+' }}</span>
                </button>
              </div>
              <div v-if="item.children && expandedItems.has(item.to)" class="docs-sidebar__children">
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
      </aside>

      <main class="docs-main" :class="{ 'docs-main--full': isHome }">
        <div v-if="pageTitle" class="docs-main__page-title">{{ pageTitle }}</div>
        <RouterView />
      </main>
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

    <BackToTop />
  </div>
</template>
