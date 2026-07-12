<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUp } from '@element-plus/icons-vue';

const props = defineProps<{
  scrollContainer: HTMLElement | null;
  scrollTop: number;
}>();

const visible = computed(() => props.scrollTop > 300);

const scrollToTop = () => {
  props.scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
};
</script>

<template>
  <Teleport to="body">
    <transition name="btt-fade">
      <button
        v-show="visible"
        class="back-to-top"
        title="回到顶部"
        @click="scrollToTop"
      >
        <el-icon :size="18"><ArrowUp /></el-icon>
      </button>
    </transition>
  </Teleport>
</template>
