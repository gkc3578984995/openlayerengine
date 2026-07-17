import Circle from 'ol/geom/Circle.js';
import Projection from 'ol/proj/Projection.js';
import { fromLonLat, get as getProjection } from 'ol/proj.js';
import { describe, expect, it, vi } from 'vitest';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { ShapeProjectionAdapter } from '../src/adapters/openlayers/ShapeProjectionAdapter.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { Coordinate } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../src/core/ports/DrawInteractionPort.js';
import type {
  EditControlAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../src/core/ports/EditInteractionPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { RenderGeometryState, ShapeState } from '../src/core/shape/types.js';
import type { ElementStyleState } from '../src/core/style/types.js';
import { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import { AnimationRegistry } from '../src/services/animation/AnimationRegistry.js';
import type { AnimationDefinition } from '../src/services/animation/types.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { StyleService } from '../src/services/style/StyleService.js';
import { createTestMap } from './fixtures/Task8Map.js';
import { FakeLayerRenderPort } from './helpers/animationHarness.js';
import { createFacadeHarness } from './helpers/facadeHarness.js';
import { createTransformHarness } from './helpers/transformHarness.js';

const circleStyle: ElementStyleState = {
  fill: { type: 'solid', color: 'rgba(0, 120, 255, 0.15)' },
  strokes: [{ color: '#0078ff', width: 2 }]
};

class FakeDrawPort implements DrawInteractionPort {
  readonly previews: Array<Readonly<DrawInteractionRenderState> | undefined> = [];
  readonly render = vi.fn((preview: Readonly<DrawInteractionRenderState> | undefined) => this.previews.push(preview));
  readonly destroy = vi.fn();
  listener: ((event: Readonly<DrawInteractionEvent>) => void) | undefined;

  open(_spec: Readonly<DrawInteractionSpec>, listener: (event: Readonly<DrawInteractionEvent>) => void): DrawInteractionHandle {
    this.listener = listener;
    return { render: this.render, destroy: this.destroy };
  }

  emit(event: DrawInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Draw port is not open');
    this.listener(event);
  }
}

class FakeEditPort implements EditInteractionPort {
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  readonly render = vi.fn((state: Readonly<EditInteractionRenderState>) => this.renders.push(state));
  readonly destroy = vi.fn();
  listener: ((event: EditInteractionEvent) => void) | undefined;

  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle {
    this.listener = listener;
    return {
      placement: Object.freeze({
        controlPoints: Object.freeze(spec.controlPoints.map(copyCoordinate)),
        handoff: Object.freeze({ kind: 'identity' as const })
      }),
      render: this.render,
      destroy: this.destroy
    };
  }

  emit(event: EditInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Edit port is not open');
    this.listener(event);
  }
}

describe('Circle 米制半径语义', () => {
  it('公开 ElementService 的 add、update 与 copy 始终返回米制状态，并同步高纬度 OL 半径', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const addedCenter = projectCoordinate([120, 70], projection);
    const updatedCenter = projectCoordinate([120, 60], projection);
    const copiedCenter = projectCoordinate([120, 75], projection);
    const harness = createFacadeHarness(shapeProjection);

    try {
      const added = harness.elements.add({ id: 'public-circle', geometry: { type: 'circle', center: addedCenter, radius: 1_000 } });
      const expectedAdded = requireCircleState(shapeProjection.toViewState(added.state.geometry));
      expect(requireCircleState(added.state.geometry).radius).toBe(1_000);
      expect(requireOlCircle(added.olFeature.getGeometry()).getRadius()).toBeCloseTo(expectedAdded.radius, 8);

      added.update({ geometry: { type: 'circle', center: updatedCenter, radius: 1_500 } });
      const expectedUpdated = requireCircleState(shapeProjection.toViewState(added.state.geometry));
      expect(added.state.geometry).toEqual({ type: 'circle', center: updatedCenter, radius: 1_500 });
      expect(requireOlCircle(added.olFeature.getGeometry()).getRadius()).toBeCloseTo(expectedUpdated.radius, 8);

      const copied = harness.elements.copy(added.id, {
        geometry: { type: 'circle', center: copiedCenter, radius: 2_000 }
      });
      const expectedCopied = requireCircleState(shapeProjection.toViewState(copied.state.geometry));
      expect(copied.state.geometry).toEqual({ type: 'circle', center: copiedCenter, radius: 2_000 });
      expect(requireOlCircle(copied.olFeature.getGeometry()).getRadius()).toBeCloseTo(expectedCopied.radius, 8);
      expect(requireOlCircle(copied.olFeature.getGeometry()).getRadius()).not.toBeCloseTo(requireOlCircle(added.olFeature.getGeometry()).getRadius(), 6);
    } finally {
      harness.destroy();
    }
  });

  it('GeometryCodec 与 FeatureBinding 只把高纬度米制半径投影到 OL Circle', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([120, 70], projection);
    const map = createTestMap();
    const refs = new NativeRefRegistry();
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    const layers = new LayerAdapter(map, refs);
    const manager = new LayerManager(store, layers);
    manager.ensureDefaultVector();
    const stored = store.add(circleElement('bound-circle', center, 1_000));
    const binding = new FeatureBinding(store, layers, new GeometryCodec(shapes, shapeProjection), new StyleCompiler(refs));

    const geometry = binding.requireFeature(stored.id).getGeometry();
    const expectedView = requireCircleState(shapeProjection.toViewState(stored.geometry));

    expect(stored.geometry).toEqual({ type: 'circle', center, radius: 1_000 });
    expect(store.get(stored.id)?.geometry).toEqual(stored.geometry);
    expect(geometry).toBeInstanceOf(Circle);
    expect((geometry as Circle).getCenter()).toEqual(center);
    expect((geometry as Circle).getRadius()).toBeCloseTo(expectedView.radius, 8);
    expect((geometry as Circle).getRadius()).toBeGreaterThan(2_900);

    binding.destroy();
    manager.destroy();
  });

  it('Draw 圆预览使用 View 半径，而 change、complete 与 Store 保持米', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([120, 70], projection);
    const expectedView = requireCircleState(shapeProjection.toViewState({ type: 'circle', center, radius: 1_000 }));
    const radiusPoint = [center[0] + expectedView.radius, center[1]] as const;
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    const port = new FakeDrawPort();
    const service = new DrawService({
      store,
      shapes,
      styles: new StyleService(store),
      coordinator: new InteractionCoordinator(),
      drawPort: port,
      editPort: {} as EditInteractionPort,
      shapeProjection,
      defaultStyle: () => circleStyle,
      createId: () => 'draw-circle'
    });
    const session = service.start({ type: 'circle', layerId: 'default', style: circleStyle, limit: 1 });
    const changes: ShapeState[] = [];
    const completed: Readonly<ElementState>[] = [];
    session.on('change', ({ geometry }) => changes.push(geometry));
    session.on('complete', ({ state }) => completed.push(state));

    port.emit({ type: 'click', coordinate: center });
    port.emit({ type: 'move', coordinate: radiusPoint });

    const preview = requireCircleRender(port.previews.at(-1)?.geometry);
    expect(preview.center).toEqual(center);
    expect(preview.radius).toBeCloseTo(expectedView.radius, 8);
    expect(requireCircleState(changes.at(-1)).radius).toBeCloseTo(1_000, 8);
    expect(store.query()).toEqual([]);

    port.emit({ type: 'click', coordinate: radiusPoint });

    expect(session.status).toBe('finished');
    expect(completed).toHaveLength(1);
    expect(requireCircleState(completed[0]?.geometry).radius).toBeCloseTo(1_000, 8);
    expect(requireCircleState(store.get('draw-circle')?.geometry).radius).toBeCloseTo(1_000, 8);
  });

  it('Edit 不做任何修改直接完成时逐位保留米制半径', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([120, 70], projection);
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(circleElement('unchanged-edit-circle', center, 1_000));
    const port = new FakeEditPort();
    const service = new DrawService({
      store,
      shapes,
      styles: new StyleService(store),
      coordinator: new InteractionCoordinator(),
      drawPort: {} as DrawInteractionPort,
      editPort: port,
      shapeProjection,
      defaultStyle: () => circleStyle
    });

    service.edit('unchanged-edit-circle').finish();

    expect(store.get('unchanged-edit-circle')?.geometry).toEqual({ type: 'circle', center, radius: 1_000 });
    expect(requireCircleState(store.get('unchanged-edit-circle')?.geometry).radius).toBe(1_000);
  });

  it('Edit 跨纬度移动圆心不改变米制半径，仅移动半径控制点时更新米值', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const originalCenter = projectCoordinate([120, 30], projection);
    const movedCenter = projectCoordinate([120, 70], projection);
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    store.add(circleElement('edit-circle', originalCenter, 1_000));
    const port = new FakeEditPort();
    const service = new DrawService({
      store,
      shapes,
      styles: new StyleService(store),
      coordinator: new InteractionCoordinator(),
      drawPort: {} as DrawInteractionPort,
      editPort: port,
      shapeProjection,
      defaultStyle: () => circleStyle
    });
    const session = service.edit('edit-circle');
    const modifying: ShapeState[] = [];
    session.on('modifying', ({ state }) => modifying.push(state));

    const originalPreview = requireCircleRender(port.renders.at(-1)?.geometry);
    const centerAnchor = requireControlAnchor(port.renders.at(-1), 0);
    port.emit({ type: 'move-start', anchor: centerAnchor, coordinate: centerAnchor.coordinate });
    port.emit({ type: 'move-end', anchor: centerAnchor, coordinate: movedCenter });

    const movedPreview = requireCircleRender(port.renders.at(-1)?.geometry);
    const expectedMovedView = requireCircleState(shapeProjection.toViewState({ type: 'circle', center: movedCenter, radius: 1_000 }));
    expect(requireCircleState(modifying.at(-1)).radius).toBe(1_000);
    expect(store.get('edit-circle')?.geometry).toEqual({ type: 'circle', center: originalCenter, radius: 1_000 });
    expect(movedPreview.center).toEqual(movedCenter);
    expect(movedPreview.radius).toBeCloseTo(expectedMovedView.radius, 8);
    expect(movedPreview.radius).not.toBeCloseTo(originalPreview.radius, 6);

    const radiusAnchor = requireControlAnchor(port.renders.at(-1), 1);
    const doubledRadiusPoint = [movedCenter[0] + expectedMovedView.radius * 2, movedCenter[1]] as const;
    port.emit({ type: 'move-start', anchor: radiusAnchor, coordinate: radiusAnchor.coordinate });
    port.emit({ type: 'move-end', anchor: radiusAnchor, coordinate: doubledRadiusPoint });

    expect(requireCircleState(modifying.at(-1)).radius).toBeCloseTo(2_000, 7);
    expect(requireCircleRender(port.renders.at(-1)?.geometry).radius).toBeCloseTo(expectedMovedView.radius * 2, 7);

    session.finish();
    const committed = requireCircleState(store.get('edit-circle')?.geometry);
    expect(committed.center).toEqual(movedCenter);
    expect(committed.radius).toBeCloseTo(2_000, 7);
  });

  it('Transform 平移与圆心顶点编辑保持米半径，缩放才修改米半径', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const originalCenter = projectCoordinate([120, 30], projection);
    const movedCenter = projectCoordinate([120, 70], projection);

    const transform = createTransformHarness(false, undefined, shapeProjection);
    transform.store.add(circleElement('transform-circle', originalCenter, 1_000));
    const translateSession = transform.service.select('transform-circle');
    const translate = { type: 'translate' as const, x: movedCenter[0] - originalCenter[0], y: movedCenter[1] - originalCenter[1] };
    transform.interaction.emit({ type: 'operation-start', operation: 'translate', delta: { type: 'translate', x: 0, y: 0 } });
    transform.interaction.emit({ type: 'operation-end', operation: 'translate', delta: translate });

    const expectedMovedView = requireCircleState(shapeProjection.toViewState({ type: 'circle', center: movedCenter, radius: 1_000 }));
    expect(requireCircleRender(transform.interaction.handle?.target?.geometry).radius).toBeCloseTo(expectedMovedView.radius, 8);
    translateSession.finish();
    expect(transform.store.get('transform-circle')?.geometry).toEqual({ type: 'circle', center: movedCenter, radius: 1_000 });

    const scaleSession = transform.service.select('transform-circle');
    const scale = { type: 'scale' as const, scaleX: 2, scaleY: 2, center: movedCenter };
    transform.interaction.emit({ type: 'operation-start', operation: 'scale', delta: { ...scale, scaleX: 1, scaleY: 1 } });
    transform.interaction.emit({ type: 'operation-end', operation: 'scale', delta: scale });
    scaleSession.finish();
    expect(transform.store.get('transform-circle')?.geometry).toEqual({ type: 'circle', center: movedCenter, radius: 2_000 });

    const vertex = createTransformHarness(false, undefined, shapeProjection);
    vertex.store.add(circleElement('vertex-circle', originalCenter, 1_000));
    const vertexSession = vertex.service.select('vertex-circle');
    vertexSession.setMode('edit');
    const centerAnchor = vertex.interaction.handle?.target?.editAnchors.find((anchor) => anchor.kind === 'control' && anchor.index === 0);
    if (centerAnchor?.kind !== 'control') throw new Error('Circle center anchor is missing');
    const vertexDelta = { type: 'vertex' as const, index: 0, coordinate: movedCenter };
    vertex.interaction.emit({ type: 'operation-start', operation: 'vertex', delta: vertexDelta, anchor: centerAnchor });
    vertex.interaction.emit({ type: 'operation-end', operation: 'vertex', delta: vertexDelta, anchor: centerAnchor });

    expect(requireCircleRender(vertex.interaction.handle?.target?.geometry).radius).toBeCloseTo(expectedMovedView.radius, 8);
    vertexSession.finish();
    expect(vertex.store.get('vertex-circle')?.geometry).toEqual({ type: 'circle', center: movedCenter, radius: 1_000 });
  });

  it('Transform undo 精确恢复米制半径，cancel 不向 Store 泄漏预览和历史', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([120, 70], projection);
    const harness = createTransformHarness(false, undefined, shapeProjection);
    const entry = harness.store.add(circleElement('history-circle', center, 1_000));
    const generation = harness.store.generationOf(entry.id);
    const revision = harness.store.revisionOf(entry.id);
    const session = harness.service.select(entry.id);
    const scale = { type: 'scale' as const, scaleX: 2, scaleY: 2, center };
    harness.interaction.emit({ type: 'operation-start', operation: 'scale', delta: { ...scale, scaleX: 1, scaleY: 1 } });
    harness.interaction.emit({ type: 'operation-end', operation: 'scale', delta: scale });

    const doubledView = requireCircleState(shapeProjection.toViewState({ type: 'circle', center, radius: 2_000 }));
    expect(requireCircleRender(harness.interaction.handle?.target?.geometry).radius).toBeCloseTo(doubledView.radius, 8);
    expect(harness.store.get(entry.id)?.geometry).toEqual(entry.geometry);

    expect(session.undo()).toBe(true);
    const restoredView = requireCircleState(shapeProjection.toViewState(entry.geometry));
    expect(requireCircleRender(harness.interaction.handle?.target?.geometry).radius).toBeCloseTo(restoredView.radius, 8);

    session.cancel();
    expect(session.status).toBe('cancelled');
    expect(() => session.undo()).toThrow(ObjectDisposedError);
    expect(harness.store.get(entry.id)?.geometry).toEqual({ type: 'circle', center, radius: 1_000 });
    expect(harness.store.generationOf(entry.id)).toBe(generation);
    expect(harness.store.revisionOf(entry.id)).toBe(revision);
    expect(harness.log).toContain(`animation:preview:clear:${entry.id}`);
    expect(harness.interaction.handle?.destroyed).toBe(true);
  });

  it('AnimationManager 为 circle 动画准备 View 半径且不回写 Store', () => {
    const projection = requireProjection('EPSG:3857');
    const shapeProjection = new ShapeProjectionAdapter(projection);
    const center = projectCoordinate([120, 70], projection);
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    const state = store.add(circleElement('animated-circle', center, 1_000));
    const render = new FakeLayerRenderPort();
    render.addElementTarget(state.layerId, state.id);
    let compatibilityGeometry: RenderGeometryState | undefined;
    let frameGeometry: RenderGeometryState | undefined;
    const definition: AnimationDefinition = {
      type: 'pulse',
      writeDomains: new Set(['overlay']),
      requirements: new Set(['structured-presentation']),
      interactionPolicy: { edit: 'pause-and-suppress', transform: 'follow-preview' },
      normalize: (spec) => spec as never,
      assertCompatible: (target) => {
        compatibilityGeometry = target.geometry;
      },
      create: (target) => {
        compatibilityGeometry = target.geometry;
        return {
          slots: [],
          rebind() {},
          sample(context) {
            frameGeometry = context.target.geometry;
            return { finished: false, schedule: { kind: 'continuous' } };
          },
          destroy() {}
        };
      }
    };
    const manager = new AnimationManagerImpl({
      store,
      shapes,
      render,
      shapeProjection,
      registry: new AnimationRegistry([definition]),
      clock: render,
      wake: render
    });
    const expectedView = requireCircleState(shapeProjection.toViewState(state.geometry));

    const handle = manager.play({ id: state.id }, { type: 'pulse', repeat: true });
    render.frame(state.layerId, 0);

    expect(requireCircleRender(compatibilityGeometry).radius).toBeCloseTo(expectedView.radius, 8);
    expect(requireCircleRender(frameGeometry).radius).toBeCloseTo(expectedView.radius, 8);
    expect(store.get(state.id)?.geometry).toEqual({ type: 'circle', center, radius: 1_000 });

    handle.stop();
    manager.destroy();
  });
});

function circleElement(id: string, center: Coordinate, radius: number): ElementState {
  return {
    id,
    type: 'circle',
    geometry: { type: 'circle', center, radius },
    style: circleStyle,
    layerId: 'default',
    visible: true
  };
}

function requireCircleState(state: ShapeState | undefined): ShapeState<'circle'> {
  if (state?.type !== 'circle') throw new Error('Circle shape state is required');
  return state;
}

function requireCircleRender(geometry: RenderGeometryState | undefined): Extract<RenderGeometryState, { type: 'circle' }> {
  if (geometry?.type !== 'circle') throw new Error('Circle render geometry is required');
  return geometry;
}

function requireOlCircle(geometry: unknown): Circle {
  if (!(geometry instanceof Circle)) throw new Error('OpenLayers Circle geometry is required');
  return geometry;
}

function requireControlAnchor(state: Readonly<EditInteractionRenderState> | undefined, index: number): EditControlAnchor {
  const anchor = state?.anchors.find((candidate) => candidate.kind === 'control' && candidate.index === index);
  if (anchor?.kind !== 'control') throw new Error(`Circle control anchor is missing: ${index}`);
  return anchor;
}

function projectCoordinate(coordinate: readonly [number, number], projection: Projection): Coordinate {
  const projected = fromLonLat([...coordinate], projection);
  return [projected[0], projected[1]];
}

function copyCoordinate(coordinate: Coordinate): Coordinate {
  return coordinate.length === 3 ? [coordinate[0], coordinate[1], coordinate[2]] : [coordinate[0], coordinate[1]];
}

function requireProjection(code: string): Projection {
  const projection = getProjection(code);
  if (projection === null) throw new Error(`测试投影不存在：${code}`);
  return projection;
}
