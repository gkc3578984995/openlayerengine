<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { Earth, PointLayer } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('在空白地图或蓝色模块点上右键');
const isDark = ref(false);
const defaultVisible = ref(true);
const center = fromLonLat([116.4074, 39.9042]);

const toggleTheme = () => {
  isDark.value = earthRef.value?.useContextMenu().toggleTheme() ?? isDark.value;
};
const toggleDefaultItem = () => {
  const menu = earthRef.value?.useContextMenu();
  if (!menu) return;
  defaultVisible.value = menu.toggleDefaultMenuState('default-feedback');
};

onMounted(() => {
  const earth = new Earth({ center, zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  const points = new PointLayer(earth, { register: false });
  points.add({ id: 'menu-point', module: 'menu-demo', center, size: 12, fill: { color: '#409eff' }, label: { text: '模块菜单点', offsetY: 20 } });
  const menu = earth.useContextMenu({ isDarkTheme: isDark.value });
  menu.addDefaultMenu([{ key: 'default-feedback', label: '记录默认菜单回调' }], ({ menu: item, scope }) => {
    feedback.value = `${scope}：${item.label}`;
  });
  menu.addModuleMenu(
    'menu-demo',
    [{ key: 'module-feedback', label: '记录模块菜单回调' }],
    ({ menu: item, featureId }) => {
      feedback.value = `module：${item.label}（${featureId}）`;
    },
    ({ menu: item }) => item.key !== 'module-feedback' || true
  );
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  const earth = earthRef.value;
  earth?.useContextMenu().destroy();
  earth?.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button size="small" @click="toggleTheme">{{ isDark ? '切换浅色主题' : '切换深色主题' }}</el-button>
      <el-button size="small" @click="toggleDefaultItem">{{ defaultVisible ? '隐藏默认菜单项' : '显示默认菜单项' }}</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
