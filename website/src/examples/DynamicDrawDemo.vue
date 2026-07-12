<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useId } from 'vue';
import { DrawType, Earth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/dist/index.es.css';
import { fromLonLat } from 'ol/proj';
import { createConfiguredLayer } from '../config/mapSources';

const mapId = useId();
const earthRef = shallowRef<Earth | null>(null);
const feedback = ref('Choose a drawing tool, then click the map. Right-click exits the current session.');

const withDraw = (callback: (draw: ReturnType<Earth['useDrawTool']>) => void) => {
  const earth = earthRef.value;
  if (earth) callback(earth.useDrawTool());
};

const drawPoint = () => {
  withDraw((draw) => {
    draw.drawPoint({
      callback: (event) => {
        if (event.type === DrawType.Drawend) feedback.value = 'Point created. Use “Remove first result” to call get() and remove().';
      }
    });
  });
};

const drawAttackArrow = () => {
  withDraw((draw) => {
    draw.drawAttackArrow({
      fillColor: 'rgba(64, 158, 255, 0.28)',
      strokeColor: '#409eff',
      callback: (event) => {
        if (event.type === DrawType.Drawend) feedback.value = 'Attack arrow created.';
      }
    });
  });
};

const removeFirst = () => {
  withDraw((draw) => {
    const [feature] = draw.get() ?? [];
    if (!feature) {
      feedback.value = 'No saved drawing is available.';
      return;
    }
    draw.remove(feature);
    feedback.value = 'The first saved drawing was removed.';
  });
};

onMounted(() => {
  const earth = new Earth({ center: fromLonLat([116.4074, 39.9042]), zoom: 5 }, { target: mapId });
  earth.addLayer(createConfiguredLayer(earth, 'vector'));
  earthRef.value = earth;
});

onBeforeUnmount(() => {
  const earth = earthRef.value;
  if (!earth) return;
  const draw = earth.useDrawTool();
  draw.destroy({ removeGraphics: true, removeLayers: true });
  earth.destroy();
});
</script>

<template>
  <div class="example-demo">
    <div class="example-demo__toolbar">
      <el-button type="primary" @click="drawPoint">Draw point</el-button>
      <el-button @click="drawAttackArrow">Draw attack arrow</el-button>
      <el-button type="danger" plain @click="removeFirst">Remove first result</el-button>
      <span>{{ feedback }}</span>
    </div>
    <div :id="mapId" class="example-stage"></div>
  </div>
</template>
