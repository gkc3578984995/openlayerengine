import { getWidth } from 'ol/extent.js';
import { unByKey } from 'ol/Observable.js';
import { useEarth, type AnimationHandle, type Coordinate, type Earth } from '../../src/index.ts';
import '../../src/assets/style/public.scss';

type BenchmarkVariant = 'onscreen' | 'offscreen' | 'world-copy';

interface BenchmarkPreparation {
  readonly scenarioId: string;
  readonly variant: BenchmarkVariant;
  readonly elementCount: number;
  readonly animationHandleCount: number;
  readonly postrenderListenerCount: number;
  readonly screenCoverageRatio: number;
  readonly startupMs: number;
}

interface BenchmarkSample {
  readonly source: 'actual-map-postrender';
  readonly warmupFrames: number;
  readonly sampleFrames: number;
  readonly warmupElapsedMs: number;
  readonly sampleElapsedMs: number;
  readonly frameIntervalsMs: readonly number[];
}

interface AnimationBenchmarkFixture {
  readonly ready: boolean;
  prepare(scenarioId: string, variant: BenchmarkVariant, seed: number): BenchmarkPreparation;
  sample(warmupFrames: number, sampleFrames: number): Promise<BenchmarkSample>;
  cleanup(): void;
}

declare global {
  interface Window {
    __OL_ENGINE_ANIMATION_BENCHMARK__: AnimationBenchmarkFixture;
  }
}

const target = document.getElementById('map');
if (!(target instanceof HTMLElement)) throw new Error('动画基准地图容器不存在');

const earth = useEarth({
  id: 'animation-benchmark',
  target,
  view: { center: [0, 0], resolution: 1, rotation: 0, projection: 'EPSG:3857', multiWorld: true },
  controls: { zoom: false, rotate: false, attribution: false }
});
const animationHandles = new Set<AnimationHandle>();
const modules = new Set<string>();

window.__OL_ENGINE_ANIMATION_BENCHMARK__ = Object.freeze({
  ready: true,
  prepare(scenarioId, variant, seed) {
    const startedAt = performance.now();
    cleanup();
    resetView(variant);
    const random = seededRandom(seed);
    const coverage = prepareScenario(scenarioId, variantOffset(variant), random);
    earth.map.updateSize();
    earth.map.renderSync();
    return Object.freeze({
      scenarioId,
      variant,
      elementCount: earth.elements.query().length,
      animationHandleCount: [...animationHandles].filter(({ status }) => status === 'running' || status === 'paused').length,
      postrenderListenerCount: activePostrenderListenerCount(earth),
      screenCoverageRatio: variant === 'offscreen' ? 0 : coverage,
      startupMs: performance.now() - startedAt
    });
  },
  async sample(warmupFrames, sampleFrames) {
    requireFrameCount(warmupFrames, '预热帧数');
    requireFrameCount(sampleFrames, '采样帧数');
    const warmupTimes = await collectMapFrameTimes(warmupFrames);
    const times = await collectMapFrameTimes(sampleFrames);
    return Object.freeze({
      source: 'actual-map-postrender',
      warmupFrames,
      sampleFrames,
      warmupElapsedMs: elapsedBetween(warmupTimes),
      sampleElapsedMs: elapsedBetween(times),
      frameIntervalsMs: Object.freeze(times.slice(1).map((time, index) => time - times[index]))
    });
  },
  cleanup
});

earth.map.updateSize();
earth.map.renderSync();

function prepareScenario(scenarioId: string, offset: Coordinate, random: () => number): number {
  if (scenarioId === 'points-blink') {
    const module = addPoints('points-blink', 1_000, 6, offset, random);
    track(earth.animations.play({ module }, { type: 'blink', periodMs: 500, repeat: true }));
    return coverageOfCircles(1_000, 6);
  }
  if (scenarioId === 'points-fade') {
    const module = addPoints('points-fade', 1_000, 6, offset, random);
    track(earth.animations.play({ module }, { type: 'fade', direction: 'out', durationMs: 20_000 }));
    return coverageOfCircles(1_000, 6);
  }
  if (scenarioId === 'polyline-grow') {
    const module = addPolylines('polyline-grow', 500, 32, offset, random);
    track(earth.animations.play({ module }, { type: 'grow', durationMs: 1_200, repeat: true }));
    return 0.72;
  }
  if (scenarioId === 'circle-radar') {
    const module = addCircles('circle-radar', 128, 40, offset);
    track(earth.animations.play({ module }, { type: 'radar-scan', repeat: true }));
    return coverageOfCircles(128, 40);
  }
  if (scenarioId === 'circle-center-spread') {
    const module = addCircles('circle-center-spread', 128, 40, offset);
    track(earth.animations.play({ module }, { type: 'center-spread', ringCount: 3, repeat: true }));
    return coverageOfCircles(128, 40);
  }
  if (scenarioId === 'static-mixed') return prepareStaticMixed(offset, random);
  if (scenarioId === 'effect-composition') return prepareEffectComposition(offset, random);
  if (scenarioId === 'resource-cycle') return prepareResourceCycle(offset, random);
  throw new Error(`未知动画基准场景：${scenarioId}`);
}

function prepareStaticMixed(offset: Coordinate, random: () => number): number {
  addPoints('static-mixed-static', 10_000, 3, offset, random);
  const fadeModule = addPoints('static-mixed-fade', 16, 6, offset, random);
  const growModule = addPolylines('static-mixed-grow', 16, 32, offset, random);
  track(earth.animations.play({ module: fadeModule }, { type: 'fade', direction: 'out', durationMs: 20_000 }));
  track(earth.animations.play({ module: growModule }, { type: 'grow', durationMs: 1_200, repeat: true }));
  return 1;
}

function prepareEffectComposition(offset: Coordinate, random: () => number): number {
  const fadeBlinkModule = addPoints('composition-fade-blink', 86, 6, offset, random);
  const growDashModule = addPolylines('composition-grow-dash', 85, 16, offset, random);
  const growAlertModule = addFineArrows('composition-grow-alert', 85, offset);
  track(earth.animations.play({ module: fadeBlinkModule }, { type: 'fade', direction: 'out', durationMs: 20_000 }));
  track(earth.animations.play({ module: fadeBlinkModule }, { type: 'blink', periodMs: 800, repeat: true }));
  track(earth.animations.play({ module: growDashModule }, { type: 'grow', durationMs: 1_200, repeat: true }));
  track(earth.animations.play({ module: growDashModule }, { type: 'dash-flow', speed: 24 }));
  track(earth.animations.play({ module: growAlertModule }, { type: 'grow', durationMs: 1_200, repeat: true }));
  track(earth.animations.play({ module: growAlertModule }, { type: 'alert', repeat: true }));
  return 0.9;
}

function prepareResourceCycle(offset: Coordinate, random: () => number): number {
  const module = addPoints('resource-cycle', 100, 6, offset, random);
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const fade = earth.animations.play({ module }, { type: 'fade', direction: 'out', durationMs: 20_000 });
    const blink = earth.animations.play({ module }, { type: 'blink', periodMs: 800, repeat: true });
    fade.stop();
    blink.stop();
  }
  return coverageOfCircles(100, 6);
}

function addPoints(name: string, count: number, radius: number, offset: Coordinate, random: () => number): string {
  const module = benchmarkModule(name);
  for (let index = 0; index < count; index += 1) {
    const coordinate = gridCoordinate(index, count, offset, random);
    earth.elements.add({
      id: `${module}-${index}`,
      module,
      geometry: { type: 'point', controlPoints: [coordinate] },
      style: { symbol: { type: 'circle', radius, fill: { type: 'solid', color: index % 2 === 0 ? '#2563eb' : '#16a34a' } } }
    });
  }
  return module;
}

function addPolylines(name: string, count: number, vertices: number, offset: Coordinate, random: () => number): string {
  const module = benchmarkModule(name);
  const rows = Math.max(1, Math.ceil(Math.sqrt(count)));
  for (let index = 0; index < count; index += 1) {
    const row = index % rows;
    const lane = Math.floor(index / rows);
    const y = offset[1] - 330 + ((row + 0.5) * 660) / rows;
    const controlPoints: Coordinate[] = [];
    for (let vertex = 0; vertex < vertices; vertex += 1) {
      const progress = vertex / Math.max(1, vertices - 1);
      controlPoints.push([offset[0] - 610 + progress * 1_220, y + Math.sin(progress * Math.PI * 4 + lane * 0.3) * (2 + (random() - 0.5) * 0.5)]);
    }
    earth.elements.add({
      id: `${module}-${index}`,
      module,
      geometry: { type: 'polyline', controlPoints },
      style: { strokes: [{ color: '#00d8ff', width: 2 }] }
    });
  }
  return module;
}

function addCircles(name: string, count: number, radius: number, offset: Coordinate): string {
  const module = benchmarkModule(name);
  for (let index = 0; index < count; index += 1) {
    const center = gridCoordinate(index, count, offset, () => 0.5);
    earth.elements.add({
      id: `${module}-${index}`,
      module,
      geometry: { type: 'circle', center, radius },
      style: { fill: { type: 'solid', color: 'rgba(15, 23, 42, 0.25)' }, strokes: [{ color: '#38bdf8', width: 1 }] }
    });
  }
  return module;
}

function addFineArrows(name: string, count: number, offset: Coordinate): string {
  const module = benchmarkModule(name);
  for (let index = 0; index < count; index += 1) {
    const center = gridCoordinate(index, count, offset, () => 0.5);
    earth.elements.add({
      id: `${module}-${index}`,
      module,
      geometry: {
        type: 'fine-arrow',
        controlPoints: [
          [center[0] - 24, center[1]],
          [center[0] + 24, center[1]]
        ]
      },
      style: { fill: { type: 'solid', color: 'rgba(239, 68, 68, 0.28)' }, strokes: [{ color: '#ef4444', width: 2 }] }
    });
  }
  return module;
}

function gridCoordinate(index: number, count: number, offset: Coordinate, random: () => number): Coordinate {
  const columns = Math.max(1, Math.ceil(Math.sqrt((count * 16) / 9)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  const jitterX = (random() - 0.5) * 0.2;
  const jitterY = (random() - 0.5) * 0.2;
  return [offset[0] - 610 + ((column + 0.5 + jitterX) * 1_220) / columns, offset[1] + 340 - ((row + 0.5 + jitterY) * 680) / rows];
}

function benchmarkModule(name: string): string {
  const module = `animation-benchmark-${name}`;
  modules.add(module);
  return module;
}

function track(handle: AnimationHandle): void {
  animationHandles.add(handle);
}

function cleanup(): void {
  for (const handle of animationHandles) handle.stop();
  animationHandles.clear();
  for (const module of modules) earth.elements.remove({ module });
  modules.clear();
}

function resetView(variant: BenchmarkVariant): void {
  const view = earth.map.getView();
  const projection = view.getProjection();
  const centerX = variant === 'world-copy' ? getWidth(projection.getExtent()) : 0;
  view.setCenter([centerX, 0]);
  view.setResolution(1);
  view.setRotation(0);
}

function variantOffset(variant: BenchmarkVariant): Coordinate {
  return variant === 'offscreen' ? [2_000_000, 2_000_000] : [0, 0];
}

function collectMapFrameTimes(count: number): Promise<readonly number[]> {
  if (count === 0) return Promise.resolve(Object.freeze([]));
  return new Promise((resolve) => {
    const times: number[] = [];
    const key = earth.map.on('postrender', (event) => {
      const frameTime = (event as unknown as { readonly frameState?: { readonly time?: number } }).frameState?.time;
      times.push(typeof frameTime === 'number' && Number.isFinite(frameTime) ? frameTime : performance.now());
      if (times.length >= count) {
        unByKey(key);
        resolve(Object.freeze(times));
        return;
      }
      earth.map.render();
    });
    earth.map.render();
  });
}

function activePostrenderListenerCount(current: Earth): number {
  return current.map
    .getLayers()
    .getArray()
    .reduce((total, layer) => total + (layer.getListeners('postrender')?.length ?? 0), 0);
}

function coverageOfCircles(count: number, radius: number): number {
  return Math.min(1, (count * Math.PI * radius * radius) / (1_280 * 720));
}

function seededRandom(seed: number): () => number {
  if (!Number.isSafeInteger(seed)) throw new Error('动画基准 seed 必须是安全整数');
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function requireFrameCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}必须是非负安全整数`);
}

function elapsedBetween(times: readonly number[]): number {
  if (times.length < 2) return 0;
  return Math.max(0, times[times.length - 1] - times[0]);
}
