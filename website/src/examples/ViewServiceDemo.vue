<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const EARTH_ID = 'docs-core-view-service';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const longitude = ref(116.4074);
const latitude = ref(39.9042);
const zoom = ref(8);
const projected = ref<readonly [number, number] | null>(null);
const geographic = ref<readonly [number, number] | null>(null);
const cursor = ref<'default' | 'crosshair'>('default');
const dragEnabled = ref(true);
const animationStatus = ref('等待操作');

const projectedLabel = computed(() => (projected.value === null ? '—' : `${projected.value[0].toFixed(2)}, ${projected.value[1].toFixed(2)}`));
const geographicLabel = computed(() => (geographic.value === null ? '—' : `${geographic.value[0].toFixed(5)}, ${geographic.value[1].toFixed(5)}`));

// #region view-navigation
const readCurrentCenter = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  const center = earth.view.getCenter();
  if (center === undefined) return;

  projected.value = [center[0], center[1]];
  const lonLat = earth.view.toGeographicCoordinates([center[0], center[1]]);
  geographic.value = [lonLat[0], lonLat[1]];
};

const targetCenter = (): readonly [number, number] | undefined => {
  const earth = earthRef.value;
  if (earth === null) return undefined;
  return earth.view.toProjectedCoordinates([longitude.value, latitude.value]);
};

const flyTo = () => {
  const earth = earthRef.value;
  const center = targetCenter();
  if (earth === null || center === undefined) return;

  earth.view.flyTo(center, zoom.value);
  animationStatus.value = '已立即定位';
  readCurrentCenter();
};

const animateFlyTo = () => {
  const earth = earthRef.value;
  const center = targetCenter();
  if (earth === null || center === undefined) return;

  animationStatus.value = '动画进行中';
  earth.view.animateFlyTo(center, {
    zoom: zoom.value,
    duration: 900,
    callback: (completed) => {
      animationStatus.value = completed ? '动画已完成' : '动画已取消';
      readCurrentCenter();
    }
  });
};

const flyHome = () => {
  const earth = earthRef.value;
  if (earth === null) return;

  animationStatus.value = '返回初始位置中';
  earth.view.flyHome({
    duration: 800,
    callback: (completed) => {
      animationStatus.value = completed ? '已返回初始位置' : '返回动画已取消';
      readCurrentCenter();
    }
  });
};

const useCrosshair = () => {
  earthRef.value?.view.useCrosshairCursor();
  cursor.value = 'crosshair';
};

const useDefaultCursor = () => {
  earthRef.value?.view.useDefaultCursor();
  cursor.value = 'default';
};

const changeDrag = (value: string | number | boolean) => {
  const enabled = Boolean(value);
  dragEnabled.value = enabled;
  earthRef.value?.view.setDragEnabled(enabled);
};
// #endregion view-navigation

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earthRef.value = earth;
  flyTo();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel">
      <el-form class="example-demo__control-grid view-service-demo__form" inline label-position="top">
        <el-form-item label="经度">
          <el-input-number v-model="longitude" :min="-180" :max="180" :step="0.1" :precision="4" />
        </el-form-item>
        <el-form-item label="纬度">
          <el-input-number v-model="latitude" :min="-85" :max="85" :step="0.1" :precision="4" />
        </el-form-item>
        <el-form-item label="缩放级别">
          <el-input-number v-model="zoom" :min="2" :max="18" :step="1" />
        </el-form-item>
      </el-form>

      <div class="example-demo__action-group">
        <div class="example-demo__action-buttons example-demo__actions">
          <el-button type="primary" @click="flyTo">立即定位</el-button>
          <el-button @click="animateFlyTo">动画定位</el-button>
          <el-button @click="flyHome">返回初始位置</el-button>
          <el-button :type="cursor === 'crosshair' ? 'primary' : undefined" plain @click="useCrosshair">十字光标</el-button>
          <el-button :type="cursor === 'default' ? 'primary' : undefined" plain @click="useDefaultCursor">默认光标</el-button>
          <el-switch v-model="dragEnabled" active-text="允许拖拽" inactive-text="禁止拖拽" @change="changeDrag" />
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-descriptions class="view-service-demo__details" :column="1" border>
      <el-descriptions-item label="当前投影坐标">{{ projectedLabel }}</el-descriptions-item>
      <el-descriptions-item label="转换后的经纬度">{{ geographicLabel }}</el-descriptions-item>
      <el-descriptions-item label="动画状态">{{ animationStatus }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.view-service-demo__form {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
}

.view-service-demo__details {
  margin-top: 16px;
}

@media (max-width: 640px) {
  .view-service-demo__form :deep(.el-form-item) {
    display: flex;
    margin-right: 0;
    width: 100%;
  }

  .view-service-demo__form :deep(.el-input-number) {
    width: 100%;
  }
}
</style>
