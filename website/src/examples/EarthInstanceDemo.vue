<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const EARTH_ID = 'docs-core-earth-instance';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const lastLifecycle = ref<Earth['lifecycle'] | 'not-created'>('not-created');
const reuseMatches = ref<boolean | null>(null);
const creationCount = ref(0);
const detailsColumn = ref<1 | 2>(2);
let detailsMediaQuery: MediaQueryList | null = null;

const lifecycle = computed(() => earthRef.value?.lifecycle ?? lastLifecycle.value);
const lifecycleTagType = computed(() => {
  if (lifecycle.value === 'ready') return 'success';
  if (lifecycle.value === 'destroyed') return 'warning';
  return 'info';
});

const syncDetailsColumn = () => {
  detailsColumn.value = detailsMediaQuery?.matches === true ? 1 : 2;
};

const observeDetailsLayout = () => {
  detailsMediaQuery = window.matchMedia('(max-width: 640px)');
  syncDetailsColumn();
  detailsMediaQuery.addEventListener('change', syncDetailsColumn);
};

const stopObservingDetailsLayout = () => {
  detailsMediaQuery?.removeEventListener('change', syncDetailsColumn);
  detailsMediaQuery = null;
};

// #region earth-registry-lifecycle
const createEarth = () => {
  if (mapTarget.value === null || earthRef.value !== null) return;

  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 5 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), 5);

  earthRef.value = earth;
  lastLifecycle.value = earth.lifecycle;
  reuseMatches.value = useEarth(EARTH_ID) === earth;
  creationCount.value += 1;
};

const verifyReuse = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  reuseMatches.value = useEarth(EARTH_ID) === earth;
};

const destroyEarth = () => {
  const earth = earthRef.value;
  if (earth === null) return;

  earth.destroy();
  lastLifecycle.value = earth.lifecycle;
  earthRef.value = null;
  reuseMatches.value = null;
};
// #endregion earth-registry-lifecycle

onMounted(() => {
  observeDetailsLayout();
  createEarth();
});

onBeforeUnmount(() => {
  stopObservingDetailsLayout();
  destroyEarth();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel">
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons">
            <el-button type="primary" :disabled="earthRef !== null" @click="createEarth">创建 / 重建实例</el-button>
            <el-button :disabled="earthRef === null" @click="verifyReuse">验证 useEarth 复用</el-button>
            <el-button type="danger" plain :disabled="earthRef === null" @click="destroyEarth">销毁实例</el-button>
          </div>
        </div>
        <div class="example-demo__feedback" aria-live="polite">
          <el-tag :type="lifecycleTagType">{{ lifecycle }}</el-tag>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-descriptions class="earth-instance-demo__details" :column="detailsColumn" border>
      <el-descriptions-item label="实例 ID">
        <el-tag effect="plain">{{ EARTH_ID }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="创建次数">{{ creationCount }}</el-descriptions-item>
      <el-descriptions-item label="生命周期">{{ lifecycle }}</el-descriptions-item>
      <el-descriptions-item label="同 ID 复用">
        <el-tag v-if="reuseMatches !== null" :type="reuseMatches ? 'success' : 'danger'">
          {{ reuseMatches ? '返回同一实例' : '实例不一致' }}
        </el-tag>
        <span v-else>销毁后等待重建</span>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.earth-instance-demo__details {
  margin-top: 16px;
}

.earth-instance-demo__details :deep(.el-descriptions__content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
