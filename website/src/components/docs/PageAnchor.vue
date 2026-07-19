<script setup lang="ts">
import type { Ref } from 'vue';
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createStableHeadingId, normalizeTocLabel } from '../../utils/pageToc';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

interface FlatAnchorItem {
  id: string;
  label: string;
  depth: number;
}

const props = defineProps<{
  title?: string;
  items: AnchorItem[];
}>();

const route = useRoute();
const router = useRouter();
const scrollContainer = inject<Readonly<Ref<HTMLElement | null>>>('docsMainScrollContainer', ref(null));
const anchorRoot = ref<HTMLElement | null>(null);
const activeId = ref('');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = ref(motionQuery.matches);
const anchorDuration = computed(() => (reducedMotion.value ? 0 : 300));

let headingObserver: IntersectionObserver | undefined;
let contentObserver: MutationObserver | undefined;
let rescanFrame: number | undefined;

const flattenAnchors = (items: AnchorItem[], depth = 0): FlatAnchorItem[] =>
  items.flatMap((item) => [{ id: item.id, label: item.label, depth }, ...flattenAnchors(item.children ?? [], depth + 1)]);

const flatItems = computed(() => flattenAnchors(props.items));

const decodeHash = (hash: string): string => {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return hash.replace(/^#/, '');
  }
};

const getContentRoot = (): HTMLElement | null => anchorRoot.value?.closest('.doc-page-layout')?.querySelector<HTMLElement>('.doc-page') ?? null;

const scanHeadingTargets = (): Map<string, HTMLElement> => {
  const root = getContentRoot();
  const targets = new Map<string, HTMLElement>();
  if (!root) return targets;

  const usedIds = new Set(Array.from(root.querySelectorAll<HTMLElement>('[id]'), ({ id }) => id).filter(Boolean));
  const claimedIds = new Set<string>();

  for (const heading of root.querySelectorAll<HTMLHeadingElement>('h2, h3')) {
    const label = normalizeTocLabel(heading.textContent ?? '');
    if (!label) continue;

    let id = heading.id;
    if (id && claimedIds.has(id)) id = '';

    if (!id) {
      const ancestor = heading.parentElement?.closest<HTMLElement>('[id]');
      if (ancestor?.id && !claimedIds.has(ancestor.id)) {
        id = ancestor.id;
      } else {
        id = createStableHeadingId(label, usedIds);
        heading.id = id;
        heading.dataset.pageTocGenerated = 'true';
      }
    }

    claimedIds.add(id);
    targets.set(id, heading);
  }

  return targets;
};

const updateActiveHeading = (observedItems: Array<{ id: string; target: HTMLElement }>) => {
  if (observedItems.length === 0) return;

  const rootTop = scrollContainer.value?.getBoundingClientRect().top ?? 0;
  const activationLine = rootTop + 96;
  let current = observedItems[0];

  for (const item of observedItems) {
    if (item.target.getBoundingClientRect().top > activationLine) break;
    current = item;
  }

  activeId.value = current.id;
};

const observeHeadings = () => {
  headingObserver?.disconnect();
  headingObserver = undefined;

  const headingTargets = scanHeadingTargets();
  const observedItems = flatItems.value.flatMap((item) => {
    const target = headingTargets.get(item.id) ?? document.getElementById(item.id);
    return target ? [{ id: item.id, target }] : [];
  });

  if (observedItems.length === 0) return;
  const hashId = decodeHash(route.hash);
  activeId.value = observedItems.some(({ id }) => id === hashId) ? hashId : (observedItems[0]?.id ?? '');

  if (typeof IntersectionObserver === 'undefined') return;

  headingObserver = new IntersectionObserver(() => updateActiveHeading(observedItems), {
    root: scrollContainer.value,
    rootMargin: '-88px 0px -70% 0px',
    threshold: [0, 1]
  });
  observedItems.forEach(({ target }) => headingObserver?.observe(target));
  updateActiveHeading(observedItems);
};

const scheduleScan = () => {
  if (rescanFrame !== undefined) cancelAnimationFrame(rescanFrame);
  rescanFrame = requestAnimationFrame(() => {
    rescanFrame = undefined;
    observeHeadings();
  });
};

const disconnect = () => {
  headingObserver?.disconnect();
  contentObserver?.disconnect();
  headingObserver = undefined;
  contentObserver = undefined;
  if (rescanFrame !== undefined) cancelAnimationFrame(rescanFrame);
  rescanFrame = undefined;
};

const connect = async () => {
  disconnect();
  await nextTick();
  observeHeadings();

  const root = getContentRoot();
  if (root && typeof MutationObserver !== 'undefined') {
    contentObserver = new MutationObserver(scheduleScan);
    contentObserver.observe(root, { childList: true, subtree: true });
  }
};

const navigateTo = async (id: string) => {
  if (!id) return;

  activeId.value = id;
  if (decodeHash(route.hash) === id) {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion.value ? 'auto' : 'smooth', block: 'start' });
    return;
  }

  await router.replace({ path: route.path, query: route.query, hash: `#${id}` });
};

const onAnchorClick = (event: MouseEvent, href?: string) => {
  event.preventDefault();
  if (href) void navigateTo(decodeHash(href));
};

const onAnchorChange = (href: string) => {
  activeId.value = decodeHash(href);
};

const onMobileChange = (value: unknown) => {
  if (typeof value === 'string') void navigateTo(value);
};

const onMotionPreferenceChange = ({ matches }: MediaQueryListEvent) => {
  reducedMotion.value = matches;
};

watch(
  () => [scrollContainer.value, route.path, props.items] as const,
  () => void connect(),
  { immediate: true, deep: true, flush: 'post' }
);

watch(
  () => route.hash,
  (hash) => {
    const id = decodeHash(hash);
    if (flatItems.value.some((item) => item.id === id)) activeId.value = id;
  }
);

onMounted(() => motionQuery.addEventListener('change', onMotionPreferenceChange));

onBeforeUnmount(() => {
  motionQuery.removeEventListener('change', onMotionPreferenceChange);
  disconnect();
});
</script>

<template>
  <div ref="anchorRoot" class="page-anchor-shell">
    <div class="page-anchor__desktop">
      <el-affix class="page-anchor" :offset="80" target=".docs-main">
        <p v-if="title" class="page-anchor__title">{{ title }}</p>
        <el-scrollbar max-height="calc(100vh - 160px)">
          <el-anchor
            :container="scrollContainer"
            :offset="80"
            :bound="24"
            :duration="anchorDuration"
            direction="vertical"
            @change="onAnchorChange"
            @click="onAnchorClick"
          >
            <el-anchor-link
              v-for="item in flatItems"
              :key="item.id"
              :href="`#${item.id}`"
              :title="item.label"
              :class="[
                'page-anchor__item',
                { 'page-anchor__child': item.depth === 1, 'page-anchor__grandchild': item.depth >= 2, 'is-active': activeId === item.id }
              ]"
            />
          </el-anchor>
        </el-scrollbar>
      </el-affix>
    </div>

    <div class="page-anchor__mobile">
      <label class="page-anchor__mobile-label" for="page-anchor-select">本页目录</label>
      <el-select
        id="page-anchor-select"
        :model-value="activeId"
        class="page-anchor__mobile-select"
        popper-class="page-anchor-mobile-popper"
        fit-input-width
        aria-label="选择本页章节"
        placeholder="选择章节"
        @change="onMobileChange"
      >
        <el-option v-for="item in flatItems" :key="item.id" :label="item.label" :value="item.id">
          <span :class="{ 'page-anchor__option--nested': item.depth > 0 }">{{ item.label }}</span>
        </el-option>
      </el-select>
    </div>
  </div>
</template>

<style scoped>
.page-anchor-shell {
  min-width: 0;
}

.page-anchor__mobile {
  display: none;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--doc-border);
  border-radius: 10px;
  background: var(--doc-surface);
}

.page-anchor__mobile-label {
  flex: 0 0 auto;
  color: var(--doc-muted);
  font-size: 12px;
  font-weight: 700;
}

.page-anchor__mobile-select {
  min-width: 0;
  flex: 1;
}

.page-anchor__option--nested {
  display: block;
  padding-left: 14px;
}

:global(.page-anchor-mobile-popper) {
  max-width: calc(100vw - 32px);
}

:global(.page-anchor-mobile-popper .el-select-dropdown__item span) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .page-anchor__desktop {
    display: none;
  }

  .page-anchor__mobile {
    display: flex;
    width: 100%;
    max-width: 100%;
    align-items: center;
    gap: 12px;
  }
}

@media (max-width: 560px) {
  .page-anchor__mobile {
    align-items: stretch;
    flex-direction: column;
    gap: 8px;
  }

  .page-anchor__mobile-select {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-anchor__mobile {
    scroll-behavior: auto;
  }
}
</style>
