<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowUp } from '@element-plus/icons-vue';

const visible = ref(false);

const onScroll = () => {
  visible.value = window.scrollY > 300;
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
});
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