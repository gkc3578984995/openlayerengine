import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { getWidth } from 'ol/extent.js';
import { get as getProjection } from 'ol/proj.js';
import Style from 'ol/style/Style.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerRenderPass } from '../src/adapters/openlayers/render/LayerRenderPass.js';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import type { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import type { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { LayerRenderBatch, LayerRenderValue } from '../src/core/ports/LayerRenderPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import { pointElement, polylineElement } from './helpers/animationHarness.js';

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

describe('LayerRenderPass', () => {
  it('同层一千个元素动画与 Transform 临时目标只安装一个 postrender 并且每帧只触发一次 changed', () => {
    const states = Array.from({ length: 1_000 }, (_, index) => pointElement(`point-${index}`, { geometry: { type: 'point', controlPoints: [[index, 0]] } }));
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.transaction((transaction) => {
      for (const state of states) transaction.add(state);
    });
    const harness = createPassHarness(states);
    const on = vi.spyOn(harness.layer, 'on');
    const changed = vi.spyOn(harness.layer, 'changed');
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({ store, shapes, render: pass });
    const applied: Array<{ value: LayerRenderValue; time: number }> = [];
    const cleared: string[] = [];
    const transientTarget = pass.registerTarget({
      layerId: 'default',
      targetId: 'transform-bbox',
      apply: (value, frame) => applied.push({ value, time: frame.time }),
      clear: (channel) => cleared.push(channel)
    });

    const elements = manager.play({ layerId: 'default' }, { type: 'pulse' });
    const transient = manager.playTransient({
      ownerId: 'transform-session',
      renderLayerId: 'default',
      renderTargetId: 'transform-bbox',
      channel: 'transform-bbox',
      animation: { type: 'blink', periodMs: 420 }
    });

    expect(on).toHaveBeenCalledTimes(1);
    expect(pass.activeLoopCount).toBe(1);
    expect(harness.layer.hasListener('postrender')).toBe(true);
    changed.mockClear();
    dispatchFrame(harness.layer, 100, 0);

    expect(changed).toHaveBeenCalledTimes(1);
    expect(renderSpies.getVectorContext).toHaveBeenCalledTimes(1);
    expect(renderSpies.drawFeature).toHaveBeenCalledTimes(3_000);
    expect(applied).toEqual([{ value: { visible: true }, time: 100 }]);
    expect(manager.activeCount).toBe(1_001);
    expect(elements.status).toBe('running');
    expect(transient.status).toBe('running');

    manager.stopAll();
    expect(pass.activeLoopCount).toBe(0);
    expect(harness.layer.hasListener('postrender')).toBe(false);
    expect(cleared).toEqual(['transform-bbox']);
    transientTarget.destroy();
    manager.destroy();
    pass.destroy();
  });

  it('注册目标按 channel 应用和清理临时值，销毁最后循环后移除监听', () => {
    const harness = createPassHarness([]);
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles);
    const changed = vi.spyOn(harness.layer, 'changed');
    const apply = vi.fn();
    const clear = vi.fn();
    const target = pass.registerTarget({ layerId: 'default', targetId: 'bbox', apply, clear });
    let batch: LayerRenderBatch = {
      contributions: [{ targetId: 'bbox', channel: 'blink', value: { visible: false } }],
      requestNextFrame: true
    };
    const loop = pass.open('default', () => batch);

    loop.requestRender();
    expect(changed).toHaveBeenCalledTimes(1);
    changed.mockClear();
    dispatchFrame(harness.layer, 420, 0);
    expect(apply).toHaveBeenCalledWith({ visible: false }, { layerId: 'default', time: 420, resolution: 1 });
    expect(changed).toHaveBeenCalledTimes(1);

    batch = { contributions: [], requestNextFrame: false };
    dispatchFrame(harness.layer, 840, 0);
    expect(clear).toHaveBeenCalledWith('blink');
    target.destroy();
    target.destroy();
    expect(pass.registeredTargetCount).toBe(0);

    loop.destroy();
    loop.destroy();
    expect(pass.activeLoopCount).toBe(0);
    expect(harness.layer.hasListener('postrender')).toBe(false);
    pass.destroy();
    expect(() => pass.open('default', () => batch)).toThrowError(ObjectDisposedError);
  });

  it('隔离单个临时目标异常并继续处理同层贡献和下一帧调度', () => {
    const harness = createPassHarness([]);
    const reported = vi.fn();
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles, { errorReporter: reported });
    const changed = vi.spyOn(harness.layer, 'changed');
    const successful = vi.fn();
    pass.registerTarget({
      layerId: 'default',
      targetId: 'broken',
      apply: () => {
        throw new Error('target failed');
      },
      clear: vi.fn()
    });
    pass.registerTarget({ layerId: 'default', targetId: 'healthy', apply: successful, clear: vi.fn() });
    pass.open('default', () => ({
      contributions: [
        { targetId: 'broken', channel: 'blink', value: { visible: false } },
        { targetId: 'healthy', channel: 'blink', value: { visible: true } }
      ],
      requestNextFrame: true
    }));

    dispatchFrame(harness.layer, 420, 0);

    expect(reported).toHaveBeenCalledOnce();
    expect(successful).toHaveBeenCalledWith({ visible: true }, { layerId: 'default', time: 420, resolution: 1 });
    expect(changed).toHaveBeenCalledTimes(1);
    pass.destroy();
  });

  it('临时目标 clear 首次失败时保留注册和应用记录，重复销毁后完成清理', () => {
    const harness = createPassHarness([]);
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles);
    let fail = true;
    const clear = vi.fn(() => {
      if (fail) {
        fail = false;
        throw new Error('clear failed');
      }
    });
    const target = pass.registerTarget({ layerId: 'default', targetId: 'bbox', apply: vi.fn(), clear });
    pass.open('default', () => ({
      contributions: [{ targetId: 'bbox', channel: 'blink', value: { visible: false } }],
      requestNextFrame: false
    }));
    dispatchFrame(harness.layer, 420, 0);

    expect(() => target.destroy()).toThrow('clear failed');
    expect(pass.registeredTargetCount).toBe(1);
    target.destroy();
    expect(clear).toHaveBeenCalledTimes(2);
    expect(pass.registeredTargetCount).toBe(0);
    pass.destroy();
  });

  it('严格拒绝临时目标访问器且不执行 getter', () => {
    const harness = createPassHarness([]);
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles);
    const getter = vi.fn(() => 'default');
    const target = { targetId: 'bbox', apply: vi.fn(), clear: vi.fn() };
    Object.defineProperty(target, 'layerId', { enumerable: true, get: getter });

    expect(() => pass.registerTarget(target as never)).toThrowError(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();
    pass.destroy();
  });

  it('wrapX 关闭时只绘制规范世界，不生成相邻世界副本', () => {
    const state = pointElement('point');
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state], false);
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({ store, shapes, render: pass });
    manager.play({ id: 'point' }, { type: 'pulse' });
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('测试需要 EPSG:3857 投影');

    dispatchFrame(harness.layer, 0, getWidth(projection.getExtent()));

    expect(renderSpies.drawFeature).toHaveBeenCalledTimes(1);
    manager.destroy();
    pass.destroy();
  });

  it('在相邻 world copy 绘制 pulse、dash-flow 与 path-travel，且规范坐标和动画时间保持连续', () => {
    const states = [pointElement('point', { geometry: { type: 'point', controlPoints: [[10, 20]] } }), polylineElement('dash'), polylineElement('flight')];
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    for (const state of states) store.add(state);
    const harness = createPassHarness(states);
    const pass = new LayerRenderPass(harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({ store, shapes, render: pass });
    const point = manager.play({ id: 'point' }, { type: 'pulse', periodMs: 1_000 });
    const dash = manager.play({ id: 'dash' }, { type: 'dash-flow', speed: 24 });
    const flight = manager.play(
      { id: 'flight' },
      { type: 'path-travel', durationMs: 1_000, repeat: false, trailLength: 0.5, showStart: false, showEnd: false }
    );
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('测试需要 EPSG:3857 投影');
    const worldWidth = getWidth(projection.getExtent());
    const drawnExtents: number[][] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => {
      const geometry = feature.getGeometry();
      if (geometry !== undefined) drawnExtents.push([...geometry.getExtent()]);
    });

    dispatchFrame(harness.layer, 0, 0);
    drawnExtents.length = 0;
    harness.styles.compile.mockClear();
    dispatchFrame(harness.layer, 500, worldWidth);

    expect(drawnExtents.some(([minX, , maxX]) => minX <= worldWidth + 10 && maxX >= worldWidth + 10)).toBe(true);
    expect(drawnExtents.some(([minX]) => Math.abs(minX) < 1)).toBe(true);
    expect(drawnExtents.some(([minX]) => Math.abs(minX - worldWidth * 2) < 1)).toBe(true);
    const compiledStyles = harness.styles.compile.mock.calls.map(([style]) => style as StyleSpec);
    expect(compiledStyles.some(({ symbol }) => symbol?.type === 'circle' && symbol.radius === 14.75)).toBe(true);
    expect(compiledStyles.some(({ strokes }) => strokes?.some(({ lineDashOffset }) => lineDashOffset === -12))).toBe(true);
    expect(point.status).toBe('running');
    expect(dash.status).toBe('running');
    expect(flight.status).toBe('running');
    expect(store.get('point')?.geometry).toEqual({ type: 'point', controlPoints: [[10, 20]] });
    expect(store.get('dash')?.geometry).toEqual(polylineElement('dash').geometry);

    dispatchFrame(harness.layer, 1_000, -worldWidth);
    expect(flight.status).toBe('finished');
    expect(point.status).toBe('running');
    expect(dash.status).toBe('running');
    manager.destroy();
    pass.destroy();
  });
});

interface PassHarness {
  readonly layer: VectorLayer;
  readonly layers: LayerAdapter;
  readonly binding: FeatureBinding;
  readonly styles: StyleCompiler & { readonly compile: ReturnType<typeof vi.fn> };
}

function createPassHarness(states: readonly ElementState[], wrapX = true): PassHarness {
  const layer = new VectorLayer({ source: new VectorSource({ wrapX }) });
  const features = new Map<string, Feature<Geometry>>();
  for (const state of states) {
    const geometry =
      state.type === 'point'
        ? new Point([0, 0])
        : new LineString([
            [0, 0],
            [1, 1]
          ]);
    const feature = new Feature<Geometry>(geometry);
    feature.setId(state.id);
    features.set(state.id, feature);
  }
  const layers = {
    requireLayer(layerId: string) {
      if (layerId !== 'default') throw new Error(`未知图层 ${layerId}`);
      return layer;
    }
  } as unknown as LayerAdapter;
  const binding = {
    requireFeature(id: string) {
      const feature = features.get(id);
      if (feature === undefined) throw new Error(`未知元素 ${id}`);
      return feature;
    },
    resolveFeature(feature: Feature<Geometry>) {
      const id = feature.getId();
      return typeof id === 'string' && features.get(id) === feature ? { elementId: id, layerId: 'default', visible: true } : undefined;
    }
  } as unknown as FeatureBinding;
  const compile = vi.fn(() => new Style());
  const styles = { compile } as unknown as PassHarness['styles'];
  return { layer, layers, binding, styles };
}

function dispatchFrame(layer: VectorLayer, time: number, centerX: number): void {
  const projection = getProjection('EPSG:3857');
  if (projection === null) throw new Error('测试需要 EPSG:3857 投影');
  layer.dispatchEvent({
    type: 'postrender',
    frameState: {
      time,
      viewState: { center: [centerX, 0], resolution: 1, projection }
    }
  } as never);
}
