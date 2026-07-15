import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import Geometry from 'ol/geom/Geometry.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type BaseLayer from 'ol/layer/Base.js';
import VectorLayer from 'ol/layer/Vector.js';
import type OlMap from 'ol/Map.js';
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
import type { LayerRenderPort } from '../src/core/ports/LayerRenderPort.js';
import type { TransformInteractionOptions, TransformInteractionTarget } from '../src/core/ports/TransformInteractionPort.js';
import type { StyleSpec } from '../src/core/style/types.js';

const handleMetadata = 'ol-engine-transform-handle';
const pointIcon = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/%3E';

class MapHarness {
  readonly layers = new Collection<BaseLayer>();
  readonly view = new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 2 });

  addLayer(layer: BaseLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: BaseLayer): BaseLayer | undefined {
    return this.layers.remove(layer);
  }

  getView(): View {
    return this.view;
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

    for (const feature of transformHandles(harness.map).values()) expect(feature.getStyle()).toBe(customStyle);
    expect(compiler.compile).toHaveBeenCalledWith(handleStyle);

    harness.handles.destroy();
  });

  it('视图分辨率和旋转变化时按图标视觉尺寸重建控制框，并在销毁时解除监听', () => {
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
    expect(bboxFeature(map, previewStyle)).not.toBe(firstBBox);
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
});

function createHarness(previewStyle: Style, options: TransformInteractionOptions, providedCompiler?: StyleCompiler, map = new MapHarness()) {
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
  const handles = new HandleLayer(map as unknown as OlMap, binding, compiler, render, { sessionId: 'visual-test', interaction: options });
  return { binding, compiler, handles, map, render };
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

function sourceFeatures(map: MapHarness): Feature<Geometry>[] {
  const layer = map.layers.item(0) as VectorLayer<VectorSource<Feature<Geometry>>>;
  return layer.getSource()?.getFeatures() ?? [];
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
