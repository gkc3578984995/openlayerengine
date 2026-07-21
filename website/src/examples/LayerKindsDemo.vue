<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import TextStyle from 'ol/style/Text.js';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, Layer, LayerKind } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';
import type { MapSourceName } from '../config/mapSources';

const EARTH_ID = 'docs-core-layer-kinds';
const ELEMENT_MODULE = 'docs-layer-kind-elements';

interface LayerRow {
  id: string;
  kind: LayerKind;
  source: '部署期底图配置' | 'Earth Element 容器' | 'OpenLayers VectorLayer';
  ownership: 'earth' | 'external';
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const nativeLayer = shallowRef<Layer | null>(null);
const externalOlLayer = shallowRef<VectorLayer<VectorSource> | null>(null);
const rows = ref<LayerRow[]>([]);
const selectedBasemap = ref<MapSourceName>('vector');
const externalResourceState = ref('等待创建 external 原生图层');
const basemapOptions = [
  { label: '矢量底图', value: 'vector' },
  { label: '影像底图', value: 'satellite' }
] as const;

const refreshRows = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  rows.value = earth.layers.query().map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    source: layer.kind === 'native' ? 'OpenLayers VectorLayer' : layer.kind === 'tile' ? '部署期底图配置' : 'Earth Element 容器',
    ownership: layer.kind === 'native' ? 'external' : 'earth'
  }));
};

// #region layer-kinds
const createLayerKinds = () => {
  const earth = earthRef.value;
  if (earth === null) return;

  earth.elements.remove({ module: ELEMENT_MODULE });
  earth.layers.clear();
  createConfiguredLayer(earth, selectedBasemap.value);
  const engineLayer = earth.layers.add({ kind: 'vector', id: 'mixed-elements', wrapX: true, declutter: true, zIndex: 10 });
  const engineCenter = earth.view.toProjectedCoordinates([116.05, 39.9]);
  earth.elements.add({
    id: 'layer-kind-earth-circle',
    module: ELEMENT_MODULE,
    layerId: engineLayer.id,
    geometry: { type: 'circle', center: engineCenter, radius: 28_000 },
    style: {
      fill: { type: 'pattern', pattern: 'diagonal', color: '#2563eb', backgroundColor: 'rgba(219,234,254,0.72)', size: 16, lineWidth: 3 },
      strokes: [{ color: '#1d4ed8', width: 4 }],
      text: {
        text: 'Earth vector',
        fontSize: 14,
        fontWeight: 'bold',
        fill: { type: 'solid', color: '#1e3a8a' },
        stroke: { color: '#ffffff', width: 3 }
      }
    }
  });

  const externalLayer = externalOlLayer.value ?? new VectorLayer({ source: new VectorSource() });
  externalOlLayer.value = externalLayer;
  const externalSource = externalLayer.getSource();
  if (externalSource !== null) {
    externalSource.clear();
    const marker = new Feature(new Point([...earth.view.toProjectedCoordinates([116.75, 39.9])]));
    marker.setStyle(
      new Style({
        image: new CircleStyle({ radius: 18, fill: new Fill({ color: '#f97316' }), stroke: new Stroke({ color: '#ffffff', width: 4 }) }),
        text: new TextStyle({
          text: 'external native',
          offsetY: 34,
          font: 'bold 14px sans-serif',
          fill: new Fill({ color: '#9a3412' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 })
        })
      })
    );
    externalSource.addFeature(marker);
  }
  nativeLayer.value = earth.layers.add({
    kind: 'native',
    id: 'external-native-layer',
    layer: externalLayer,
    ownership: 'external'
  });
  externalResourceState.value = 'external VectorLayer 已挂载，所有权仍属于调用方';
  refreshRows();
};

const removeNativeByHandle = () => {
  nativeLayer.value?.remove();
  nativeLayer.value = null;
  externalResourceState.value =
    externalOlLayer.value?.getSource() instanceof VectorSource ? 'Earth 已解绑；调用方仍可读取 VectorLayer 与 VectorSource' : '外部资源不可用';
  refreshRows();
};

const clearAllLayers = () => {
  const earth = earthRef.value;
  earth?.elements.remove({ module: ELEMENT_MODULE });
  earth?.layers.clear();
  nativeLayer.value = null;
  externalResourceState.value =
    externalOlLayer.value?.getSource() instanceof VectorSource ? '全部 Layer 句柄已清理；external 原生资源仍由调用方持有' : '外部资源不可用';
  refreshRows();
};
// #endregion layer-kinds

const switchBasemap = (value: string | number | boolean | undefined) => {
  if (value !== 'vector' && value !== 'satellite') return;
  selectedBasemap.value = value;
  createLayerKinds();
};

const focus = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.view.animateFlyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), { zoom: 5, duration: 450 });
};

const reset = () => {
  selectedBasemap.value = 'vector';
  createLayerKinds();
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
  earthRef.value = earth;
  createLayerKinds();
  focus();
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  nativeLayer.value = null;
  externalOlLayer.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__control-panel">
      <div class="layer-kinds-demo__source">
        <span>部署期底图配置</span>
        <el-segmented v-model="selectedBasemap" :options="basemapOptions" aria-label="选择底图配置" @change="switchBasemap" />
        <el-tag effect="plain">{{ selectedBasemap }}</el-tag>
      </div>

      <div class="example-demo__action-group">
        <div class="example-demo__action-buttons example-demo__actions">
          <el-button type="primary" @click="createLayerKinds">创建三类图层</el-button>
          <el-button :disabled="nativeLayer === null" @click="removeNativeByHandle">用 Layer.remove() 移除 native</el-button>
          <el-button type="danger" plain :disabled="rows.length === 0" @click="clearAllLayers">清空全部图层</el-button>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-table class="layer-kinds-demo__table" :data="rows" border size="small" empty-text="当前没有图层">
      <el-table-column prop="id" label="图层 ID" min-width="180" />
      <el-table-column prop="kind" label="kind" width="100" />
      <el-table-column prop="source" label="来源" min-width="180" />
      <el-table-column prop="ownership" label="资源所有权" min-width="140" />
    </el-table>

    <el-alert class="example-demo__alert layer-kinds-demo__alert" type="info" :closable="false" show-icon>
      <template #title>external 只解绑，不替调用方销毁原生资源</template>
      {{ externalResourceState }}。地图中的蓝色纹理圆来自 Earth vector，橙色点来自 external native。
    </el-alert>
  </div>
</template>

<style scoped>
.layer-kinds-demo__table {
  margin-top: 16px;
}

.layer-kinds-demo__source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--doc-muted);
  font-size: 14px;
}

.layer-kinds-demo__source :deep(.el-segmented) {
  max-width: 100%;
}

.layer-kinds-demo__alert {
  margin-top: 16px;
}

@media (max-width: 640px) {
  .layer-kinds-demo__source :deep(.el-segmented) {
    flex: 1 1 100%;
    width: 100%;
  }
}
</style>
