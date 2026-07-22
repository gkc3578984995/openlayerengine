import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import type Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import Observable from 'ol/Observable.js';
import type Overlay from 'ol/Overlay.js';
import { clearUserProjection, getUserProjection, setUserProjection, useGeographic } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import Style, { type StyleFunction } from 'ol/style/Style.js';
import View from 'ol/View.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementProtectionViewAdapter } from '../src/adapters/openlayers/ElementProtectionViewAdapter.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState, ElementStateInput } from '../src/core/element/types.js';
import type { ElementProtectionState } from '../src/core/protection/types.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { identityShapeProjection } from './helpers/shapeProjection.js';

interface OverlayRecord {
  element: HTMLDivElement | undefined;
  offset: number[];
  position: number[] | undefined;
  readonly positioning: string | undefined;
  readonly stopEvent: boolean | undefined;
  readonly insertFirst: boolean | undefined;
  readonly className: string | undefined;
  disposed: boolean;
  setElement(value: HTMLDivElement | undefined): void;
  setOffset(value: number[]): void;
  setPosition(value: number[] | undefined): void;
  getPosition(): number[] | undefined;
  dispose(): void;
}

const overlayHarness = vi.hoisted(() => ({ instances: [] as OverlayRecord[] }));

vi.mock('ol/Overlay.js', () => {
  class FakeOverlay implements OverlayRecord {
    element: HTMLDivElement | undefined;
    offset: number[];
    position: number[] | undefined;
    readonly positioning: string | undefined;
    readonly stopEvent: boolean | undefined;
    readonly insertFirst: boolean | undefined;
    readonly className: string | undefined;
    disposed = false;

    constructor(options: Record<string, unknown>) {
      this.element = options.element as HTMLDivElement | undefined;
      this.offset = [...((options.offset as number[] | undefined) ?? [0, 0])];
      this.positioning = options.positioning as string | undefined;
      this.stopEvent = options.stopEvent as boolean | undefined;
      this.insertFirst = options.insertFirst as boolean | undefined;
      this.className = options.className as string | undefined;
      overlayHarness.instances.push(this);
    }

    setElement(value: HTMLDivElement | undefined): void {
      this.element = value;
    }

    setOffset(value: number[]): void {
      this.offset = [...value];
    }

    setPosition(value: number[] | undefined): void {
      this.position = value === undefined ? undefined : [...value];
    }

    getPosition(): number[] | undefined {
      return this.position === undefined ? undefined : [...this.position];
    }

    dispose(): void {
      this.disposed = true;
    }
  }

  return { default: FakeOverlay };
});

class FakeLabelElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  className = '';
  hidden = false;
  textContent = '';
  innerHTMLSetCalls = 0;
  removeCalls = 0;

  set innerHTML(_value: string) {
    this.innerHTMLSetCalls += 1;
  }

  remove(): void {
    this.removeCalls += 1;
  }
}

class MapHarness extends Observable {
  readonly layers = new Collection<BaseLayer>();
  readonly view = new View({ projection: 'EPSG:4326', center: [0, 0], zoom: 4 });
  readonly addedOverlays: OverlayRecord[] = [];
  readonly removedOverlays: OverlayRecord[] = [];

  getLayers(): Collection<BaseLayer> {
    return this.layers;
  }

  getView(): View {
    return this.view;
  }

  addOverlay(overlay: Overlay): void {
    this.addedOverlays.push(overlay as unknown as OverlayRecord);
  }

  removeOverlay(overlay: Overlay): void {
    this.removedOverlays.push(overlay as unknown as OverlayRecord);
  }

  getPixelFromCoordinate(coordinate: number[]): number[] {
    const center = this.view.getCenter() ?? [0, 0];
    return [coordinate[0] - center[0] + 100, center[1] - coordinate[1] + 100];
  }
}

function setup() {
  const map = new MapHarness();
  const refs = new NativeRefRegistry();
  const layers = new LayerAdapter(map as unknown as OlMap, refs);
  layers.attach({ kind: 'vector', id: 'layer-a', visible: true, opacity: 1, wrapX: true, declutter: false });
  layers.attach({ kind: 'vector', id: 'layer-b', visible: true, opacity: 1, wrapX: false, declutter: false });
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const store = new ElementStore(shapes);
  const roots: FakeLabelElement[] = [];
  const adapter = new ElementProtectionViewAdapter(
    map as unknown as OlMap,
    layers,
    new GeometryCodec(shapes, identityShapeProjection),
    new StyleCompiler(refs),
    {
      createElement: () => {
        const root = new FakeLabelElement();
        roots.push(root);
        return root as unknown as HTMLDivElement;
      }
    }
  );
  return { adapter, layers, map, refs, roots, store };
}

function addElement(store: ElementStore, input: ElementStateInput): Readonly<ElementState> {
  return store.add(input);
}

function protection(elementId: string, operatorName?: string): ElementProtectionState {
  return { elementId, protected: true, ...(operatorName === undefined ? {} : { operatorName }) };
}

function protectionLayer(collection: Collection<BaseLayer>, target: BaseLayer): VectorLayer<VectorSource<Feature<Geometry>>> {
  const index = collection.getArray().indexOf(target);
  const layer = collection.item(index + 1);
  if (!(layer instanceof VectorLayer)) throw new Error('Missing protection layer');
  return layer as VectorLayer<VectorSource<Feature<Geometry>>>;
}

function requireSource(layer: VectorLayer<VectorSource<Feature<Geometry>>>): VectorSource<Feature<Geometry>> {
  const source = layer.getSource();
  if (source === null) throw new Error('Missing protection source');
  return source;
}

function maskStyle(feature: Feature<Geometry>): Style {
  const resolved = feature.getStyleFunction()?.(feature, 1);
  const styles = resolved instanceof Style ? [resolved] : resolved;
  const mask = styles?.[0];
  if (!(mask instanceof Style)) throw new Error('Missing protection mask Style');
  return mask;
}

function fakeCanvasContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 10
  };
}

function renderMask(feature: Feature<Geometry>, coordinates: unknown) {
  const style = maskStyle(feature);
  const renderer = style.getRenderer();
  if (renderer === null) throw new Error('Missing protection renderer');
  const context = fakeCanvasContext();
  renderer(coordinates as never, {
    context: context as unknown as CanvasRenderingContext2D,
    pixelRatio: 2,
    rotation: 0,
    geometry: feature.getGeometry() as Geometry
  });
  return { context, style };
}

function dispatchPostrender(map: MapHarness, target: VectorLayer, extent: number[] = [-180, -90, 180, 90]): void {
  map.dispatchEvent({
    type: 'postrender',
    frameState: {
      extent,
      layerStatesArray: [target.getLayerState()],
      size: [200, 200],
      viewState: map.view.getState()
    }
  } as never);
}

beforeEach(() => {
  overlayHarness.instances.length = 0;
});

describe('ElementProtectionViewAdapter', () => {
  it('同步并在复用时恢复替身 Feature id，使原生 StyleFunction 可按业务 id 返回样式', () => {
    const { adapter, layers, map, refs, store } = setup();
    const baseStyle = new Style({ renderer: vi.fn() });
    const nativeStyle: StyleFunction = vi.fn((feature) => (feature.getId() === 'styled-by-id' ? baseStyle : []));
    const style = refs.registerStyle(nativeStyle);
    const element = addElement(store, {
      id: 'styled-by-id',
      type: 'point',
      geometry: { type: 'point', controlPoints: [[1, 2]] },
      style,
      layerId: 'layer-a',
      visible: true
    });

    adapter.upsert(element, protection(element.id));

    const layer = protectionLayer(map.layers, layers.requireLayer('layer-a'));
    const source = requireSource(layer);
    const feature = source.getFeatures()[0];
    if (feature === undefined) throw new Error('Missing protection Feature');
    expect(feature.getId()).toBe(element.id);
    expect(maskStyle(feature)).toBeInstanceOf(Style);

    feature.setId('stale-id');
    store.update({ id: element.id }, { geometry: { type: 'point', controlPoints: [[3, 4]] } });
    const updated = store.get(element.id);
    if (updated === undefined) throw new Error('Missing updated Element');
    adapter.upsert(updated, protection(element.id));

    expect(source.getFeatures()).toEqual([feature]);
    expect(feature.getId()).toBe(element.id);
    expect(maskStyle(feature)).toBeInstanceOf(Style);
    expect(nativeStyle).toHaveBeenCalled();
  });

  it('View 位于远端 world copy 时把保护标签放到最近副本并保持可见', () => {
    const previousUserProjection = getUserProjection();
    let adapter: ElementProtectionViewAdapter | undefined;
    useGeographic();
    try {
      const harness = setup();
      adapter = harness.adapter;
      const { layers, map, roots, store } = harness;
      const element = addElement(store, {
        id: 'wrapped-label',
        type: 'point',
        geometry: { type: 'point', controlPoints: [[5, 6]] },
        style: { symbol: { type: 'circle', radius: 6, fill: { type: 'solid', color: '#2563eb' } } },
        layerId: 'layer-a',
        visible: true
      });
      adapter.upsert(element, protection(element.id, '张三'));

      const target = layers.requireLayer('layer-a') as VectorLayer;
      const feature = requireSource(protectionLayer(map.layers, target)).getFeatures()[0];
      const overlay = overlayHarness.instances[0];
      const root = roots[0];
      if (feature === undefined || overlay === undefined || root === undefined) throw new Error('Missing protection resources');
      maskStyle(feature);

      map.view.setCenter([365, 0]);
      dispatchPostrender(map, target, [265, -90, 465, 90]);

      expect(overlay.position).toEqual([365, 6]);
      expect(map.getPixelFromCoordinate(overlay.position)).toEqual([100, 94]);
      expect(root.hidden).toBe(false);
    } finally {
      adapter?.destroy();
      if (previousUserProjection === null) clearUserProjection();
      else setUserProjection(previousUserProjection);
    }
    expect(getUserProjection()).toBe(previousUserProjection);
  });

  it('按目标业务层共享遮罩层，并分别绘制普通点、图片点、线、面和圆', () => {
    const { adapter, layers, map, store } = setup();
    const target = layers.requireLayer('layer-a');
    map.layers.remove(target);
    const nested = new Collection<BaseLayer>([target]);
    map.layers.insertAt(0, new LayerGroup({ layers: nested }));
    const elements = [
      addElement(store, {
        id: 'point',
        type: 'point',
        geometry: { type: 'point', controlPoints: [[1, 2]] },
        style: { symbol: { type: 'circle', radius: 7, fill: { type: 'solid', color: '#2563eb' } } },
        layerId: 'layer-a',
        visible: true
      }),
      addElement(store, {
        id: 'image-point',
        type: 'point',
        geometry: { type: 'point', controlPoints: [[3, 4]] },
        style: {
          symbol: {
            type: 'icon',
            src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="24"/%3E',
            size: [32, 24],
            anchor: [0.5, 1]
          }
        },
        layerId: 'layer-a',
        visible: true
      }),
      addElement(store, {
        id: 'line',
        type: 'polyline',
        geometry: {
          type: 'polyline',
          controlPoints: [
            [0, 0],
            [10, 8]
          ]
        },
        style: { strokes: [{ color: '#2563eb', width: 3 }] },
        layerId: 'layer-a',
        visible: true
      }),
      addElement(store, {
        id: 'polygon',
        type: 'polygon',
        geometry: {
          type: 'polygon',
          controlPoints: [
            [0, 0],
            [8, 0],
            [4, 6]
          ]
        },
        style: { fill: { type: 'solid', color: '#93c5fd' }, strokes: [{ color: '#2563eb', width: 2 }] },
        layerId: 'layer-a',
        visible: true
      }),
      addElement(store, {
        id: 'circle',
        type: 'circle',
        geometry: { type: 'circle', center: [12, 12], radius: 5 },
        style: { fill: { type: 'solid', color: '#93c5fd' }, strokes: [{ color: '#2563eb', width: 2 }] },
        layerId: 'layer-a',
        visible: true
      })
    ];

    for (const element of elements) adapter.upsert(element, protection(element.id, '张三'));

    expect(nested.getLength()).toBe(2);
    const layer = protectionLayer(nested, target);
    const source = requireSource(layer);
    expect(source.getFeatures()).toHaveLength(5);
    expect(source.getWrapX()).toBe(true);
    expect(layers.requireVectorSource('layer-a').getFeatures()).toEqual([]);
    expect(layers.isRegisteredVectorLayer(layer)).toBe(false);

    const features = source.getFeatures();
    const point = features.find((feature) => feature.getGeometry() instanceof Point && (feature.getGeometry() as Point).getCoordinates()[0] === 1);
    const imagePoint = features.find((feature) => feature.getGeometry() instanceof Point && (feature.getGeometry() as Point).getCoordinates()[0] === 3);
    const line = features.find((feature) => feature.getGeometry() instanceof LineString);
    const polygon = features.find((feature) => feature.getGeometry() instanceof Polygon);
    const circle = features.find((feature) => feature.getGeometry() instanceof Circle);
    if (point === undefined || imagePoint === undefined || line === undefined || polygon === undefined || circle === undefined) {
      throw new Error('Missing projected protection geometry');
    }

    const pointRender = renderMask(point, [20, 20]);
    const imageRender = renderMask(imagePoint, [20, 20]);
    const lineRender = renderMask(line, [
      [0, 0],
      [20, 12]
    ]);
    const polygonRender = renderMask(polygon, [
      [
        [0, 0],
        [20, 0],
        [10, 15],
        [0, 0]
      ]
    ]);
    const circleRender = renderMask(circle, [
      [10, 10],
      [18, 10]
    ]);

    expect(pointRender.context.arc).toHaveBeenCalled();
    expect(imageRender.context.quadraticCurveTo).toHaveBeenCalled();
    expect(lineRender.context.lineTo).toHaveBeenCalled();
    expect(lineRender.context.fill).not.toHaveBeenCalled();
    expect(polygonRender.context.closePath).toHaveBeenCalled();
    expect(polygonRender.context.fill).toHaveBeenCalled();
    expect(circleRender.context.arc).toHaveBeenCalled();
    expect(circleRender.context.fill).toHaveBeenCalled();
    for (const rendered of [pointRender, imageRender, lineRender, polygonRender, circleRender]) {
      expect(rendered.context.stroke).toHaveBeenCalledTimes(2);
      expect(rendered.style.getHitDetectionRenderer()).toBeTypeOf('function');
    }

    const targetVector = target as VectorLayer;
    targetVector.setOpacity(0.45);
    targetVector.setExtent([-20, -10, 20, 10]);
    targetVector.setMinResolution(0.5);
    targetVector.setMaxResolution(500);
    targetVector.setMinZoom(2);
    targetVector.setMaxZoom(15);
    targetVector.setZIndex(9);
    expect(layer.getOpacity()).toBe(0.45);
    expect(layer.getExtent()).toEqual([-20, -10, 20, 10]);
    expect(layer.getMinResolution()).toBe(0.5);
    expect(layer.getMaxResolution()).toBe(500);
    expect(layer.getMinZoom()).toBe(2);
    expect(layer.getMaxZoom()).toBe(15);
    expect(layer.getZIndex()).toBe(9);

    adapter.destroy();
    expect(nested.getArray()).toEqual([target]);
  });

  it('原位更新与跨层迁移均复用视觉资源，标签使用纯文本并在最后移除时完整释放', () => {
    const { adapter, layers, map, roots, store } = setup();
    const initial = addElement(store, {
      id: 'editable',
      type: 'point',
      geometry: { type: 'point', controlPoints: [[5, 6]] },
      style: { symbol: { type: 'circle', radius: 6, fill: { type: 'solid', color: '#2563eb' } } },
      layerId: 'layer-a',
      visible: true
    });
    adapter.upsert(initial, protection(initial.id, '<img src=x onerror=alert(1)>'));

    const firstLayer = protectionLayer(map.layers, layers.requireLayer('layer-a'));
    const firstSource = requireSource(firstLayer);
    const feature = firstSource.getFeatures()[0];
    const geometry = feature?.getGeometry();
    const overlay = overlayHarness.instances[0];
    const root = roots[0];
    if (feature === undefined || geometry === undefined || overlay === undefined || root === undefined) throw new Error('Missing protection resources');
    expect(root.textContent).toBe('🔒 <img src=x onerror=alert(1)> 正在编辑');
    expect(root.innerHTMLSetCalls).toBe(0);
    expect(root.style.pointerEvents).toBe('none');
    expect(overlay).toMatchObject({
      positioning: 'bottom-left',
      stopEvent: false,
      insertFirst: false,
      className: 'ol-overlay-container ol-element-protection-label-overlay'
    });
    expect(map.getListeners('postrender')).toHaveLength(1);

    store.update({ id: initial.id }, { geometry: { type: 'point', controlPoints: [[9, 10]] } });
    const movedPoint = store.get(initial.id);
    if (movedPoint === undefined) throw new Error('Missing updated Element');
    adapter.upsert(movedPoint, protection(initial.id, '李四'));
    expect(firstSource.getFeatures()).toEqual([feature]);
    expect(feature.getGeometry()).toBe(geometry);
    expect((geometry as Point).getCoordinates()).toEqual([9, 10]);
    expect(overlayHarness.instances).toEqual([overlay]);
    expect(roots).toEqual([root]);
    expect(root.textContent).toBe('🔒 李四 正在编辑');

    maskStyle(feature);
    dispatchPostrender(map, layers.requireLayer('layer-a') as VectorLayer);
    expect(root.hidden).toBe(false);
    (layers.requireLayer('layer-a') as VectorLayer).setVisible(false);
    expect(root.hidden).toBe(true);
    (layers.requireLayer('layer-a') as VectorLayer).setVisible(true);
    dispatchPostrender(map, layers.requireLayer('layer-a') as VectorLayer);
    expect(root.hidden).toBe(false);

    store.update({ id: initial.id }, { layerId: 'layer-b' });
    const movedLayer = store.get(initial.id);
    if (movedLayer === undefined) throw new Error('Missing migrated Element');
    adapter.upsert(movedLayer, protection(initial.id, '王五'));
    expect(map.layers.getArray()).not.toContain(firstLayer);
    expect(firstLayer.getSource()).toBeNull();
    const secondLayer = protectionLayer(map.layers, layers.requireLayer('layer-b'));
    expect(requireSource(secondLayer).getFeatures()).toEqual([feature]);
    expect(overlayHarness.instances).toEqual([overlay]);
    expect(root.textContent).toBe('🔒 王五 正在编辑');
    expect(map.getListeners('postrender')).toHaveLength(1);

    adapter.remove(initial.id);
    adapter.remove(initial.id);
    expect(map.layers.getArray()).not.toContain(secondLayer);
    expect(secondLayer.getSource()).toBeNull();
    expect(map.removedOverlays).toEqual([overlay]);
    expect(overlay.element).toBeUndefined();
    expect(overlay.disposed).toBe(true);
    expect(root.removeCalls).toBe(1);
    expect(map.getListeners('postrender') ?? []).toHaveLength(0);
    adapter.destroy();
    adapter.destroy();
    expect(map.removedOverlays).toHaveLength(1);
  });

  it('创建 Overlay 失败时回滚已建立的标签、Feature 和临时层', () => {
    const { adapter, layers, map, roots, store } = setup();
    const element = addElement(store, {
      id: 'rollback',
      type: 'polyline',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [5, 5]
        ]
      },
      style: { strokes: [{ color: '#2563eb', width: 2 }] },
      layerId: 'layer-a',
      visible: true
    });
    const target = layers.requireLayer('layer-a');
    vi.spyOn(map, 'addOverlay').mockImplementation((overlay) => {
      map.addedOverlays.push(overlay as unknown as OverlayRecord);
      throw new Error('overlay mount failed');
    });

    expect(() => adapter.upsert(element, protection(element.id, '张三'))).toThrowError('overlay mount failed');
    expect(map.layers.getArray()).toEqual([target, layers.requireLayer('layer-b')]);
    expect(map.removedOverlays).toEqual(overlayHarness.instances);
    expect(overlayHarness.instances[0]?.disposed).toBe(true);
    expect(roots[0]?.removeCalls).toBe(1);
    expect(map.getListeners('postrender') ?? []).toHaveLength(0);

    adapter.destroy();
  });
});
