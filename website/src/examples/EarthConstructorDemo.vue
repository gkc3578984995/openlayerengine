<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Earth } from '@vrsim/earth-engine-ol';
import type { EarthLifecycleState } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const lastLifecycle = ref<EarthLifecycleState | 'not-created'>('not-created');
const creationCount = ref(0);

const lifecycle = computed(() => earthRef.value?.lifecycle ?? lastLifecycle.value);

// #region earth-constructor
const createEarth = () => {
  if (mapTarget.value === null || earthRef.value !== null) return;

  const earth = new Earth({
    target: mapTarget.value,
    view: { zoom: 10 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');

  const elementLayer = earth.layers.add({ kind: 'vector', id: 'self-managed-elements', zIndex: 20 });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.elements.add({
    id: 'self-managed-marker',
    layerId: elementLayer.id,
    geometry: { type: 'point', controlPoints: [center] },
    style: {
      symbol: {
        type: 'circle',
        radius: 15,
        fill: { type: 'solid', color: '#409eff' },
        stroke: { color: '#ffffff', width: 4 }
      },
      text: {
        text: 'new Earth',
        offsetY: -30,
        fill: { type: 'solid', color: '#17233d' },
        backgroundFill: { type: 'solid', color: 'rgba(255,255,255,0.92)' },
        backgroundStroke: { color: '#409eff', width: 1 },
        padding: [5, 8, 5, 8]
      }
    }
  });
  earth.view.flyTo(center, 10);

  earthRef.value = earth;
  lastLifecycle.value = earth.lifecycle;
  creationCount.value += 1;
};

const destroyEarth = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.destroy();
  lastLifecycle.value = earth.lifecycle;
  earthRef.value = null;
};
// #endregion earth-constructor

onMounted(createEarth);
onBeforeUnmount(destroyEarth);
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel">
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons">
            <el-button type="primary" :disabled="earthRef !== null" @click="createEarth">创建自管实例</el-button>
            <el-button type="danger" plain :disabled="earthRef === null" @click="destroyEarth">销毁实例</el-button>
          </div>
        </div>
        <div class="example-demo__feedback" aria-live="polite">
          <el-tag :type="lifecycle === 'ready' ? 'success' : lifecycle === 'destroyed' ? 'warning' : 'info'">
            {{ lifecycle }}
          </el-tag>
          <el-tag effect="plain">已创建 {{ creationCount }} 次</el-tag>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-alert class="example-demo__alert earth-constructor-demo__alert" type="info" :closable="false" show-icon>
      <template #title>构造器实例完全由调用方管理</template>
      它不会进入 useEarth 注册表；组件卸载或业务结束时必须调用 destroy()。
    </el-alert>
  </div>
</template>

<style scoped>
.earth-constructor-demo__alert {
  margin-top: 16px;
}
</style>
