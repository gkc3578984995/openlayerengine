<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PolylineLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const FLIGHT_ID = 'demo-flight';
const SAFE_NOOP_FLIGHT_ID = 'flight-not-created';
const BEIJING = fromLonLat([116.4074, 39.9042]);
const GUANGZHOU = fromLonLat([113.2644, 23.1291]);
const SHANGHAI = fromLonLat([121.4737, 31.2304]);

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const polylineLayer = shallowRef<PolylineLayer | null>(null);
const limitationDemoDone = ref(false);

const createFlightOnce = () => {
  const layer = polylineLayer.value;
  if (!layer) return;
  layer.addFlightLine({
    id: FLIGHT_ID,
    position: [BEIJING, GUANGZHOU],
    width: 4,
    color: '#409eff',
    arrowColor: '#f59e0b',
    isRepeat: false,
    isShowAnchorPoint: true
  });
};

const demonstrateLimitedApisOnce = () => {
  if (limitationDemoDone.value) return;
  // 当前实现会在真实飞行线上重新初始化 postrender 监听，且公开 API 无法解绑旧监听。
  // 因此这里使用不存在的 id 执行两个安全空操作，仅展示方法签名而不创建或累积监听。
  polylineLayer.value?.setFlightPosition(SAFE_NOOP_FLIGHT_ID, [BEIJING, SHANGHAI]);
  polylineLayer.value?.removeFlightLine(SAFE_NOOP_FLIGHT_ID);
  limitationDemoDone.value = true;
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.5, 31.5]), zoom: 4 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
  polylineLayer.value = new PolylineLayer(earth, { register: false });
  createFlightOnce();
});

onBeforeUnmount(() => {
  // removeFlightLine 只清除飞行要素与缓存，不会解绑飞行线的 postrender 监听。
  // 当前公开 API 下最安全的页面收尾是避免重复创建/更新，再依次移除要素、图层和 Earth。
  polylineLayer.value?.removeFlightLine();
  polylineLayer.value?.destroy();
  polylineLayer.value = null;
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="warning" plain :disabled="limitationDemoDone" @click="demonstrateLimitedApisOnce">一次性演示受限 API</el-button>
    </div>
    <el-alert
      title="当前公开 API 无法主动解绑飞行线的 postrender 监听。本示例只创建一条非循环飞行线；位置更新和移除方法使用不存在的 id 执行安全空操作，避免重复初始化或累积监听。"
      type="warning"
      :closable="false"
      show-icon
    />
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
