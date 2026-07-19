<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const EARTH_ID = 'docs-core-control-service';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const graticuleEnabled = ref(false);
const scaleLineEnabled = ref(true);
const scaleUnits = ref<'metric' | 'imperial'>('metric');

// #region runtime-controls
const changeGraticule = (value: string | number | boolean) => {
  const enabled = Boolean(value);
  graticuleEnabled.value = enabled;
  const controls = earthRef.value?.controls;
  if (controls === undefined) return;

  if (enabled) controls.enableGraticule({ showLabels: true, targetSize: 120 });
  else controls.disableGraticule();
};

const changeScaleLine = (value: string | number | boolean) => {
  const enabled = Boolean(value);
  scaleLineEnabled.value = enabled;
  const controls = earthRef.value?.controls;
  if (controls === undefined) return;

  if (enabled) controls.enableScaleLine({ units: scaleUnits.value, bar: true, text: true, minWidth: 120 });
  else controls.disableScaleLine();
};

const changeScaleUnits = () => {
  if (!scaleLineEnabled.value) return;
  earthRef.value?.controls.enableScaleLine({ units: scaleUnits.value, bar: true, text: true, minWidth: 120 });
};
// #endregion runtime-controls

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 4 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earthRef.value = earth;
  earth.controls.enableScaleLine({ units: scaleUnits.value, bar: true, text: true, minWidth: 120 });
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="control-service-demo__settings">
      <div class="control-service-demo__setting">
        <span>经纬网</span>
        <el-switch v-model="graticuleEnabled" active-text="显示" inactive-text="隐藏" @change="changeGraticule" />
        <el-tag :type="graticuleEnabled ? 'success' : 'info'" effect="plain">
          {{ graticuleEnabled ? 'graticule 已创建' : 'graticule 未启用' }}
        </el-tag>
      </div>

      <div class="control-service-demo__setting">
        <span>比例尺</span>
        <el-switch v-model="scaleLineEnabled" active-text="显示" inactive-text="隐藏" @change="changeScaleLine" />
        <el-select v-model="scaleUnits" aria-label="比例尺单位" :disabled="!scaleLineEnabled" @change="changeScaleUnits">
          <el-option label="公制 metric" value="metric" />
          <el-option label="英制 imperial" value="imperial" />
        </el-select>
        <el-tag :type="scaleLineEnabled ? 'success' : 'info'" effect="plain">
          {{ scaleLineEnabled ? 'scaleLine 已创建' : 'scaleLine 未启用' }}
        </el-tag>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>
  </div>
</template>

<style scoped>
.control-service-demo__settings {
  display: grid;
  gap: 12px;
  margin-bottom: 14px;
}

.control-service-demo__setting {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.control-service-demo__setting > span:first-child {
  min-width: 48px;
  font-weight: 600;
}

.control-service-demo__setting :deep(.el-select) {
  width: 150px;
}
</style>
