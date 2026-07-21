<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Earth, OverlayHandle } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-overlays';
const MODULE = 'overlay-demo';

interface DemoData {
  label: string;
  version: number;
}

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const mainRef = shallowRef<OverlayHandle<DemoData> | null>(null);
const companionRef = shallowRef<OverlayHandle<DemoData> | null>(null);
const mainState = ref({ id: '—', visible: false, position: '—' });
const queryResult = ref('等待查询');
const operationResult = ref('等待操作');
const externalClickCount = ref(0);

let version = 1;
let externalElement: HTMLDivElement | undefined;
let externalListener: (() => void) | undefined;

const overlayElement = (label: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = 'docs-overlay-chip';
  element.textContent = label;
  return element;
};

const refreshState = () => {
  const handle = mainRef.value;
  mainState.value = {
    id: handle?.id ?? '—',
    visible: handle?.visible ?? false,
    position: handle?.position?.map((value) => value.toFixed(0)).join(', ') ?? '—'
  };
};

const releaseCallerResources = () => {
  if (externalElement !== undefined && externalListener !== undefined) externalElement.removeEventListener('click', externalListener);
  externalElement = undefined;
  externalListener = undefined;
};

// #region overlay-create
const addOverlays = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  earth.overlays.remove({ module: MODULE });
  releaseCallerResources();

  const center = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  const secondary = earth.view.toProjectedCoordinates([116.43, 39.92]);
  const element = overlayElement('外部所有权 Overlay');
  const listener = () => {
    externalClickCount.value += 1;
  };
  element.addEventListener('click', listener);
  externalElement = element;
  externalListener = listener;

  mainRef.value = earth.overlays.add<DemoData>({
    id: 'overlay-main',
    element,
    position: center,
    offset: [0, -16],
    positioning: 'bottom-center',
    stopEvent: true,
    autoPan: { margin: 24, duration: 300 },
    module: MODULE,
    data: { label: '主覆盖物', version },
    ownership: 'external'
  });
  companionRef.value = earth.overlays.add<DemoData>({
    id: 'overlay-earth-owned',
    element: overlayElement('Earth 所有权 Overlay'),
    position: secondary,
    positioning: 'center-left',
    module: MODULE,
    data: { label: '辅助覆盖物', version },
    ownership: 'earth'
  });
  operationResult.value = '已通过 add() 创建两个 Overlay';
  refreshState();
};
// #endregion overlay-create

const getOverlay = () => {
  const found = earthRef.value?.overlays.get<DemoData>('overlay-main');
  queryResult.value = found === undefined ? 'get() 未找到 overlay-main' : `get() 找到 ${found.id}，visible=${found.visible}`;
};

const queryOverlays = () => {
  const found = earthRef.value?.overlays.query<DemoData>({ module: MODULE }) ?? [];
  queryResult.value = `query() 找到 ${found.length} 个：${found.map(({ id }) => id).join('、') || '—'}`;
};

const updateOverlay = () => {
  const handle = mainRef.value;
  if (handle === null) return;
  version += 1;
  handle.update({ offset: [18, -22], data: { label: '主覆盖物', version }, visible: true });
  if (externalElement !== undefined) externalElement.textContent = `已更新 v${version}`;
  operationResult.value = `update() 已写入 offset、data 与 visible（v${version}）`;
  refreshState();
};

const moveOverlay = () => {
  const earth = earthRef.value;
  const handle = mainRef.value;
  if (earth === null || handle === null) return;
  handle.setPosition(earth.view.toProjectedCoordinates([116.37, 39.93]));
  operationResult.value = '已通过 setPosition() 改变地图坐标';
  refreshState();
};

const showOverlay = () => {
  mainRef.value?.show();
  operationResult.value = '已调用 show()';
  refreshState();
};

const hideOverlay = () => {
  mainRef.value?.hide();
  operationResult.value = '已调用 hide()';
  refreshState();
};

const panIntoView = () => {
  mainRef.value?.panIntoView({ margin: 32, duration: 350 });
  operationResult.value = '已调用 panIntoView()';
};

const destroyMain = () => {
  const handle = mainRef.value;
  if (handle === null) return;
  handle.destroy();
  mainRef.value = null;
  externalElement?.dispatchEvent(new MouseEvent('click'));
  operationResult.value = 'destroy() 已解绑 Overlay；外部 DOM 内容和调用方监听仍由调用方管理';
  refreshState();
};

const removeModule = () => {
  const removed = earthRef.value?.overlays.remove({ module: MODULE }) ?? 0;
  mainRef.value = null;
  companionRef.value = null;
  operationResult.value = `remove({ module }) 移除了 ${removed} 个 Overlay`;
  refreshState();
};

const clearAll = () => {
  earthRef.value?.overlays.clear();
  mainRef.value = null;
  companionRef.value = null;
  operationResult.value = 'clear() 已清空当前 Earth 的全部 Overlay 与 Descriptor';
  refreshState();
};

onMounted(() => {
  if (mapTarget.value === null) return;
  const earth = useEarth({
    id: EARTH_ID,
    target: mapTarget.value,
    view: { zoom: 9 },
    controls: { zoom: true, rotate: false, attribution: true }
  });
  createConfiguredLayer(earth, 'vector');
  earth.view.flyTo(earth.view.toProjectedCoordinates([116.4074, 39.9042]), 9);
  earthRef.value = earth;
  addOverlays();
});

onBeforeUnmount(() => {
  mainRef.value?.destroy();
  companionRef.value?.destroy();
  releaseCallerResources();
  earthRef.value?.destroy();
  earthRef.value = null;
  mainRef.value = null;
  companionRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <el-alert type="info" :closable="false" show-icon title="普通 Overlay 由 OverlayService 查询；Descriptor 是独立复合句柄，但 clear() 会统一清理两者。" />

    <div class="example-demo__control-panel overlays-demo__toolbar">
      <div class="example-demo__actions overlays-demo__actions">
        <div class="example-demo__action-group overlays-demo__action-group" role="group" aria-label="创建与查询">
          <span>创建与查询</span>
          <div class="example-demo__action-buttons overlays-demo__action-buttons">
            <el-button type="primary" @click="addOverlays">重新 add</el-button>
            <el-button @click="getOverlay">get</el-button>
            <el-button @click="queryOverlays">query</el-button>
          </div>
        </div>
        <div class="example-demo__action-group overlays-demo__action-group" role="group" aria-label="主句柄操作">
          <span>主句柄操作</span>
          <div class="example-demo__action-buttons overlays-demo__action-buttons">
            <el-button :disabled="mainRef === null" @click="updateOverlay">update</el-button>
            <el-button :disabled="mainRef === null" @click="moveOverlay">setPosition</el-button>
            <el-button :disabled="mainRef === null" @click="showOverlay">show</el-button>
            <el-button :disabled="mainRef === null" @click="hideOverlay">hide</el-button>
            <el-button :disabled="mainRef === null" @click="panIntoView">panIntoView</el-button>
            <el-button :disabled="mainRef === null" type="danger" plain @click="destroyMain">handle.destroy</el-button>
          </div>
        </div>
        <div class="example-demo__action-group overlays-demo__action-group" role="group" aria-label="批量清理">
          <span>批量清理</span>
          <div class="example-demo__action-buttons overlays-demo__action-buttons">
            <el-button type="warning" plain @click="removeModule">remove(module)</el-button>
            <el-button type="danger" plain @click="clearAll">clear</el-button>
          </div>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-descriptions class="overlays-demo__result" :column="1" border aria-live="polite">
      <el-descriptions-item label="主 Overlay ID">{{ mainState.id }}</el-descriptions-item>
      <el-descriptions-item label="可见">{{ mainState.visible ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="位置">{{ mainState.position }}</el-descriptions-item>
      <el-descriptions-item label="外部 DOM 监听触发次数">{{ externalClickCount }}</el-descriptions-item>
      <el-descriptions-item label="查询结果">{{ queryResult }}</el-descriptions-item>
      <el-descriptions-item label="最近操作">{{ operationResult }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.overlays-demo__action-group {
  max-width: 100%;
}

.overlays-demo__result {
  margin-top: 14px;
}

.overlays-demo__result :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
}

:global(.docs-overlay-chip) {
  box-sizing: border-box;
  max-width: min(240px, calc(100vw - 32px));
  overflow: hidden;
  padding: 9px 13px;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  border: 3px solid var(--el-bg-color-overlay);
  border-radius: var(--el-border-radius-base);
  box-shadow: var(--el-box-shadow-light);
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (max-width: 560px) {
  .overlays-demo__toolbar,
  .overlays-demo__action-buttons {
    display: grid;
    grid-template-columns: 1fr;
  }

  .overlays-demo__action-group,
  .overlays-demo__action-buttons :deep(.el-button) {
    width: 100%;
  }

  .overlays-demo__action-buttons :deep(.el-button) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
}
</style>
