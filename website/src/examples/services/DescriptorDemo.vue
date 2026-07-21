<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useEarth } from '@vrsim/earth-engine-ol';
import type { Coordinate, DescriptorEvent, DescriptorHandle, DescriptorListItem, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { createConfiguredLayer } from '../../config/mapSources';

const EARTH_ID = 'docs-services-descriptor';

interface DescriptorData {
  version: number;
}

interface CurrentEvent {
  source: string;
  type: string;
  detail: string;
}

const initialItems: readonly DescriptorListItem[] = [
  { label: '温度', value: '23°C', color: 'var(--el-color-danger)' },
  { label: '风速', value: '3.2 m/s', color: 'var(--el-color-primary)' }
];

const mapTarget = ref<HTMLDivElement | null>(null);
const earthRef = shallowRef<Earth | null>(null);
const descriptorRef = shallowRef<DescriptorHandle<DescriptorData> | null>(null);
const contentMode = ref<'list' | 'text' | 'dom'>('list');
const activeContentMode = ref<'list' | 'text' | 'dom'>('list');
const closeAction = ref<'hide' | 'destroy'>('hide');
const currentEvent = ref<CurrentEvent>({ source: '—', type: '—', detail: '点击列表项或关闭按钮后显示当前载荷' });
const status = ref('等待创建');
const positionIndex = ref(0);

let version = 1;
let offDescriptorEvents: Array<() => void> = [];

const showEvent = (source: string, event: DescriptorEvent<DescriptorData>) => {
  currentEvent.value = {
    source,
    type: event.type,
    detail: event.item === undefined ? `data.version=${event.data?.version ?? '—'}` : `${event.item.label} = ${event.item.value}`
  };
};

const disposeEventSubscriptions = () => {
  for (const off of offDescriptorEvents) off();
  offDescriptorEvents = [];
};

const destroyCurrent = () => {
  disposeEventSubscriptions();
  descriptorRef.value?.destroy();
  descriptorRef.value = null;
};

const customElement = (): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = 'docs-descriptor-custom';
  element.textContent = '这是调用方提供的 HTMLElement 内容';
  return element;
};

// #region descriptor-create
const createDescriptor = () => {
  const earth = earthRef.value;
  if (earth === null) return;
  destroyCurrent();
  const position = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  const common = {
    id: 'descriptor-demo',
    position,
    header: '站点监测',
    footer: '点击列表项查看事件',
    close: true,
    closeAction: closeAction.value,
    draggable: true,
    fixedLine: true,
    fixedLineColor: 'var(--el-color-primary)',
    fixedMode: 'position' as const,
    data: { version },
    onClose: (event: DescriptorEvent<DescriptorData>) => showEvent('spec.onClose', event),
    onItemClick: (event: DescriptorEvent<DescriptorData>) => showEvent('spec.onItemClick', event)
  };

  const descriptor =
    contentMode.value === 'list'
      ? earth.overlays.createDescriptor<DescriptorData>({ ...common, type: 'list', content: initialItems })
      : earth.overlays.createDescriptor<DescriptorData>({
          ...common,
          type: 'custom',
          content: contentMode.value === 'text' ? '自定义文本内容' : customElement()
        });

  offDescriptorEvents = [
    descriptor.on('click', (event) => showEvent('handle.on(click)', event)),
    descriptor.on('close', (event) => showEvent('handle.on(close)', event))
  ];
  activeContentMode.value = contentMode.value;
  descriptorRef.value = descriptor;
  status.value = `已创建 ${contentMode.value} Descriptor（${descriptor.id}）`;
};
// #endregion descriptor-create

const patchDescriptor = () => {
  const descriptor = descriptorRef.value;
  if (descriptor === null) return;
  version += 1;
  descriptor.update({
    header: `站点监测 v${version}`,
    footer: version % 2 === 0 ? undefined : '内容已通过 patch 更新',
    content:
      activeContentMode.value === 'list'
        ? [
            { label: '温度', value: `${22 + version}°C`, color: 'var(--el-color-danger)' },
            { label: '状态', value: '在线', color: 'var(--el-color-success)' }
          ]
        : `DescriptorPatch 更新后的文本 v${version}`,
    data: { version },
    draggable: version % 2 === 0,
    fixedLine: true
  });
  status.value = `update() 已应用 DescriptorPatch v${version}`;
};

const moveDescriptor = () => {
  const earth = earthRef.value;
  const descriptor = descriptorRef.value;
  if (earth === null || descriptor === null) return;
  positionIndex.value = (positionIndex.value + 1) % 2;
  const lonLat: Coordinate = positionIndex.value === 0 ? [116.4074, 39.9042] : [116.445, 39.925];
  descriptor.setPosition(earth.view.toProjectedCoordinates(lonLat));
  status.value = `setPosition() 已移动到第 ${positionIndex.value + 1} 个位置`;
};

const showDescriptor = () => {
  descriptorRef.value?.show();
  status.value = '已调用 show()';
};

const hideDescriptor = () => {
  descriptorRef.value?.hide();
  status.value = '已调用 hide()；句柄与订阅仍然有效';
};

const closeDescriptor = () => {
  const descriptor = descriptorRef.value;
  if (descriptor === null) return;
  const action = closeAction.value;
  descriptor.close();
  status.value = action === 'hide' ? 'close() 按 hide 策略隐藏，可再次 show()' : 'close() 按 destroy 策略销毁，旧句柄失效';
  if (action === 'destroy') {
    descriptorRef.value = null;
    disposeEventSubscriptions();
  }
};

const changeCloseAction = (value: string | number | boolean | undefined) => {
  if (value !== 'hide' && value !== 'destroy') return;
  closeAction.value = value;
  descriptorRef.value?.update({ closeAction: value });
  status.value = `关闭策略已更新为 ${value}`;
};

const destroyDescriptor = () => {
  destroyCurrent();
  status.value = '已显式调用 destroy() 并注销 handle.on() 监听';
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
  const anchor = earth.view.toProjectedCoordinates([116.4074, 39.9042]);
  const anchorLayer = earth.layers.add({ kind: 'vector', id: 'descriptor-anchor-layer', zIndex: 10 });
  earth.elements.add({
    id: 'descriptor-anchor',
    layerId: anchorLayer.id,
    geometry: { type: 'point', controlPoints: [anchor] },
    style: {
      symbol: {
        type: 'circle',
        radius: 10,
        fill: { type: 'solid', color: '#f56c6c' },
        stroke: { color: '#ffffff', width: 4 }
      },
      text: {
        text: 'Descriptor 定位点',
        fontSize: 13,
        fontWeight: 'bold',
        offsetY: 34,
        padding: [4, 7, 4, 7],
        fill: { type: 'solid', color: '#1f2937' },
        stroke: { color: '#ffffff', width: 3 },
        backgroundFill: { type: 'solid', color: 'rgba(255, 255, 255, 0.9)' }
      }
    }
  });
  earth.view.flyTo(anchor, 9);
  earthRef.value = earth;
  createDescriptor();
});

onBeforeUnmount(() => {
  destroyCurrent();
  earthRef.value?.destroy();
  earthRef.value = null;
});
</script>

<template>
  <div class="example-demo">
    <el-alert type="info" :closable="false" show-icon title="列表项点击和关闭会同时进入 spec 回调与 handle.on() 订阅；两条路径都需要按各自生命周期清理。" />

    <div class="example-demo__control-panel descriptor-demo__controls">
      <div class="example-demo__control-grid descriptor-demo__settings" role="group" aria-label="Descriptor 创建设置">
        <el-radio-group v-model="contentMode" aria-label="Descriptor 内容类型">
          <el-radio-button value="list">列表</el-radio-button>
          <el-radio-button value="text">文本</el-radio-button>
          <el-radio-button value="dom">HTMLElement</el-radio-button>
        </el-radio-group>
        <el-select v-model="closeAction" class="descriptor-demo__close-action" aria-label="关闭策略" @change="changeCloseAction">
          <el-option label="关闭时隐藏" value="hide" />
          <el-option label="关闭时销毁" value="destroy" />
        </el-select>
      </div>

      <div class="example-demo__actions descriptor-demo__toolbar">
        <div class="example-demo__action-group descriptor-demo__action-group" role="group" aria-label="创建与更新">
          <span>创建与更新</span>
          <div class="example-demo__action-buttons descriptor-demo__action-buttons">
            <el-button type="primary" @click="createDescriptor">按当前内容重新创建</el-button>
            <el-button :disabled="descriptorRef === null" @click="patchDescriptor">update patch</el-button>
            <el-button :disabled="descriptorRef === null" @click="moveDescriptor">setPosition</el-button>
          </div>
        </div>
        <div class="example-demo__action-group descriptor-demo__action-group" role="group" aria-label="显示控制">
          <span>显示控制</span>
          <div class="example-demo__action-buttons descriptor-demo__action-buttons">
            <el-button :disabled="descriptorRef === null" @click="showDescriptor">show</el-button>
            <el-button :disabled="descriptorRef === null" @click="hideDescriptor">hide</el-button>
          </div>
        </div>
        <div class="example-demo__action-group descriptor-demo__action-group" role="group" aria-label="关闭与销毁">
          <span>关闭与销毁</span>
          <div class="example-demo__action-buttons descriptor-demo__action-buttons">
            <el-button :disabled="descriptorRef === null" type="warning" plain @click="closeDescriptor">close</el-button>
            <el-button :disabled="descriptorRef === null" type="danger" plain @click="destroyDescriptor">destroy</el-button>
          </div>
        </div>
      </div>
    </div>

    <div ref="mapTarget" class="example-stage"></div>

    <el-alert class="descriptor-demo__status" :closable="false" :title="status" type="success" show-icon aria-live="polite" />
    <el-descriptions :column="1" border title="当前事件载荷">
      <el-descriptions-item label="来源">{{ currentEvent.source }}</el-descriptions-item>
      <el-descriptions-item label="类型">{{ currentEvent.type }}</el-descriptions-item>
      <el-descriptions-item label="数据">{{ currentEvent.detail }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<style scoped>
.descriptor-demo__settings {
  grid-template-columns: minmax(min(100%, 320px), max-content) minmax(min(100%, 150px), 1fr);
}

.descriptor-demo__settings > *,
.descriptor-demo__settings :deep(.el-radio-group) {
  max-width: 100%;
}

.descriptor-demo__settings :deep(.el-radio-group) {
  overflow-x: auto;
  overflow-y: hidden;
}

.descriptor-demo__close-action {
  width: min(150px, 100%);
}

.descriptor-demo__toolbar {
  align-items: flex-start;
  gap: 10px;
}

.descriptor-demo__action-group {
  max-width: 100%;
}

.descriptor-demo__status {
  margin: 14px 0;
}

:global(.docs-descriptor-custom) {
  padding: 10px 12px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: var(--el-border-radius-base);
}

@media (max-width: 560px) {
  .descriptor-demo__settings {
    display: grid;
    grid-template-columns: 1fr;
  }

  .descriptor-demo__settings :deep(.el-radio-group),
  .descriptor-demo__close-action,
  .descriptor-demo__action-group {
    width: 100%;
  }

  .descriptor-demo__toolbar,
  .descriptor-demo__action-buttons {
    display: grid;
    grid-template-columns: 1fr;
  }

  .descriptor-demo__action-buttons :deep(.el-button) {
    width: 100%;
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
}
</style>
