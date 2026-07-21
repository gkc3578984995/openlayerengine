import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import Observable from 'ol/Observable.js';
import VectorSource from 'ol/source/Vector.js';
import { getWidth } from 'ol/extent.js';
import { get as getProjection } from 'ol/proj.js';
import Style from 'ol/style/Style.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import type { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { LayerRenderPass } from '../src/adapters/openlayers/render/LayerRenderPass.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { centerSpreadAnimationDefinition } from '../src/builtins/animations/centerSpread.js';
import { createBuiltinAnimationRegistry } from '../src/builtins/animations/index.js';
import { pathTravelAnimationDefinition } from '../src/builtins/animations/pathTravel.js';
import { radarScanAnimationDefinition } from '../src/builtins/animations/radarScan.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { AnimationClockPort } from '../src/core/ports/AnimationClockPort.js';
import type { AnimationWakeHandle, AnimationWakePort } from '../src/core/ports/AnimationWakePort.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import type {
  LayerPresentationLease,
  LayerRenderBatch,
  LayerRenderFrame,
  LayerRenderLoopHandle,
  LayerRenderPort,
  LayerRenderPrimitive,
  LayerRenderTargetHandle,
  LayerRenderTargetSpec
} from '../src/core/ports/LayerRenderPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { RenderGeometryState, ShapeDefinition } from '../src/core/shape/types.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { createAnimationFrameBuffer } from '../src/services/animation/AnimationFrameBuffer.js';
import { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import type { AnimationTargetProfile } from '../src/services/animation/types.js';
import { identityShapeProjection } from './helpers/shapeProjection.js';

const renderSpies = vi.hoisted(() => ({
  drawFeature: vi.fn(),
  getVectorContext: vi.fn()
}));

vi.mock('ol/render.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ol/render.js')>();
  return { ...actual, getVectorContext: renderSpies.getVectorContext };
});

beforeEach(() => {
  renderSpies.drawFeature.mockReset();
  renderSpies.getVectorContext.mockReset();
  renderSpies.getVectorContext.mockReturnValue({ drawFeature: renderSpies.drawFeature });
});

describe('动画性能与资源预算', () => {
  it('固定拓扑预热后连续 300 帧复用 OL Feature、Geometry、Style，且不再编译样式或改变规范 revision', () => {
    const state = pointElement('stable-point', 0);
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const baseGeometry: Extract<RenderGeometryState, { type: 'point' }> = { type: 'point', coordinates: [0, 0] };
    const overlayGeometry: Extract<RenderGeometryState, { type: 'circle' }> = { type: 'circle', center: [0, 0], radius: 8 };
    const baseStyle: StyleSpec = { symbol: { type: 'circle', radius: 6, fill: { type: 'solid', color: '#1677ff' } } };
    const overlayStyle: StyleSpec = { strokes: [{ color: '#00e5ff', width: 2 }] };
    const batch: LayerRenderBatch = {
      contributions: [
        {
          targetId: state.id,
          channel: '$animation',
          value: {
            presentation: { slotKey: 'base', geometry: baseGeometry, style: baseStyle, opacity: 0.75 },
            primitives: [{ slotKey: 'pulse-ring', geometry: overlayGeometry, style: overlayStyle, opacity: 0.5 }]
          }
        }
      ],
      requestNextFrame: true
    };
    pass.open('default', () => batch);

    const warmDraws: Array<{ readonly feature: Feature<Geometry>; readonly geometry: Geometry; readonly style: Style }> = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>, style: Style) => {
      const geometry = feature.getGeometry();
      if (geometry === undefined) throw new Error('稳定 slot 缺少 Geometry');
      warmDraws.push({ feature, geometry, style });
    });
    dispatchFrame(harness.layer, 0);
    expect(warmDraws).toHaveLength(2);

    const warmFeatures = new Set(warmDraws.map(({ feature }) => feature));
    const warmGeometries = new Set(warmDraws.map(({ geometry }) => geometry));
    const warmStyles = new Set(warmDraws.map(({ style }) => style));
    const compileBaseline = harness.styles.compilePresentationCallCount;
    const layerRevision = harness.layer.getRevision();
    const sourceRevision = harness.source.getRevision();
    const canonicalRevision = harness.features.get(state.id)?.getRevision();
    const observedFeatures = new Set<Feature<Geometry>>();
    const observedGeometries = new Set<Geometry>();
    const observedStyles = new Set<Style>();
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>, style: Style) => {
      const geometry = feature.getGeometry();
      if (geometry === undefined) throw new Error('稳定 slot 缺少 Geometry');
      observedFeatures.add(feature);
      observedGeometries.add(geometry);
      observedStyles.add(style);
    });

    for (let frame = 1; frame <= 300; frame += 1) {
      baseGeometry.coordinates[0] = frame;
      overlayGeometry.center[1] = frame;
      overlayGeometry.radius = 8 + (frame % 5);
      dispatchFrame(harness.layer, frame * 16);
    }

    expect(renderSpies.drawFeature).toHaveBeenCalledTimes(2 + 300 * 2);
    expect([...observedFeatures]).toEqual(expect.arrayContaining([...warmFeatures]));
    expect([...observedGeometries]).toEqual(expect.arrayContaining([...warmGeometries]));
    expect([...observedStyles]).toEqual(expect.arrayContaining([...warmStyles]));
    expect(observedFeatures.size).toBe(warmFeatures.size);
    expect(observedGeometries.size).toBe(warmGeometries.size);
    expect(observedStyles.size).toBe(warmStyles.size);
    expect(harness.styles.compilePresentationCallCount).toBe(compileBaseline);
    expect(pass.cachedPresentationCount).toBe(1);
    expect(pass.cachedOverlayCount).toBe(1);
    expect(harness.layer.getRevision()).toBe(layerRevision);
    expect(harness.source.getRevision()).toBe(sourceRevision);
    expect(harness.features.get(state.id)?.getRevision()).toBe(canonicalRevision);

    pass.destroy();
    harness.styles.destroy();
  });

  it('radar、center-spread 与 path-travel 的 Runtime 使用固定且有硬上限的 slot topology', () => {
    const radialTarget = circleTarget();
    const radarSpec = radarScanAnimationDefinition.normalize({ type: 'radar-scan' });
    const radar = radarScanAnimationDefinition.create(radialTarget, radarSpec);
    const radarSlots = radar.slots;
    const radarBuffer = createAnimationFrameBuffer(radarSlots);
    expect(radarSlots).toHaveLength(10);
    expect(radarSlots.length).toBeLessThanOrEqual(16);
    for (let frame = 0; frame < 300; frame += 1) {
      radar.sample(frameContext(radialTarget, frame * 17), radarBuffer);
      expect(radar.slots).toBe(radarSlots);
      expect(radarBuffer.overlays.filter(({ active }) => active).length).toBeLessThanOrEqual(10);
    }

    const roundTripSpec = radarScanAnimationDefinition.normalize({ type: 'radar-scan', periodMs: 1000, scanMode: 'round-trip' });
    const roundTripRadar = radarScanAnimationDefinition.create(radialTarget, roundTripSpec);
    const roundTripSlots = roundTripRadar.slots;
    const roundTripBuffer = createAnimationFrameBuffer(roundTripSlots);
    const roundTripGeometryBySlot = new Map<number, RenderGeometryState>();
    expect(roundTripSlots).toHaveLength(10);
    for (let frame = 0; frame < 300; frame += 1) {
      roundTripRadar.sample(frameContext(radialTarget, frame * 17), roundTripBuffer);
      expect(roundTripRadar.slots).toBe(roundTripSlots);
      expect(roundTripBuffer.overlays.filter(({ active }) => active).length).toBeLessThanOrEqual(10);
      for (let index = 0; index < roundTripBuffer.overlays.length; index += 1) {
        const geometry = roundTripBuffer.overlays[index].geometry;
        if (geometry === undefined) continue;
        const stableGeometry = roundTripGeometryBySlot.get(index);
        if (stableGeometry === undefined) roundTripGeometryBySlot.set(index, geometry);
        else expect(geometry).toBe(stableGeometry);
      }
    }
    expect(roundTripGeometryBySlot.size).toBe(10);

    const spreadSpec = centerSpreadAnimationDefinition.normalize({ type: 'center-spread', ringCount: 5 });
    const spread = centerSpreadAnimationDefinition.create(radialTarget, spreadSpec);
    const spreadSlots = spread.slots;
    const spreadBuffer = createAnimationFrameBuffer(spreadSlots);
    expect(spreadSlots).toHaveLength(25);
    expect(spreadSlots.length).toBeLessThanOrEqual(25);
    for (let frame = 0; frame < 300; frame += 1) {
      spread.sample(frameContext(radialTarget, frame * 17), spreadBuffer);
      expect(spread.slots).toBe(spreadSlots);
      expect(spreadBuffer.overlays.filter(({ active }) => active).length).toBeLessThanOrEqual(25);
    }

    const pathTarget = polylineTarget();
    const pathSpec = pathTravelAnimationDefinition.normalize({
      type: 'path-travel',
      durationMs: 1_000,
      gradient: [
        [0, '#00e5ff'],
        [1, '#ff3b30']
      ],
      showStart: false,
      showEnd: false
    });
    const path = pathTravelAnimationDefinition.create(pathTarget, pathSpec);
    const pathSlots = path.slots;
    const trailSlotIndexes = pathSlots.flatMap(({ slotKey }, index) => (slotKey.startsWith('trail-') ? [index] : []));
    const pathBuffer = createAnimationFrameBuffer(pathSlots);
    const geometryBySlot = new Map<number, RenderGeometryState>();
    expect(trailSlotIndexes).toHaveLength(24);
    for (let frame = 1; frame <= 300; frame += 1) {
      path.sample(frameContext(pathTarget, frame * 17), pathBuffer);
      expect(path.slots).toBe(pathSlots);
      expect(trailSlotIndexes.filter((index) => pathBuffer.overlays[index].active).length).toBeLessThanOrEqual(24);
      for (const index of trailSlotIndexes) {
        const geometry = pathBuffer.overlays[index].geometry;
        if (!pathBuffer.overlays[index].active || geometry === undefined) continue;
        const previous = geometryBySlot.get(index);
        if (previous === undefined) geometryBySlot.set(index, geometry);
        else expect(geometry).toBe(previous);
      }
    }
    expect(geometryBySlot.size).toBeGreaterThan(0);

    radar.destroy();
    roundTripRadar.destroy();
    spread.destroy();
    path.destroy();
  });

  it('连续 100 次 play/stop 后 Manager、RenderPass、presentation lease、slot 与 wake 全部恢复基线', () => {
    const harness = createKernelHarness([polygonElement('lease-area', 0)]);

    for (let cycle = 0; cycle < 100; cycle += 1) {
      harness.timing.setNow(cycle * 20_000);
      const fade = harness.manager.play({ id: 'lease-area' }, { type: 'fade', direction: 'out', durationMs: 10_000 });
      const highlight = harness.manager.play({ id: 'lease-area' }, { type: 'highlight' });
      dispatchFrame(harness.adapter.layer, cycle * 20_000);

      expect(harness.manager.activeCount).toBe(2);
      expect(harness.manager.activeLayerCount).toBe(1);
      expect(harness.pass.activeLoopCount).toBe(1);
      expect(harness.pass.cachedPresentationCount).toBe(1);
      expect(harness.pass.cachedOverlayCount).toBe(2);
      expect(harness.adapter.leases.filter(({ active }) => active)).toHaveLength(1);
      expect(harness.timing.activeWakeCount).toBeLessThanOrEqual(1);

      highlight.stop();
      fade.stop();
      highlight.stop();
      fade.stop();

      expect(harness.manager.activeCount).toBe(0);
      expect(harness.manager.activeLayerCount).toBe(0);
      expect(harness.pass.activeLoopCount).toBe(0);
      expect(harness.pass.cachedPresentationCount).toBe(0);
      expect(harness.pass.cachedOverlayCount).toBe(0);
      expect(harness.adapter.leases.filter(({ active }) => active)).toHaveLength(0);
      expect(harness.timing.activeWakeCount).toBe(0);
      expect(harness.adapter.layer.hasListener('postrender')).toBe(false);
    }

    expect(harness.adapter.leases).toHaveLength(100);
    harness.manager.destroy();
    harness.pass.destroy();
    harness.adapter.styles.destroy();
  });

  it('同层 1000 个 overlay 与 200 个 grow 只合成一个 RenderPass，并保持固定贡献与 slot 上界', () => {
    const overlays = Array.from({ length: 1_000 }, (_, index) => pointElement(`overlay-${index}`, index, 'overlay-budget'));
    const grows = Array.from({ length: 200 }, (_, index) => polylineElement(`grow-${index}`, index, 'grow-budget'));
    const harness = createKernelHarness([...overlays, ...grows]);
    const pulse = harness.manager.play({ module: 'overlay-budget' }, { type: 'pulse', periodMs: 1_000, repeat: true });
    const grow = harness.manager.play({ module: 'grow-budget' }, { type: 'grow', durationMs: 1_200, repeat: true });

    dispatchFrame(harness.adapter.layer, 0);
    dispatchFrame(harness.adapter.layer, 600);
    const stableBatch = requireLastBatch(harness.batches);
    const topology = batchTopology(stableBatch);
    const compileBaseline = harness.adapter.styles.compilePresentationCallCount;

    expect(harness.manager.activeCount).toBe(1_200);
    expect(harness.manager.activeLayerCount).toBe(1);
    expect(harness.pass.activeLoopCount).toBe(1);
    expect(harness.adapter.layer.getListeners('postrender')).toHaveLength(1);
    expect(stableBatch.contributions).toHaveLength(1_200);
    expect(stableBatch.contributions.filter(({ value }) => value.presentation !== undefined)).toHaveLength(200);
    expect(stableBatch.contributions.reduce((total, { value }) => total + (value.primitives?.length ?? 0), 0)).toBe(1_000);
    expect(Math.max(...stableBatch.contributions.map(({ value }) => value.primitives?.length ?? 0))).toBe(1);
    expect(harness.pass.cachedPresentationCount).toBe(200);
    expect(harness.pass.cachedOverlayCount).toBe(1_000);

    dispatchFrame(harness.adapter.layer, 700);
    expect(batchTopology(requireLastBatch(harness.batches))).toEqual(topology);
    expect(harness.adapter.styles.compilePresentationCallCount).toBe(compileBaseline);
    expect(harness.pass.cachedPresentationCount).toBe(200);
    expect(harness.pass.cachedOverlayCount).toBe(1_000);

    pulse.stop();
    grow.stop();
    expect(harness.manager.activeCount).toBe(0);
    expect(harness.pass.activeLoopCount).toBe(0);
    expect(harness.pass.cachedPresentationCount).toBe(0);
    expect(harness.pass.cachedOverlayCount).toBe(0);
    expect(harness.adapter.leases.filter(({ active }) => active)).toHaveLength(0);
    harness.manager.destroy();
    harness.pass.destroy();
    harness.adapter.styles.destroy();
  });
});

interface TestLease extends LayerPresentationLease {
  readonly active: boolean;
}

interface PassHarness {
  readonly map: OlMap;
  readonly layer: VectorLayer;
  readonly source: VectorSource;
  readonly layers: LayerAdapter;
  readonly binding: FeatureBinding;
  readonly styles: CountingStyleCompiler;
  readonly features: ReadonlyMap<string, Feature<Geometry>>;
  readonly leases: TestLease[];
}

interface KernelHarness {
  readonly adapter: PassHarness;
  readonly pass: LayerRenderPass;
  readonly timing: ManualAnimationTiming;
  readonly batches: LayerRenderBatch[];
  readonly manager: AnimationManagerImpl;
}

function createKernelHarness(states: readonly ElementState[]): KernelHarness {
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  store.transaction((transaction) => {
    for (const state of states) transaction.add(state);
  });
  const adapter = createPassHarness(states);
  const pass = new LayerRenderPass(adapter.map, adapter.layers, adapter.binding, adapter.styles);
  const batches: LayerRenderBatch[] = [];
  const render: LayerRenderPort = {
    open(layerId: string, callback: (frame: LayerRenderFrame) => LayerRenderBatch): LayerRenderLoopHandle {
      return pass.open(layerId, (frame) => {
        const batch = callback(frame);
        batches.push(batch);
        return batch;
      });
    },
    registerTarget(spec: LayerRenderTargetSpec): LayerRenderTargetHandle {
      return pass.registerTarget(spec);
    },
    hasTarget(layerId: string, targetId: string): boolean {
      return pass.hasTarget(layerId, targetId);
    },
    acquirePresentation(layerId: string, targetId: string): LayerPresentationLease {
      return pass.acquirePresentation(layerId, targetId);
    }
  };
  const timing = new ManualAnimationTiming();
  const manager = new AnimationManagerImpl({
    store,
    shapes,
    render,
    shapeProjection: identityShapeProjection,
    registry: createBuiltinAnimationRegistry(),
    clock: timing,
    wake: timing
  });
  return { adapter, pass, timing, batches, manager };
}

function createPassHarness(states: readonly ElementState[]): PassHarness {
  const render = vi.fn();
  const map = Object.assign(new Observable(), { render }) as unknown as OlMap;
  const source = new VectorSource({ wrapX: true });
  const layer = new VectorLayer({ source });
  const features = new Map<string, Feature<Geometry>>();
  const renderOrders = new Map<string, number>();
  for (const state of states) {
    const feature = new Feature<Geometry>(canonicalGeometry(state));
    feature.setId(state.id);
    features.set(state.id, feature);
    renderOrders.set(state.id, renderOrders.size);
  }
  source.addFeatures([...features.values()]);
  const layers = {
    requireLayer(layerId: string) {
      if (layerId !== 'default') throw new Error(`未知图层 ${layerId}`);
      return layer;
    }
  } as unknown as LayerAdapter;
  const leases: TestLease[] = [];
  const binding = {
    requireFeature(id: string) {
      const feature = features.get(id);
      if (feature === undefined) throw new Error(`未知元素 ${id}`);
      return feature;
    },
    renderOrderOf(id: string) {
      const order = renderOrders.get(id);
      if (order === undefined) throw new Error(`未知元素 ${id}`);
      return order;
    },
    resolveFeature(feature: Feature<Geometry>) {
      const id = feature.getId();
      return typeof id === 'string' && features.get(id) === feature ? { elementId: id, layerId: 'default', visible: true } : undefined;
    },
    acquirePresentation(id: string) {
      if (!features.has(id)) throw new Error(`未知元素 ${id}`);
      let active = true;
      const lease: TestLease = Object.freeze({
        layerId: 'default',
        targetId: id,
        get active() {
          return active;
        },
        release() {
          active = false;
        }
      });
      leases.push(lease);
      return lease;
    }
  } as unknown as FeatureBinding;
  const styles = new CountingStyleCompiler();
  return { map, layer, source, layers, binding, styles, features, leases };
}

class CountingStyleCompiler extends StyleCompiler {
  readonly #nativeRefs: NativeRefRegistry;
  compilePresentationCallCount = 0;

  constructor() {
    const nativeRefs = new NativeRefRegistry();
    super(nativeRefs);
    this.#nativeRefs = nativeRefs;
  }

  override compilePresentation(...parameters: Parameters<StyleCompiler['compilePresentation']>): ReturnType<StyleCompiler['compilePresentation']> {
    this.compilePresentationCallCount += 1;
    return super.compilePresentation(...parameters);
  }

  destroy(): void {
    this.#nativeRefs.destroy();
  }
}

class ManualAnimationTiming implements AnimationClockPort, AnimationWakePort {
  readonly #wakes = new Set<AnimationWakeHandle>();
  #now = 0;

  get activeWakeCount(): number {
    return this.#wakes.size;
  }

  now(): number {
    return this.#now;
  }

  setNow(value: number): void {
    this.#now = value;
  }

  scheduleAt(timestamp: number, callback: () => void): AnimationWakeHandle {
    if (!Number.isFinite(timestamp) || typeof callback !== 'function') throw new Error('动画唤醒参数非法');
    let active = true;
    const handle: AnimationWakeHandle = {
      cancel: () => {
        if (!active) return;
        active = false;
        this.#wakes.delete(handle);
      }
    };
    this.#wakes.add(handle);
    return handle;
  }
}

function canonicalGeometry(state: ElementState): Geometry {
  if (state.geometry.type === 'point') return new Point([...state.geometry.controlPoints[0]]);
  if (state.geometry.type === 'polyline') return new LineString(state.geometry.controlPoints.map((coordinate) => [...coordinate]));
  if (state.geometry.type === 'circle') return new Circle([...state.geometry.center], state.geometry.radius);
  const controlPoints = 'controlPoints' in state.geometry ? state.geometry.controlPoints : [];
  const ring = controlPoints.map((coordinate) => [...coordinate]);
  if (ring.length > 0) ring.push([...ring[0]]);
  return new Polygon([ring]);
}

function dispatchFrame(layer: VectorLayer, time: number): void {
  const projection = getProjection('EPSG:3857');
  if (projection === null) throw new Error('测试需要 EPSG:3857 投影');
  const worldWidth = getWidth(projection.getExtent());
  layer.dispatchEvent({
    type: 'postrender',
    frameState: {
      time,
      extent: [-worldWidth / 2, -worldWidth / 2, worldWidth / 2, worldWidth / 2],
      pixelRatio: 1,
      viewState: { center: [0, 0], resolution: 1, rotation: 0, projection }
    }
  } as never);
}

function pointElement(id: string, index: number, module = 'markers'): ElementState {
  const x = (index % 50) * 20;
  const y = Math.floor(index / 50) * 20;
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[x, y]] },
    style: { symbol: { type: 'circle', radius: 6, fill: { type: 'solid', color: '#1677ff' } } },
    module,
    layerId: 'default',
    visible: true
  };
}

function polylineElement(id: string, index: number, module = 'routes'): ElementState {
  const y = index * 4;
  return {
    id,
    type: 'polyline',
    geometry: {
      type: 'polyline',
      controlPoints: [
        [0, y],
        [50, y + 10],
        [100, y]
      ]
    },
    style: { strokes: [{ color: '#00d8ff', width: 2 }] },
    module,
    layerId: 'default',
    visible: true
  };
}

function polygonElement(id: string, index: number): ElementState {
  const x = index * 20;
  return {
    id,
    type: 'polygon',
    geometry: {
      type: 'polygon',
      controlPoints: [
        [x, 0],
        [x + 10, 0],
        [x + 10, 10],
        [x, 10]
      ]
    },
    style: { fill: { type: 'solid', color: '#334155' }, strokes: [{ color: '#94a3b8', width: 2 }] },
    module: 'areas',
    layerId: 'default',
    visible: true
  };
}

function circleTarget(): AnimationTargetProfile {
  const state: ElementState = {
    id: 'radial-target',
    type: 'circle',
    geometry: { type: 'circle', center: [0, 0], radius: 100 },
    style: { fill: { type: 'solid', color: '#334155' }, strokes: [{ color: '#94a3b8', width: 2 }] },
    module: 'areas',
    layerId: 'default',
    visible: true
  };
  return targetProfile(state, { type: 'circle', center: [0, 0], radius: 100 });
}

function polylineTarget(): AnimationTargetProfile {
  const state = polylineElement('path-target', 0);
  return targetProfile(state, {
    type: 'polyline',
    coordinates: [
      [0, 0],
      [50, 50],
      [100, 0]
    ]
  });
}

function targetProfile(state: ElementState, geometry: RenderGeometryState): AnimationTargetProfile {
  const shape = basicShapeDefinitions.find(({ type }) => type === state.type);
  if (shape === undefined) throw new Error(`未找到 ShapeDefinition：${state.type}`);
  return Object.freeze({
    state,
    viewShape: state.geometry,
    geometry,
    style: state.style as StyleSpec,
    shape: shape as ShapeDefinition
  });
}

function frameContext(target: AnimationTargetProfile, elapsedMs: number) {
  return { target, elapsedMs, resolution: 1, rotation: 0, pixelRatio: 1 } as const;
}

function requireLastBatch(batches: readonly LayerRenderBatch[]): LayerRenderBatch {
  const batch = batches.at(-1);
  if (batch === undefined) throw new Error('缺少动画合成批次');
  return batch;
}

function batchTopology(batch: LayerRenderBatch): readonly string[] {
  return batch.contributions.flatMap(({ targetId, value }) => [
    ...(value.presentation === undefined ? [] : [`${targetId}:presentation:${value.presentation.slotKey ?? ''}`]),
    ...(value.primitives ?? []).map((primitive: LayerRenderPrimitive) => `${targetId}:overlay:${primitive.slotKey ?? ''}`)
  ]);
}
