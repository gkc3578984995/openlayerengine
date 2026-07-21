<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, Layer, LayerKind } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const EARTH_ID = 'docs-core-layer-service';
const BUSINESS_LAYER_ID = 'business-layer';
const BUSINESS_ELEMENT_ID = 'business-marker';

interface LayerRow {
  id: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;
  zIndex: number | undefined;
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const businessLayer = shallowRef<Layer | null>(null);
const opacity = ref(0.75);
const rows = ref<LayerRow[]>([]);
const queryLabel = ref('全部图层');
const operationResult = ref('等待操作');

const businessState = computed(() => rows.value.find(({ id }) => id === BUSINESS_LAYER_ID));

// #region layer-lifecycle
const refreshLayers = (kind?: LayerKind) => {
  const earth = earthRef.value;
  if (earth === null) return;

  rows.value = earth.layers.query(kind).map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    visible: layer.visible,
    opacity: layer.opacity,
    zIndex: layer.zIndex
  }));
  queryLabel.value = kind === undefined ? '全部图层' : `${kind} 图层`;
};

const addBusinessLayer = () => {
  const earth = earthRef.value;
  if (earth === null || earth.layers.get(BUSINESS_LAYER_ID) !== undefined) return;

  const layer = earth.layers.add({
    kind: 'vector',
    id: BUSINESS_LAYER_ID,
    opacity: opacity.value,
    zIndex: 20
  });
  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  earth.elements.add({
    id: BUSINESS_ELEMENT_ID,
    layerId: layer.id,
    geometry: { type: 'point', controlPoints: [center] },
    style: {
      symbol: {
        type: 'circle',
        radius: 10,
        fill: { type: 'solid', color: '#409eff' },
        stroke: { color: '#ffffff', width: 3 }
      }
    }
  });

  businessLayer.value = layer;
  operationResult.value = `已新增 ${layer.id}`;
  refreshLayers();
};
// #endregion layer-lifecycle

const updateOpacity = (value: number | number[]) => {
  const nextOpacity = Array.isArray(value) ? (value[0] ?? opacity.value) : value;
  opacity.value = nextOpacity;
  businessLayer.value?.update({ opacity: nextOpacity });
  operationResult.value = `已通过 update() 设置透明度 ${nextOpacity.toFixed(2)}`;
  refreshLayers();
};

const showBusinessLayer = () => {
  businessLayer.value?.show();
  operationResult.value = '已调用 show()';
  refreshLayers();
};

const hideBusinessLayer = () => {
  businessLayer.value?.hide();
  operationResult.value = '已调用 hide()';
  refreshLayers();
};

const removeBusinessLayer = () => {
  const earth = earthRef.value;
  if (earth === null || businessLayer.value === null) return;

  earth.elements.remove({ layerId: BUSINESS_LAYER_ID });
  const removed = earth.layers.remove(BUSINESS_LAYER_ID);
  businessLayer.value = null;
  operationResult.value = removed ? '已通过 layers.remove() 移除业务图层' : '未找到业务图层';
  refreshLayers();
};

const focus = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.view.animateFlyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), { zoom: 5, duration: 450 });
};

const reset = () => {
  opacity.value = 0.75;
  if (businessLayer.value === null) {
    addBusinessLayer();
  } else {
    businessLayer.value.update({ visible: true, opacity: opacity.value });
    operationResult.value = '已恢复业务图层、显隐与透明度';
    refreshLayers();
  }
  focus();
};

defineExpose({ reset, focus });

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 5 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earthRef.value = earth;
  addBusinessLayer();
  focus();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  businessLayer.value = null;
});
</script>

<template>
  <div class="example-demo">
    <el-alert
      class="example-demo__alert"
      title="Earth 创建时会自动准备 id 为 default 的矢量图层；示例另建 business-layer，避免把业务数据与默认容器混在一起。"
      type="info"
      :closable="false"
      show-icon
    />

    <div class="example-demo__control-panel">
      <div class="example-demo__action-group">
        <div class="example-demo__action-buttons example-demo__actions">
          <el-button type="primary" :disabled="businessLayer !== null" @click="addBusinessLayer">新增业务图层</el-button>
          <el-button :disabled="businessLayer === null || businessState?.visible === true" @click="showBusinessLayer">显示</el-button>
          <el-button :disabled="businessLayer === null || businessState?.visible === false" @click="hideBusinessLayer">隐藏</el-button>
          <el-button type="danger" plain :disabled="businessLayer === null" @click="removeBusinessLayer">移除业务图层</el-button>
          <el-button @click="refreshLayers()">查询全部</el-button>
          <el-button @click="refreshLayers('vector')">只查 vector</el-button>
        </div>
      </div>

      <div class="layer-service-demo__opacity">
        <span>业务图层透明度</span>
        <el-slider v-model="opacity" :min="0" :max="1" :step="0.05" :disabled="businessLayer === null" @change="updateOpacity" />
        <el-tag effect="plain">{{ opacity.toFixed(2) }}</el-tag>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <div class="layer-service-demo__result">
      <span>{{ operationResult }}</span>
      <el-tag type="info" effect="plain">当前查询：{{ queryLabel }}</el-tag>
    </div>
    <el-table :data="rows" border size="small" empty-text="没有匹配的图层">
      <el-table-column prop="id" label="ID" min-width="150" />
      <el-table-column prop="kind" label="类型" width="90" />
      <el-table-column label="可见" width="80">
        <template #default="scope">
          <el-tag :type="scope.row.visible ? 'success' : 'info'" size="small">{{ scope.row.visible ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="opacity" label="透明度" width="90" />
      <el-table-column label="zIndex" width="90">
        <template #default="scope">{{ scope.row.zIndex ?? '—' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.layer-service-demo__opacity {
  display: grid;
  grid-template-columns: auto minmax(160px, 320px) auto;
  align-items: center;
  gap: 14px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.layer-service-demo__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 14px 0 10px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

@media (max-width: 640px) {
  .layer-service-demo__opacity {
    grid-template-columns: 1fr auto;
  }

  .layer-service-demo__opacity :deep(.el-slider) {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
