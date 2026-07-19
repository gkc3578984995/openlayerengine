<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, Layer, LayerKind } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../config/mapSources';

const EARTH_ID = 'docs-core-layer-kinds';

interface LayerRow {
  id: string;
  kind: LayerKind;
  ownership: 'earth preset' | 'earth' | 'external';
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const nativeLayer = shallowRef<Layer | null>(null);
const rows = ref<LayerRow[]>([]);

const refreshRows = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  rows.value = earth.layers.query().map((layer) => ({
    id: layer.id,
    kind: layer.kind,
    ownership: layer.kind === 'native' ? 'external' : layer.kind === 'tile' ? 'earth preset' : 'earth'
  }));
};

// #region layer-kinds
const createLayerKinds = () => {
  const earth = earthRef.value;
  if (earth === null) return;

  earth.layers.clear();
  createConfiguredLayer(earth, 'vector');
  earth.layers.add({ kind: 'vector', id: 'mixed-elements', wrapX: true, declutter: true, zIndex: 10 });
  nativeLayer.value = earth.layers.add({
    kind: 'native',
    id: 'external-native-layer',
    layer: new VectorLayer({ source: new VectorSource() }),
    ownership: 'external'
  });
  refreshRows();
};

const removeNativeByHandle = () => {
  nativeLayer.value?.remove();
  nativeLayer.value = null;
  refreshRows();
};

const clearAllLayers = () => {
  earthRef.value?.layers.clear();
  nativeLayer.value = null;
  refreshRows();
};
// #endregion layer-kinds

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
});

onBeforeUnmount(() => {
  earthRef.value?.destroy();
  earthRef.value = null;
  nativeLayer.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="createLayerKinds">创建三类图层</el-button>
      <el-button :disabled="nativeLayer === null" @click="removeNativeByHandle">用 Layer.remove() 移除 native</el-button>
      <el-button type="danger" plain :disabled="rows.length === 0" @click="clearAllLayers">清空全部图层</el-button>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-table class="layer-kinds-demo__table" :data="rows" border size="small" empty-text="当前没有图层">
      <el-table-column prop="id" label="图层 ID" min-width="180" />
      <el-table-column prop="kind" label="kind" width="100" />
      <el-table-column prop="ownership" label="资源所有权" min-width="140" />
    </el-table>

    <el-alert class="example-demo__alert" type="info" :closable="false" show-icon>
      <template #title>external 只解绑，不替调用方销毁原生资源</template>
      点击移除 native 后，Earth 解除地图挂载；示例创建的 VectorLayer 仍由调用方拥有。
    </el-alert>
  </div>
</template>

<style scoped>
.layer-kinds-demo__table {
  margin-top: 16px;
}
</style>
