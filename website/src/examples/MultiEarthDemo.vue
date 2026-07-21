<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

interface MapSlot {
  readonly key: 'left' | 'right';
  readonly id: string;
  readonly label: string;
  readonly city: string;
  readonly geographicCenter: readonly [number, number];
  readonly color: string;
}

const instanceSuffix = useId().replace(/[^a-zA-Z0-9_-]/gu, '');
const slots = [
  {
    key: 'left',
    id: `docs-multi-earth-${instanceSuffix}-left`,
    label: '规划地图',
    city: '北京',
    geographicCenter: [116.4074, 39.9042],
    color: '#409eff'
  },
  {
    key: 'right',
    id: `docs-multi-earth-${instanceSuffix}-right`,
    label: '监控地图',
    city: '上海',
    geographicCenter: [121.4737, 31.2304],
    color: '#f56c6c'
  }
] as const satisfies readonly MapSlot[];

const leftTarget = ref<HTMLDivElement | null>(null);
const rightTarget = ref<HTMLDivElement | null>(null);
const leftEarth = shallowRef<Earth | null>(null);
const rightEarth = shallowRef<Earth | null>(null);
const leftCenter = shallowRef<Coordinate | null>(null);
const rightCenter = shallowRef<Coordinate | null>(null);
const verification = ref('等待创建命名实例');

const earthByKey = (key: MapSlot['key']) => (key === 'left' ? leftEarth.value : rightEarth.value);
const setEarth = (key: MapSlot['key'], earth: Earth | null, center: Coordinate | null) => {
  if (key === 'left') {
    leftEarth.value = earth;
    leftCenter.value = center;
  } else {
    rightEarth.value = earth;
    rightCenter.value = center;
  }
};

const targetByKey = (key: MapSlot['key']) => (key === 'left' ? leftTarget.value : rightTarget.value);

const stateLabel = computed(() => ({
  left: leftEarth.value?.lifecycle ?? 'destroyed',
  right: rightEarth.value?.lifecycle ?? 'destroyed'
}));

const addSlotContent = (earth: Earth, slot: MapSlot, center: Coordinate) => {
  createConfiguredLayer(earth, slot.key === 'left' ? 'vector' : 'satellite');
  const layer = earth.layers.add({ kind: 'vector', id: `${slot.id}-elements`, zIndex: 20 });
  earth.elements.add({
    id: `${slot.id}-marker`,
    module: `${slot.key}-map`,
    layerId: layer.id,
    geometry: slot.key === 'left' ? { type: 'point', controlPoints: [center] } : { type: 'circle', center, radius: 32_000 },
    style:
      slot.key === 'left'
        ? {
            symbol: { type: 'circle', radius: 13, fill: { type: 'solid', color: slot.color }, stroke: { color: '#ffffff', width: 4 } },
            text: {
              text: `${slot.label} · ${slot.city}`,
              fontSize: 14,
              fontWeight: 'bold',
              offsetY: 34,
              fill: { type: 'solid', color: '#1f2937' },
              stroke: { color: '#ffffff', width: 3 }
            }
          }
        : {
            fill: { type: 'pattern', pattern: 'diagonal', color: slot.color, backgroundColor: 'rgba(255,255,255,0.32)', size: 16, lineWidth: 3 },
            strokes: [{ color: slot.color, width: 4 }],
            text: {
              text: `${slot.label} · ${slot.city}`,
              fontSize: 14,
              fontWeight: 'bold',
              fill: { type: 'solid', color: '#7f1d1d' },
              stroke: { color: '#ffffff', width: 3 }
            }
          }
  });
  earth.view.flyTo(center, slot.key === 'left' ? 8 : 7.5);
};

// #region multi-earth-create
const createMap = (slot: MapSlot) => {
  if (earthByKey(slot.key) !== null) return;
  const target = targetByKey(slot.key);
  if (target === null) return;

  const earth = useEarth({
    id: slot.id,
    target,
    view: { zoom: 7 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  const center = earth.view.toProjectedCoordinates(slot.geographicCenter);
  addSlotContent(earth, slot, center);
  setEarth(slot.key, earth, center);
};

const createMaps = () => {
  for (const slot of slots) createMap(slot);
  verifyIsolation();
};
// #endregion multi-earth-create

const destroyMap = (slot: MapSlot) => {
  earthByKey(slot.key)?.destroy();
  setEarth(slot.key, null, null);
  verification.value = `${slot.label}已销毁；另一张地图保持当前生命周期`;
};

// #region multi-earth-isolation
const verifyIsolation = () => {
  const left = leftEarth.value;
  const right = rightEarth.value;
  if (left === null || right === null) {
    verification.value = '请先创建两张地图后再验证';
    return;
  }
  const registryMatches = useEarth(slots[0].id) === left && useEarth(slots[1].id) === right;
  const distinctServices = left.elements !== right.elements && left.view !== right.view && left.contextMenu !== right.contextMenu;
  verification.value = registryMatches && distinctServices ? '两个命名键各自复用正确实例，服务与资源完全隔离' : '隔离验证失败';
};
// #endregion multi-earth-isolation

const focusMap = (slot: MapSlot) => {
  const earth = earthByKey(slot.key);
  const center = slot.key === 'left' ? leftCenter.value : rightCenter.value;
  if (earth === null || center === null) return;
  earth.view.animateFlyTo(center, { zoom: slot.key === 'left' ? 8 : 7.5, duration: 450 });
};

const focus = () => {
  for (const slot of slots) focusMap(slot);
};

const reset = () => {
  for (const slot of slots) destroyMap(slot);
  createMaps();
  focus();
};

defineExpose({ reset, focus });

onMounted(createMaps);

onBeforeUnmount(() => {
  for (const slot of slots) destroyMap(slot);
});
</script>

<template>
  <div class="example-demo multi-earth-demo">
    <el-alert
      class="example-demo__alert"
      type="info"
      :closable="false"
      show-icon
      title="两张地图使用不同命名键、底图、View、Layer、Element 与服务实例；销毁其中一张不会影响另一张。"
    />

    <div class="example-demo__control-panel">
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons">
            <el-button type="primary" @click="createMaps">创建 / 重建缺失地图</el-button>
            <el-button @click="verifyIsolation">验证命名实例隔离</el-button>
            <el-button @click="focus">同时定位</el-button>
          </div>
        </div>
        <div class="example-demo__feedback" aria-live="polite">
          <el-tag :type="leftEarth && rightEarth ? 'success' : 'warning'">{{ leftEarth && rightEarth ? '两张地图均 ready' : '存在已销毁地图' }}</el-tag>
        </div>
      </div>
    </div>

    <div class="multi-earth-demo__grid">
      <section class="multi-earth-demo__panel">
        <div class="multi-earth-demo__heading">
          <div class="multi-earth-demo__heading-meta">
            <strong>{{ slots[0].label }}</strong>
            <span
              ><code>{{ slots[0].id }}</code> · {{ stateLabel.left }}</span
            >
          </div>
          <div class="multi-earth-demo__heading-actions">
            <el-button size="small" :disabled="leftEarth === null" @click="focusMap(slots[0])">定位北京</el-button>
            <el-button size="small" type="danger" plain :disabled="leftEarth === null" @click="destroyMap(slots[0])">只销毁左图</el-button>
          </div>
        </div>
        <div ref="leftTarget" class="example-stage multi-earth-demo__stage"></div>
      </section>

      <section class="multi-earth-demo__panel">
        <div class="multi-earth-demo__heading">
          <div class="multi-earth-demo__heading-meta">
            <strong>{{ slots[1].label }}</strong>
            <span
              ><code>{{ slots[1].id }}</code> · {{ stateLabel.right }}</span
            >
          </div>
          <div class="multi-earth-demo__heading-actions">
            <el-button size="small" :disabled="rightEarth === null" @click="focusMap(slots[1])">定位上海</el-button>
            <el-button size="small" type="danger" plain :disabled="rightEarth === null" @click="destroyMap(slots[1])">只销毁右图</el-button>
          </div>
        </div>
        <div ref="rightTarget" class="example-stage multi-earth-demo__stage"></div>
      </section>
    </div>

    <el-result class="multi-earth-demo__result" icon="success" title="隔离验证" :sub-title="verification" />
  </div>
</template>

<style scoped>
.multi-earth-demo__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.multi-earth-demo__panel {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--doc-border);
  border-radius: 12px;
  background: var(--doc-surface);
}

.multi-earth-demo__heading {
  display: flex;
  min-height: 76px;
  padding: 12px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--doc-border);
}

.multi-earth-demo__heading > div {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.multi-earth-demo__heading-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.multi-earth-demo__heading span {
  color: var(--doc-muted);
  font-size: 12px;
}

.multi-earth-demo__stage {
  height: 390px;
  border: 0;
  border-radius: 0;
}

.multi-earth-demo__result {
  padding: 18px 0 0;
}

.multi-earth-demo__result :deep(.el-result__icon) {
  display: none;
}

.multi-earth-demo__result :deep(.el-result__title) {
  margin-top: 0;
}

@media (max-width: 1180px) {
  .multi-earth-demo__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .multi-earth-demo__heading {
    align-items: stretch;
    flex-direction: column;
  }

  .multi-earth-demo__stage {
    height: 340px;
  }
}
</style>
