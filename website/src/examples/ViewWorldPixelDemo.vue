<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, Earth, Pixel } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const EARTH_ID = 'docs-core-view-world-pixel';
const PATH_ID = 'view-world-path';

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const zoom = ref<number | undefined>();
const centerPixel = ref<Pixel | null>(null);
const coordinate = ref<Coordinate | null>(null);
const worldWidth = ref<number | undefined>();
const worldIndex = ref<number | undefined>();
const cursor = ref('auto');
const detailsColumn = ref<1 | 2>(2);
let detailsMediaQuery: MediaQueryList | null = null;

const pixelLabel = computed(() => (centerPixel.value === null ? '—' : centerPixel.value.map((value) => value.toFixed(0)).join(', ')));
const coordinateLabel = computed(() => (coordinate.value === null ? '—' : coordinate.value.map((value) => value.toFixed(2)).join(', ')));

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

const viewportCenterPixel = (): Pixel | undefined => {
  const target = mapTarget.value;
  if (target === null) return undefined;
  return [target.clientWidth / 2, target.clientHeight / 2];
};

// #region view-world-pixel
const readPixelAndWorld = () => {
  const earth = earthRef.value;
  const pixel = viewportCenterPixel();
  if (earth === null || pixel === undefined) return;

  centerPixel.value = pixel;
  coordinate.value = earth.view.coordinateAtPixel(pixel) ?? null;
  zoom.value = earth.view.getZoom();
  worldWidth.value = earth.view.worldWidth();
  worldIndex.value = coordinate.value === null ? undefined : earth.view.worldIndex(coordinate.value[0]);
};

const movePathToViewportCenter = () => {
  const earth = earthRef.value;
  const pixel = viewportCenterPixel();
  const center = earth?.view.getCenter();
  if (earth === null || earth === undefined || pixel === undefined || center === undefined) return;

  const path: readonly Coordinate[] = [
    [center[0] - 22_000, center[1] - 8_000],
    [center[0], center[1] + 12_000],
    [center[0] + 22_000, center[1] - 8_000]
  ];
  const normalized = earth.view.normalizeToViewWorld(path);
  const index = earth.view.worldIndex(center[0]);
  const restored = earth.view.restoreToWorld(normalized, index);
  const translated = earth.view.translateCoordinatesToPixel(pixel, restored);
  if (translated !== undefined) earth.elements.update({ id: PATH_ID }, { geometry: { type: 'polyline', controlPoints: translated } });
  readPixelAndWorld();
};

const setPointerCursor = () => {
  cursor.value = cursor.value === 'pointer' ? 'auto' : 'pointer';
  earthRef.value?.view.setCursor(cursor.value);
};
// #endregion view-world-pixel

onMounted(() => {
  observeDetailsLayout();
  if (mapTarget.value === null) return;
  const earth = useEarth({ id: EARTH_ID, target: mapTarget.value, controls: { zoom: true, rotate: false, attribution: true } });
  createConfiguredLayer(earth, 'vector');
  const layer = earth.layers.add({ kind: 'vector', id: 'view-world-elements', zIndex: 20 });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.view.setCenter(center);
  earth.view.setZoom(9);
  earth.elements.add({
    id: PATH_ID,
    layerId: layer.id,
    geometry: { type: 'polyline', controlPoints: [center, [center[0] + 1, center[1] + 1]] },
    style: {
      strokes: [
        { color: '#ffffff', width: 8 },
        { color: '#409eff', width: 4 }
      ]
    }
  });
  earthRef.value = earth;
  movePathToViewportCenter();
});

onBeforeUnmount(() => {
  stopObservingDetailsLayout();
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="readPixelAndWorld">读取视口中心</el-button>
      <el-button @click="movePathToViewportCenter">把路径移到中心像素</el-button>
      <el-button :type="cursor === 'pointer' ? 'primary' : undefined" plain @click="setPointerCursor">切换 pointer 光标</el-button>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-descriptions class="view-world-demo__details" :column="detailsColumn" border>
      <el-descriptions-item label="中心像素">{{ pixelLabel }}</el-descriptions-item>
      <el-descriptions-item label="当前 zoom">{{ zoom ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="对应坐标">{{ coordinateLabel }}</el-descriptions-item>
      <el-descriptions-item label="世界副本索引">{{ worldIndex ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="世界宽度" :span="detailsColumn">{{ worldWidth?.toFixed(2) ?? '—' }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.view-world-demo__details {
  margin-top: 16px;
}

.view-world-demo__details :deep(.el-descriptions__content) {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
