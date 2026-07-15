import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type BaseLayer from 'ol/layer/Base.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import type { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import {
  centerImage,
  rotateImage,
  scaleImage,
  stretchHorizontalImage,
  stretchVerticalImage,
  translateImage
} from '../src/adapters/openlayers/transform/handleImages.js';
import { HandleLayer, type TransformHandleHit } from '../src/adapters/openlayers/transform/HandleLayer.js';
import type { Coordinate, Pixel } from '../src/core/common/types.js';
import type { LayerRenderPort } from '../src/core/ports/LayerRenderPort.js';
import type { TransformInteractionOptions, TransformInteractionTarget } from '../src/core/ports/TransformInteractionPort.js';
import type { StyleSpec } from '../src/core/style/types.js';

const handleMetadata = 'ol-engine-transform-handle';
const pointIcon = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/%3E';

class MapHarness {
  readonly layers = new Collection<BaseLayer>();
  readonly view = new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 2 });
  readonly viewportCenter: Pixel = [100, 100];
  lastCheckWrapped: boolean | undefined;

  addLayer(layer: BaseLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: BaseLayer): BaseLayer | undefined {
    return this.layers.remove(layer);
  }

  getView(): View {
    return this.view;
  }

  forEachFeatureAtPixel<T>(
    _pixel: readonly number[],
    _callback: (feature: Feature<Geometry>) => T,
    options: Readonly<{ checkWrapped?: boolean }> = {}
  ): T | undefined {
    this.lastCheckWrapped = options.checkWrapped;
    return undefined;
  }

  getPixelFromCoordinate(coordinate: readonly number[]): [number, number] {
    const resolution = this.view.getResolution() ?? 1;
    const rotation = this.view.getRotation();
    const center = this.view.getCenter() ?? [0, 0];
    const x = coordinate[0] - center[0];
    const y = coordinate[1] - center[1];
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return [this.viewportCenter[0] + (cosine * x + sine * y) / resolution, this.viewportCenter[1] + (sine * x - cosine * y) / resolution];
  }

  getCoordinateFromPixel(pixel: readonly number[]): [number, number] {
    const resolution = this.view.getResolution() ?? 1;
    const rotation = this.view.getRotation();
    const center = this.view.getCenter() ?? [0, 0];
    const x = pixel[0] - this.viewportCenter[0];
    const y = pixel[1] - this.viewportCenter[1];
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return [center[0] + resolution * (cosine * x + sine * y), center[1] + resolution * (sine * x - cosine * y)];
  }

  getCoordinateFromPixelInternal(pixel: readonly number[]): [number, number] {
    return this.getCoordinateFromPixel(pixel);
  }
}

describe('Transform 默认视觉', () => {
  it('恢复旧版操作图标、旋转中心和 idle/active 控制框样式', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions({ translate: 'center' }));
    harness.handles.setTarget(polygonTarget());

    const handles = transformHandles(harness.map);
    expect(iconSource(handles.get('rotate'))).toBe(rotateImage);
    expect(iconOf(handles.get('rotate')).getDisplacement()).toEqual([0, 30]);
    expect(iconSource(handles.get('translate-center'))).toBe(translateImage);
    expect(iconSource(handles.get('scale-sw'))).toBe(scaleImage);
    expect(iconSource(handles.get('stretch-west'))).toBe(stretchHorizontalImage);
    expect(iconSource(handles.get('stretch-south'))).toBe(stretchVerticalImage);
    expect(sourceFeatures(harness.map).some((feature) => feature.get(handleMetadata) === undefined && iconSource(feature) === centerImage)).toBe(false);

    const bbox = bboxFeature(harness.map, previewStyle);
    expect(styleOf(bbox).getStroke()?.getColor()).toEqual([80, 80, 80]);
    expect(styleOf(bbox).getStroke()?.getWidth()).toBe(1);
    expect(styleOf(bbox).getStroke()?.getLineDash()).toBeNull();
    expect(styleOf(bbox).getFill()?.getColor()).toEqual([204, 204, 204, 0.3]);

    harness.handles.setBlink(false);
    expect(styleOf(bbox).getStroke()?.getColor()).toEqual([80, 80, 80]);
    harness.handles.setOperationActive(true, 'rotate');
    expect(sourceFeatures(harness.map).some((feature) => feature.get(handleMetadata) === undefined && iconSource(feature) === centerImage)).toBe(true);
    expect(styleOf(bboxFeature(harness.map, previewStyle)).getStroke()?.getLineDash()).toEqual([6, 4]);
    harness.handles.setBlink(false);
    expect(styleOf(bboxFeature(harness.map, previewStyle)).getStroke()?.getColor()).toEqual([80, 80, 80, 0.2]);
    harness.handles.setOperationActive(false);
    expect(styleOf(bboxFeature(harness.map, previewStyle)).getStroke()?.getLineDash()).toBeNull();

    harness.handles.destroy();
  });

  it('显式 handleStyle 继续覆盖所有可交互手柄的默认图片', () => {
    const targetStyle: StyleSpec = {};
    const handleStyle: StyleSpec = { symbol: { type: 'circle', radius: 9, fill: { type: 'solid', color: '#ff0000' } } };
    const previewStyle = new Style({ fill: new Fill({ color: '#eeeeee' }) });
    const customStyle = new Style({ image: new Icon({ src: pointIcon, size: [18, 18] }) });
    const compiler = {
      compile: vi.fn((style: TransformInteractionTarget['style']) => (style === handleStyle ? customStyle : previewStyle))
    } as unknown as StyleCompiler;
    const harness = createHarness(previewStyle, interactionOptions({ translate: 'center', handleStyle }), compiler);
    harness.handles.setTarget(polygonTarget({ style: targetStyle }));

    const firstHandles = transformHandles(harness.map);
    for (const feature of firstHandles.values()) expect(feature.getStyle()).toBe(customStyle);
    expect(compiler.compile).toHaveBeenCalledWith(handleStyle);
    harness.map.view.setResolution(1);
    harness.map.view.setRotation(Math.PI / 4);
    harness.handles.setTarget(polygonTarget({ style: {} }));
    expect(compiler.compile).toHaveBeenCalledTimes(2);
    for (const [key, feature] of firstHandles) {
      expect(transformHandles(harness.map).get(key)).toBe(feature);
      expect(feature.getStyle()).toBe(customStyle);
    }

    harness.handles.destroy();
  });

  it('视图分辨率和旋转变化时按图标视觉尺寸原位更新控制框，并在销毁时解除监听', () => {
    const previewStyle = new Style({ image: new Icon({ src: pointIcon, size: [40, 20], rotateWithView: true }) });
    const map = new MapHarness();
    const beforeResolution = listenerCount(map.view, 'change:resolution');
    const beforeRotation = listenerCount(map.view, 'change:rotation');
    const harness = createHarness(previewStyle, interactionOptions({ buffer: 0, pointRadius: 8 }), undefined, map);
    harness.handles.setTarget(pointTarget());

    expect(listenerCount(map.view, 'change:resolution')).toBe(beforeResolution + 1);
    expect(listenerCount(map.view, 'change:rotation')).toBe(beforeRotation + 1);
    expect(harness.binding.suppressProjection).toHaveBeenCalledTimes(1);
    expect(harness.handles.extent).toEqual([-40, -20, 40, 20]);
    expect(rotateCoordinate(map)[1] / 2).toBe(10);

    const firstBBox = bboxFeature(map, previewStyle);
    map.view.setResolution(1);
    expect(harness.handles.extent).toEqual([-20, -10, 20, 10]);
    expect(rotateCoordinate(map)[1]).toBe(10);
    expect(bboxFeature(map, previewStyle)).toBe(firstBBox);
    expect(harness.binding.suppressProjection).toHaveBeenCalledTimes(1);

    map.view.setRotation(Math.PI / 2);
    expect(harness.handles.extent?.[0]).toBeCloseTo(-20);
    expect(harness.handles.extent?.[1]).toBeCloseTo(-10);
    expect(harness.handles.extent?.[2]).toBeCloseTo(20);
    expect(harness.handles.extent?.[3]).toBeCloseTo(10);
    expect(rotateCoordinate(map)[1]).toBeCloseTo(10);

    harness.handles.destroy();
    expect(listenerCount(map.view, 'change:resolution')).toBe(beforeResolution);
    expect(listenerCount(map.view, 'change:rotation')).toBe(beforeRotation);
    map.view.setResolution(0.5);
    expect(map.layers.getLength()).toBe(0);

    const fixedMap = new MapHarness();
    fixedMap.view.setResolution(1);
    const fixedStyle = new Style({ image: new Icon({ src: pointIcon, size: [40, 20], rotateWithView: false }) });
    const fixedHarness = createHarness(fixedStyle, interactionOptions({ buffer: 0, pointRadius: 8 }), undefined, fixedMap);
    fixedHarness.handles.setTarget(pointTarget());
    fixedMap.view.setRotation(Math.PI / 2);
    expect(fixedHarness.handles.extent?.[0]).toBeCloseTo(-10);
    expect(fixedHarness.handles.extent?.[1]).toBeCloseTo(-20);
    expect(fixedHarness.handles.extent?.[2]).toBeCloseTo(10);
    expect(fixedHarness.handles.extent?.[3]).toBeCloseTo(20);
    fixedHarness.handles.destroy();
  });

  it('关闭交互期间的强制全量重绘，并按旋转后的屏幕外接框右上角定位工具栏', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const map = new MapHarness();
    const anchors: Coordinate[] = [];
    const harness = createHarness(previewStyle, interactionOptions(), undefined, map, (coordinate) => anchors.push(coordinate));
    harness.handles.setTarget(polygonTarget());

    const layer = map.layers.item(0) as VectorLayer<VectorSource<Feature<Geometry>>>;
    expect(layer.getUpdateWhileAnimating()).toBe(false);
    expect(layer.getUpdateWhileInteracting()).toBe(false);
    expect(sourceOf(map).getWrapX()).toBe(false);
    expect(harness.handles.hit([0, 0], 2)).toBeUndefined();
    expect(map.lastCheckWrapped).toBe(false);
    const initialAnchor = anchors.at(-1);
    expect(initialAnchor).toBeDefined();

    map.view.setRotation(Math.PI / 4);
    const rotatedAnchor = anchors.at(-1);
    const extent = harness.handles.extent;
    if (rotatedAnchor === undefined || extent === undefined) throw new Error('未收到旋转后的工具栏锚点');
    const cornerPixels = extentCorners(extent).map((coordinate) => map.getPixelFromCoordinate(coordinate));
    const expectedPixel: Pixel = [Math.max(...cornerPixels.map((pixel) => pixel[0])), Math.min(...cornerPixels.map((pixel) => pixel[1]))];
    const actualPixel = map.getPixelFromCoordinate(rotatedAnchor);

    expect(rotatedAnchor).not.toEqual(initialAnchor);
    expect(actualPixel[0]).toBeCloseTo(expectedPixel[0]);
    expect(actualPixel[1]).toBeCloseTo(expectedPixel[1]);
    harness.handles.destroy();
  });

  it('视图变化只更新依赖分辨率的边框与手柄，不写入未变化的预览和顶点', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions());
    harness.handles.setTarget(polygonTarget({ canEditVertices: true }));

    const previewGeometry = previewFeature(harness.map, previewStyle).getGeometry();
    const bboxGeometry = bboxFeature(harness.map, previewStyle).getGeometry();
    const vertexGeometry = transformHandles(harness.map).get('vertex-0')?.getGeometry();
    const scaleGeometry = transformHandles(harness.map).get('scale-ne')?.getGeometry();
    if (
      !(previewGeometry instanceof Polygon) ||
      !(bboxGeometry instanceof Polygon) ||
      !(vertexGeometry instanceof Point) ||
      !(scaleGeometry instanceof Point)
    ) {
      throw new Error('Transform 测试要素几何类型不正确');
    }
    const previewSetter = vi.spyOn(previewGeometry, 'setCoordinates');
    const bboxSetter = vi.spyOn(bboxGeometry, 'setCoordinates');
    const vertexSetter = vi.spyOn(vertexGeometry, 'setCoordinates');
    const scaleSetter = vi.spyOn(scaleGeometry, 'setCoordinates');

    harness.map.view.setResolution(1);

    expect(previewSetter).not.toHaveBeenCalled();
    expect(vertexSetter).not.toHaveBeenCalled();
    expect(bboxSetter).toHaveBeenCalledTimes(1);
    expect(scaleSetter).toHaveBeenCalledTimes(1);
    harness.handles.destroy();
  });

  it('同一目标连续更新时复用要素和几何，并跳过集合重建、样式重编译与投影重申请', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions());
    harness.handles.setTarget(polygonTarget());

    const source = sourceOf(harness.map);
    const clear = vi.spyOn(source, 'clear');
    const addFeatures = vi.spyOn(source, 'addFeatures');
    const firstPreview = previewFeature(harness.map, previewStyle);
    const firstBBox = bboxFeature(harness.map, previewStyle);
    const firstHandles = transformHandles(harness.map);
    const previewGeometry = firstPreview.getGeometry();
    const bboxGeometry = firstBBox.getGeometry();
    const scaleGeometry = firstHandles.get('scale-ne')?.getGeometry();

    for (let step = 1; step <= 40; step += 1) {
      const ring = translatedRing(step, -step);
      harness.handles.setTarget(polygonTarget({ geometry: { type: 'polygon', coordinates: [ring] }, controlPoints: ring, style: {} }));
    }

    expect(clear).not.toHaveBeenCalled();
    expect(addFeatures).not.toHaveBeenCalled();
    expect(harness.binding.suppressProjection).toHaveBeenCalledTimes(1);
    expect(harness.compiler.compile).toHaveBeenCalledTimes(1);
    expect(previewFeature(harness.map, previewStyle)).toBe(firstPreview);
    expect(bboxFeature(harness.map, previewStyle)).toBe(firstBBox);
    expect(firstPreview.getGeometry()).toBe(previewGeometry);
    expect(firstBBox.getGeometry()).toBe(bboxGeometry);
    const finalHandles = transformHandles(harness.map);
    for (const [key, feature] of firstHandles) expect(finalHandles.get(key)).toBe(feature);
    expect(finalHandles.get('scale-ne')?.getGeometry()).toBe(scaleGeometry);
    expect((firstPreview.get(handleMetadata) as TransformHandleHit).coordinate).toEqual([40, -40]);
    expect(pointCoordinates(finalHandles.get('scale-ne'))).toEqual([82, -3]);

    harness.handles.destroy();
  });

  it('模式切换只替换能力差异手柄，切回时继续复用原手柄', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions());
    const transformTarget = polygonTarget();
    harness.handles.setTarget(transformTarget);
    const source = sourceOf(harness.map);
    const clear = vi.spyOn(source, 'clear');
    const firstPreview = previewFeature(harness.map, previewStyle);
    const firstBBox = bboxFeature(harness.map, previewStyle);
    const firstScale = transformHandles(harness.map).get('scale-ne');

    harness.handles.setTarget(
      polygonTarget({
        mode: 'edit',
        canTranslate: false,
        canRotate: false,
        canScale: false,
        canStretch: false,
        canEditVertices: true
      })
    );
    const editHandles = transformHandles(harness.map);
    expect(editHandles.has('scale-ne')).toBe(false);
    expect([...editHandles.keys()].filter((key) => key.startsWith('vertex-'))).toHaveLength(5);

    harness.handles.setTarget(transformTarget);
    expect(clear).not.toHaveBeenCalled();
    expect(harness.binding.suppressProjection).toHaveBeenCalledTimes(1);
    expect(harness.compiler.compile).toHaveBeenCalledTimes(1);
    expect(previewFeature(harness.map, previewStyle)).toBe(firstPreview);
    expect(bboxFeature(harness.map, previewStyle)).toBe(firstBBox);
    expect(transformHandles(harness.map).get('scale-ne')).toBe(firstScale);

    harness.handles.destroy();
  });

  it('离开大顶点编辑时快速重置数据源并释放顶点要素池', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions({ handleStyle: {} }));
    const transformTarget = polygonTarget();
    const controlPoints = Object.freeze(Array.from({ length: 512 }, (_, index): Coordinate => Object.freeze([index, index % 17])));
    const editTarget = polygonTarget({
      mode: 'edit',
      controlPoints,
      canTranslate: false,
      canRotate: false,
      canScale: false,
      canStretch: false,
      canEditVertices: true
    });
    harness.handles.setTarget(transformTarget);
    const source = sourceOf(harness.map);
    const clear = vi.spyOn(source, 'clear');
    const removeFeature = vi.spyOn(source, 'removeFeature');

    harness.handles.setTarget(editTarget);
    const retired = transformHandles(harness.map).get('vertex-511');
    if (retired === undefined) throw new Error('未创建大顶点编辑手柄');
    const dispose = vi.spyOn(retired, 'dispose');
    clear.mockClear();
    removeFeature.mockClear();

    harness.handles.setTarget(transformTarget);

    expect(clear).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledWith(true);
    expect(removeFeature).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(retired.getGeometry()).toBeUndefined();
    expect([...transformHandles(harness.map).keys()].some((key) => key.startsWith('vertex-'))).toBe(false);

    harness.handles.setTarget(editTarget);
    expect(transformHandles(harness.map).get('vertex-511')).not.toBe(retired);
    harness.handles.destroy();
  });

  it('5 千默认样式顶点压力样本使用 MultiPoint/RBush 批次，支持增量更新、命中和退出清理', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions());
    const transformTarget = polygonTarget();
    const controlPoints = largeControlPoints(5_000);
    const editTarget = polygonTarget({
      mode: 'edit',
      controlPoints,
      canTranslate: false,
      canRotate: false,
      canScale: false,
      canStretch: false,
      canEditVertices: true
    });
    const initialStarted = performance.now();
    harness.handles.setTarget(editTarget);
    const initialDuration = performance.now() - initialStarted;
    const source = sourceOf(harness.map);
    const batch = vertexBatchFeature(harness.map);
    const geometry = batch.getGeometry();
    if (!(geometry instanceof MultiPoint)) throw new Error('大顶点批次不是 MultiPoint');

    expect(source.getFeatures()).toHaveLength(3);
    expect(geometry.getCoordinates()).toHaveLength(5_000);
    expect([...transformHandles(harness.map).keys()].some((key) => key.startsWith('vertex-'))).toBe(false);
    const selectedIndex = 3_456;
    const selectedCoordinate = controlPoints[selectedIndex];
    const nativeHitTest = vi.spyOn(harness.map, 'forEachFeatureAtPixel');
    const hitStarted = performance.now();
    expect(harness.handles.hit(harness.map.getPixelFromCoordinate(selectedCoordinate), 2)).toMatchObject({
      operation: 'vertex',
      index: selectedIndex,
      coordinate: selectedCoordinate
    });
    expect(nativeHitTest).not.toHaveBeenCalled();
    const hitDuration = performance.now() - hitStarted;
    const adjacentCoordinate = controlPoints[selectedIndex + 1];
    const midpoint: Coordinate = [(selectedCoordinate[0] + adjacentCoordinate[0]) / 2, (selectedCoordinate[1] + adjacentCoordinate[1]) / 2];
    expect(harness.handles.hit(harness.map.getPixelFromCoordinate(midpoint), 2)).toMatchObject({ index: selectedIndex });
    expect(nativeHitTest).not.toHaveBeenCalled();

    const context = fakeCanvasContext();
    const renderer = styleOf(batch).getRenderer();
    const hitRenderer = styleOf(batch).getHitDetectionRenderer();
    if (renderer === null || hitRenderer === null) throw new Error('MultiPoint 批次渲染器未安装');
    renderer(
      [
        [10, 20],
        [30, 40]
      ],
      { context, feature: batch, geometry, pixelRatio: 2, resolution: 1, rotation: 0 }
    );
    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.arc).toHaveBeenNthCalledWith(1, 10, 20, 10, 0, Math.PI * 2);
    expect(context.arc).toHaveBeenNthCalledWith(2, 30, 40, 10, 0, Math.PI * 2);
    expect(context.fill).toHaveBeenCalledOnce();
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.lineWidth).toBe(4);
    hitRenderer([[10, 20]], { context, feature: batch, geometry, pixelRatio: 2, resolution: 1, rotation: 0 });
    expect(context.arc).toHaveBeenCalledTimes(2);

    const updatedCoordinate: Coordinate = [selectedCoordinate[0] + 0.25, selectedCoordinate[1] + 0.25];
    const updatedControlPoints = Object.freeze([...controlPoints.slice(0, selectedIndex), updatedCoordinate, ...controlPoints.slice(selectedIndex + 1)]);
    const updateStarted = performance.now();
    harness.handles.setTarget({ ...editTarget, controlPoints: updatedControlPoints });
    const updateDuration = performance.now() - updateStarted;
    expect(vertexBatchFeature(harness.map)).toBe(batch);
    expect(batch.getGeometry()).toBe(geometry);
    expect(harness.handles.hit(harness.map.getPixelFromCoordinate(updatedCoordinate), 2)).toMatchObject({
      index: selectedIndex,
      coordinate: updatedCoordinate
    });

    const dispose = vi.spyOn(batch, 'dispose');
    const exitStarted = performance.now();
    harness.handles.setTarget(transformTarget);
    const exitDuration = performance.now() - exitStarted;
    expect(dispose).toHaveBeenCalledOnce();
    expect(batch.getGeometry()).toBeUndefined();
    expect(harness.handles.hit(harness.map.getPixelFromCoordinate(updatedCoordinate), 2)).toBeUndefined();
    expect(initialDuration).toBeLessThan(1_000);
    expect(updateDuration).toBeLessThan(50);
    expect(hitDuration).toBeLessThan(50);
    expect(exitDuration).toBeLessThan(500);
    harness.handles.destroy();
  });

  it('5 千自定义样式顶点压力样本使用单个 MultiPoint/RBush，并保持单点更新稳定', () => {
    const targetStyle: StyleSpec = {};
    const handleStyle: StyleSpec = { symbol: { type: 'circle', radius: 9, fill: { type: 'solid', color: '#ff0000' } } };
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const customStyle = new Style({ image: new Icon({ src: pointIcon, size: [18, 18] }) });
    const compiler = {
      compile: vi.fn((style: TransformInteractionTarget['style']) => (style === handleStyle ? customStyle : previewStyle))
    } as unknown as StyleCompiler;
    const harness = createHarness(previewStyle, interactionOptions({ handleStyle }), compiler);
    const controlPoints = largeControlPoints(5_000);
    const editTarget = polygonTarget({
      style: targetStyle,
      mode: 'edit',
      controlPoints,
      canTranslate: false,
      canRotate: false,
      canScale: false,
      canStretch: false,
      canEditVertices: true
    });

    const initialStarted = performance.now();
    harness.handles.setTarget(editTarget);
    const initialDuration = performance.now() - initialStarted;
    const source = sourceOf(harness.map);
    const batch = vertexBatchFeature(harness.map);
    const geometry = batch.getGeometry();
    if (!(geometry instanceof MultiPoint)) throw new Error('自定义样式大顶点批次不是 MultiPoint');
    expect(source.getFeatures()).toHaveLength(3);
    expect(batch.getStyle()).toBe(customStyle);
    expect([...transformHandles(harness.map).keys()].some((key) => key.startsWith('vertex-'))).toBe(false);

    const selectedIndex = 3_456;
    const selectedCoordinate = controlPoints[selectedIndex];
    const nativeHitTest = vi.spyOn(harness.map, 'forEachFeatureAtPixel');
    const hitStarted = performance.now();
    expect(harness.handles.hit(harness.map.getPixelFromCoordinate(selectedCoordinate), 2)).toMatchObject({
      operation: 'vertex',
      index: selectedIndex,
      coordinate: selectedCoordinate
    });
    const hitDuration = performance.now() - hitStarted;
    expect(nativeHitTest).not.toHaveBeenCalled();

    const updatedCoordinate: Coordinate = [selectedCoordinate[0] + 0.25, selectedCoordinate[1] + 0.25];
    const updatedControlPoints = Object.freeze([...controlPoints.slice(0, selectedIndex), updatedCoordinate, ...controlPoints.slice(selectedIndex + 1)]);
    const updateStarted = performance.now();
    harness.handles.setTarget({ ...editTarget, controlPoints: updatedControlPoints });
    const updateDuration = performance.now() - updateStarted;
    expect(vertexBatchFeature(harness.map)).toBe(batch);
    expect(batch.getGeometry()).toBe(geometry);
    expect(harness.handles.hit(harness.map.getPixelFromCoordinate(updatedCoordinate), 2)).toMatchObject({
      index: selectedIndex,
      coordinate: updatedCoordinate
    });
    expect(nativeHitTest).not.toHaveBeenCalled();
    expect(initialDuration).toBeLessThan(1_000);
    expect(hitDuration).toBeLessThan(50);
    expect(updateDuration).toBeLessThan(50);

    harness.handles.destroy();
    expect(batch.getGeometry()).toBeUndefined();
  });

  it('同一目标和视图刷新会保留复制预览要素', () => {
    const previewStyle = new Style({ stroke: new Stroke({ color: '#000000' }) });
    const harness = createHarness(previewStyle, interactionOptions());
    harness.handles.setTarget(polygonTarget());
    const copyGeometry = {
      type: 'polygon',
      coordinates: [
        [
          [3, 4, 9],
          [5, 4, 9],
          [5, 6, 9],
          [3, 4, 9]
        ]
      ]
    } as const;
    harness.handles.setCopyPreview(copyGeometry, {});
    const copy = sourceFeatures(harness.map).find((feature) => feature.get('ol-engine-transform-copy') === true);
    expect(copy).toBeDefined();

    const ring = translatedRing(5, 6);
    harness.handles.setTarget(polygonTarget({ geometry: { type: 'polygon', coordinates: [ring] }, controlPoints: ring }));
    harness.map.view.setResolution(1);
    expect(sourceFeatures(harness.map)).toContain(copy);
    const geometry = copy?.getGeometry();
    if (geometry === undefined) throw new Error('未找到复制预览几何');
    const translate = vi.spyOn(geometry, 'translate');
    harness.handles.updateCopyPreview(7, 8);
    expect(polygonCoordinates(copy)?.[0]?.[0]).toEqual([10, 12, 9]);
    expect(copy?.getGeometry()).toBe(geometry);
    harness.handles.updateCopyPreview(7, 8);
    harness.handles.updateCopyPreview(8, 10);
    expect(polygonCoordinates(copy)?.[0]?.[0]).toEqual([11, 14, 9]);
    expect(translate.mock.calls).toEqual([
      [7, 8],
      [1, 2]
    ]);

    harness.handles.destroy();
  });
});

function createHarness(
  previewStyle: Style,
  options: TransformInteractionOptions,
  providedCompiler?: StyleCompiler,
  map = new MapHarness(),
  onExtentChange?: (coordinate: Coordinate) => void
) {
  const compiler =
    providedCompiler ??
    ({
      compile: vi.fn((style: TransformInteractionTarget['style']) => {
        void style;
        return previewStyle;
      })
    } as unknown as StyleCompiler);
  const lease = { release: vi.fn() };
  const binding = { suppressProjection: vi.fn(() => lease) } as unknown as FeatureBinding & {
    suppressProjection: ReturnType<typeof vi.fn>;
  };
  const render = {
    registerTarget: vi.fn(() => {
      return { destroy: vi.fn() };
    })
  } as unknown as LayerRenderPort;
  const handles = new HandleLayer(map as unknown as OlMap, binding, compiler, render, {
    sessionId: 'visual-test',
    interaction: options,
    onExtentChange
  });
  return { binding, compiler, handles, map, render };
}

function extentCorners(extent: readonly [number, number, number, number]): readonly Coordinate[] {
  return [
    [extent[0], extent[1]],
    [extent[0], extent[3]],
    [extent[2], extent[3]],
    [extent[2], extent[1]]
  ];
}

function interactionOptions(overrides: Partial<TransformInteractionOptions> = {}): TransformInteractionOptions {
  return {
    hitTolerance: 2,
    translate: 'feature',
    scale: true,
    stretch: true,
    rotate: true,
    translateBBox: false,
    noFlip: true,
    keepRectangle: true,
    buffer: 16,
    pointRadius: 8,
    ...overrides
  };
}

function polygonTarget(overrides: Partial<TransformInteractionTarget> = {}): TransformInteractionTarget {
  const ring = [
    [-10, -5],
    [-10, 5],
    [10, 5],
    [10, -5],
    [-10, -5]
  ] as const;
  return {
    elementId: 'polygon',
    type: 'polygon',
    layerId: 'default',
    geometry: { type: 'polygon', coordinates: [ring] },
    style: {},
    controlPoints: ring,
    canTranslate: true,
    canRotate: true,
    canScale: true,
    canStretch: true,
    canEditVertices: false,
    ...overrides,
    mode: overrides.mode ?? 'transform'
  };
}

function pointTarget(): TransformInteractionTarget {
  return {
    elementId: 'point',
    type: 'point',
    layerId: 'default',
    geometry: { type: 'point', coordinates: [0, 0] },
    style: {},
    mode: 'transform',
    controlPoints: [[0, 0]],
    canTranslate: true,
    canRotate: true,
    canScale: false,
    canStretch: false,
    canEditVertices: false
  };
}

function sourceOf(map: MapHarness): VectorSource<Feature<Geometry>> {
  const layer = map.layers.item(0) as VectorLayer<VectorSource<Feature<Geometry>>>;
  const source = layer.getSource();
  if (source === null) throw new Error('未找到 Transform 控制图层数据源');
  return source;
}

function sourceFeatures(map: MapHarness): Feature<Geometry>[] {
  return sourceOf(map).getFeatures();
}

function vertexBatchFeature(map: MapHarness): Feature<Geometry> {
  const batch = sourceFeatures(map).find((feature) => feature.get('ol-engine-transform-vertex-batch') === true);
  if (batch === undefined) throw new Error('未找到 Transform MultiPoint 顶点批次');
  return batch;
}

function transformHandles(map: MapHarness): Map<string, Feature<Geometry>> {
  return new Map(
    sourceFeatures(map).flatMap((feature) => {
      const hit = feature.get(handleMetadata) as TransformHandleHit | undefined;
      return hit === undefined ? [] : [[hit.key, feature] as const];
    })
  );
}

function bboxFeature(map: MapHarness, previewStyle: Style): Feature<Geometry> {
  const bbox = sourceFeatures(map).find((feature) => feature.getGeometry() instanceof Polygon && feature.getStyle() !== previewStyle);
  if (bbox === undefined) throw new Error('未找到 Transform 控制框');
  return bbox;
}

function previewFeature(map: MapHarness, previewStyle: Style): Feature<Geometry> {
  const preview = sourceFeatures(map).find((feature) => feature.getStyle() === previewStyle);
  if (preview === undefined) throw new Error('未找到 Transform 预览要素');
  return preview;
}

function translatedRing(x: number, y: number): readonly Coordinate[] {
  return [
    [-10 + x, -5 + y],
    [-10 + x, 5 + y],
    [10 + x, 5 + y],
    [10 + x, -5 + y],
    [-10 + x, -5 + y]
  ];
}

function largeControlPoints(length: number): readonly Coordinate[] {
  return Object.freeze(
    Array.from({ length }, (_, index): Coordinate => {
      if (index === 0) return Object.freeze([0, 0]);
      return Object.freeze([(index % 300) - 150, Math.floor(index / 300) * 10 + 1]);
    })
  );
}

function fakeCanvasContext(): CanvasRenderingContext2D & {
  readonly beginPath: ReturnType<typeof vi.fn>;
  readonly arc: ReturnType<typeof vi.fn>;
  readonly fill: ReturnType<typeof vi.fn>;
  readonly stroke: ReturnType<typeof vi.fn>;
} {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1
  } as unknown as CanvasRenderingContext2D & {
    readonly beginPath: ReturnType<typeof vi.fn>;
    readonly arc: ReturnType<typeof vi.fn>;
    readonly fill: ReturnType<typeof vi.fn>;
    readonly stroke: ReturnType<typeof vi.fn>;
  };
}

function pointCoordinates(feature: Feature<Geometry> | undefined): readonly number[] {
  const geometry = feature?.getGeometry();
  if (!(geometry instanceof Point)) throw new Error('要素不是 Point');
  return geometry.getCoordinates();
}

function polygonCoordinates(feature: Feature<Geometry> | undefined): number[][][] | undefined {
  const geometry = feature?.getGeometry();
  return geometry instanceof Polygon ? geometry.getCoordinates() : undefined;
}

function rotateCoordinate(map: MapHarness): readonly number[] {
  const feature = transformHandles(map).get('rotate');
  const geometry = feature?.getGeometry();
  if (!(geometry instanceof Point)) throw new Error('未找到旋转手柄');
  return geometry.getCoordinates();
}

function styleOf(feature: Feature<Geometry> | undefined): Style {
  const style = feature?.getStyle();
  if (!(style instanceof Style)) throw new Error('要素没有单一 Style');
  return style;
}

function iconSource(feature: Feature<Geometry> | undefined): string | undefined {
  const image = styleOf(feature).getImage();
  return image instanceof Icon ? image.getSrc() : undefined;
}

function iconOf(feature: Feature<Geometry> | undefined): Icon {
  const image = styleOf(feature).getImage();
  if (!(image instanceof Icon)) throw new Error('要素没有 Icon 样式');
  return image;
}

function listenerCount(view: View, type: 'change:resolution' | 'change:rotation'): number {
  return view.getListeners(type)?.length ?? 0;
}
