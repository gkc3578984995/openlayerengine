<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Descriptor, Earth, type IProperties } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

interface StationData {
  id: string;
}

const POSITION = fromLonLat([116.4074, 39.9042]);
const properties: IProperties<string | number>[] = [
  { label: '名称', value: '北京观测站' },
  { label: '状态', value: '运行中', color: '#67c23a' },
  { label: '海拔', value: 43.5 }
];

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const descriptorRef = shallowRef<Descriptor<StationData> | null>(null);
const visible = ref(true);

const showDescriptor = () => {
  const descriptor = descriptorRef.value;
  if (!descriptor) return;
  descriptor.show();
  visible.value = true;
};

const hideDescriptor = () => {
  const descriptor = descriptorRef.value;
  if (!descriptor) return;
  descriptor.hide();
  visible.value = false;
};

onMounted(() => {
  const earth = new Earth({ center: POSITION, zoom: 7 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;

  const descriptor = new Descriptor<StationData>(earth, {
    type: 'list',
    header: '站点信息',
    footer: '数据仅用于演示',
    fixedLineColor: '#409eff',
    isShowClose: false
  });
  descriptor.set({
    position: POSITION,
    element: properties,
    data: { id: 'beijing-station' }
  });
  descriptor.show();
  descriptorRef.value = descriptor;
});

onBeforeUnmount(() => {
  const descriptor = descriptorRef.value;
  const earth = earthRef.value;
  if (descriptor) descriptor.destroy();
  if (earth) earth.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" :disabled="visible" @click="showDescriptor">显示标牌</el-button>
      <el-button :disabled="!visible" @click="hideDescriptor">隐藏标牌</el-button>
      <span>可拖动标牌，定位线会跟随更新。</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
