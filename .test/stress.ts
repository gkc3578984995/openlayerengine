import { useEarth, type Coordinate, type ShapeInput, type StyleSpec } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';
import { unByKey } from 'ol/Observable.js';
import './stress.scss';

interface RenderSample {
  readonly endedAtMs: number;
  readonly renderDurationMs: number;
}

interface PerformanceHud {
  destroy(): void;
}

interface StressColor {
  readonly stroke: string;
}

type ElementKind = 'point' | 'line' | 'text';
type StressGeometry = ShapeInput<'point'> | ShapeInput<'polyline'>;

const defaultElementCount = 10_000;
const maximumElementCount = 1_000_000;
const elementCount = readElementCount();
const elementLayerId = 'stress-elements';
const elementKinds = Object.freeze<readonly ElementKind[]>(['point', 'line', 'text']);
const colors = Object.freeze<readonly StressColor[]>([
  { stroke: '#22d3ee' },
  { stroke: '#a78bfa' },
  { stroke: '#f472b6' },
  { stroke: '#fbbf24' },
  { stroke: '#34d399' }
]);

const target = document.querySelector<HTMLElement>('#map');
if (target === null) throw new Error('压力测试缺少地图容器 #map');

const earth = useEarth({
  id: 'element-stress',
  target,
  view: { center: [0, 0], resolution: 1, rotation: 0, projection: 'EPSG:3857', multiWorld: true },
  controls: { zoom: false, rotate: false, attribution: false }
});
earth.layers.add({ kind: 'vector', id: elementLayerId, zIndex: 0, wrapX: true, declutter: false });
earth.map.updateSize();

const viewport = Object.freeze({
  width: Math.max(target.clientWidth, 1_280) * 0.96,
  height: Math.max(target.clientHeight, 720) * 0.92
});
const baseUnit = Math.max(2, Math.min(18, Math.sqrt((viewport.width * viewport.height) / Math.max(1, elementCount)) * 0.38));
const guaranteedKinds = shuffleElementKinds();
const elementCounts: Record<ElementKind, number> = { point: 0, line: 0, text: 0 };
const performanceHud = createPerformanceHud(target);

for (let index = 0; index < elementCount; index += 1) {
  const kind = index < guaranteedKinds.length ? guaranteedKinds[index] : elementKinds[Math.floor(Math.random() * elementKinds.length)];
  if (kind === undefined) throw new Error('没有可用的压力元素类型');
  const unit = baseUnit * (0.65 + Math.random() * 0.7);
  const origin = randomCoordinate(Math.max(8, unit * 6));
  elementCounts[kind] += 1;
  earth.elements.add({
    id: `stress-${kind}-${index}`,
    module: `stress-${kind}`,
    layerId: elementLayerId,
    geometry: elementGeometry(kind, origin, unit),
    style: elementStyle(kind, index, unit)
  });
}

earth.map.renderSync();

let destroyed = false;
const destroy = (): void => {
  if (destroyed) return;
  destroyed = true;
  performanceHud.destroy();
  earth.destroy();
};

window.addEventListener('beforeunload', destroy, { once: true });
if (import.meta.hot !== undefined) import.meta.hot.dispose(destroy);
document.documentElement.dataset.stressReady = 'true';
document.documentElement.dataset.stressElementCount = String(elementCount);
document.documentElement.dataset.stressElementKindCount = String(elementKinds.filter((kind) => elementCounts[kind] > 0).length);
document.documentElement.dataset.stressElementCounts = JSON.stringify(elementCounts);

function readElementCount(): number {
  const raw = new URLSearchParams(window.location.search).get('num');
  if (raw === null || raw.trim() === '') return defaultElementCount;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximumElementCount) {
    throw new Error(`num 必须是 0 到 ${maximumElementCount} 之间的整数`);
  }
  return value;
}

function shuffleElementKinds(): ElementKind[] {
  const values = [...elementKinds];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function randomCoordinate(padding: number): Coordinate {
  const horizontalPadding = Math.min(viewport.width / 3, padding);
  const verticalPadding = Math.min(viewport.height / 3, padding);
  return [
    (Math.random() - 0.5) * Math.max(1, viewport.width - horizontalPadding * 2),
    (Math.random() - 0.5) * Math.max(1, viewport.height - verticalPadding * 2)
  ];
}

function elementGeometry(kind: ElementKind, origin: Coordinate, unit: number): StressGeometry {
  if (kind !== 'line') return { type: 'point', controlPoints: [origin] };
  const pointCount = 2 + Math.floor(Math.random() * 4);
  const coordinates: Coordinate[] = [origin];
  let direction = Math.random() * Math.PI * 2;
  for (let index = 1; index < pointCount; index += 1) {
    const previous = coordinates[index - 1];
    if (previous === undefined) break;
    direction += (Math.random() - 0.5) * 1.2;
    const distance = unit * (1.3 + Math.random() * 1.7);
    coordinates.push([previous[0] + Math.cos(direction) * distance, previous[1] + Math.sin(direction) * distance]);
  }
  return { type: 'polyline', controlPoints: coordinates };
}

function elementStyle(kind: ElementKind, index: number, unit: number): StyleSpec {
  const color = colors[Math.floor(Math.random() * colors.length)] ?? colors[0];
  if (color === undefined) throw new Error('压力测试缺少颜色配置');
  if (kind === 'point') {
    return {
      symbol: {
        type: 'circle',
        radius: Math.max(2.5, Math.min(7, unit * 0.7)),
        fill: { type: 'solid', color: color.stroke },
        stroke: { color: '#e0f2fe', width: 0.8 }
      }
    };
  }
  if (kind === 'line') {
    return { strokes: [{ color: color.stroke, width: 1 + Math.random() * 1.5, lineCap: 'round', lineJoin: 'round' }] };
  }
  return {
    text: {
      text: `TEXT-${index.toString(36).toUpperCase()}`,
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: Math.max(10, Math.min(16, 8 + unit * 0.55)),
      fontWeight: Math.random() < 0.25 ? 'bold' : 'normal',
      fill: { type: 'solid', color: color.stroke },
      stroke: { color: '#020617', width: 2 },
      rotation: (Math.random() - 0.5) * 30,
      overflow: true
    }
  };
}

function createPerformanceHud(container: HTMLElement): PerformanceHud {
  const root = document.createElement('aside');
  root.className = 'stress-performance';
  root.setAttribute('aria-label', '地图实时性能');
  root.title = 'CPU 为近 1 秒地图主线程渲染占用的估算值';
  const fpsOutput = createMetric(root, 'FPS');
  const cpuOutput = createMetric(root, 'CPU≈');
  container.append(root);

  const samples: RenderSample[] = [];
  const renderKey = earth.map.on('postrender', (event) => {
    const endedAtMs = Date.now();
    const frameStartedAtMs = event.frameState?.time;
    const renderDurationMs =
      typeof frameStartedAtMs === 'number' && Number.isFinite(frameStartedAtMs) ? Math.min(250, Math.max(0, endedAtMs - frameStartedAtMs)) : 0;
    samples.push({ endedAtMs, renderDurationMs });
    pruneRenderSamples(samples, endedAtMs);
  });

  const refresh = (): void => {
    const now = Date.now();
    pruneRenderSamples(samples, now);
    if (samples.length < 2) {
      fpsOutput.value = '0';
      cpuOutput.value = '0%';
      return;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first === undefined || last === undefined) return;
    const frameSpanMs = Math.max(1, last.endedAtMs - first.endedAtMs);
    const sampleWindowMs = Math.max(250, Math.min(1_000, now - first.endedAtMs));
    const renderBusyMs = samples.reduce((total, sample) => total + sample.renderDurationMs, 0);
    fpsOutput.value = (((samples.length - 1) * 1_000) / frameSpanMs).toFixed(0);
    cpuOutput.value = `${Math.min(100, (renderBusyMs / sampleWindowMs) * 100).toFixed(0)}%`;
  };

  refresh();
  const refreshTimer = window.setInterval(refresh, 250);
  let disposed = false;
  return Object.freeze({
    destroy() {
      if (disposed) return;
      disposed = true;
      window.clearInterval(refreshTimer);
      unByKey(renderKey);
      samples.length = 0;
      root.remove();
    }
  });
}

function createMetric(root: HTMLElement, label: string): HTMLOutputElement {
  const metric = document.createElement('div');
  metric.className = 'stress-performance__metric';
  const name = document.createElement('span');
  name.textContent = label;
  const output = document.createElement('output');
  output.value = '--';
  metric.append(name, output);
  root.append(metric);
  return output;
}

function pruneRenderSamples(samples: RenderSample[], now: number): void {
  const cutoff = now - 1_000;
  while (samples[0] !== undefined && samples[0].endedAtMs < cutoff) samples.shift();
}
