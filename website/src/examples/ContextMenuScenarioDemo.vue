<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer, type IContextMenuItem } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const props = defineProps<{ scenario: string }>();
const mapId = useId();
const earthRef = shallowRef<Earth>();
const feedback = ref('在地图空白处或蓝色要素上右键');
const center = fromLonLat([116.4074, 39.9042]);
const MODULE = 'context-menu-demo';
const FEATURE_ID = 'context-menu-point';

const defaultItems: IContextMenuItem[] = [
  { key: 'default-action', label: '记录默认菜单动作' },
  { key: 'default-alternate', label: '备用默认菜单项', visible: false }
];
const moduleItems: IContextMenuItem[] = [{ key: 'module-action', label: '记录模块菜单动作' }];

const setDefaultVisibility = () => {
  const menu = earthRef.value?.useContextMenu();
  if (menu) feedback.value = menu.setDefaultMenuState('default-action', false) ? '默认菜单项已隐藏' : '设置失败';
};
const toggleModuleState = () => {
  const menu = earthRef.value?.useContextMenu();
  if (menu) feedback.value = menu.toggleModuleMenuState(MODULE, FEATURE_ID, 'module-action') ? '模块菜单项已显示' : '模块菜单项已隐藏';
};
const toggleTheme = () => {
  const dark = earthRef.value?.useContextMenu().toggleTheme();
  feedback.value = dark ? '已切换到深色主题' : '已切换到浅色主题';
};
const removeDefault = () => {
  feedback.value = earthRef.value?.useContextMenu().removeDefaultMenu() ? '全局菜单已移除' : '没有可移除的全局菜单';
};
const removeModule = () => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  menu.clearModuleMenuState(MODULE, FEATURE_ID);
  feedback.value = menu.removeModuleMenu(MODULE) ? '模块菜单及要素状态已清理' : '没有可移除的模块菜单';
};

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const points = new PointLayer(earth, { register: false });
  points.add({ id: FEATURE_ID, module: MODULE, center, size: 12, fill: { color: '#409eff' }, label: { text: '模块菜单要素', offsetY: 20 } });
  const menu = earth.useContextMenu({ isDarkTheme: props.scenario === 'theme' });
  const defaultMenu =
    props.scenario === 'nested'
      ? [
          {
            key: 'tools',
            label: '工具',
            child: [
              { key: 'zoom', label: '缩放至此处' },
              { key: 'mark', label: '添加标记' }
            ]
          }
        ]
      : props.scenario === 'mutex'
        ? [
            { key: 'show', label: '显示标注', mutexKey: 'hide' },
            { key: 'hide', label: '隐藏标注', mutexKey: 'show', visible: false }
          ]
        : defaultItems;
  menu.addDefaultMenu(defaultMenu, ({ menu: item, scope }) => {
    feedback.value = `${scope}：${item.label}`;
  });
  menu.addModuleMenu(
    MODULE,
    moduleItems,
    ({ menu: item, featureId }) => {
      feedback.value = `模块菜单：${item.label}（${featureId}）`;
    },
    props.scenario === 'guard' ? ({ featureId }) => featureId === FEATURE_ID : undefined
  );
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  earthRef.value?.useContextMenu().destroy();
  earthRef.value?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button v-if="scenario === 'visibility'" size="small" @click="setDefaultVisibility">隐藏默认菜单项</el-button>
      <el-button v-if="scenario === 'toggle'" size="small" @click="toggleModuleState">切换模块菜单项</el-button>
      <el-button v-if="scenario === 'theme'" size="small" @click="toggleTheme">切换菜单主题</el-button>
      <el-button v-if="scenario === 'remove-default'" size="small" @click="removeDefault">移除全局菜单</el-button>
      <el-button v-if="scenario === 'remove-module'" size="small" @click="removeModule">移除模块菜单</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
