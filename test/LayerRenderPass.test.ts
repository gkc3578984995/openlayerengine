import Feature from 'ol/Feature.js';
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
import Projection from 'ol/proj/Projection.js';
import CircleStyle from 'ol/style/Circle.js';
import Stroke from 'ol/style/Stroke.js';
import Style, { type StyleLike } from 'ol/style/Style.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { LayerRenderPass } from '../src/adapters/openlayers/render/LayerRenderPass.js';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import type { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { createBuiltinAnimationRegistry } from '../src/builtins/animations/index.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { LayerRenderBatch, LayerRenderValue } from '../src/core/ports/LayerRenderPort.js';
import type { RenderGeometryState } from '../src/core/shape/types.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import { FakeLayerRenderPort, pointElement, polylineElement } from './helpers/animationHarness.js';

const animationTiming = new FakeLayerRenderPort();

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
  it('同一 frame time 的多个图层只请求一次下一帧', () => {
    const { map, render } = createRenderMap();
    const firstLayer = new VectorLayer({ source: new VectorSource() });
    const secondLayer = new VectorLayer({ source: new VectorSource() });
    const layers = {
      requireLayer(layerId: string) {
        if (layerId === 'first') return firstLayer;
        if (layerId === 'second') return secondLayer;
        throw new Error(`未知图层 ${layerId}`);
      }
    } as unknown as LayerAdapter;
    const binding = {} as FeatureBinding;
    const styles = {} as StyleCompiler;
    const pass = new LayerRenderPass(map, layers, binding, styles);
    const firstLoop = pass.open('first', () => ({ contributions: [], requestNextFrame: true }));
    const secondLoop = pass.open('second', () => ({ contributions: [], requestNextFrame: true }));

    firstLoop.requestRender();
    secondLoop.requestRender();
    expect(render).toHaveBeenCalledOnce();

    render.mockClear();
    dispatchFrame(firstLayer, 100, 0);
    dispatchFrame(secondLayer, 100, 0);
    dispatchMapFrame(map, 100);
    firstLoop.requestRender();
    expect(render).toHaveBeenCalledOnce();

    render.mockClear();
    dispatchFrame(firstLayer, 116, 0);
    dispatchFrame(secondLayer, 116, 0);
    expect(render).toHaveBeenCalledOnce();
    pass.destroy();
  });

  it('最后一个图层循环关闭后仍由地图帧释放门闩，让新循环请求首帧', () => {
    const harness = createPassHarness([]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const firstLoop = pass.open('default', () => ({ contributions: [], requestNextFrame: false }));

    firstLoop.requestRender();
    expect(harness.render).toHaveBeenCalledTimes(1);

    firstLoop.destroy();
    expect(pass.activeLoopCount).toBe(0);
    expect(harness.layer.hasListener('postrender')).toBe(false);

    dispatchMapFrame(harness.map, Number.NaN);
    const blockedLoop = pass.open('default', () => ({ contributions: [], requestNextFrame: false }));
    blockedLoop.requestRender();
    expect(harness.render).toHaveBeenCalledTimes(1);
    blockedLoop.destroy();

    dispatchMapFrame(harness.map, 100);
    const secondLoop = pass.open('default', () => ({ contributions: [], requestNextFrame: false }));
    secondLoop.requestRender();

    expect(harness.render).toHaveBeenCalledTimes(2);
    secondLoop.destroy();
    pass.destroy();
    pass.destroy();
    expect(harness.map.hasListener('postrender')).toBe(false);
  });

  it('同层一千个元素动画与 Transform 临时目标只安装一个 postrender，下一帧不使业务图层缓存失效', () => {
    const states = Array.from({ length: 1_000 }, (_, index) => pointElement(`point-${index}`, { geometry: { type: 'point', controlPoints: [[index, 0]] } }));
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.transaction((transaction) => {
      for (const state of states) transaction.add(state);
    });
    const harness = createPassHarness(states);
    const on = vi.spyOn(harness.layer, 'on');
    const changed = vi.spyOn(harness.layer, 'changed');
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
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
    harness.render.mockClear();
    const revision = harness.layer.getRevision();
    dispatchFrame(harness.layer, 100, 0);

    expect(changed).not.toHaveBeenCalled();
    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(harness.layer.getRevision()).toBe(revision);
    expect(renderSpies.getVectorContext).toHaveBeenCalledTimes(1);
    expect(renderSpies.drawFeature).toHaveBeenCalledTimes(1_000);
    expect(harness.styles.compile).toHaveBeenCalledTimes(1_000);
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
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
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
    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    harness.render.mockClear();
    changed.mockClear();
    dispatchFrame(harness.layer, 420, 0);
    expect(apply).toHaveBeenCalledWith(
      { visible: false },
      expect.objectContaining({ layerId: 'default', time: 420, resolution: 1, pixelRatio: 1, rotation: 0 })
    );
    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();

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
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles, { errorReporter: reported });
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
    expect(successful).toHaveBeenCalledWith(
      { visible: true },
      expect.objectContaining({ layerId: 'default', time: 420, resolution: 1, pixelRatio: 1, rotation: 0 })
    );
    expect(harness.render).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    pass.destroy();
  });

  it('临时目标 clear 首次失败时保留注册和应用记录，重复销毁后完成清理', () => {
    const harness = createPassHarness([]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
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
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const getter = vi.fn(() => 'default');
    const target = { targetId: 'bbox', apply: vi.fn(), clear: vi.fn() };
    Object.defineProperty(target, 'layerId', { enumerable: true, get: getter });

    expect(() => pass.registerTarget(target as never)).toThrowError(InvalidArgumentError);
    expect(getter).not.toHaveBeenCalled();
    pass.destroy();
  });

  it('展示租约委托给 FeatureBinding，并拒绝跨层接管', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    const acquirePresentation = vi.spyOn(harness.binding, 'acquirePresentation');
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);

    const lease = pass.acquirePresentation('default', 'point');
    expect(acquirePresentation).toHaveBeenCalledWith('point');
    expect(lease.active).toBe(true);
    lease.release();
    expect(lease.active).toBe(false);
    expect(() => pass.acquirePresentation('other', 'point')).toThrow();
    pass.destroy();
  });

  it('分离缓存基础替身与 overlay，稳定帧复用 Feature、Geometry 和编译样式并更新动态标量', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    harness.styles.compile.mockImplementation(
      () =>
        new Style({
          stroke: new Stroke({ color: '#00ff00', width: 2, lineDash: [4, 2], lineDashOffset: 1 }),
          image: new CircleStyle({ radius: 5, stroke: new Stroke({ color: '#ffffff', width: 1 }) })
        })
    );
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const baseGeometry = { type: 'point', coordinates: [1, 2] } as RenderGeometryState;
    const overlayGeometry = { type: 'point', coordinates: [3, 4] } as RenderGeometryState;
    const baseStyle: StyleSpec = { strokes: [{ color: '#00ff00', width: 2 }] };
    const overlayStyle: StyleSpec = { symbol: { type: 'circle', radius: 5 } };
    const slotReservations = [
      { kind: 'presentation', targetId: 'point' },
      { kind: 'overlay', targetId: 'point', channel: '__composite__', slotKey: 'alert-halo' }
    ] as const;
    const activeBatch: LayerRenderBatch = {
      contributions: [
        {
          targetId: 'point',
          channel: '__composite__',
          value: {
            presentation: {
              slotKey: 'base',
              geometry: baseGeometry,
              style: baseStyle,
              opacity: 0.5,
              dynamicStyle: { lineDashOffset: 4, strokeWidth: 6 }
            },
            primitives: [
              {
                slotKey: 'alert-halo',
                geometry: overlayGeometry,
                style: overlayStyle,
                opacity: 0.25,
                dynamicStyle: { symbolRadius: 9, rotation: Math.PI / 4 }
              }
            ]
          }
        }
      ],
      slotReservations,
      requestNextFrame: false
    };
    let batch = activeBatch;
    pass.open('default', () => batch);
    const context = canvasContext(0.8);
    const firstFeatures: Feature<Geometry>[] = [];
    const firstAlphas: number[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>, style: Style) => {
      firstFeatures.push(feature);
      firstAlphas.push(context.globalAlpha);
      if (firstFeatures.length === 1) {
        expect(style.getStroke()?.getLineDashOffset()).toBe(4);
        expect(style.getStroke()?.getWidth()).toBe(6);
      } else {
        expect((style.getImage() as CircleStyle).getRadius()).toBe(9);
        expect(style.getImage()?.getRotation()).toBeCloseTo(Math.PI / 4);
      }
    });

    dispatchFrame(harness.layer, 0, 0, 1, context);

    expect(firstFeatures).toHaveLength(2);
    expect(firstFeatures[0]).not.toBe(firstFeatures[1]);
    expect(firstAlphas).toEqual([0.4, 0.2]);
    expect(context.globalAlpha).toBe(0.8);
    expect(harness.styles.compile).toHaveBeenCalledTimes(2);
    expect(pass.cachedPresentationCount).toBe(1);
    expect(pass.cachedOverlayCount).toBe(1);

    (baseGeometry.coordinates as [number, number])[0] = 11;
    (overlayGeometry.coordinates as [number, number])[0] = 13;
    const secondFeatures: Feature<Geometry>[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => secondFeatures.push(feature));
    dispatchFrame(harness.layer, 16, 0, 1, context);

    expect(secondFeatures).toEqual(firstFeatures);
    expect((secondFeatures[0].getGeometry() as Point).getCoordinates()).toEqual([11, 2]);
    expect((secondFeatures[1].getGeometry() as Point).getCoordinates()).toEqual([13, 4]);
    expect(harness.styles.compile).toHaveBeenCalledTimes(2);

    const disposals = firstFeatures.map((feature) => vi.spyOn(feature, 'dispose'));
    batch = { contributions: [], slotReservations, requestNextFrame: false };
    dispatchFrame(harness.layer, 32, 0, 1, context);
    expect(pass.cachedPresentationCount).toBe(1);
    expect(pass.cachedOverlayCount).toBe(1);
    expect(disposals.map((dispose) => dispose.mock.calls.length)).toEqual([0, 0]);

    const resumedFeatures: Feature<Geometry>[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => resumedFeatures.push(feature));
    batch = activeBatch;
    dispatchFrame(harness.layer, 48, 0, 1, context);
    expect(resumedFeatures).toEqual(firstFeatures);
    expect(harness.styles.compile).toHaveBeenCalledTimes(2);

    batch = { contributions: [], requestNextFrame: false };
    dispatchFrame(harness.layer, 64, 0, 1, context);
    expect(pass.cachedPresentationCount).toBe(0);
    expect(pass.cachedOverlayCount).toBe(0);
    expect(disposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
    pass.destroy();
  });

  it('按目标规范 zIndex 与 Element generation 排序，并始终先绘制同目标 presentation', () => {
    const harness = createPassHarness([pointElement('first'), pointElement('second')]);
    const firstBaseStyle = { zIndex: 50, symbol: { type: 'circle' as const, radius: 5 } };
    const firstOverlayStyle = { zIndex: -50, symbol: { type: 'circle' as const, radius: 7 } };
    const secondOverlayStyle = { zIndex: 100, symbol: { type: 'circle' as const, radius: 9 } };
    const labels = new Map<Style, string>();
    harness.styles.compile.mockImplementation((style: StyleSpec) => {
      const compiled = new Style({ zIndex: style.zIndex });
      labels.set(compiled, style === firstBaseStyle ? 'first-base' : style === firstOverlayStyle ? 'first-overlay' : 'second-overlay');
      return compiled;
    });
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const contribution = (targetZIndexes: Readonly<{ first: number; second: number }>): LayerRenderBatch => ({
      contributions: [
        {
          targetId: 'second',
          channel: '$animation',
          targetZIndex: targetZIndexes.second,
          value: {
            primitives: [{ slotKey: 'overlay', geometry: { type: 'point', coordinates: [2, 0] }, style: secondOverlayStyle }]
          }
        },
        {
          targetId: 'first',
          channel: '$animation',
          targetZIndex: targetZIndexes.first,
          value: {
            presentation: { slotKey: 'base', geometry: { type: 'point', coordinates: [0, 0] }, style: firstBaseStyle },
            primitives: [{ slotKey: 'overlay', geometry: { type: 'point', coordinates: [1, 0] }, style: firstOverlayStyle }]
          }
        }
      ],
      requestNextFrame: false
    });
    let batch = contribution({ first: 0, second: 0 });
    pass.open('default', () => batch);
    const drawn: string[] = [];
    renderSpies.drawFeature.mockImplementation((_feature: Feature<Geometry>, style: Style) => drawn.push(labels.get(style) ?? 'unknown'));

    dispatchFrame(harness.layer, 0, 0);
    expect(drawn).toEqual(['first-base', 'first-overlay', 'second-overlay']);

    drawn.length = 0;
    batch = contribution({ first: 10, second: 0 });
    dispatchFrame(harness.layer, 16, 0);
    expect(drawn).toEqual(['second-overlay', 'first-base', 'first-overlay']);
    pass.destroy();
  });

  it('grow 展示几何变化时复用完整路径预热的 Decoration Style 和 Point', () => {
    const state = polylineElement('flight');
    const harness = createPassHarness([state]);
    const completeCoordinates: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [20, 10]
    ];
    harness.binding.requireFeature('flight').setGeometry(new LineString(completeCoordinates));
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const compilePresentation = vi.spyOn(compiler, 'compilePresentation');
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, compiler);
    const geometry = { type: 'polyline', coordinates: completeCoordinates.map((coordinate) => [...coordinate]) } as RenderGeometryState;
    const style: StyleSpec = {
      strokes: [{ color: '#1677ff', width: 3 }],
      decorations: [
        { type: 'arrow', placement: 'start' },
        { type: 'arrow', placement: 'end' },
        { type: 'arrow', placement: 'each-segment' },
        { type: 'arrow', placement: 'repeat', spacing: 5 }
      ]
    };
    pass.open('default', () => ({
      contributions: [
        {
          targetId: 'flight',
          channel: '$animation',
          value: { presentation: { slotKey: 'base', geometry, style } }
        }
      ],
      requestNextFrame: true
    }));

    dispatchFrame(harness.layer, 0, 0);
    const warmedStyles = renderSpies.drawFeature.mock.calls.map((call) => call[1] as Style);
    const warmedPoints = warmedStyles.slice(1).map((item) => item.getGeometry());
    expect(warmedStyles).toHaveLength(13);
    expect(compilePresentation).toHaveBeenCalledOnce();

    (geometry.coordinates as [number, number][]).splice(0, geometry.coordinates.length, [0, 0], [0, 5]);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 16, 0);
    expect(renderSpies.drawFeature).toHaveBeenCalledTimes(6);
    const shortenedEnd = renderSpies.drawFeature.mock.calls[2]?.[1] as Style;
    expect(shortenedEnd.getImage()?.getRotation()).toBeCloseTo(0);

    (geometry.coordinates as [number, number][]).splice(
      0,
      geometry.coordinates.length,
      ...completeCoordinates.map((coordinate) => [...coordinate] as [number, number])
    );
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 32, 0);
    const restoredStyles = renderSpies.drawFeature.mock.calls.map((call) => call[1] as Style);
    expect(restoredStyles).toEqual(warmedStyles);
    expect(restoredStyles.slice(1).map((item) => item.getGeometry())).toEqual(warmedPoints);
    expect(compilePresentation).toHaveBeenCalledOnce();

    pass.destroy();
  });

  it('dash-flow 只更新前景描边并保留背景描边自身的 lineDashOffset', () => {
    const state = polylineElement('route', {
      style: {
        strokes: [
          { color: '#111111', width: 6, lineDash: [2, 3], lineDashOffset: 9 },
          { color: '#00e5ff', width: 2, lineDash: [6, 2], lineDashOffset: 4 }
        ]
      }
    });
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, compiler);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    manager.play({ id: 'route' }, { type: 'dash-flow', speed: 30 });

    dispatchFrame(harness.layer, 0, 0);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 500, 0);
    const offsets = renderSpies.drawFeature.mock.calls
      .map((call) => (call[1] as Style).getStroke()?.getLineDashOffset())
      .filter((value): value is number => value !== undefined);

    expect(offsets).toEqual([9, -15]);
    manager.destroy();
    pass.destroy();
  });

  it('dash-flow 分别更新 linework 的虚线轨道并保留轨道偏移与基础相位', () => {
    const state = polylineElement('route', {
      style: {
        linework: {
          tracks: [
            { offset: -3, stroke: { color: '#111111', width: 2, lineDash: [8, 6], lineDashOffset: 2 } },
            { offset: 0, stroke: { color: '#222222', width: 2 } },
            { offset: 7, stroke: { color: '#333333', width: 1, lineDash: [3, 4], lineDashOffset: 9 } }
          ],
          contour: { kind: 'open' }
        }
      }
    });
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, compiler);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    manager.play({ id: 'route' }, { type: 'dash-flow', speed: 30 });

    dispatchFrame(harness.layer, 0, 0);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 500, 0);
    const strokes = renderSpies.drawFeature.mock.calls.map((call) => (call[1] as Style).getStroke()).filter((stroke): stroke is Stroke => stroke !== null);

    expect(strokes.map((stroke) => stroke.getLineDashOffset())).toEqual([-13, -6]);
    expect(strokes.map((stroke) => stroke.getOffset())).toEqual([-3, 7]);
    manager.destroy();
    pass.destroy();
  });

  it('renders dash-flow on a closed Polygon linework track', () => {
    const state: ElementState = {
      id: 'area',
      type: 'polygon',
      geometry: {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100]
        ]
      },
      style: {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2, lineDash: [8, 4], lineDashOffset: 2 } }],
          contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }
        }
      },
      module: 'areas',
      layerId: 'default',
      visible: true
    };
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    harness.binding.requireFeature('area').setGeometry(
      new Polygon([
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0]
        ]
      ])
    );
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, compiler);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });

    const handle = manager.play({ id: 'area' }, { type: 'dash-flow', speed: 24 });
    dispatchFrame(harness.layer, 0, 0);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 500, 0);

    const styles = renderSpies.drawFeature.mock.calls.map((call) => call[1] as Style);
    expect(handle.status).toBe('running');
    expect(styles).toHaveLength(1);
    expect(styles[0].getStroke()?.getLineDashOffset()).toBe(-10);
    const geometry = styles[0].getGeometry();
    expect(geometry).toBeInstanceOf(Polygon);
    if (geometry instanceof Polygon) {
      expect(geometry.getCoordinates()).toEqual([
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0]
        ]
      ]);
    }
    manager.destroy();
    pass.destroy();
  });

  it('composes reverse grow reveal phase with dash-flow phase', () => {
    const state = polylineElement('route', {
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [100, 0]
        ]
      },
      style: {
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2, lineDash: [8, 4], lineDashOffset: 1 } }],
          contour: { kind: 'open' }
        }
      }
    });
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    harness.binding.requireFeature('route').setGeometry(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, compiler);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });

    manager.play({ id: 'route' }, { type: 'dash-flow', speed: 24, color: '#00ff00' });
    manager.play({ id: 'route' }, { type: 'grow', durationMs: 1_250, direction: 'reverse', easing: 'linear' });
    dispatchFrame(harness.layer, 0, 0);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 500, 0);

    const records = renderSpies.drawFeature.mock.calls.map((call) => {
      const style = call[1] as Style;
      return { stroke: style.getStroke(), geometry: style.getGeometry() };
    });
    expect(records.map(({ stroke }) => stroke?.getLineDashOffset())).toEqual([-59, -71]);
    const overlay = records.find(({ stroke }) => stroke?.getColor() === '#00ff00');
    expect(overlay?.stroke?.getLineDashOffset()).toBe(-71);
    expect(overlay?.geometry).toBeInstanceOf(LineString);
    if (overlay?.geometry instanceof LineString) {
      expect(overlay.geometry.getCoordinates()).toEqual([
        [60, 0],
        [100, 0]
      ]);
    }
    manager.destroy();
    pass.destroy();
  });

  it.each(['inline-text', 'center-decoration'] as const)('dash-flow preserves the %s cutout without drawing duplicate content', (kind) => {
    const style = cutoutLineworkStyle(kind);
    const state = polylineElement('route', {
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [100, 0]
        ]
      },
      style
    });
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state], false);
    harness.binding.requireFeature('route').setGeometry(
      new LineString([
        [0, 0],
        [100, 0]
      ])
    );
    const compiler = new StyleCompiler(new NativeRefRegistry(), { measureTextWidth: () => 8 });
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, compiler);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });

    manager.play({ id: 'route' }, { type: 'dash-flow', speed: 24 });
    dispatchFrame(harness.layer, 0, 0);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 500, 0);

    const styles = renderSpies.drawFeature.mock.calls.map((call) => call[1] as Style);
    const expectedCutout = kind === 'inline-text' ? [44, 56] : [46, 54];
    expect(styles).toHaveLength(2);
    expect(styles.every((item) => item.getText() === null && item.getImage() === null)).toBe(true);
    expect(styles.map((item) => item.getStroke()?.getLineDashOffset())).toEqual([-11, -11 - expectedCutout[1]]);
    expect(
      styles.map((item) => {
        const geometry = item.getGeometry();
        return geometry instanceof LineString ? geometry.getCoordinates().map(([x, y]) => [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9]) : [];
      })
    ).toEqual([
      [
        [0, 0],
        [expectedCutout[0], 0]
      ],
      [
        [expectedCutout[1], 0],
        [100, 0]
      ]
    ]);
    manager.destroy();
    pass.destroy();
  });

  it('绘制失败时通过 try/finally 恢复 Canvas globalAlpha', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    const reported = vi.fn();
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles, { errorReporter: reported });
    pass.open('default', () => ({
      contributions: [
        {
          targetId: 'point',
          channel: 'pulse',
          value: {
            primitives: [{ slotKey: 'pulse', geometry: { type: 'point', coordinates: [0, 0] }, style: {}, opacity: 0.2 }]
          }
        }
      ],
      requestNextFrame: false
    }));
    const context = canvasContext(0.75);
    renderSpies.drawFeature.mockImplementation(() => {
      expect(context.globalAlpha).toBeCloseTo(0.15);
      throw new Error('draw failed');
    });

    dispatchFrame(harness.layer, 0, 0, 1, context);

    expect(context.globalAlpha).toBe(0.75);
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
    expect(reported).toHaveBeenCalledOnce();
    pass.destroy();
  });

  it('Manager 销毁最后一个循环前先绘制 fade-in 的终态 handoff 批次', () => {
    const state = pointElement('point');
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    const fade = manager.play({ id: 'point' }, { type: 'fade', direction: 'in', durationMs: 100, easing: 'linear' });

    dispatchFrame(harness.layer, 0, 0);
    renderSpies.drawFeature.mockClear();
    dispatchFrame(harness.layer, 100, 0);

    expect(fade.status).toBe('finished');
    expect(renderSpies.drawFeature).toHaveBeenCalled();
    expect(pass.activeLoopCount).toBe(0);
    expect(pass.cachedPresentationCount).toBe(0);
    manager.destroy();
    pass.destroy();
  });

  it('同层 steady overlay 存活时在下一帧清理已完成 fade-in 的 presentation slot', () => {
    const state: ElementState = {
      id: 'area',
      type: 'polygon',
      geometry: {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100]
        ]
      },
      style: { fill: { type: 'solid', color: '#334155' }, strokes: [{ color: '#94a3b8', width: 2 }] },
      module: 'areas',
      layerId: 'default',
      visible: true
    };
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    const fade = manager.play({ id: 'area' }, { type: 'fade', channel: 'fade', direction: 'in', durationMs: 100, easing: 'linear' });
    const highlight = manager.play({ id: 'area' }, { type: 'highlight', channel: 'steady', mode: 'steady' });

    dispatchFrame(harness.layer, 0, 0);
    harness.render.mockClear();
    dispatchFrame(harness.layer, 100, 0);

    expect(fade.status).toBe('finished');
    expect(highlight.status).toBe('running');
    expect(pass.cachedPresentationCount).toBe(1);
    expect(harness.render).toHaveBeenCalledOnce();

    dispatchFrame(harness.layer, 116, 0);

    expect(pass.cachedPresentationCount).toBe(0);
    expect(pass.activeLoopCount).toBe(1);
    highlight.stop();
    manager.destroy();
    pass.destroy();
  });

  it('终态 handoff 清理失败后保留循环并在下一帧重试', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    const reported = vi.fn();
    const style = new Style();
    let destroyAttempts = 0;
    harness.styles.compilePresentation.mockImplementation(() => ({
      revision: 0,
      resolve: () => [style],
      destroy: () => {
        destroyAttempts += 1;
        if (destroyAttempts === 1) throw new Error('synthetic presentation cleanup failure');
      }
    }));
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles, { errorReporter: reported });
    let frameCount = 0;
    const loop = pass.open('default', () => {
      frameCount += 1;
      loop.destroy({ flushCurrentFrame: true });
      if (frameCount > 1) {
        return {
          contributions: [],
          slotReservations: [{ kind: 'presentation', targetId: 'point' }],
          requestNextFrame: false
        };
      }
      return {
        contributions: [
          {
            targetId: 'point',
            channel: '$animation',
            value: {
              presentation: {
                slotKey: 'base',
                geometry: { type: 'point', coordinates: [0, 0] },
                style: state.style as StyleSpec
              }
            }
          }
        ],
        requestNextFrame: false
      };
    });

    dispatchFrame(harness.layer, 0, 0);

    expect(pass.activeLoopCount).toBe(1);
    expect(pass.cachedPresentationCount).toBe(1);
    expect(harness.render).toHaveBeenCalledOnce();
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'synthetic presentation cleanup failure' }),
      expect.objectContaining({ operation: 'destroy-loop-after-frame', ownerId: 'default' })
    );

    dispatchFrame(harness.layer, 16, 0);

    expect(destroyAttempts).toBe(2);
    expect(pass.activeLoopCount).toBe(0);
    expect(pass.cachedPresentationCount).toBe(0);
    const replacement = pass.open('default', () => ({ contributions: [], requestNextFrame: false }));
    replacement.destroy();
    pass.destroy();
  });

  it('render 回调同步销毁最后一个 loop 后不重建已释放 slot', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const loop = pass.open('default', () => {
      loop.destroy();
      return {
        contributions: [
          {
            targetId: 'point',
            channel: 'pulse',
            value: { primitives: [{ slotKey: 'pulse', geometry: { type: 'point', coordinates: [0, 0] }, style: {} }] }
          }
        ],
        requestNextFrame: true
      };
    });

    dispatchFrame(harness.layer, 0, 0);

    expect(pass.activeLoopCount).toBe(0);
    expect(pass.cachedOverlayCount).toBe(0);
    expect(renderSpies.getVectorContext).not.toHaveBeenCalled();
    expect(harness.render).not.toHaveBeenCalled();
    pass.destroy();
  });

  it('把 extent、pixelRatio 和 rotation 传给共享回调，并在 world copy 后恢复缓存 Geometry', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    let receivedFrame: Parameters<Parameters<LayerRenderPass['open']>[1]>[0] | undefined;
    pass.open('default', (frame) => {
      receivedFrame = frame;
      return {
        contributions: [
          {
            targetId: 'point',
            channel: 'pulse',
            value: { primitives: [{ slotKey: 'pulse', geometry: { type: 'point', coordinates: [10, 20] }, style: {} }] }
          }
        ],
        requestNextFrame: false
      };
    });
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('测试需要 EPSG:3857 投影');
    const worldWidth = getWidth(projection.getExtent());
    const drawnX: number[] = [];
    let cachedFeature: Feature<Geometry> | undefined;
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => {
      cachedFeature = feature;
      drawnX.push((feature.getGeometry() as Point).getCoordinates()[0]);
    });

    dispatchFrame(harness.layer, 123, worldWidth, 3);

    expect(receivedFrame).toMatchObject({ layerId: 'default', time: 123, resolution: 1, pixelRatio: 1, rotation: 0 });
    expect(receivedFrame?.extent).toEqual([worldWidth - worldWidth * 1.5, -1_000, worldWidth + worldWidth * 1.5, 1_000]);
    expect(drawnX).toHaveLength(3);
    expect(drawnX[1] - drawnX[0]).toBeCloseTo(worldWidth);
    expect(drawnX[2] - drawnX[1]).toBeCloseTo(worldWidth);
    expect((cachedFeature?.getGeometry() as Point).getCoordinates()).toEqual([10, 20]);
    pass.destroy();
  });

  it('wrapX 关闭时只绘制规范世界，不生成相邻世界副本', () => {
    const state = pointElement('point');
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state], false);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    manager.play({ id: 'point' }, { type: 'pulse' });

    dispatchFrame(harness.layer, 0, 0, 3);

    expect(renderSpies.drawFeature).toHaveBeenCalledTimes(1);
    manager.destroy();
    pass.destroy();
  });

  it('叠加 primitive 样式、动态半径和描边及 renderBuffer 后枚举边缘 world copy', () => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    harness.styles.compile.mockImplementation((style) => {
      const symbol = style.symbol;
      return new Style({
        image:
          symbol?.type === 'circle'
            ? new CircleStyle({
                radius: symbol.radius,
                stroke: symbol.stroke === undefined ? undefined : new Stroke({ width: symbol.stroke.width })
              })
            : undefined
      });
    });
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    pass.open('default', () => ({
      contributions: [
        {
          targetId: 'point',
          channel: 'pulse',
          value: {
            primitives: [
              {
                slotKey: 'pulse-ring',
                geometry: { type: 'point', coordinates: [-769, 0] },
                style: { symbol: { type: 'circle', radius: 10, stroke: { width: 1 } } },
                dynamicStyle: { symbolRadius: 30, strokeWidth: 20 }
              }
            ]
          }
        }
      ],
      requestNextFrame: false
    }));
    const drawnX: number[] = [];
    const drawnStyles: Style[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>, style: Style) => {
      drawnX.push((feature.getGeometry() as Point).getCoordinates()[0]);
      drawnStyles.push(style);
    });

    dispatchExtentFrame(harness.layer, 0, wrappedProjection(1_000), [0, -100, 100, 100]);

    expect(harness.layer.getRenderBuffer()).toBe(100);
    expect(drawnX).toEqual([231]);
    expect((drawnStyles[0]?.getImage() as CircleStyle).getRadius()).toBe(30);
    expect((drawnStyles[0]?.getImage() as CircleStyle).getStroke()?.getWidth()).toBe(20);
    pass.destroy();
  });

  it('大半径 pulse 的相邻世界圆环从 Geometry 外扩进入视口时仍会绘制', () => {
    const state = pointElement('point', { geometry: { type: 'point', controlPoints: [[-799, 0]] } });
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    manager.play({ id: 'point' }, { type: 'pulse', radius: 100 });
    const drawnX: number[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => {
      drawnX.push((feature.getGeometry() as Point).getCoordinates()[0]);
    });

    dispatchExtentFrame(harness.layer, 0, wrappedProjection(1_000), [0, -100, 100, 100]);

    expect(drawnX).toEqual([201]);
    manager.destroy();
    pass.destroy();
  });

  it.each([
    ['Text', { text: { text: 'unknown-size' } } satisfies StyleSpec],
    ['Icon', { symbol: { type: 'icon', src: 'data:image/png;base64,AA==' } } satisfies StyleSpec]
  ])('未知 %s 尺寸按 Geometry center 为多世界视口保留边界副本', (_kind, style) => {
    const state = pointElement('point');
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    pass.open('default', () => ({
      contributions: [
        {
          targetId: 'point',
          channel: 'unknown-style',
          value: { primitives: [{ slotKey: 'unknown-style', geometry: { type: 'point', coordinates: [500, 0] }, style }] }
        }
      ],
      requestNextFrame: false
    }));
    const drawnX: number[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => {
      drawnX.push((feature.getGeometry() as Point).getCoordinates()[0]);
    });

    dispatchExtentFrame(harness.layer, 0, wrappedProjection(1_000), [0, -100, 2_100, 100]);

    expect(drawnX).toEqual([-500, 500, 1_500, 2_500]);
    pass.destroy();
  });

  it('未知样式的 center 边界策略不会丢失 Geometry extent 自身跨越的世界副本', () => {
    const state = polylineElement('route');
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    pass.open('default', () => ({
      contributions: [
        {
          targetId: 'route',
          channel: 'unknown-style',
          value: {
            primitives: [
              {
                slotKey: 'unknown-style',
                geometry: {
                  type: 'polyline',
                  coordinates: [
                    [-2_500, 0],
                    [2_500, 0]
                  ]
                },
                style: { text: { text: 'unknown-size' } }
              }
            ]
          }
        }
      ],
      requestNextFrame: false
    }));
    const drawnCenters: number[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>) => {
      const extent = feature.getGeometry()?.getExtent();
      if (extent === undefined) throw new Error('Expected translated geometry');
      drawnCenters.push((extent[0] + extent[2]) / 2);
    });

    dispatchExtentFrame(harness.layer, 0, wrappedProjection(1_000), [0, -100, 100, 100]);

    expect(drawnCenters).toEqual([-2_000, -1_000, 0, 1_000, 2_000]);
    pass.destroy();
  });

  it.each([2 ** 53, -(2 ** 53)])('极远 world %s 不会让副本枚举失去进展', (world) => {
    const state = pointElement('point');
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    manager.play({ id: 'point' }, { type: 'pulse' });
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('测试需要 EPSG:3857 投影');

    dispatchFrame(harness.layer, 0, getWidth(projection.getExtent()) * world, 3);

    expect(renderSpies.drawFeature).toHaveBeenCalledOnce();
    manager.destroy();
    pass.destroy();
  });

  it('在每个可见世界平移后重新解析依赖几何的样式，同时只编译一次样式函数', () => {
    const state = polylineElement('flight');
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(state);
    const harness = createPassHarness([state]);
    const resolveStyle = vi.fn((feature: Feature<Geometry>) => {
      const geometry = feature.getGeometry();
      if (!(geometry instanceof LineString)) throw new Error('Expected a translated path geometry');
      return new Style({ geometry: new Point(geometry.getLastCoordinate()) });
    });
    harness.styles.compile.mockReturnValue(resolveStyle);
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
    manager.play({ id: 'flight' }, { type: 'path-travel', durationMs: 1_000, repeat: true, showStart: false, showEnd: false });
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('测试需要 EPSG:3857 投影');
    const worldWidth = getWidth(projection.getExtent());
    const decorationXs: number[] = [];
    renderSpies.drawFeature.mockImplementation((_feature: Feature<Geometry>, style: Style) => {
      const geometry = style.getGeometry();
      if (geometry instanceof Point) decorationXs.push(geometry.getCoordinates()[0]);
    });

    dispatchFrame(harness.layer, 500, worldWidth, 3);

    expect(harness.styles.compile).toHaveBeenCalledOnce();
    expect(resolveStyle).toHaveBeenCalledTimes(3);
    expect(decorationXs).toHaveLength(3);
    expect(decorationXs[1] - decorationXs[0]).toBeCloseTo(worldWidth);
    expect(decorationXs[2] - decorationXs[1]).toBeCloseTo(worldWidth);
    manager.destroy();
    pass.destroy();
  });

  it('在相邻 world copy 绘制 pulse、dash-flow 与 path-travel，且规范坐标和动画时间保持连续', () => {
    const states = [pointElement('point', { geometry: { type: 'point', controlPoints: [[10, 20]] } }), polylineElement('dash'), polylineElement('flight')];
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    for (const state of states) store.add(state);
    const harness = createPassHarness(states);
    harness.styles.compile.mockImplementation((style) => {
      const stroke = style.strokes?.[0];
      const symbol = style.symbol;
      return new Style({
        stroke:
          stroke === undefined
            ? undefined
            : new Stroke({
                color: stroke.color,
                width: stroke.width,
                lineDash: stroke.lineDash === undefined ? undefined : [...stroke.lineDash],
                lineDashOffset: stroke.lineDashOffset
              }),
        image:
          symbol?.type === 'circle'
            ? new CircleStyle({
                radius: symbol.radius,
                fill: undefined,
                stroke: undefined
              })
            : undefined
      });
    });
    const pass = new LayerRenderPass(harness.map, harness.layers, harness.binding, harness.styles);
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render: pass,
      shapeProjection: identityShapeProjection,
      registry: createBuiltinAnimationRegistry(),
      clock: animationTiming,
      wake: animationTiming
    });
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
    const drawnStyles: Style[] = [];
    renderSpies.drawFeature.mockImplementation((feature: Feature<Geometry>, style: Style) => {
      const geometry = feature.getGeometry();
      if (geometry !== undefined) drawnExtents.push([...geometry.getExtent()]);
      drawnStyles.push(style);
    });

    dispatchFrame(harness.layer, 0, 0, 3);
    drawnExtents.length = 0;
    drawnStyles.length = 0;
    harness.styles.compile.mockClear();
    dispatchFrame(harness.layer, 500, worldWidth, 3);

    expect(drawnExtents.some(([minX, , maxX]) => minX <= worldWidth + 10 && maxX >= worldWidth + 10)).toBe(true);
    expect(drawnExtents.some(([minX]) => Math.abs(minX) < 1)).toBe(true);
    expect(drawnExtents.some(([minX]) => Math.abs(minX - worldWidth * 2) < 1)).toBe(true);
    expect(harness.styles.compile).not.toHaveBeenCalled();
    expect(drawnStyles.some((style) => style.getImage() instanceof CircleStyle && style.getImage()?.getRadius() === 14.75)).toBe(true);
    expect(drawnStyles.some((style) => style.getStroke()?.getLineDashOffset() === -12)).toBe(true);
    expect(point.status).toBe('running');
    expect(dash.status).toBe('running');
    expect(flight.status).toBe('running');
    expect(store.get('point')?.geometry).toEqual({ type: 'point', controlPoints: [[10, 20]] });
    expect(store.get('dash')?.geometry).toEqual(polylineElement('dash').geometry);

    dispatchFrame(harness.layer, 1_000, -worldWidth, 3);
    expect(flight.status).toBe('finished');
    expect(point.status).toBe('running');
    expect(dash.status).toBe('running');
    manager.destroy();
    pass.destroy();
  });
});

interface PassHarness {
  readonly map: OlMap;
  readonly render: ReturnType<typeof vi.fn>;
  readonly layer: VectorLayer;
  readonly layers: LayerAdapter;
  readonly binding: FeatureBinding;
  readonly styles: StyleCompiler & {
    readonly compile: ReturnType<typeof vi.fn>;
    readonly compilePresentation: ReturnType<typeof vi.fn>;
  };
}

function cutoutLineworkStyle(kind: 'inline-text' | 'center-decoration'): StyleSpec {
  return {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2, lineDash: [8, 4], lineDashOffset: 1 } }],
      ...(kind === 'inline-text'
        ? {
            inlineText: {
              text: 'AB',
              fontFamily: 'sans-serif',
              fontSize: 12,
              fontWeight: 'normal' as const,
              fontStyle: 'normal' as const,
              fill: { type: 'solid' as const, color: '#000000' },
              gapPadding: 2
            }
          }
        : {
            decorations: [
              {
                placement: { kind: 'center' as const },
                glyph: {
                  primitives: [{ type: 'circle' as const, center: [0, 0] as [number, number], radius: 4, fill: { type: 'solid' as const, color: '#000000' } }]
                }
              }
            ]
          }),
      contour: { kind: 'open' }
    }
  };
}

function createPassHarness(states: readonly ElementState[], wrapX = true): PassHarness {
  const { map, render } = createRenderMap();
  const layer = new VectorLayer({ source: new VectorSource({ wrapX }) });
  const features = new Map<string, Feature<Geometry>>();
  const renderOrders = new Map<string, number>();
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
    renderOrders.set(state.id, renderOrders.size);
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
      return Object.freeze({
        layerId: 'default',
        targetId: id,
        get active() {
          return active;
        },
        release() {
          active = false;
        }
      });
    }
  } as unknown as FeatureBinding;
  const compile = vi.fn(() => new Style());
  const compilePresentation = vi.fn((style: StyleSpec) => {
    const compiled = compile(style) as StyleLike;
    let destroyed = false;
    return {
      revision: 0,
      resolve(feature: Feature<Geometry>, resolution: number): readonly Style[] {
        if (destroyed) return [];
        const resolved = typeof compiled === 'function' ? compiled(feature, resolution) : compiled;
        if (resolved === undefined) return [];
        return Array.isArray(resolved) ? resolved : [resolved];
      },
      destroy(): void {
        destroyed = true;
      }
    };
  });
  const styles = { compile, compilePresentation } as unknown as PassHarness['styles'];
  return { map, render, layer, layers, binding, styles };
}

function createRenderMap(): Readonly<{ map: OlMap; render: ReturnType<typeof vi.fn> }> {
  const render = vi.fn();
  const map = Object.assign(new Observable(), { render }) as unknown as OlMap;
  return { map, render };
}

function dispatchMapFrame(map: OlMap, time: number): void {
  map.dispatchEvent({ type: 'postrender', frameState: { time } } as never);
}

function dispatchFrame(
  layer: VectorLayer,
  time: number,
  centerX: number,
  visibleWorlds = 1,
  context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
): void {
  const projection = getProjection('EPSG:3857');
  if (projection === null) throw new Error('测试需要 EPSG:3857 投影');
  const worldWidth = getWidth(projection.getExtent());
  layer.dispatchEvent({
    type: 'postrender',
    frameState: {
      time,
      extent: [centerX - (worldWidth * visibleWorlds) / 2, -1_000, centerX + (worldWidth * visibleWorlds) / 2, 1_000],
      pixelRatio: 1,
      viewState: { center: [centerX, 0], resolution: 1, rotation: 0, projection }
    },
    context
  } as never);
}

function wrappedProjection(worldWidth: number): Projection {
  return new Projection({
    code: `TEST:WRAP-${worldWidth}`,
    units: 'm',
    extent: [-worldWidth / 2, -worldWidth / 2, worldWidth / 2, worldWidth / 2],
    global: true
  });
}

function dispatchExtentFrame(layer: VectorLayer, time: number, projection: Projection, extent: [number, number, number, number], resolution = 1): void {
  layer.dispatchEvent({
    type: 'postrender',
    frameState: {
      time,
      extent,
      pixelRatio: 1,
      viewState: {
        center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
        resolution,
        rotation: 0,
        projection
      }
    }
  } as never);
}

function canvasContext(globalAlpha: number): CanvasRenderingContext2D & {
  readonly save: ReturnType<typeof vi.fn>;
  readonly restore: ReturnType<typeof vi.fn>;
} {
  const stack: number[] = [];
  const context = {
    globalAlpha,
    save: vi.fn(() => stack.push(context.globalAlpha)),
    restore: vi.fn(() => {
      context.globalAlpha = stack.pop() ?? 1;
    })
  };
  return context as unknown as CanvasRenderingContext2D & {
    readonly save: ReturnType<typeof vi.fn>;
    readonly restore: ReturnType<typeof vi.fn>;
  };
}
