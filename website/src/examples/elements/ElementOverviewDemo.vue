<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, Element, ElementState, StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-elements-overview';
const ELEMENT_LAYER_ID = 'elements-overview-preview';
const FOCUS_ZOOM = 10;

interface StationData {
  name: string;
  category: 'station';
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const stationRef = shallowRef<Element<StationData> | null>(null);
const stationState = shallowRef<Readonly<ElementState<StationData>> | null>(null);
const stationPositions = shallowRef<readonly Coordinate[]>([]);
const positionIndex = ref(0);
const positionLabel = computed(() => (positionIndex.value === 0 ? '中心位置' : '东侧位置'));
const statusLabel = computed(() => {
  if (stationState.value === null) return '未创建';
  return `${positionLabel.value} · ${stationState.value.visible ? '已显示' : '已隐藏'}`;
});
const statusType = computed(() => (stationState.value === null ? 'info' : stationState.value.visible ? 'success' : 'warning'));

const createStationStyle = (location: string): StyleSpec => ({
  symbol: {
    type: 'circle',
    radius: 16,
    fill: { type: 'solid', color: '#409eff' },
    stroke: { color: '#ffffff', width: 4 }
  },
  text: {
    text: `中心站 · ${location}`,
    fontSize: 14,
    fontWeight: 'bold',
    offsetY: 38,
    padding: [5, 8, 5, 8],
    fill: { type: 'solid', color: '#1f2937' },
    stroke: { color: '#ffffff', width: 3 },
    backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.88)' },
    backgroundStroke: { color: 'rgba(255, 255, 255, 0.98)', width: 2 }
  }
});

const focusStation = () => {
  const earth = earthRef.value;
  const position = stationPositions.value[positionIndex.value];
  if (earth === null || position === undefined) return;
  earth.view.animateFlyTo(position, { zoom: FOCUS_ZOOM, duration: 450 });
};

const createStation = () => {
  const earth = earthRef.value;
  const center = stationPositions.value[0];
  if (earth === null || center === undefined || stationRef.value !== null) return;

  // #region element-quick-start
  const station = earth.elements.add<StationData>({
    id: 'quick-start-station',
    module: 'facilities',
    layerId: ELEMENT_LAYER_ID,
    data: { name: '中心站', category: 'station' },
    geometry: {
      type: 'point',
      controlPoints: [center]
    },
    style: createStationStyle('中心位置')
  });
  // #endregion element-quick-start

  stationRef.value = station;
  stationState.value = station.state;
  positionIndex.value = 0;
  focusStation();
};

const moveStation = (nextPositionIndex: 0 | 1) => {
  const station = stationRef.value;
  if (station === null) return;
  positionIndex.value = nextPositionIndex;
  station.update({
    geometry: {
      type: 'point',
      controlPoints: [stationPositions.value[positionIndex.value]!]
    },
    style: createStationStyle(positionLabel.value)
  });
  stationState.value = station.state;
  focusStation();
};

const toggleStation = () => {
  const station = stationRef.value;
  if (station === null) return;
  station.update({ visible: !station.state.visible });
  stationState.value = station.state;
  focusStation();
};

const removeStation = () => {
  stationRef.value?.remove();
  stationRef.value = null;
  stationState.value = null;
  positionIndex.value = 0;
  const center = stationPositions.value[0];
  if (center !== undefined) earthRef.value?.view.animateFlyTo(center, { zoom: FOCUS_ZOOM, duration: 450 });
};

const reset = () => {
  const center = stationPositions.value[0];
  if (center === undefined) return;
  if (stationRef.value === null) {
    createStation();
    return;
  }

  positionIndex.value = 0;
  stationRef.value.update({
    visible: true,
    geometry: { type: 'point', controlPoints: [center] },
    style: createStationStyle('中心位置')
  });
  stationState.value = stationRef.value.state;
  focusStation();
};

const focusSelected = () => {
  focusStation();
};

defineExpose({ reset, focusSelected });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: FOCUS_ZOOM },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector').update({ opacity: 0.5 });
  earth.layers.add({ kind: 'vector', id: ELEMENT_LAYER_ID, zIndex: 30, declutter: true });

  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  stationPositions.value = [center, [center[0] + 12_000, center[1] + 4_000]];
  earthRef.value = earth;
  earth.view.flyTo(center, FOCUS_ZOOM);
  createStation();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  stationRef.value = null;
  stationState.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel element-overview-demo__toolbar">
      <div class="example-demo__action-row">
        <div class="example-demo__action-group">
          <div class="example-demo__action-buttons">
            <el-button v-if="stationState === null" type="primary" @click="createStation">创建 Element</el-button>
            <template v-else>
              <el-button type="primary" :disabled="positionIndex === 1" @click="moveStation(1)">移动到东侧</el-button>
              <el-button :disabled="positionIndex === 0" @click="moveStation(0)">移回中心</el-button>
              <el-button @click="toggleStation">{{ stationState.visible ? '隐藏' : '显示' }}</el-button>
              <el-button type="danger" plain @click="removeStation">删除</el-button>
            </template>
          </div>
        </div>
        <div class="example-demo__feedback" aria-live="polite">
          <el-tag :type="statusType" effect="plain">quick-start-station · {{ statusLabel }}</el-tag>
        </div>
      </div>
    </div>

    <div class="element-overview-demo__stage">
      <div ref="mapTarget" class="example-stage"></div>
      <el-tag class="element-overview-demo__map-status" :type="statusType" effect="dark">中心站 · {{ statusLabel }}</el-tag>
    </div>
  </div>
</template>

<style scoped>
.element-overview-demo__toolbar {
  align-items: center;
}

.element-overview-demo__stage {
  position: relative;
}

.element-overview-demo__map-status {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  pointer-events: none;
}
</style>
