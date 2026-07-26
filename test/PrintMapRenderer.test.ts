import Collection from 'ol/Collection.js';
import Feature from 'ol/Feature.js';
import ImageState from 'ol/ImageState.js';
import TileState from 'ol/TileState.js';
import Point from 'ol/geom/Point.js';
import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import ImageLayer from 'ol/layer/Image.js';
import Layer from 'ol/layer/Layer.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import Map from 'ol/Map.js';
import DataTileSource from 'ol/source/DataTile.js';
import ImageSource, { ImageSourceEvent } from 'ol/source/Image.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import TileWMS from 'ol/source/TileWMS.js';
import { TileSourceEvent } from 'ol/source/Tile.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Icon from 'ol/style/Icon.js';
import { shared as iconImageCache } from 'ol/style/IconImageCache.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Text from 'ol/style/Text.js';
import View from 'ol/View.js';
import { describe, expect, it, vi } from 'vitest';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec, projectRenderGeometry } from '../src/adapters/openlayers/GeometryCodec.js';
import { isInternalTransientLayer, markInternalTransientLayer } from '../src/adapters/openlayers/internalLayerRole.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { bindResourceErrors, composeMapCanvases, PrintMapRenderer, resolvePrintMapRenderSize } from '../src/adapters/openlayers/PrintMapRenderer.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { createPatternFill, type PatternCanvasContext } from '../src/adapters/openlayers/style/pattern.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import type { PrintPlan } from '../src/core/print/types.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { AnimationManagerImpl } from '../src/services/animation/AnimationManager.js';
import { identityShapeProjection } from './helpers/shapeProjection.js';
import { testShapePresentation } from './helpers/shapePresentation.js';

describe('PrintMapRenderer', () => {
  it('keeps fractional CSS map dimensions while rounding final and draft backing pixels directly from millimeters', () => {
    const mapFrameMm = { x: 10, y: 10, width: 123.45, height: 67.89 };
    const resolution = 2.75;
    const finalSize = resolvePrintMapRenderSize(mapFrameMm, 300, 'final');
    const draftSize = resolvePrintMapRenderSize(mapFrameMm, 300, 'draft');
    const expectedCssWidth = (mapFrameMm.width / 25.4) * 96;
    const expectedCssHeight = (mapFrameMm.height / 25.4) * 96;

    expect(finalSize.cssWidth).toBeCloseTo(expectedCssWidth, 12);
    expect(finalSize.cssHeight).toBeCloseTo(expectedCssHeight, 12);
    expect(finalSize.cssWidth).not.toBe(Math.round(expectedCssWidth));
    expect(finalSize.cssWidth * resolution).toBeCloseTo(expectedCssWidth * resolution, 12);
    expect(finalSize.widthPx).toBe(Math.round((mapFrameMm.width / 25.4) * 300));
    expect(finalSize.heightPx).toBe(Math.round((mapFrameMm.height / 25.4) * 300));
    expect(finalSize.pixelRatio).toBeCloseTo(300 / 96);
    expect(draftSize.widthPx).toBe(Math.round((mapFrameMm.width / 25.4) * 96));
    expect(draftSize.heightPx).toBe(Math.round((mapFrameMm.height / 25.4) * 96));
    expect(draftSize.pixelRatio).toBe(1);
  });

  it('keeps animated child layers inside the business layer zIndex context', () => {
    const upper = new VectorLayer({ source: new VectorSource(), zIndex: 100 });
    const lower = new VectorLayer({ source: new VectorSource(), zIndex: 50 });
    const map = fakeMap([upper, lower]);
    const layersById = new globalThis.Map([
      ['upper', upper],
      ['lower', lower]
    ]);
    const renderer = new PrintMapRenderer(map, {
      layers: {
        query: () => [
          { kind: 'vector', id: 'upper', visible: true, opacity: 1, zIndex: 100, wrapX: false, declutter: false },
          { kind: 'vector', id: 'lower', visible: true, opacity: 1, zIndex: 50, wrapX: false, declutter: false }
        ],
        subscribe: () => () => undefined
      } as unknown as LayerManager,
      layerAdapter: {
        requireLayer: (id: string) => layersById.get(id),
        vectorLayerIdFor: (layer: VectorLayer) => (layer === upper ? 'upper' : layer === lower ? 'lower' : undefined)
      } as unknown as LayerAdapter,
      binding: {
        captureCanonicalLayerFeatures: (layerId: string) => [canonical(layerId === 'upper' ? 'animated' : 'lower')]
      } as unknown as FeatureBinding,
      animations: {
        capturePresentationSnapshot: () => ({
          revision: 7,
          capturedAt: 100,
          elements: [
            {
              elementId: 'animated',
              layerId: 'upper',
              targetZIndex: 0,
              replacesBase: true,
              presentation: {
                geometry: { type: 'point', coordinates: [0, 0] },
                style: { symbol: { type: 'circle', radius: 4, fill: { type: 'solid', color: '#ff0000' } } }
              },
              primitives: []
            }
          ]
        })
      } as unknown as AnimationManagerImpl,
      styles: {
        compilePresentation: () => ({
          resolve: () => [new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#ff0000' }) }) })],
          destroy: () => undefined
        })
      } as unknown as StyleCompiler
    });

    const snapshot = renderer.capture(plan(), { animations: 'current-frame' });
    const upperClone = snapshot.layers[0];
    const lowerClone = snapshot.layers[1];

    expect(upperClone).toBeInstanceOf(LayerGroup);
    expect(upperClone?.getZIndex()).toBe(100);
    const children = (upperClone as LayerGroup).getLayers().getArray();
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((child) => child.getZIndex() === undefined)).toBe(true);
    expect((upperClone as LayerGroup).getLayerStatesArray().every((state) => state.zIndex === 100)).toBe(true);
    expect(lowerClone?.getZIndex()).toBe(50);

    snapshot.destroy();
    renderer.destroy();
  });

  it('preserves one background carrier for animated managed layers even when all feature content is hidden', () => {
    const layer = new VectorLayer({ source: new VectorSource(), background: '#223344', opacity: 0.4, className: 'managed-background' });
    const renderer = new PrintMapRenderer(fakeMap([layer]), {
      layers: {
        query: () => [{ kind: 'vector', id: 'managed', visible: true, opacity: 0.4, wrapX: false, declutter: false }],
        subscribe: () => () => undefined
      } as unknown as LayerManager,
      layerAdapter: {
        requireLayer: () => layer,
        vectorLayerIdFor: (candidate: BaseLayer) => (candidate === layer ? 'managed' : undefined)
      } as unknown as LayerAdapter,
      binding: {
        captureCanonicalLayerFeatures: () => [canonical('animated')]
      } as unknown as FeatureBinding,
      animations: {
        capturePresentationSnapshot: () => ({
          revision: 1,
          capturedAt: 1,
          elements: [
            {
              elementId: 'animated',
              layerId: 'managed',
              targetZIndex: 0,
              replacesBase: true,
              presentation: {
                geometry: { type: 'point', coordinates: [0, 0] },
                style: { symbol: { type: 'circle', radius: 4, fill: { type: 'solid', color: '#ff0000' } } },
                opacity: 0
              },
              primitives: []
            }
          ]
        })
      } as unknown as AnimationManagerImpl,
      styles: {} as StyleCompiler
    });

    const baseSnapshot = renderer.capture(plan(), { animations: 'base' });
    const animatedSnapshot = renderer.capture(plan(), { animations: 'current-frame' });
    const animatedGroup = animatedSnapshot.layers[0] as LayerGroup;
    const children = animatedGroup.getLayers().getArray();
    const carrier = children[0] as VectorLayer<VectorSource>;

    expect(baseSnapshot.layers[0]?.getBackground()).toBe('#223344');
    expect(animatedGroup).toBeInstanceOf(LayerGroup);
    expect(animatedGroup.getBackground()).toBeUndefined();
    expect(animatedGroup.getOpacity()).toBe(0.4);
    expect(children).toHaveLength(1);
    expect(carrier).toBeInstanceOf(VectorLayer);
    expect(carrier.getBackground()).toBe('#223344');
    expect(carrier.getOpacity()).toBe(1);
    expect(carrier.getSource()?.getFeatures()).toEqual([]);
    expect(animatedGroup.getLayerStatesArray()).toHaveLength(1);
    expect(animatedGroup.getLayerStatesArray()[0]?.opacity).toBe(0.4);
    expect(animatedSnapshot.expectedRenderableLeafCount).toBe(1);

    baseSnapshot.destroy();
    animatedSnapshot.destroy();
    renderer.destroy();
  });

  it('keeps Callout text in base and current-frame snapshots and forwards the frozen PrintPlan frame', () => {
    const layer = new VectorLayer({ source: new VectorSource() });
    const style = {
      fill: { type: 'solid' as const, color: '#ffffff' },
      strokes: [{ color: '#222222', width: 2 }],
      text: { text: '打印标注', fontSize: 14, padding: [8, 12, 8, 12] as const }
    };
    const geometry = {
      type: 'polygon' as const,
      coordinates: [
        [
          [-20, 10],
          [20, 10],
          [20, -10],
          [-20, -10],
          [-20, 10]
        ]
      ],
      label: { coordinate: [0, 0] as const, text: '打印标注', visualScale: 0.5 }
    };
    const compiler = new StyleCompiler(new NativeRefRegistry());
    const captureCanonicalLayerFeatures = vi.fn(() => {
      const feature = new Feature<Geometry>();
      feature.setId('callout');
      projectRenderGeometry(feature, geometry);
      feature.setStyle(compiler.compile(style));
      return [{ elementId: 'callout', layerId: 'managed', renderOrder: 0, structuredStyle: true, feature }];
    });
    const capturePresentationSnapshot = vi.fn(() => ({
      revision: 7,
      capturedAt: 100,
      elements: [
        {
          elementId: 'callout',
          layerId: 'managed',
          targetZIndex: 0,
          replacesBase: true,
          presentation: { geometry, style },
          primitives: []
        }
      ]
    }));
    const renderer = new PrintMapRenderer(fakeMap([layer], new View({ center: [500, 600], resolution: 1, rotation: 0 })), {
      layers: {
        query: () => [{ kind: 'vector', id: 'managed', visible: true, opacity: 1, wrapX: false, declutter: false }],
        subscribe: () => () => undefined
      } as unknown as LayerManager,
      layerAdapter: {
        requireLayer: () => layer,
        vectorLayerIdFor: (candidate: BaseLayer) => (candidate === layer ? 'managed' : undefined)
      } as unknown as LayerAdapter,
      binding: { captureCanonicalLayerFeatures } as unknown as FeatureBinding,
      animations: { capturePresentationSnapshot } as unknown as AnimationManagerImpl,
      styles: compiler
    });
    const basePlan = plan(4);
    const printPlan: PrintPlan = {
      ...basePlan,
      range: { ...basePlan.range, center: [25, 30], rotation: Math.PI / 2 }
    };

    const base = renderer.capture(printPlan, { animations: 'base' });
    const animated = renderer.capture(printPlan, { animations: 'current-frame' });
    const frame = { center: printPlan.range.center, resolution: 4, rotation: Math.PI / 2 };

    expect(snapshotTexts(base.layers, 4)).toContain('打印标注');
    expect(snapshotTexts(animated.layers, 4)).toContain('打印标注');
    for (const call of captureCanonicalLayerFeatures.mock.calls) expect(call).toEqual(['managed', frame]);
    expect(capturePresentationSnapshot).toHaveBeenCalledWith({
      center: printPlan.range.center,
      resolution: 4,
      rotation: Math.PI / 2,
      pixelRatio: 1,
      extent: printPlan.range.actualExtent
    });

    base.destroy();
    animated.destroy();
    renderer.destroy();
  });

  it('ignores the active Callout companion layer and rebuilds its text in base and current-frame snapshots', () => {
    const map = fakeMap([], new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 1, rotation: 0 }));
    const refs = new NativeRefRegistry();
    const shapes = new ShapeRegistry(basicShapeDefinitions);
    const store = new ElementStore(shapes);
    const layerAdapter = new LayerAdapter(map, refs);
    const layers = new LayerManager(store, layerAdapter);
    layers.ensureDefaultVector();
    store.add({
      id: 'integrated-callout',
      type: 'callout',
      geometry: { type: 'callout', anchor: [0, 0], center: [40, 30], size: [120, 50], referenceResolution: 2 },
      style: {
        fill: { type: 'solid', color: '#ffffff' },
        strokes: [{ color: '#222222', width: 2 }],
        text: { text: '完整打印标注', fontSize: 14, padding: [8, 12, 8, 12] }
      },
      module: 'labels',
      layerId: 'default',
      visible: true
    });
    const styles = new StyleCompiler(refs);
    const binding = new FeatureBinding(store, layerAdapter, new GeometryCodec(shapes, identityShapeProjection, testShapePresentation), styles, {
      shapePresentation: testShapePresentation
    });
    const companion = layerAdapter.presentationLabelLayer('default');
    if (companion === undefined) throw new Error('Callout 必须创建活动 companion 文字层');
    const animations = {
      capturePresentationSnapshot: () => ({ revision: 1, capturedAt: 1, elements: [] })
    } as unknown as AnimationManagerImpl;
    const renderer = new PrintMapRenderer(map, { layers, layerAdapter, binding, animations, styles });

    expect(companion.getVisible()).toBe(true);
    expect(isInternalTransientLayer(companion)).toBe(true);
    expect(map.getLayers().getArray()).toHaveLength(2);
    expect(renderer.validationIssues(plan())).toEqual([]);

    const base = renderer.capture(plan(), { animations: 'base' });
    const animated = renderer.capture(plan(), { animations: 'current-frame' });
    expect(base.layers).toHaveLength(1);
    expect(animated.layers).toHaveLength(1);
    expect(snapshotTexts(base.layers, 1)).toContain('完整打印标注');
    expect(snapshotTexts(animated.layers, 1)).toContain('完整打印标注');

    base.destroy();
    animated.destroy();
    renderer.destroy();
    binding.destroy();
    layers.destroy();
    layerAdapter.destroy();
    store.destroy();
    refs.destroy();
  });

  it('blocks unregistered raw map layers but ignores explicitly marked interaction layers', () => {
    const managed = new VectorLayer({ source: new VectorSource() });
    const raw = new VectorLayer({ source: new VectorSource() });
    const transient = markInternalTransientLayer(new VectorLayer({ source: new VectorSource() }));
    const map = fakeMap([managed, raw, transient]);
    const renderer = new PrintMapRenderer(map, {
      layers: {
        query: () => [{ kind: 'vector', id: 'managed', visible: true, opacity: 1, wrapX: false, declutter: false }],
        subscribe: () => () => undefined
      } as unknown as LayerManager,
      layerAdapter: {
        requireLayer: () => managed,
        vectorLayerIdFor: () => 'managed'
      } as unknown as LayerAdapter,
      binding: { captureCanonicalLayerFeatures: () => [] } as unknown as FeatureBinding
    });

    expect(renderer.validationIssues(plan())).toEqual([expect.objectContaining({ code: 'layer-not-printable', subject: expect.any(String) })]);

    renderer.destroy();
  });

  it('invalidates managed tile content changes but ignores tile loading progress', async () => {
    const xyz = new XYZ({ url: 'https://example.test/first/{z}/{x}/{y}.png' });
    const wms = new TileWMS({ url: 'https://example.test/wms', params: { LAYERS: 'first' } });
    const xyzLayer = new TileLayer({ source: xyz });
    const wmsLayer = new TileLayer({ source: wms });
    const layersById = new globalThis.Map([
      ['xyz', xyzLayer],
      ['wms', wmsLayer]
    ]);
    const renderer = new PrintMapRenderer(fakeMap([xyzLayer, wmsLayer]), {
      layers: {
        query: () => [
          { kind: 'tile', id: 'xyz', visible: true, opacity: 1, source: { preset: 'osm' }, sourceOwnership: 'earth' },
          { kind: 'tile', id: 'wms', visible: true, opacity: 1, source: { preset: 'osm' }, sourceOwnership: 'earth' }
        ],
        subscribe: () => () => undefined
      } as unknown as LayerManager,
      layerAdapter: { requireLayer: (id: string) => layersById.get(id) } as unknown as LayerAdapter
    });
    const revisions: number[] = [];
    renderer.subscribe(() => revisions.push(revisions.length + 1));

    xyz.dispatchEvent('tileloadstart');
    expect(revisions).toEqual([]);

    xyz.setUrl('https://example.test/second/{z}/{x}/{y}.png');
    expect(revisions).toEqual([1]);
    await Promise.resolve();
    wms.updateParams({ LAYERS: 'second' });
    expect(revisions).toEqual([1, 2]);

    renderer.destroy();
  });

  it('only blocks unsupported layers that contribute to the print extent and zoom', () => {
    const outside = new Layer({ extent: [1000, 1000, 1100, 1100], render: () => ({}) as HTMLElement });
    const zoomHidden = new Layer({ extent: [-50, -50, 50, 50], minZoom: 100, render: () => ({}) as HTMLElement });
    const map = fakeMap([outside, zoomHidden]);
    const renderer = new PrintMapRenderer(map);

    expect(renderer.validationIssues(plan())).toEqual([]);

    outside.setExtent([-50, -50, 50, 50]);
    expect(renderer.validationIssues(plan())).toEqual([expect.objectContaining({ code: 'layer-not-printable', message: expect.stringContaining('Layer') })]);

    renderer.destroy();
  });

  it('creates an isolated printable ImageLayer projection backed by a shared ImageWMS source', () => {
    const source = new ImageWMS({ url: 'https://example.test/wms', params: { LAYERS: 'ortho' } });
    const layer = new ImageLayer({
      source,
      className: 'business-image-layer',
      opacity: 0.4,
      zIndex: 12,
      extent: [-50, -50, 50, 50],
      background: '#112233'
    });
    const renderer = new PrintMapRenderer(fakeMap([layer]));

    expect(renderer.validationIssues(plan())).toEqual([]);
    const snapshot = renderer.capture(plan(), { animations: 'base' });
    const clone = snapshot.layers[0];

    expect(clone).toBeInstanceOf(ImageLayer);
    expect(clone).not.toBe(layer);
    expect((clone as ImageLayer<ImageWMS>).getSource()).toBe(source);
    expect(clone?.getClassName()).toBe('business-image-layer');
    expect(clone?.getOpacity()).toBe(0.4);
    expect(clone?.getZIndex()).toBe(12);
    expect(clone?.getBackground()).toBe('#112233');
    expect(snapshot.expectedRenderableLeafCount).toBe(1);

    snapshot.destroy();
    expect(source.getState()).toBe('ready');
    renderer.destroy();
  });

  it('evaluates a functional Layer background once and freezes its capture-time color', () => {
    let color = '#112233';
    const background = vi.fn((resolutionValue: number) => {
      void resolutionValue;
      return color;
    });
    const source = new ImageWMS({ url: 'https://example.test/wms', params: { LAYERS: 'ortho' } });
    const layer = new ImageLayer({ source, background });
    const renderer = new PrintMapRenderer(fakeMap([layer]));

    const snapshot = renderer.capture(plan(2), { animations: 'base' });
    color = '#abcdef';

    expect(background).toHaveBeenCalledOnce();
    expect(background).toHaveBeenCalledWith(2);
    expect(snapshot.layers[0]?.getBackground()).toBe('#112233');
    snapshot.destroy();
    renderer.destroy();
  });

  it('tracks ImageSource load failures without treating image progress as content revision', () => {
    const source = new ImageWMS({ url: 'https://example.test/wms', params: { LAYERS: 'ortho' } });
    const layer = new ImageLayer({ source });
    const report = vi.fn();
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const image = source.getImage([...extent], 1, 1, projection);
    const resources = bindResourceErrors([layer], 1, report, { extent, projection, pixelRatio: 1 });

    source.dispatchEvent(new ImageSourceEvent('imageloadstart', image));
    expect(report).not.toHaveBeenCalled();
    source.dispatchEvent(new ImageSourceEvent('imageloaderror', image));

    expect(report).toHaveBeenCalledWith('layer:0');
    expect(resources.hasError()).toBe(true);
    resources.release();
  });

  it('rolls back earlier resource listeners when bindResourceErrors setup fails partway through', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const inspection = { extent, projection, pixelRatio: 1 };
    const tileSource = new DataTileSource({ projection, loader: () => new Uint8Array(256 * 256 * 4) });
    const imageSource = new ImageSource({ loader: () => ({}) as HTMLCanvasElement });
    vi.spyOn(imageSource, 'getImage').mockImplementation(() => {
      throw new Error('boom');
    });
    const report = vi.fn();
    const grid = tileSource.getTileGridForProjection(projection);
    const zoom = grid.getZForResolution(1, tileSource.zDirection);
    const range = grid.getTileRangeForExtentAndZ([...extent], zoom);
    const printTile = { getTileCoord: () => [zoom, range.minX, range.minY] };

    expect(() => bindResourceErrors([new TileLayer({ source: tileSource }), new ImageLayer({ source: imageSource })], 1, report, inspection)).toThrowError(
      'boom'
    );
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', printTile as never));

    expect(report).not.toHaveBeenCalled();
  });

  it('ignores Tile and Image load errors from an active map range outside the frozen print request', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const inspection = { extent, projection, pixelRatio: 1 };

    const tileSource = new DataTileSource({ projection, loader: () => new Uint8Array(256 * 256 * 4) });
    const tileReport = vi.fn();
    const tileResources = bindResourceErrors([new TileLayer({ source: tileSource })], 1, tileReport, inspection);
    const grid = tileSource.getTileGridForProjection(projection);
    const zoom = grid.getZForResolution(1, tileSource.zDirection);
    const range = grid.getTileRangeForExtentAndZ([...extent], zoom);
    const outsideTile = { getTileCoord: () => [zoom, range.maxX + 100, range.maxY + 100] };
    const printTile = { getTileCoord: () => [zoom, range.minX, range.minY] };
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', outsideTile as never));
    expect(tileReport).not.toHaveBeenCalled();
    expect(tileResources.hasError()).toBe(false);
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', printTile as never));
    expect(tileReport).toHaveBeenCalledWith('layer:0');
    tileResources.release();

    const imageSource = new ImageSource({
      loader: (extentValue, resolutionValue, pixelRatioValue) => {
        void extentValue;
        void resolutionValue;
        void pixelRatioValue;
        return {} as HTMLCanvasElement;
      }
    });
    const imageReport = vi.fn();
    const imageResources = bindResourceErrors([new ImageLayer({ source: imageSource })], 1, imageReport, inspection);
    const outsideImage = imageSource.getImage([10_000, 10_000, 10_100, 10_100], 1, 1, projection);
    imageSource.dispatchEvent(new ImageSourceEvent('imageloadstart', outsideImage));
    imageSource.dispatchEvent(new ImageSourceEvent('imageloaderror', outsideImage));
    expect(imageReport).not.toHaveBeenCalled();
    expect(imageResources.hasError()).toBe(false);
    const printImage = imageSource.getImage([...extent], 1, 1, projection);
    imageSource.dispatchEvent(new ImageSourceEvent('imageloadstart', printImage));
    imageSource.dispatchEvent(new ImageSourceEvent('imageloaderror', printImage));
    expect(imageReport).toHaveBeenCalledWith('layer:0');
    imageResources.release();
  });

  it('scopes Tile and Image errors to root and ancestor Group Layer extent intersections', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-2000, -2000, 2000, 2000] as const;
    const resolution = 1;
    const inspection = { extent, projection, pixelRatio: 1 };
    const tileSource = new DataTileSource({ projection, loader: () => new Uint8Array(256 * 256 * 4) });
    const grid = tileSource.getTileGridForProjection(projection);
    const zoom = grid.getZForResolution(resolution, tileSource.zDirection);
    const printRange = grid.getTileRangeForExtentAndZ([...extent], zoom);
    const insideCoord = [zoom, printRange.maxX, printRange.maxY] as const;
    const outsideCoord = [zoom, printRange.minX, printRange.minY] as const;
    const layerExtent = grid.getTileCoordExtent([...insideCoord]);

    const rootTileReport = vi.fn();
    const rootTileResources = bindResourceErrors([new TileLayer({ source: tileSource, extent: layerExtent })], resolution, rootTileReport, inspection);
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', { getTileCoord: () => outsideCoord } as never));
    expect(rootTileReport).not.toHaveBeenCalled();
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', { getTileCoord: () => insideCoord } as never));
    expect(rootTileReport).toHaveBeenCalledWith('layer:0');
    rootTileResources.release();

    const groupTileReport = vi.fn();
    const groupTileResources = bindResourceErrors(
      [new LayerGroup({ layers: [new TileLayer({ source: tileSource })], extent: layerExtent })],
      resolution,
      groupTileReport,
      inspection
    );
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', { getTileCoord: () => outsideCoord } as never));
    expect(groupTileReport).not.toHaveBeenCalled();
    tileSource.dispatchEvent(new TileSourceEvent('tileloaderror', { getTileCoord: () => insideCoord } as never));
    expect(groupTileReport).toHaveBeenCalledWith('layer:0/0');
    groupTileResources.release();

    const exerciseImageClip = (root: boolean): void => {
      const source = new ImageSource({ loader: () => ({}) as HTMLCanvasElement });
      const report = vi.fn();
      const leaf = new ImageLayer({ source, ...(root ? { extent: layerExtent } : {}) });
      const layer = root ? leaf : new LayerGroup({ layers: [leaf], extent: layerExtent });
      const resources = bindResourceErrors([layer], resolution, report, inspection);
      const outsideImage = {
        getExtent: () => [extent[0], extent[1], extent[0] + 10, extent[1] + 10],
        getResolution: () => resolution,
        getState: () => ImageState.ERROR
      };
      source.dispatchEvent(new ImageSourceEvent('imageloadstart', outsideImage as never));
      source.dispatchEvent(new ImageSourceEvent('imageloaderror', outsideImage as never));
      expect(report).not.toHaveBeenCalled();
      const effectiveExtent = [
        Math.max(extent[0], layerExtent[0]),
        Math.max(extent[1], layerExtent[1]),
        Math.min(extent[2], layerExtent[2]),
        Math.min(extent[3], layerExtent[3])
      ];
      const printImage = source.getImage(effectiveExtent, resolution, 1, projection);
      source.dispatchEvent(new ImageSourceEvent('imageloadstart', printImage));
      source.dispatchEvent(new ImageSourceEvent('imageloaderror', printImage));
      expect(report).toHaveBeenCalledWith(root ? 'layer:0' : 'layer:0/0');
      resources.release();
    };
    exerciseImageClip(true);
    exerciseImageClip(false);
  });

  it('seeds the exact print Image instance and ignores a same-extent request at another resolution', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    let printState = ImageState.LOADING;
    const printImage = {
      getExtent: () => [...extent],
      getResolution: () => 1,
      getState: () => printState
    };
    const externalImage = {
      getExtent: () => [...extent],
      getResolution: () => 4,
      getState: () => ImageState.ERROR
    };
    const source = new ImageSource({ loader: () => ({}) as HTMLCanvasElement });
    vi.spyOn(source, 'getImage').mockReturnValue(printImage as never);
    const report = vi.fn();
    const resources = bindResourceErrors([new ImageLayer({ source })], 1, report, { extent, projection, pixelRatio: 1 });

    source.dispatchEvent(new ImageSourceEvent('imageloadstart', externalImage as never));
    source.dispatchEvent(new ImageSourceEvent('imageloaderror', externalImage as never));
    expect(report).not.toHaveBeenCalled();
    expect(resources.hasError()).toBe(false);

    printState = ImageState.ERROR;
    source.dispatchEvent(new ImageSourceEvent('imageloaderror', printImage as never));
    expect(report).toHaveBeenCalledWith('layer:0');
    expect(resources.hasError()).toBe(true);
    resources.release();
  });

  it('detects cached Tile and Image error states even when no new loaderror event fires', () => {
    const view = new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 1 });
    const projection = view.getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const inspection = { extent, projection, pixelRatio: 1 };

    const tileSource = new DataTileSource({ projection, loader: () => new Uint8Array(256 * 256 * 4) });
    vi.spyOn(tileSource, 'getTile').mockReturnValue({ getState: () => TileState.ERROR } as never);
    const tileResources = bindResourceErrors([new TileLayer({ source: tileSource })], 1, vi.fn(), inspection);
    expect(tileResources.hasError()).toBe(true);
    tileResources.release();

    const imageSource = new ImageSource({ loader: () => ({}) as HTMLCanvasElement });
    vi.spyOn(imageSource, 'getImage').mockReturnValue({
      getExtent: () => [...extent],
      getResolution: () => 1,
      getState: () => ImageState.ERROR
    } as never);
    const imageResources = bindResourceErrors([new ImageLayer({ source: imageSource })], 1, vi.fn(), inspection);
    expect(imageResources.hasError()).toBe(true);
    imageResources.release();
  });

  it('tracks Vector style images only when their resolved Style geometry intersects the print footprint', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const footprint = [
      [-100, 100],
      [100, 100],
      [100, -100],
      [-100, -100]
    ] as const;
    const createErrorImage = () => ({
      getImageState: () => ImageState.ERROR,
      listenImageChange: vi.fn(),
      unlistenImageChange: vi.fn(),
      getSize: () => [10, 10],
      getAnchor: () => [5, 5],
      getScaleArray: () => [1, 1],
      getRotateWithView: () => false,
      getRotation: () => 0
    });

    const outsideImage = createErrorImage();
    const outside = new Feature(new Point([1000, 1000]));
    outside.setStyle(new Style({ image: outsideImage as never }));
    const outsideResources = bindResourceErrors([new VectorLayer({ source: new VectorSource({ features: [outside] }) })], 1, vi.fn(), {
      extent,
      footprint,
      projection,
      pixelRatio: 1
    });
    expect(outsideImage.listenImageChange).not.toHaveBeenCalled();
    expect(outsideResources.hasError()).toBe(false);
    outsideResources.release();

    const insideStyleImage = createErrorImage();
    const baseOutside = new Feature(new Point([1000, 1000]));
    baseOutside.setStyle(new Style({ geometry: new Point([0, 0]), image: insideStyleImage as never }));
    const insideResources = bindResourceErrors([new VectorLayer({ source: new VectorSource({ features: [baseOutside] }) })], 1, vi.fn(), {
      extent,
      footprint,
      projection,
      pixelRatio: 1
    });
    expect(insideStyleImage.listenImageChange).toHaveBeenCalledOnce();
    expect(insideResources.hasError()).toBe(true);
    insideResources.release();
    expect(insideStyleImage.unlistenImageChange).toHaveBeenCalledOnce();
  });

  it('tracks Vector icon and font resources inside renderBuffer while keeping Layer extent as a hard clip', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const footprint = [
      [-100, 100],
      [100, 100],
      [100, -100],
      [-100, -100]
    ] as const;
    const inspection = { extent, footprint, projection, pixelRatio: 1 };
    const createErrorImage = () => ({
      getImageState: () => ImageState.ERROR,
      listenImageChange: vi.fn(),
      unlistenImageChange: vi.fn(),
      getSize: () => [10, 10],
      getAnchor: () => [5, 5],
      getScaleArray: () => [1, 1],
      getRotateWithView: () => false,
      getRotation: () => 0
    });
    const bufferedImage = createErrorImage();
    const buffered = new Feature(new Point([150, 0]));
    buffered.setStyle(new Style({ image: bufferedImage as never }));
    const farImage = createErrorImage();
    const far = new Feature(new Point([1000, 0]));
    far.setStyle(new Style({ image: farImage as never }));
    const resources = bindResourceErrors(
      [new VectorLayer({ source: new VectorSource({ features: [buffered, far] }), renderBuffer: 50 })],
      2,
      vi.fn(),
      inspection
    );
    expect(bufferedImage.listenImageChange).toHaveBeenCalledOnce();
    expect(farImage.listenImageChange).not.toHaveBeenCalled();
    resources.release();

    const clippedImage = createErrorImage();
    const clipped = new Feature(new Point([150, 0]));
    clipped.setStyle(new Style({ image: clippedImage as never }));
    const clippedResources = bindResourceErrors(
      [new VectorLayer({ source: new VectorSource({ features: [clipped] }), renderBuffer: 50, extent })],
      2,
      vi.fn(),
      inspection
    );
    expect(clippedImage.listenImageChange).not.toHaveBeenCalled();
    clippedResources.release();

    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    const bufferedFont = new Feature(new Point([150, 0]));
    bufferedFont.setStyle(new Style({ text: new Text({ text: 'buffered', font: '18px "Buffered Sans"' }) }));
    const farFont = new Feature(new Point([1000, 0]));
    farFont.setStyle(new Style({ text: new Text({ text: 'far', font: '18px "Far Sans"' }) }));
    const fontLayer = new VectorLayer({ source: new VectorSource({ features: [bufferedFont, farFont] }), renderBuffer: 50 });
    const snapshot = renderer.capture(plan(2), { animations: 'base' }, () => ({ layer: fontLayer, ownership: 'external' }));
    expect(snapshot.fontSamples).toEqual([{ font: '18px "Buffered Sans"', text: 'buffered' }]);
    snapshot.destroy();

    const clippedFont = new Feature(new Point([180, 0]));
    clippedFont.setStyle(new Style({ text: new Text({ text: 'x', font: '18px "Clipped Sans"' }) }));
    const clippedFontLayer = new VectorLayer({
      source: new VectorSource({ features: [clippedFont] }),
      renderBuffer: 50,
      extent
    });
    const clippedSnapshot = renderer.capture(plan(2), { animations: 'base' }, () => ({ layer: clippedFontLayer, ownership: 'external' }));
    expect(clippedSnapshot.fontSamples).toEqual([]);
    clippedSnapshot.destroy();
    renderer.destroy();
  });

  it('audits Vector resources whose visual pixels enter a leaf or Group hard extent clip', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const footprint = [
      [-100, 100],
      [100, 100],
      [100, -100],
      [-100, -100]
    ] as const;
    const inspection = { extent, footprint, projection, pixelRatio: 1 };
    const createImage = () => ({
      getImageState: () => ImageState.ERROR,
      listenImageChange: vi.fn(),
      unlistenImageChange: vi.fn(),
      getSize: () => [20, 20],
      getAnchor: () => [10, 10],
      getScaleArray: () => [1, 1],
      getRotateWithView: () => false,
      getRotation: () => 0
    });
    for (const grouped of [false, true]) {
      const image = createImage();
      const feature = new Feature(new Point([101, 0]));
      feature.setStyle(new Style({ image: image as never }));
      const leaf = new VectorLayer({ source: new VectorSource({ features: [feature] }), renderBuffer: 20, ...(grouped ? {} : { extent }) });
      const root: BaseLayer = grouped ? new LayerGroup({ layers: [leaf], extent }) : leaf;
      const resources = bindResourceErrors([root], 1, vi.fn(), inspection);
      expect(image.listenImageChange).toHaveBeenCalledOnce();
      expect(resources.hasError()).toBe(true);
      resources.release();
    }

    for (const grouped of [false, true]) {
      const icon = new Icon({ src: 'https://example.test/pending-icon.png' });
      const listen = vi.spyOn(icon, 'listenImageChange');
      vi.spyOn(icon, 'getImageState').mockReturnValue(ImageState.ERROR);
      const feature = new Feature(new Point([101, 0]));
      feature.setStyle(new Style({ image: icon }));
      const leaf = new VectorLayer({ source: new VectorSource({ features: [feature] }), renderBuffer: 20, ...(grouped ? {} : { extent }) });
      const root: BaseLayer = grouped ? new LayerGroup({ layers: [leaf], extent }) : leaf;
      const resources = bindResourceErrors([root], 1, vi.fn(), inspection);
      expect(listen).toHaveBeenCalledOnce();
      expect(resources.hasError()).toBe(true);
      resources.release();
    }

    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    for (const grouped of [false, true]) {
      const feature = new Feature(new Point([101, 0]));
      feature.setStyle(new Style({ text: new Text({ text: 'edge', font: '18px "Edge Sans"' }) }));
      const leaf = new VectorLayer({ source: new VectorSource({ features: [feature] }), renderBuffer: 20, ...(grouped ? {} : { extent }) });
      const root: BaseLayer = grouped ? new LayerGroup({ layers: [leaf], extent }) : leaf;
      const snapshot = renderer.capture(plan(), { animations: 'base' }, () => ({ layer: root, ownership: 'external' }));
      expect(snapshot.fontSamples).toEqual([{ font: '18px "Edge Sans"', text: 'edge' }]);
      snapshot.destroy();
    }
    renderer.destroy();
  });

  it('audits wrapped Vector icon and font resources in a far repeated world of a wide footprint', () => {
    const projection = new View({ projection: 'EPSG:4326' }).getProjection();
    const extent = [0, -2, 3600, 2] as const;
    const footprint = [
      [0, 2],
      [3600, 2],
      [3600, -2],
      [0, -2]
    ] as const;
    const image = {
      getImageState: () => ImageState.ERROR,
      listenImageChange: vi.fn(),
      unlistenImageChange: vi.fn()
    };
    const feature = new Feature(new Point([0, 0]));
    feature.setStyle(new Style({ image: image as never }));
    const layer = new VectorLayer({
      source: new VectorSource({ features: [feature], wrapX: true }),
      extent: [3599, -1, 3601, 1]
    });
    const resources = bindResourceErrors([layer], 1, vi.fn(), { extent, footprint, projection, pixelRatio: 1, worldWidth: 360 });
    expect(image.listenImageChange).toHaveBeenCalledOnce();
    expect(resources.hasError()).toBe(true);
    resources.release();

    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]], new View({ projection: 'EPSG:4326', center: [1800, 0], resolution: 1 }));
    const fontFeature = new Feature(new Point([0, 0]));
    fontFeature.setStyle(new Style({ text: new Text({ text: 'world ten', font: '18px "Wrapped Sans"' }) }));
    const fontLayer = new VectorLayer({
      source: new VectorSource({ features: [fontFeature], wrapX: true }),
      extent: [3599, -1, 3601, 1]
    });
    const basePlan = plan();
    const widePlan: PrintPlan = {
      ...basePlan,
      range: { ...basePlan.range, sourceExtent: extent, actualExtent: extent, footprint, center: [1800, 0] }
    };
    const snapshot = renderer.capture(widePlan, { animations: 'base' }, () => ({ layer: fontLayer, ownership: 'external' }));
    expect(snapshot.fontSamples).toEqual([{ font: '18px "Wrapped Sans"', text: 'world ten' }]);
    snapshot.destroy();
    renderer.destroy();
  });

  it('applies root and ancestor Group Layer extents to Vector image resources and font samples', () => {
    const projection = new View({ projection: 'EPSG:3857' }).getProjection();
    const extent = [-100, -100, 100, 100] as const;
    const footprint = [
      [-100, 100],
      [100, 100],
      [100, -100],
      [-100, -100]
    ] as const;
    const inspection = { extent, footprint, projection, pixelRatio: 1 };
    const createClippedFeature = () => {
      const image = {
        getImageState: () => ImageState.ERROR,
        listenImageChange: vi.fn(),
        unlistenImageChange: vi.fn(),
        getSize: () => [10, 10],
        getAnchor: () => [5, 5],
        getScaleArray: () => [1, 1],
        getRotateWithView: () => false,
        getRotation: () => 0
      };
      const feature = new Feature(new Point([0, 0]));
      feature.setStyle(new Style({ image: image as never, text: new Text({ text: 'x', font: '18px "Clipped Sans"' }) }));
      return { image, feature };
    };

    const rootCase = createClippedFeature();
    const rootLayer = new VectorLayer({ source: new VectorSource({ features: [rootCase.feature] }), extent: [50, 50, 100, 100] });
    const rootResources = bindResourceErrors([rootLayer], 1, vi.fn(), inspection);
    expect(rootCase.image.listenImageChange).not.toHaveBeenCalled();
    expect(rootResources.hasError()).toBe(false);
    rootResources.release();

    const groupCase = createClippedFeature();
    const groupedLayer = new VectorLayer({ source: new VectorSource({ features: [groupCase.feature] }) });
    const groupLayer = new LayerGroup({ layers: [groupedLayer], extent: [50, 50, 100, 100] });
    const groupResources = bindResourceErrors([groupLayer], 1, vi.fn(), inspection);
    expect(groupCase.image.listenImageChange).not.toHaveBeenCalled();
    expect(groupResources.hasError()).toBe(false);
    groupResources.release();

    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    const rootFontFeature = new Feature(new Point([0, 0]));
    rootFontFeature.setStyle(new Style({ text: new Text({ text: 'x', font: '18px "Clipped Sans"' }) }));
    const rootFontLayer = new VectorLayer({ source: new VectorSource({ features: [rootFontFeature] }), extent: [50, 50, 100, 100] });
    const groupFontFeature = new Feature(new Point([0, 0]));
    groupFontFeature.setStyle(new Style({ text: new Text({ text: 'x', font: '18px "Clipped Sans"' }) }));
    const groupFontLayer = new LayerGroup({
      layers: [new VectorLayer({ source: new VectorSource({ features: [groupFontFeature] }) })],
      extent: [50, 50, 100, 100]
    });
    const rootSnapshot = renderer.capture(plan(), { animations: 'base' }, () => ({ layer: rootFontLayer, ownership: 'external' }));
    const groupSnapshot = renderer.capture(plan(), { animations: 'base' }, () => ({ layer: groupFontLayer, ownership: 'external' }));
    expect(rootSnapshot.fontSamples).toEqual([]);
    expect(groupSnapshot.fontSamples).toEqual([]);
    rootSnapshot.destroy();
    groupSnapshot.destroy();
    renderer.destroy();
  });

  it('uses the active View custom resolutions for minZoom filtering and neutralizes the frozen clone constraint', () => {
    const layer = new TileLayer({ source: new XYZ({ url: 'https://example.test/{z}/{x}/{y}.png' }), minZoom: 0.5 });
    const view = new View({ center: [0, 0], resolutions: [100, 10, 1], resolution: 100 });
    const map = fakeMap([layer], view);
    const renderer = new PrintMapRenderer(map);

    const hidden = renderer.capture(plan(100), { animations: 'base' });
    expect(hidden.layers[0]).toBeInstanceOf(LayerGroup);
    expect((hidden.layers[0] as LayerGroup).getLayers().getLength()).toBe(0);
    expect(hidden.expectedRenderableLeafCount).toBe(0);
    hidden.destroy();

    const visible = renderer.capture(plan(10), { animations: 'base' });
    expect(visible.layers[0]).toBeInstanceOf(TileLayer);
    expect(visible.layers[0]?.getMinZoom()).toBe(-Infinity);
    expect(visible.layers[0]?.getMaxZoom()).toBe(Infinity);
    expect(visible.expectedRenderableLeafCount).toBe(1);
    visible.destroy();
    renderer.destroy();
  });

  it('marks an empty map as a valid zero-leaf snapshot', () => {
    const renderer = new PrintMapRenderer(fakeMap([]));

    const snapshot = renderer.capture(plan(), { animations: 'base' });

    expect(snapshot.layers).toEqual([]);
    expect(snapshot.expectedRenderableLeafCount).toBe(0);
    snapshot.destroy();
    renderer.destroy();
  });

  it('blocks empty and partially loaded external VectorSources because custom loader completeness is not publicly auditable', () => {
    const empty = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const partial = new VectorLayer({ source: new VectorSource({ features: [new Feature(new Point([0, 0]))], loader: () => undefined }) });
    const renderer = new PrintMapRenderer(fakeMap([empty, partial]));

    expect(renderer.validationIssues(plan())).toEqual([
      expect.objectContaining({ code: 'layer-not-printable', subject: 'map:0', message: expect.stringContaining('fully loaded') }),
      expect.objectContaining({ code: 'layer-not-printable', subject: 'map:1', message: expect.stringContaining('fully loaded') })
    ]);
    expect(() => renderer.capture(plan(), { animations: 'base' })).toThrowError(/non-printable/u);
    renderer.destroy();
  });

  it('captures native Layer factory outputs once and honors session versus external ownership', () => {
    const firstActive = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const secondActive = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([
      ['first', firstActive],
      ['second', secondActive]
    ]);
    const sessionLayer = new VectorLayer({ source: new VectorSource({ features: [new Feature(new Point([0, 0]))] }) });
    const externalLayer = new VectorLayer({ source: new VectorSource({ features: [new Feature(new Point([10, 10]))] }) });
    const sessionDispose = vi.spyOn(sessionLayer, 'dispose');
    const externalDispose = vi.spyOn(externalLayer, 'dispose');
    const destroySessionLayer = vi.fn();
    const factory = vi.fn(({ layerId }: { readonly layerId?: string }) =>
      layerId === 'first'
        ? { layer: sessionLayer, ownership: 'session' as const, destroy: destroySessionLayer }
        : { layer: externalLayer, ownership: 'external' as const }
    );

    expect(renderer.validationIssues(plan(), factory)).toEqual([]);
    const snapshot = renderer.capture(plan(), { animations: 'base' }, factory);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[0]?.[0]).toMatchObject({ sourceLayer: firstActive, subject: 'first', layerId: 'first', plan: plan() });
    expect(snapshot.layers[0]).not.toBe(sessionLayer);
    expect(snapshot.layers[1]).not.toBe(externalLayer);
    expect((snapshot.layers[0] as VectorLayer<VectorSource>).getSource()).not.toBe(sessionLayer.getSource());
    expect((snapshot.layers[1] as VectorLayer<VectorSource>).getSource()).not.toBe(externalLayer.getSource());
    const firstCloneDispose = vi.spyOn(snapshot.layers[0]!, 'dispose');
    const secondCloneDispose = vi.spyOn(snapshot.layers[1]!, 'dispose');
    snapshot.destroy();
    snapshot.destroy();
    expect(destroySessionLayer).toHaveBeenCalledOnce();
    expect(firstCloneDispose).toHaveBeenCalledOnce();
    expect(secondCloneDispose).toHaveBeenCalledOnce();
    expect(sessionDispose).not.toHaveBeenCalled();
    expect(externalDispose).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it('routes registered custom Layer subclasses, including group children, through the factory', () => {
    class CustomVectorLayer extends VectorLayer {
      override createRenderer() {
        return super.createRenderer();
      }
    }

    const direct = new CustomVectorLayer({ source: new VectorSource() });
    const nested = new CustomVectorLayer({ source: new VectorSource() });
    const group = new LayerGroup({ layers: [nested] });
    const renderer = nativeLayerRenderer([
      ['direct', direct],
      ['group', group]
    ]);
    const directOutput = new VectorLayer({ source: new VectorSource() });
    const groupOutput = new LayerGroup({ layers: [new VectorLayer({ source: new VectorSource() })] });
    const factory = vi.fn(({ layerId }: { readonly layerId?: string }) => ({
      layer: layerId === 'direct' ? directOutput : groupOutput,
      ownership: 'external' as const
    }));

    expect(renderer.validationIssues(plan())).toEqual([
      expect.objectContaining({ code: 'layer-not-printable', subject: 'direct', message: expect.stringContaining('printableLayerFactory') }),
      expect.objectContaining({ code: 'layer-not-printable', subject: 'group/0', message: expect.stringContaining('printableLayerFactory') })
    ]);
    expect(() => renderer.capture(plan(), { animations: 'base' })).toThrowError(/non-printable/u);
    expect(renderer.validationIssues(plan(), factory)).toEqual([]);
    expect(factory).not.toHaveBeenCalled();

    const snapshot = renderer.capture(plan(), { animations: 'base' }, factory);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls[0]?.[0]).toMatchObject({ sourceLayer: direct, subject: 'direct', layerId: 'direct' });
    expect(factory.mock.calls[1]?.[0]).toMatchObject({ sourceLayer: group, subject: 'group', layerId: 'group' });
    expect(snapshot.layers[0]).not.toBe(directOutput);
    expect(snapshot.layers[1]).not.toBe(groupOutput);
    expect(snapshot.layers[1]).toBeInstanceOf(LayerGroup);
    expect((snapshot.layers[1] as LayerGroup).getLayers().item(0)).not.toBe(groupOutput.getLayers().item(0));
    snapshot.destroy();
    renderer.destroy();
  });

  it('freezes factory Layer state, Feature content, dynamic Style output, and font samples at capture time', () => {
    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    let currentText = 'captured';
    let currentFont = '600 18px "Captured Sans"';
    const styleFunction = vi.fn(
      () => new Style({ text: new Text({ text: currentText, font: currentFont }), image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#123456' }) }) })
    );
    const feature = new Feature(new Point([0, 0]));
    feature.setStyle(styleFunction);
    const outputSource = new VectorSource({ features: [feature] });
    const outputLayer = new VectorLayer({ source: outputSource, visible: true });
    const outputDispose = vi.spyOn(outputLayer, 'dispose');
    const outputSourceDispose = vi.spyOn(outputSource, 'dispose');

    const snapshot = renderer.capture(plan(), { animations: 'base' }, () => ({ layer: outputLayer, ownership: 'external' }));
    const frozenLayer = snapshot.layers[0] as VectorLayer<VectorSource<Feature>>;
    const frozenFeature = frozenLayer.getSource()?.getFeatures()[0];
    expect(frozenLayer).not.toBe(outputLayer);
    expect(frozenFeature).not.toBe(feature);
    expect(styleFunction).toHaveBeenCalledOnce();

    currentText = 'late';
    currentFont = 'italic 24px "Late Sans"';
    const laterStyle = styleFunction(feature, 1);
    outputLayer.setVisible(false);
    outputSource.clear();

    const frozenStyles = frozenFeature?.getStyleFunction()?.(frozenFeature, 1);
    const frozenStyle = Array.isArray(frozenStyles) ? frozenStyles[0] : frozenStyles;
    expect((laterStyle as Style).getText()?.getText()).toBe('late');
    expect(frozenLayer.getVisible()).toBe(true);
    expect(frozenLayer.getSource()?.getFeatures()).toHaveLength(1);
    expect(frozenStyle?.getText()?.getText()).toBe('captured');
    expect(frozenStyle?.getText()?.getFont()).toBe('600 18px "Captured Sans"');
    expect(snapshot.fontSamples).toEqual([{ font: '600 18px "Captured Sans"', text: 'captured' }]);

    snapshot.destroy();
    expect(outputDispose).not.toHaveBeenCalled();
    expect(outputSourceDispose).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it('detaches factory Text rich-text and padding arrays from their mutable source Style', () => {
    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    const richText = ['captured', '600 18px serif'];
    const padding = [1, 2, 3, 4];
    const text = new Text({ text: richText, padding });
    const feature = new Feature(new Point([0, 0]));
    feature.setStyle(new Style({ text }));
    const output = new VectorLayer({ source: new VectorSource({ features: [feature] }) });

    const snapshot = renderer.capture(plan(), { animations: 'base' }, () => ({ layer: output, ownership: 'external' }));
    const frozenFeature = (snapshot.layers[0] as VectorLayer<VectorSource<Feature>>).getSource()?.getFeatures()[0];
    const resolved = frozenFeature?.getStyleFunction()?.(frozenFeature, 1);
    const frozenStyle = Array.isArray(resolved) ? resolved[0] : resolved;
    const frozenText = frozenStyle?.getText();

    richText[0] = 'late';
    padding[0] = 99;
    (text.getText() as string[])[1] = 'italic 24px serif';
    text.getPadding()![1] = 88;

    expect(frozenText?.getText()).toEqual(['captured', '600 18px serif']);
    expect(frozenText?.getText()).not.toBe(richText);
    expect(frozenText?.getPadding()).toEqual([1, 2, 3, 4]);
    expect(frozenText?.getPadding()).not.toBe(padding);

    snapshot.destroy();
    renderer.destroy();
  });

  it('releases earlier session factory outputs when a later factory throws', () => {
    const firstActive = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const secondActive = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([
      ['first', firstActive],
      ['second', secondActive]
    ]);
    const destroyFirst = vi.fn();
    const factory = vi.fn(({ layerId }: { readonly layerId?: string }) => {
      if (layerId === 'second') throw new Error('second factory failed');
      return { layer: new VectorLayer({ source: new VectorSource() }), ownership: 'session' as const, destroy: destroyFirst };
    });

    expect(() => renderer.capture(plan(), { animations: 'base' }, factory)).toThrowError(/layer-not-printable.*second factory failed/u);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(destroyFirst).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it('releases session factory handles once on render failure and cancellation without disposing external outputs', async () => {
    const createCase = () => {
      const firstActive = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
      const secondActive = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
      const renderer = nativeLayerRenderer([
        ['session', firstActive],
        ['external', secondActive]
      ]);
      const sessionLayer = new VectorLayer({ source: new VectorSource() });
      const externalLayer = new VectorLayer({ source: new VectorSource() });
      const sessionDispose = vi.spyOn(sessionLayer, 'dispose');
      const externalDispose = vi.spyOn(externalLayer, 'dispose');
      const destroySessionLayer = vi.fn();
      const factory = vi.fn(({ layerId }: { readonly layerId?: string }) =>
        layerId === 'session'
          ? { layer: sessionLayer, ownership: 'session' as const, destroy: destroySessionLayer }
          : { layer: externalLayer, ownership: 'external' as const }
      );
      return { renderer, sessionDispose, externalDispose, destroySessionLayer, factory };
    };

    const failed = createCase();
    await expect(
      failed.renderer.render(plan(), { quality: 'final', timeoutMs: 1000, signal: new AbortController().signal }, failed.factory)
    ).rejects.toThrowError(/browser document/u);
    expect(failed.destroySessionLayer).toHaveBeenCalledOnce();
    expect(failed.sessionDispose).not.toHaveBeenCalled();
    expect(failed.externalDispose).not.toHaveBeenCalled();
    failed.renderer.destroy();

    const cancelled = createCase();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('document', {});
    try {
      await expect(
        cancelled.renderer.render(plan(), { quality: 'final', timeoutMs: 1000, signal: controller.signal }, cancelled.factory)
      ).rejects.toMatchObject({ code: 'cancelled' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(cancelled.destroySessionLayer).toHaveBeenCalledOnce();
    expect(cancelled.sessionDispose).not.toHaveBeenCalled();
    expect(cancelled.externalDispose).not.toHaveBeenCalled();
    cancelled.renderer.destroy();
  });

  it('rejects undefined, unsupported, and active-child native factory outputs with rollback', () => {
    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    expect(renderer.validationIssues(plan())).toContainEqual(expect.objectContaining({ code: 'layer-not-printable', subject: 'native' }));
    expect(renderer.validationIssues(plan(), () => undefined)).toEqual([]);
    expect(() => renderer.capture(plan(), { animations: 'base' }, () => undefined)).toThrowError(/returned undefined/u);

    const destroyUnsupported = vi.fn();
    expect(() =>
      renderer.capture(plan(), { animations: 'base' }, () => ({ layer: new Layer({ source: null }), ownership: 'session', destroy: destroyUnsupported }))
    ).toThrowError(/Unsupported printable Layer type/u);
    expect(destroyUnsupported).toHaveBeenCalledOnce();

    const destroyActiveTree = vi.fn();
    expect(() =>
      renderer.capture(plan(), { animations: 'base' }, () => ({
        layer: new LayerGroup({ layers: [new VectorLayer({ source: new VectorSource() }), active] }),
        ownership: 'session',
        destroy: destroyActiveTree
      }))
    ).toThrowError(/active Map Layer or child Layer/u);
    expect(destroyActiveTree).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it('rejects custom and DAG factory trees and cleans partial frozen clones before releasing the handle', () => {
    class CustomVectorLayer extends VectorLayer {}

    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    const destroyCustom = vi.fn();
    expect(() =>
      renderer.capture(plan(), { animations: 'base' }, () => ({
        layer: new CustomVectorLayer({ source: new VectorSource() }),
        ownership: 'session',
        destroy: destroyCustom
      }))
    ).toThrowError(/Custom printable Layer subclass/u);
    expect(destroyCustom).toHaveBeenCalledOnce();

    const shared = new VectorLayer({ source: new VectorSource() });
    const leftBranch = new LayerGroup({ layers: [shared] });
    const rightBranch = new LayerGroup({ layers: [shared] });
    const destroyDag = vi.fn();
    expect(() =>
      renderer.capture(plan(), { animations: 'base' }, () => ({
        layer: new LayerGroup({ layers: [leftBranch, rightBranch] }),
        ownership: 'session',
        destroy: destroyDag
      }))
    ).toThrowError(/multiple branches/u);
    expect(destroyDag).toHaveBeenCalledOnce();

    const first = new VectorLayer({ source: new VectorSource({ features: [new Feature(new Point([0, 0]))] }) });
    const failingFeature = new Feature(new Point([0, 0]));
    failingFeature.setStyle(new Style({ renderer: () => undefined }));
    const failing = new VectorLayer({ source: new VectorSource({ features: [failingFeature] }) });
    const destroyPartial = vi.fn();
    const layerDispose = vi.spyOn(VectorLayer.prototype, 'dispose');
    try {
      expect(() =>
        renderer.capture(plan(), { animations: 'base' }, () => ({
          layer: new LayerGroup({ layers: [first, failing] }),
          ownership: 'session',
          destroy: destroyPartial
        }))
      ).toThrowError(/custom renderer/u);
      expect(layerDispose).toHaveBeenCalledOnce();
      expect(destroyPartial).toHaveBeenCalledOnce();
    } finally {
      layerDispose.mockRestore();
    }
    renderer.destroy();
  });

  it('collects only map text fonts whose resolved style geometry intersects the print footprint', () => {
    const inside = new Feature(new Point([0, 0]));
    inside.setStyle(new Style({ text: new Text({ text: '中文态势', font: '600 18px "Tactical Sans"' }) }));
    const outside = new Feature(new Point([1000, 1000]));
    outside.setStyle(new Style({ text: new Text({ text: 'outside', font: '12px "Unused Sans"' }) }));
    const rich = new Feature(new Point([10, 10]));
    rich.setStyle(
      new Style({
        text: new Text({
          text: ['Foo', '700 16px "Foo Sans"', 'Bar', 'italic 17px "Bar Sans"', 'Baz', ''],
          font: '12px "Base Sans"'
        })
      })
    );
    const layer = new VectorLayer({ source: new VectorSource({ features: [inside, outside, rich] }) });
    const renderer = managedVectorRenderer(layer);

    const snapshot = renderer.capture(plan(), { animations: 'base' });

    expect(snapshot.fontSamples).toEqual([
      { font: '600 18px "Tactical Sans"', text: '中文态势' },
      { font: '700 16px "Foo Sans"', text: 'Foo' },
      { font: 'italic 17px "Bar Sans"', text: 'Bar' },
      { font: '12px "Base Sans"', text: 'Baz' }
    ]);
    snapshot.destroy();
    renderer.destroy();
  });

  it('blocks a custom Vector Style renderer whose font usage cannot be audited', () => {
    const feature = new Feature(new Point([0, 0]));
    feature.setStyle(new Style({ renderer: () => undefined }));
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }) });
    const renderer = managedVectorRenderer(layer, false);

    expect(renderer.validationIssues(plan())).toContainEqual(
      expect.objectContaining({ code: 'layer-not-printable', subject: 'managed', message: expect.stringContaining('custom renderer') })
    );
    expect(() => renderer.capture(plan(), { animations: 'base' })).toThrowError(/non-printable/u);

    renderer.destroy();
  });

  it('freezes a Style geometry property into a session-owned Geometry at capture time', () => {
    const feature = new Feature(new Point([0, 0]));
    const labelPoint = new Point([4, 6]);
    feature.set('labelPoint', labelPoint);
    feature.setStyle(new Style({ geometry: 'labelPoint', text: new Text({ text: 'label', font: '14px sans-serif' }) }));
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }) });
    const renderer = managedVectorRenderer(layer);

    const snapshot = renderer.capture(plan(), { animations: 'base' });
    const frozenFeature = (snapshot.layers[0] as VectorLayer<VectorSource<Feature>>).getSource()?.getFeatures()[0];
    const frozenStyle = frozenFeature?.getStyleFunction()?.(frozenFeature, 1);
    const style = Array.isArray(frozenStyle) ? frozenStyle[0] : frozenStyle;
    const frozenGeometry = style?.getGeometryFunction()(frozenFeature!);
    labelPoint.setCoordinates([40, 60]);

    expect(frozenGeometry).toBeInstanceOf(Point);
    expect((frozenGeometry as Point).getCoordinates()).toEqual([4, 6]);
    expect(frozenGeometry).not.toBe(labelPoint);
    snapshot.destroy();
    renderer.destroy();
  });

  it('rejects a canvas-backed Icon before cloning and does not grow the global Icon image cache across retries', () => {
    const sourceCanvas = {
      width: 16,
      height: 12,
      getContext: () => ({})
    } as unknown as HTMLCanvasElement;
    const feature = new Feature(new Point([0, 0]));
    feature.setStyle(new Style({ image: new Icon({ img: sourceCanvas, anchor: [3, 4], anchorXUnits: 'pixels', anchorYUnits: 'pixels' }) }));
    const layer = new VectorLayer({ source: new VectorSource({ features: [feature] }) });
    const renderer = managedVectorRenderer(layer, false);
    const cache = iconImageCache as unknown as { cacheSize_: number };
    const baseline = cache.cacheSize_;

    for (let index = 0; index < 50; index += 1) {
      expect(renderer.validationIssues(plan())).toContainEqual(
        expect.objectContaining({ code: 'layer-not-printable', message: expect.stringContaining('External Icon') })
      );
    }
    expect(cache.cacheSize_).toBe(baseline);
    expect(() => renderer.capture(plan(), { animations: 'base' })).toThrowError(/non-printable/u);
    renderer.destroy();
  });

  it('rebuilds trusted structured PatternFill resources while rejecting custom ImageStyle subclasses', () => {
    let nextPattern = 0;
    const createContext = (): PatternCanvasContext => ({
      canvas: {},
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      fillRect: () => undefined,
      createPattern: () => ({ id: ++nextPattern }) as unknown as CanvasPattern
    });
    const originalPattern = createPatternFill({ type: 'pattern', pattern: 'cross', color: '#1677ff' }, undefined, createContext);
    const patternFeature = new Feature(new Point([0, 0]));
    patternFeature.setStyle(new Style({ fill: new Fill({ color: originalPattern }) }));
    const patternRenderer = managedVectorRenderer(new VectorLayer({ source: new VectorSource({ features: [patternFeature] }) }));

    expect(patternRenderer.validationIssues(plan())).toEqual([]);
    const snapshot = patternRenderer.capture(plan(), { animations: 'base' });
    const frozenFeature = (snapshot.layers[0] as VectorLayer<VectorSource<Feature>>).getSource()?.getFeatures()[0];
    const resolved = frozenFeature?.getStyleFunction()?.(frozenFeature, 1);
    const frozenStyle = Array.isArray(resolved) ? resolved[0] : resolved;
    expect(frozenStyle?.getFill()?.getColor()).not.toBe(originalPattern);
    snapshot.destroy();
    patternRenderer.destroy();

    const iconFeature = new Feature(new Point([0, 0]));
    iconFeature.setStyle(new Style({ image: new Icon({ src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', color: '#ff0000' }) }));
    const iconRenderer = managedVectorRenderer(new VectorLayer({ source: new VectorSource({ features: [iconFeature] }) }), true);
    expect(iconRenderer.validationIssues(plan())).toEqual([]);
    const iconSnapshot = iconRenderer.capture(plan(), { animations: 'base' });
    iconSnapshot.destroy();
    iconRenderer.destroy();

    class CustomCircleStyle extends CircleStyle {}
    const customFeature = new Feature(new Point([0, 0]));
    customFeature.setStyle(new Style({ image: new CustomCircleStyle({ radius: 4, fill: new Fill({ color: '#1677ff' }) }) }));
    const customRenderer = managedVectorRenderer(new VectorLayer({ source: new VectorSource({ features: [customFeature] }) }));
    expect(customRenderer.validationIssues(plan())).toContainEqual(
      expect.objectContaining({ code: 'layer-not-printable', message: expect.stringContaining('Custom Vector ImageStyle') })
    );
    customRenderer.destroy();
  });

  it('rejects mutable CanvasGradient or CanvasPattern Fill and Stroke colors, including factory output rollback', () => {
    const mutableColor = {} as CanvasGradient;
    const cases = [new Style({ fill: new Fill({ color: mutableColor }) }), new Style({ stroke: new Stroke({ color: mutableColor }) })];
    for (const style of cases) {
      const feature = new Feature(new Point([0, 0]));
      feature.setStyle(style);
      const renderer = managedVectorRenderer(new VectorLayer({ source: new VectorSource({ features: [feature] }) }));
      expect(renderer.validationIssues(plan())).toContainEqual(
        expect.objectContaining({ code: 'layer-not-printable', message: expect.stringMatching(/CanvasGradient|CanvasPattern/u) })
      );
      expect(() => renderer.capture(plan(), { animations: 'base' })).toThrowError(/non-printable/u);
      renderer.destroy();
    }

    const active = new VectorLayer({ source: new VectorSource({ loader: () => undefined }) });
    const renderer = nativeLayerRenderer([['native', active]]);
    const outputFeature = new Feature(new Point([0, 0]));
    outputFeature.setStyle(new Style({ stroke: new Stroke({ color: mutableColor }) }));
    const outputLayer = new VectorLayer({ source: new VectorSource({ features: [outputFeature] }) });
    const destroy = vi.fn();
    expect(() => renderer.capture(plan(), { animations: 'base' }, () => ({ layer: outputLayer, ownership: 'session', destroy }))).toThrowError(
      /layer-not-printable.*CanvasGradient/u
    );
    expect(destroy).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it('composites an OpenLayers layer background before its transparent canvas', () => {
    const operations: Array<readonly [string, unknown?]> = [];
    const surfaceOperations: Array<readonly [string, unknown?]> = [];
    const context = {
      fillStyle: '',
      globalAlpha: 1,
      fillRect: () => operations.push(['fill', context.fillStyle]),
      drawImage: () => operations.push(['draw', context.globalAlpha]),
      setTransform: () => operations.push(['transform']),
      save: () => operations.push(['save']),
      restore: () => operations.push(['restore']),
      beginPath: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
      getImageData: () => ({})
    };
    const output = { width: 0, height: 0, getContext: () => context };
    const surfaceContext = {
      fillStyle: '',
      globalAlpha: 1,
      fillRect: () => surfaceOperations.push(['fill', surfaceContext.fillStyle]),
      drawImage: () => surfaceOperations.push(['draw', surfaceContext.globalAlpha])
    };
    const surface = { width: 0, height: 0, getContext: () => surfaceContext };
    const layerElement = { style: { backgroundColor: '#101010', opacity: '0.5', clip: '', clipPath: '' } };
    const layerCanvas = {
      width: 100,
      height: 50,
      style: { transform: 'matrix(1,0,0,1,0,0)', opacity: '' },
      parentElement: layerElement,
      closest: () => layerElement
    };
    const target = {
      style: { width: '100px', height: '50px' },
      querySelectorAll: () => [layerCanvas]
    };
    const previousDocument = globalThis.document;
    let created = 0;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => (created++ === 0 ? output : surface) } });
    try {
      composeMapCanvases(target as HTMLElement, 100, 50);
      expect(surfaceOperations).toEqual([
        ['fill', '#101010'],
        ['draw', 1]
      ]);
      expect(operations).toEqual([['fill', '#ffffff'], ['save'], ['transform'], ['draw', 0.5], ['restore'], ['transform']]);
      expect(surface).toMatchObject({ width: 1, height: 1 });
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });

  it('applies Layer opacity once to the isolated background and canvas pixel group', () => {
    const source = new PixelCanvas([0, 0, 255, 255]);
    source.style = { transform: 'matrix(1,0,0,1,0,0)', opacity: '', filter: '', mixBlendMode: '' };
    source.parentElement = { style: { backgroundColor: '#ff0000', opacity: '0.5', clip: '', clipPath: '', filter: '', mixBlendMode: '' } };
    source.closest = () => source.parentElement;
    const target = {
      style: { width: '1px', height: '1px' },
      querySelectorAll: () => [source]
    };
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new PixelCanvas() } });
    try {
      const output = composeMapCanvases(target as HTMLElement, 1, 1) as unknown as PixelCanvas;
      expect([...output.pixel]).toEqual([128, 128, 255, 255]);
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });

  it('returns a white canvas when the frozen snapshot expects no renderable leaves', () => {
    const operations: Array<readonly [string, unknown?]> = [];
    const context = {
      fillStyle: '',
      globalAlpha: 1,
      fillRect: () => operations.push(['fill', context.fillStyle]),
      drawImage: () => operations.push(['draw']),
      setTransform: () => operations.push(['transform']),
      save: () => undefined,
      restore: () => undefined
    };
    const output = { width: 0, height: 0, getContext: () => context };
    const target = {
      style: { width: '100px', height: '50px' },
      querySelectorAll: () => []
    };
    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => output } });
    try {
      expect(composeMapCanvases(target as HTMLElement, 100, 50, 100, 50, true)).toBe(output);
      expect(operations).toEqual([['fill', '#ffffff']]);
      expect(() => composeMapCanvases(target as HTMLElement, 100, 50, 100, 50)).toThrowError(/OpenLayers/u);
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });
});

class PixelCanvas {
  #width = 1;
  #height = 1;
  readonly pixel = new Uint8ClampedArray(4);
  style: Record<string, string> = { transform: '', opacity: '', filter: '', mixBlendMode: '' };
  parentElement: { readonly style: Record<string, string> } | null = null;
  closest = (): { readonly style: Record<string, string> } | null => this.parentElement;
  readonly #context: {
    fillStyle: string;
    globalAlpha: number;
    fillRect: () => void;
    drawImage: (source: PixelCanvas) => void;
    save: () => void;
    restore: () => void;
    setTransform: () => void;
    beginPath: () => void;
    rect: () => void;
    clip: () => void;
    getImageData: () => { data: Uint8ClampedArray };
  };

  constructor(color: readonly [number, number, number, number] = [0, 0, 0, 0]) {
    this.pixel.set(color);
    const stack: Array<readonly [string, number]> = [];
    this.#context = {
      fillStyle: '#000000',
      globalAlpha: 1,
      fillRect: () => this.#composite(parseHexColor(this.#context.fillStyle), this.#context.globalAlpha),
      drawImage: (source) => this.#composite(source.pixel, this.#context.globalAlpha),
      save: () => stack.push([this.#context.fillStyle, this.#context.globalAlpha]),
      restore: () => {
        const state = stack.pop();
        if (state === undefined) return;
        this.#context.fillStyle = state[0];
        this.#context.globalAlpha = state[1];
      },
      setTransform: () => undefined,
      beginPath: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
      getImageData: () => ({ data: this.pixel })
    };
  }

  get width(): number {
    return this.#width;
  }

  set width(value: number) {
    this.#width = value;
    this.pixel.fill(0);
  }

  get height(): number {
    return this.#height;
  }

  set height(value: number) {
    this.#height = value;
    this.pixel.fill(0);
  }

  getContext(): object {
    return this.#context;
  }

  #composite(color: ArrayLike<number>, opacity: number): void {
    const sourceAlpha = (color[3]! / 255) * opacity;
    const destinationAlpha = this.pixel[3]! / 255;
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
    for (let index = 0; index < 3; index += 1) {
      const premultiplied = color[index]! * sourceAlpha + this.pixel[index]! * destinationAlpha * (1 - sourceAlpha);
      this.pixel[index] = outputAlpha === 0 ? 0 : Math.round(premultiplied / outputAlpha);
    }
    this.pixel[3] = Math.round(outputAlpha * 255);
  }
}

function parseHexColor(value: string): readonly [number, number, number, number] {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(value);
  if (match === null) throw new Error(`Unsupported test color: ${value}`);
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16), 255];
}

function snapshotTexts(layers: readonly BaseLayer[], resolution: number): string[] {
  const result: string[] = [];
  const visit = (layer: BaseLayer): void => {
    if (layer instanceof LayerGroup) {
      for (const child of layer.getLayers().getArray()) visit(child);
      return;
    }
    if (!(layer instanceof VectorLayer)) return;
    const source = layer.getSource();
    if (!(source instanceof VectorSource)) return;
    for (const feature of source.getFeatures()) {
      const resolved = feature.getStyleFunction()?.(feature, resolution);
      const styles = resolved === undefined ? [] : Array.isArray(resolved) ? resolved : [resolved];
      for (const style of styles) {
        const text = style.getText()?.getText();
        if (typeof text === 'string') result.push(text);
      }
    }
  };
  for (const layer of layers) visit(layer);
  return result;
}

function canonical(elementId: string): {
  readonly elementId: string;
  readonly feature: Feature<Point>;
  readonly renderOrder: number;
} {
  const feature = new Feature(new Point([0, 0]));
  feature.setStyle(new Style({ image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#000000' }) }) }));
  return { elementId, feature, renderOrder: 0 };
}

function fakeMap(layers: readonly BaseLayer[], view = new View({ center: [0, 0], resolution: 1 })): Map {
  const collection = new Collection([...layers]);
  return { getLayers: () => collection, getView: () => view } as unknown as Map;
}

function managedVectorRenderer(layer: VectorLayer<VectorSource<Feature>>, structuredStyle = true): PrintMapRenderer {
  return new PrintMapRenderer(fakeMap([layer]), {
    layers: {
      query: () => [{ kind: 'vector', id: 'managed', visible: true, opacity: 1, wrapX: layer.getSource()?.getWrapX() ?? false, declutter: false }],
      subscribe: () => () => undefined
    } as unknown as LayerManager,
    layerAdapter: {
      requireLayer: () => layer,
      vectorLayerIdFor: (candidate: BaseLayer) => (candidate === layer ? 'managed' : undefined)
    } as unknown as LayerAdapter,
    binding: {
      captureCanonicalLayerFeatures: () =>
        (layer.getSource()?.getFeatures() ?? []).map((feature, renderOrder) => ({
          elementId: `element-${renderOrder}`,
          feature: feature.clone(),
          structuredStyle,
          renderOrder
        }))
    } as unknown as FeatureBinding
  });
}

function nativeLayerRenderer(entries: readonly (readonly [string, BaseLayer])[], view?: View): PrintMapRenderer {
  const layers = new globalThis.Map(entries);
  return new PrintMapRenderer(
    fakeMap(
      entries.map(([, layer]) => layer),
      view
    ),
    {
      layers: {
        query: () => entries.map(([id]) => ({ kind: 'native' as const, id, ref: {} as never, ownership: 'external' as const })),
        subscribe: () => () => undefined
      } as unknown as LayerManager,
      layerAdapter: {
        requireLayer: (id: string) => layers.get(id)!,
        vectorLayerIdFor: () => undefined
      } as unknown as LayerAdapter
    }
  );
}

function plan(resolution = 1): PrintPlan {
  return {
    revision: 1,
    pageSizeMm: [297, 210],
    mapFrameMm: { x: 10, y: 10, width: 277, height: 190 },
    outputSizePx: [1123, 794],
    range: {
      sourceMode: 'view',
      sourceExtent: [-100, -100, 100, 100],
      actualExtent: [-100, -100, 100, 100],
      footprint: [
        [-100, 100],
        [100, 100],
        [100, -100],
        [-100, -100]
      ],
      center: [0, 0],
      rotation: 0,
      denominator: 1000,
      resolution
    },
    dpi: 96
  };
}
