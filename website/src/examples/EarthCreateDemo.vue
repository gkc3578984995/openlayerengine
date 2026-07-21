<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const lastStatus = ref<Earth['lifecycle'] | 'not-created'>('not-created');
const status = computed(() => earthRef.value?.lifecycle ?? lastStatus.value);

// #region first-map
const createMap = () => {
  if (mapTarget.value === null || earthRef.value !== null) return;

  const earth = useEarth({
    target: mapTarget.value,
    view: { zoom: 5 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  const beijing = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.view.flyTo(beijing, 5);
  earthRef.value = earth;
  lastStatus.value = earth.lifecycle;
};

const destroyMap = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.destroy();
  lastStatus.value = earth.lifecycle;
  earthRef.value = null;
};
// #endregion first-map

onMounted(createMap);
onBeforeUnmount(destroyMap);
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel">
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons">
            <el-button type="primary" :disabled="earthRef !== null" @click="createMap">创建地图</el-button>
            <el-button type="danger" plain :disabled="earthRef === null" @click="destroyMap">销毁地图</el-button>
          </div>
        </div>
        <div class="example-demo__feedback" aria-live="polite">
          <el-tag :type="status === 'ready' ? 'success' : status === 'destroyed' ? 'warning' : 'info'">{{ status }}</el-tag>
        </div>
      </div>
    </div>
    <div ref="mapTarget" class="example-stage"></div>
  </div>
</template>
