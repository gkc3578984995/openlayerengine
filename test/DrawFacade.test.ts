import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Style from 'ol/style/Style.js';
import { describe, expect, it, vi } from 'vitest';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../src/core/common/types.js';
import type { HorizontalWorld, PreparedWorldEdit } from '../src/core/common/worldWrap.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { CapabilityError, InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../src/core/ports/DrawInteractionPort.js';
import type {
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../src/core/ports/EditInteractionPort.js';
import type { HitTestPort } from '../src/core/ports/HitTestPort.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { isNativeStyleRef, type StyleSpec } from '../src/core/style/types.js';
import { DrawFacade } from '../src/facade/DrawFacade.js';
import { Element } from '../src/facade/Element.js';
import { ElementServiceImpl } from '../src/facade/ElementService.js';
import { LayerServiceImpl } from '../src/facade/LayerService.js';
import { DrawService } from '../src/services/draw/DrawService.js';
import { InteractionCoordinator } from '../src/services/events/InteractionCoordinator.js';
import { assertStructuredStyleSpec, StyleService } from '../src/services/style/StyleService.js';
import { createTestMap } from './fixtures/Task8Map.js';

const style: StyleSpec = {
  symbol: { type: 'circle', radius: 6, fill: { type: 'solid', color: '#3366ff' } },
  strokes: [{ color: '#3366ff', width: 2 }]
};

class FakeHitTest implements HitTestPort {
  atPixel(): undefined {
    return undefined;
  }

  getScreenExtent(): undefined {
    return undefined;
  }
}

class FakeDrawPort implements DrawInteractionPort {
  readonly previews: Array<Readonly<DrawInteractionRenderState> | undefined> = [];
  readonly destroy = vi.fn();
  listener: ((event: Readonly<DrawInteractionEvent>) => void) | undefined;
  spec: Readonly<DrawInteractionSpec> | undefined;
  world: HorizontalWorld | undefined;

  open(spec: Readonly<DrawInteractionSpec>, listener: (event: Readonly<DrawInteractionEvent>) => void): DrawInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    return {
      ...(this.world === undefined ? {} : { world: this.world }),
      render: (preview) => this.previews.push(preview),
      destroy: this.destroy
    };
  }

  emit(event: DrawInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Draw port is not open');
    this.listener(event);
  }
}

class FakeEditPort implements EditInteractionPort {
  readonly renders: Readonly<EditInteractionRenderState>[] = [];
  readonly destroy = vi.fn();
  listener: ((event: Readonly<EditInteractionEvent>) => void) | undefined;
  spec: Readonly<EditInteractionSpec> | undefined;
  placement: PreparedWorldEdit | undefined;

  open(spec: Readonly<EditInteractionSpec>, listener: (event: Readonly<EditInteractionEvent>) => void): EditInteractionHandle {
    this.spec = spec;
    this.listener = listener;
    const placement =
      this.placement ??
      Object.freeze({
        controlPoints: spec.controlPoints.map((coordinate) => [...coordinate] as Coordinate),
        handoff: Object.freeze({ kind: 'identity' as const })
      });
    return {
      placement,
      render: (state) => this.renders.push(state),
      destroy: this.destroy
    };
  }

  emit(event: EditInteractionEvent): void {
    if (this.listener === undefined) throw new Error('Edit port is not open');
    this.listener(event);
  }
}

function setup() {
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
  const store = new ElementStore(shapes, {
    validateElement(state) {
      manager.requireVector(state.layerId);
      if (isNativeStyleRef(state.style)) void refs.requireStyle(state.style);
      else assertStructuredStyleSpec(state.style);
    }
  });
  const adapter = new LayerAdapter(createTestMap(), refs);
  const manager = new LayerManager(store, adapter);
  const layers = new LayerServiceImpl(manager, adapter, refs);
  layers.add({ kind: 'vector', id: 'draw-layer' });
  const geometry = new GeometryCodec(shapes, identityShapeProjection);
  const binding = new FeatureBinding(store, adapter, geometry, new StyleCompiler(refs));
  const elements = new ElementServiceImpl(store, manager, binding, geometry, layers, refs, new FakeHitTest());
  const drawPort = new FakeDrawPort();
  const editPort = new FakeEditPort();
  let nextId = 0;
  const internal = new DrawService({
    store,
    shapes,
    shapeProjection: identityShapeProjection,
    styles: new StyleService(store),
    coordinator: new InteractionCoordinator(),
    drawPort,
    editPort,
    defaultStyle: () => style,
    createId: () => `facade-draw-${++nextId}`
  });
  const draw = new DrawFacade(internal, elements, refs);
  return { binding, draw, drawPort, editPort, elements, internal, layers, manager, refs, shapes, store };
}

function point(id: string, coordinate: readonly [number, number] = [0, 0]) {
  return {
    id,
    geometry: { type: 'point' as const, controlPoints: [coordinate] },
    style,
    layerId: 'draw-layer'
  };
}

describe('DrawFacade', () => {
  it('rejects non-function listeners in mapped Draw and Edit event branches at subscription time', () => {
    const { draw, elements } = setup();
    const drawSession = draw.start({ type: 'point', layerId: 'draw-layer', style });
    expect(() => drawSession.on('complete', undefined as never)).toThrow(InvalidArgumentError);

    const target = elements.add({
      id: 'listener-validation-edit',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [4, 0]
        ]
      },
      style,
      layerId: 'draw-layer'
    });
    const editSession = draw.edit(target);
    expect(() => editSession.on('modifying', null as never)).toThrow(InvalidArgumentError);
    expect(() => editSession.on('complete', {} as never)).toThrow(InvalidArgumentError);
    editSession.cancel();
  });

  it('maps complete to a live Element instead of exposing an OpenLayers Feature', async () => {
    const { draw, drawPort, elements } = setup();
    const session = draw.start<{ label: string }>({
      type: 'point',
      layerId: 'draw-layer',
      style,
      data: { label: 'created' },
      limit: 1
    });
    let completed: Element<{ label: string }> | undefined;
    session.on('complete', (event) => {
      expect(Object.isFrozen(event)).toBe(true);
      completed = event.element;
      expect(event.element).toBeInstanceOf(Element);
      expect(event.element).not.toBeInstanceOf(Feature);
      expect(event.element.olFeature).toBeInstanceOf(Feature<Geometry>);
      expect(event.element.state.data).toEqual({ label: 'created' });
    });

    drawPort.emit({ type: 'click', coordinate: [1, 2] });

    expect(completed).toBe(elements.get('facade-draw-1'));
    await expect(session.finished).resolves.toEqual([completed]);
  });

  it('keeps transient Elements live for every synchronous complete listener and invalidates them afterwards', async () => {
    const { draw, drawPort, elements } = setup();
    const session = draw.start({ type: 'point', layerId: 'draw-layer', style, keepGraphics: false, limit: 1 });
    const observations: Element[] = [];
    session.on('complete', ({ element }) => {
      expect(element.state.geometry).toEqual({ type: 'point', controlPoints: [[2, 3]] });
      expect(elements.get(element.id)).toBe(element);
      observations.push(element);
    });
    session.on('complete', ({ element }) => {
      expect(element.state.id).toBe('facade-draw-1');
      expect(elements.get(element.id)).toBe(element);
      observations.push(element);
    });

    drawPort.emit({ type: 'click', coordinate: [2, 3] });

    expect(observations).toHaveLength(2);
    expect(observations[1]).toBe(observations[0]);
    expect(() => observations[0].state).toThrow(ObjectDisposedError);
    expect(elements.get('facade-draw-1')).toBeUndefined();
    expect(session.results).toEqual([]);
    await expect(session.finished).resolves.toEqual([]);
  });

  it('never remaps later complete listeners or results to a same-id Element generation', async () => {
    const { draw, drawPort, elements } = setup();
    const session = draw.start({ type: 'point', layerId: 'draw-layer', style });
    let completed: Element | undefined;
    let second: Element | undefined;
    let replacement: Element | undefined;
    session.on('complete', ({ element }) => {
      // 后续监听器必须继续收到首次缓存的句柄，不能按 ID 重新解析为这里创建的新 generation。
      completed = element;
      element.remove();
      replacement = elements.add(point(element.id, [9, 9]));
    });
    session.on('complete', ({ element }) => {
      second = element;
    });

    drawPort.emit({ type: 'click', coordinate: [1, 2] });

    expect(second).toBe(completed);
    expect(second).not.toBe(replacement);
    expect(session.results).toEqual([]);
    session.finish();
    await expect(session.finished).resolves.toEqual([]);
    expect(elements.get('facade-draw-1')).toBe(replacement);
  });

  it('wraps results and owned queries as Elements and clears only matching draw-owned entries', () => {
    const { draw, drawPort, elements } = setup();
    const unrelated = elements.add({ ...point('unrelated', [9, 9]), module: 'shared' });
    const session = draw.start<{ order: number }>({
      type: 'point',
      layerId: 'draw-layer',
      style,
      module: 'shared',
      data: { order: 1 },
      limit: 2
    });

    drawPort.emit({ type: 'click', coordinate: [1, 1] });
    drawPort.emit({ type: 'click', coordinate: [2, 2] });

    const results = session.results;
    const queried = draw.query<{ order: number }>({ module: 'shared' });
    expect(Object.isFrozen(results)).toBe(true);
    expect(Object.isFrozen(queried)).toBe(true);
    expect(results).toHaveLength(2);
    expect(queried).toEqual(results);
    expect(results.every((element) => element instanceof Element && !(element instanceof Feature))).toBe(true);
    expect(results.map(({ state }) => state.geometry)).toEqual([
      { type: 'point', controlPoints: [[1, 1]] },
      { type: 'point', controlPoints: [[2, 2]] }
    ]);

    expect(draw.clear({ module: 'shared' })).toBe(2);
    expect(draw.query({ module: 'shared' })).toEqual([]);
    expect(unrelated.state.geometry).toEqual({ type: 'point', controlPoints: [[9, 9]] });
    expect(elements.get('unrelated')).toBe(unrelated);
    for (const result of results) expect(() => result.state).toThrow(ObjectDisposedError);
  });

  it('edits only a current Element handle from the same Earth and generation', () => {
    const local = setup();
    const foreign = setup();
    const localElement = local.elements.add(point('shared-id'));
    const foreignElement = foreign.elements.add(point('shared-id'));

    expect(() => local.draw.edit(foreignElement)).toThrow(InvalidArgumentError);

    localElement.remove();
    const replacement = local.elements.add(point('shared-id', [3, 4]));
    expect(() => local.draw.edit(localElement)).toThrow(ObjectDisposedError);

    const publicSnapshotRead = vi.spyOn(local.store, 'get');
    const session = local.draw.edit(replacement);
    expect(publicSnapshotRead).not.toHaveBeenCalled();
    expect(session.element).toBe(replacement);
    expect(local.editPort.spec?.elementId).toBe('shared-id');
    session.cancel();
  });

  it('rejects an edit when replacement cancellation swaps the target generation before native open', () => {
    const { draw, drawPort, editPort, elements } = setup();
    const target = elements.add({
      id: 'replace-during-edit',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [4, 0]
        ]
      },
      style,
      layerId: 'draw-layer'
    });
    const blocker = draw.start({ type: 'point', layerId: 'draw-layer', style });
    blocker.on('cancel', () => {
      // coordinator 替换旧交互时会同步派发取消；目标可能在原生 edit open 前被换成同 ID 新实例。
      target.remove();
      elements.add({
        id: target.id,
        geometry: {
          type: 'polyline',
          controlPoints: [
            [20, 20],
            [30, 30]
          ]
        },
        style,
        layerId: 'draw-layer'
      });
    });

    expect(() => draw.edit(target)).toThrow();
    expect(editPort.spec).toBeUndefined();
    expect(drawPort.destroy).toHaveBeenCalledOnce();
  });

  it('maps modifying and complete edit events to the current Element contract', async () => {
    const { draw, editPort, elements } = setup();
    const target = elements.add({
      id: 'editable',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [4, 0]
        ]
      },
      style,
      data: { role: 'route' },
      layerId: 'draw-layer'
    });
    const session = draw.edit(target, { underlay: true });
    const modifying = vi.fn();
    const complete = vi.fn();
    session.on('modifying', modifying);
    session.on('complete', complete);
    const anchor = editPort.renders[0].anchors.find((candidate) => candidate.kind === 'control' && candidate.index === 1);
    if (anchor?.kind !== 'control') throw new Error('Missing editable control anchor');

    editPort.emit({ type: 'move-start', anchor, coordinate: anchor.coordinate });
    editPort.emit({ type: 'move-end', anchor, coordinate: [6, 2] });

    expect(modifying).toHaveBeenCalledOnce();
    expect(modifying.mock.calls[0][0]).toMatchObject({
      type: 'modifying',
      element: target,
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [6, 2]
        ]
      },
      operation: 'move',
      coordinate: [6, 2]
    });

    session.finish();

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0]).toEqual({ type: 'complete', element: target });
    expect(target.state.geometry).toEqual({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [6, 2]
      ]
    });
    await expect(session.finished).resolves.toBe(target);
  });

  it('commits a provisional native style on successful start and discards it when start fails', () => {
    const successful = setup();
    const nativeStyle = new Style();
    const register = vi.spyOn(successful.refs, 'registerProvisionalStyle');
    const commit = vi.spyOn(successful.refs, 'commitProvisionalStyle');
    const discard = vi.spyOn(successful.refs, 'discardProvisionalStyle');

    const session = successful.draw.start({ type: 'point', layerId: 'draw-layer', style: { nativeStyle } });
    const reference = register.mock.results[0]?.value;
    expect(reference).toBeDefined();
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(reference);
    expect(discard).not.toHaveBeenCalled();
    if (reference === undefined) throw new Error('Missing successful native style reference');
    expect(successful.refs.requireStyle(reference)).toBe(nativeStyle);
    session.cancel();

    const failing = setup();
    const failingRegister = vi.spyOn(failing.refs, 'registerProvisionalStyle');
    const failingCommit = vi.spyOn(failing.refs, 'commitProvisionalStyle');
    const failingDiscard = vi.spyOn(failing.refs, 'discardProvisionalStyle');
    expect(() => failing.draw.start({ type: 'missing-shape' as never, layerId: 'draw-layer', style: { nativeStyle } })).toThrow(CapabilityError);
    const discardedReference = failingRegister.mock.results[0]?.value;
    expect(discardedReference).toBeDefined();
    expect(failingCommit).not.toHaveBeenCalled();
    expect(failingDiscard).toHaveBeenCalledOnce();
    expect(failingDiscard).toHaveBeenCalledWith(discardedReference);
    if (discardedReference === undefined) throw new Error('Missing failed native style reference');
    expect(() => failing.refs.requireStyle(discardedReference)).toThrow(ObjectDisposedError);
  });

  it('rejects a NativeStyleRef owned by another Earth before opening an interaction', () => {
    const local = setup();
    const foreign = setup();
    const foreignReference = foreign.refs.registerStyle(new Style());

    expect(() => local.draw.start({ type: 'point', layerId: 'draw-layer', style: foreignReference as never })).toThrow(ObjectDisposedError);
    expect(local.drawPort.listener).toBeUndefined();

    const localReference = local.refs.registerStyle(new Style());
    const session = local.draw.start({ type: 'point', layerId: 'draw-layer', style: localReference as never });
    expect(local.drawPort.listener).toBeDefined();
    session.cancel();
  });

  it('rejects option accessors without executing them or opening a native interaction', () => {
    const { draw, drawPort } = setup();
    let getterCalls = 0;
    const options = { layerId: 'draw-layer' } as Record<PropertyKey, unknown>;
    Object.defineProperty(options, 'type', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'point';
      }
    });

    expect(() => draw.start(options as never)).toThrow(InvalidArgumentError);
    expect(getterCalls).toBe(0);
    expect(drawPort.listener).toBeUndefined();
  });

  it('filters Elements removed before draw and edit finished facade promises settle', async () => {
    const { draw, drawPort, elements } = setup();
    const drawSession = draw.start({ type: 'point', layerId: 'draw-layer', style });
    drawPort.emit({ type: 'click', coordinate: [1, 2] });
    const drawn = drawSession.results[0];
    drawSession.finish();
    drawn.remove();

    await expect(drawSession.finished).resolves.toEqual([]);

    const editable = elements.add(point('editable-finished', [4, 5]));
    const editSession = draw.edit(editable);
    editSession.finish();
    editable.remove();

    await expect(editSession.finished).resolves.toBeUndefined();
  });

  it('keeps every edit complete callback on the original generation and filters a same-id replacement from finished', async () => {
    const { draw, elements } = setup();
    const editable = elements.add({
      id: 'edit-complete-generation',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [4, 0]
        ]
      },
      style,
      layerId: 'draw-layer'
    });
    const session = draw.edit(editable);
    let second: Element | undefined;
    let replacement: Element | undefined;
    session.on('complete', ({ element }) => {
      // complete 已经提交，但监听器仍可能同步替换实例；后续回调必须固定在原始句柄。
      element.remove();
      replacement = elements.add({
        id: element.id,
        geometry: {
          type: 'polyline',
          controlPoints: [
            [10, 10],
            [20, 20]
          ]
        },
        style,
        layerId: 'draw-layer'
      });
    });
    session.on('complete', ({ element }) => {
      second = element;
    });

    session.finish();

    expect(second).toBe(editable);
    expect(second).not.toBe(replacement);
    await expect(session.finished).resolves.toBeUndefined();
    expect(elements.get(editable.id)).toBe(replacement);
  });
});
