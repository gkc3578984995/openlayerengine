import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import DragPan from 'ol/interaction/DragPan.js';
import Graticule from 'ol/layer/Graticule.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { addCoordinateTransforms, get as getProjection } from 'ol/proj.js';
import Projection from 'ol/proj/Projection.js';
import { remove as removeCoordinateTransform } from 'ol/proj/transforms.js';
import { ShapeProjectionAdapter } from '../src/adapters/openlayers/ShapeProjectionAdapter.js';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import { ControlServiceImpl } from '../src/facade/ControlService.js';
import { ViewServiceImpl } from '../src/facade/ViewService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const extent = [-20_037_508.342789244, -20_037_508.342789244, 20_037_508.342789244, 20_037_508.342789244] as const;
const worldWidth = extent[2] - extent[0];

function createViewHarness(options: { center?: number[]; zoom?: number; coordinateAtPixel?: number[] | null; projection?: Projection } = {}) {
  const center = options.center ?? [0, 0];
  const zoom = options.zoom ?? 7;
  const projection = options.projection ?? { getExtent: vi.fn(() => [...extent]) };
  let animationCallback: ((completed: boolean) => void) | undefined;
  const animate = vi.fn((...args: unknown[]) => {
    const callback = args.at(-1);
    if (typeof callback === 'function') animationCallback = callback as (completed: boolean) => void;
  });
  const cancelAnimations = vi.fn(() => {
    animationCallback?.(false);
    animationCallback = undefined;
  });
  const olView = {
    animate,
    cancelAnimations,
    getCenter: vi.fn(() => center),
    setCenter: vi.fn(),
    getZoom: vi.fn(() => zoom),
    setZoom: vi.fn(),
    getProjection: vi.fn(() => projection)
  } as unknown as View;
  const dragPan = new DragPan();
  const otherInteraction = { setActive: vi.fn() };
  const map = {
    getCoordinateFromPixel: vi.fn(() => ('coordinateAtPixel' in options ? options.coordinateAtPixel : [100, 200])),
    getInteractions: vi.fn(() => ({
      forEach: (listener: (interaction: DragPan | typeof otherInteraction) => void) => [dragPan, otherInteraction].forEach(listener)
    }))
  } as unknown as Map;
  const viewport = { style: { cursor: '' } } as HTMLElement;
  const service = new ViewServiceImpl({ map, olView, viewport }, [119, 39]);
  return { service, map, olView, viewport, dragPan, otherInteraction, cancelAnimations };
}

describe('ViewServiceImpl', () => {
  coversCapabilities(
    'earth-map-view-public-access',
    'earth-cursor-control',
    'earth-drag-pan-toggle',
    'camera-fly-home',
    'camera-animate-fly-to',
    'camera-fly-to',
    'utils-world-width-index',
    'utils-feature-translate-to-pixel',
    'utils-world-normalize-restore'
  );

  it('exposes center and zoom snapshots and supports immediate positioning including zoom zero', () => {
    const { service, olView } = createViewHarness({ center: [12, 34], zoom: 5 });

    expect(service.olView).toBe(olView);
    expect(service.getCenter()).toEqual([12, 34]);
    expect(service.getZoom()).toBe(5);

    service.setCenter([56, 78]);
    service.setZoom(0);
    service.flyTo([90, 12], 0);

    expect(olView.setCenter).toHaveBeenNthCalledWith(1, [56, 78]);
    expect(olView.setCenter).toHaveBeenNthCalledWith(2, [90, 12]);
    expect(olView.setZoom).toHaveBeenNthCalledWith(1, 0);
    expect(olView.setZoom).toHaveBeenNthCalledWith(2, 0);
  });

  it('keeps fly-home and fly-to animation defaults and passes callbacks separately', () => {
    const { service, olView } = createViewHarness({ zoom: 6 });
    const homeCallback = vi.fn();
    const flyCallback = vi.fn();
    const easing = vi.fn((progress: number) => progress);

    service.flyHome({ duration: 600, callback: homeCallback });
    service.animateFlyTo([120, 30], { zoom: 9, duration: 800, easing, callback: flyCallback });
    service.animateFlyTo([121, 31]);

    expect(olView.animate).toHaveBeenNthCalledWith(1, { center: [119, 39], zoom: 4, duration: 600 }, homeCallback);
    expect(olView.animate).toHaveBeenNthCalledWith(2, { center: [120, 30], zoom: 9, duration: 800, easing }, flyCallback);
    expect(olView.animate).toHaveBeenNthCalledWith(3, { center: [121, 31], zoom: 6, duration: 2_000 });
  });

  it('changes only its own viewport cursor and DragPan interactions', () => {
    const first = createViewHarness();
    const second = createViewHarness();

    first.service.useCrosshairCursor();
    first.service.setDragEnabled(false);

    expect(first.viewport.style.cursor).toBe('crosshair');
    expect(first.dragPan.getActive()).toBe(false);
    expect(first.otherInteraction.setActive).not.toHaveBeenCalled();
    expect(second.viewport.style.cursor).toBe('');
    expect(second.dragPan.getActive()).toBe(true);

    first.service.useDefaultCursor();
    first.service.setDragEnabled(true);
    expect(first.viewport.style.cursor).toBe('auto');
    expect(first.dragPan.getActive()).toBe(true);
  });

  it('normalizes and restores points, lines and rings across world copies', () => {
    const { service } = createViewHarness({ center: [worldWidth, 0] });

    expect(service.worldWidth()).toBeCloseTo(worldWidth, 6);
    expect(service.worldIndex(-1)).toBe(-1);
    expect(service.worldIndex(worldWidth)).toBe(1);
    expect(service.normalizeToViewWorld([100, 200])).toEqual([worldWidth + 100, 200]);
    expect(
      service.normalizeToViewWorld([
        [100, 200],
        [300, 400]
      ])
    ).toEqual([
      [worldWidth + 100, 200],
      [worldWidth + 300, 400]
    ]);

    const ring = service.normalizeToViewWorld([
      [
        [100, 200],
        [300, 400]
      ]
    ]);
    expect(service.restoreToWorld(ring, 0)).toEqual([
      [
        [100, 200],
        [300, 400]
      ]
    ]);
  });

  it('converts pixels and translates coordinates through the shortest wrapped delta', () => {
    const half = worldWidth / 2;
    const { service } = createViewHarness({ coordinateAtPixel: [-half + 1, 50] });

    expect(service.coordinateAtPixel([5, 6])).toEqual([-half + 1, 50]);
    expect(service.translateCoordinatesToPixel([5, 6], [half - 1, 0])).toEqual([-half + 1, 50]);
    expect(
      service.translateCoordinatesToPixel(
        [5, 6],
        [
          [half - 11, -10],
          [half - 1, 10]
        ]
      )
    ).toEqual([
      [half - 4, 40],
      [-half + 6, 60]
    ]);
  });

  it('returns undefined when a pixel cannot be located', () => {
    const { service } = createViewHarness({ coordinateAtPixel: null });

    expect(service.coordinateAtPixel([1, 2])).toBeUndefined();
    expect(service.translateCoordinatesToPixel([1, 2], [3, 4])).toBeUndefined();
  });

  it('在扁平经纬度和当前 View 投影坐标之间往返转换', () => {
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('EPSG:3857 projection is unavailable');
    const { service } = createViewHarness({ projection });
    const geographic = Object.freeze([120, 0, 110, 20]);

    const projected = service.toProjectedCoordinates(geographic);
    const restored = service.toGeographicCoordinates(projected);

    expect(projected).not.toBe(geographic);
    expect(projected[0]).toBeCloseTo(13_358_338.895, 3);
    expect(projected[1]).toBeCloseTo(0, 8);
    expect(projected[2]).toBeCloseTo(12_245_143.987, 3);
    expect(projected[3]).toBeCloseTo(2_273_030.927, 3);
    expect(restored).toHaveLength(geographic.length);
    restored.forEach((value, index) => expect(value).toBeCloseTo(geographic[index]!, 10));
    expect(geographic).toEqual([120, 0, 110, 20]);
  });

  it('保持嵌套坐标结构和三维高度，并且不修改输入', () => {
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('EPSG:3857 projection is unavailable');
    const { service } = createViewHarness({ projection });
    const geographic = [
      [120, 0],
      [110, 20, 500]
    ];

    const projected = service.toProjectedCoordinates(geographic);
    const restored = service.toGeographicCoordinates(projected);

    expect(projected).not.toBe(geographic);
    expect(projected[0]).not.toBe(geographic[0]);
    expect(projected[1]).toHaveLength(3);
    expect(projected[1]?.[2]).toBe(500);
    expect(restored[0]?.[0]).toBeCloseTo(120, 10);
    expect(restored[0]?.[1]).toBeCloseTo(0, 10);
    expect(restored[1]?.[0]).toBeCloseTo(110, 10);
    expect(restored[1]?.[1]).toBeCloseTo(20, 10);
    expect(restored[1]?.[2]).toBe(500);
    expect(geographic).toEqual([
      [120, 0],
      [110, 20, 500]
    ]);
  });

  it('当前 View 使用 EPSG:4326 时仍返回独立且结构一致的坐标', () => {
    const projection = getProjection('EPSG:4326');
    if (projection === null) throw new Error('EPSG:4326 projection is unavailable');
    const { service } = createViewHarness({ projection });
    const flat = [120, 0, 110, 20] as const;
    const nested = [[120, 0, 300]] as const;

    const projectedFlat = service.toProjectedCoordinates(flat);
    const geographicNested = service.toGeographicCoordinates(nested);

    expect(projectedFlat).toEqual(flat);
    expect(projectedFlat).not.toBe(flat);
    expect(geographicNested).toEqual(nested);
    expect(geographicNested).not.toBe(nested);
    expect(geographicNested[0]).not.toBe(nested[0]);
  });

  it('支持已注册转换关系的自定义 View 投影，并提供有效米制圆半径比例', () => {
    const geographicProjection = getProjection('EPSG:4326');
    if (geographicProjection === null) throw new Error('EPSG:4326 projection is unavailable');
    const customProjection = new Projection({
      code: 'TEST:REGISTERED-METER-VIEW-20260716',
      units: 'm',
      extent: [-180_000, -90_000, 180_000, 90_000],
      getPointResolution: (resolution) => resolution
    });
    addCoordinateTransforms(
      geographicProjection,
      customProjection,
      (coordinate) => [coordinate[0] * 1_000, coordinate[1] * 1_000, ...coordinate.slice(2)],
      (coordinate) => [coordinate[0] / 1_000, coordinate[1] / 1_000, ...coordinate.slice(2)]
    );

    try {
      const { service } = createViewHarness({ projection: customProjection });
      const geographic = [120, 30, -45, 10] as const;
      const projected = service.toProjectedCoordinates(geographic);
      const restored = service.toGeographicCoordinates(projected);

      expect(projected).toEqual([120_000, 30_000, -45_000, 10_000]);
      expect(restored).toEqual(geographic);

      const shapeProjection = new ShapeProjectionAdapter(customProjection);
      const viewed = shapeProjection.toViewState({ type: 'circle', center: [120_000, 30_000], radius: 750 });
      expect(viewed).toEqual({ type: 'circle', center: [120_000, 30_000], radius: 750 });
    } finally {
      removeCoordinateTransform(geographicProjection, customProjection);
      removeCoordinateTransform(customProjection, geographicProjection);
    }
  });

  it('拒绝空数组、奇数扁平数组、非有限值和非法嵌套结构', () => {
    const projection = getProjection('EPSG:3857');
    if (projection === null) throw new Error('EPSG:3857 projection is unavailable');
    const { service } = createViewHarness({ projection });
    const sparse = [120, 0, 110, 20];
    delete sparse[2];
    const accessor = [120, 0];
    Object.defineProperty(accessor, '0', { get: () => 120, configurable: true });

    expect(() => service.toProjectedCoordinates([])).toThrow(InvalidArgumentError);
    expect(() => service.toProjectedCoordinates([120, 0, 110])).toThrow(InvalidArgumentError);
    expect(() => service.toProjectedCoordinates([120, Number.NaN])).toThrow(InvalidArgumentError);
    expect(() => service.toProjectedCoordinates(sparse)).toThrow(InvalidArgumentError);
    expect(() => service.toProjectedCoordinates(accessor)).toThrow(InvalidArgumentError);
    expect(() => service.toProjectedCoordinates([[120]] as never)).toThrow(InvalidArgumentError);
    expect(() => service.toProjectedCoordinates([[120, 0, 10, 20]] as never)).toThrow(InvalidArgumentError);
    expect(() => service.toGeographicCoordinates([[120, 0], 110] as never)).toThrow(InvalidArgumentError);
  });

  it('当前 View 投影没有注册坐标转换时统一抛出参数错误', () => {
    const projection = new Projection({ code: 'TEST:VIEW-NO-TRANSFORM', units: 'm' });
    const { service } = createViewHarness({ projection });

    expect(() => service.toProjectedCoordinates([120, 0])).toThrow(InvalidArgumentError);
    expect(() => service.toGeographicCoordinates([120, 0])).toThrow(InvalidArgumentError);
  });

  it('销毁时取消 View 动画并以 false 完成回调', () => {
    const { service, cancelAnimations } = createViewHarness();
    const callback = vi.fn();
    service.animateFlyTo([120, 30], { callback });

    service.destroy();
    service.destroy();

    expect(cancelAnimations).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(false);
    expect(() => service.getCenter()).toThrow(ObjectDisposedError);
  });
});

describe('ControlServiceImpl', () => {
  coversCapabilities('control-graticule-lifecycle', 'control-scale-line-lifecycle');

  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => ({ appendChild: vi.fn(), className: '', style: {}, setAttribute: vi.fn() })
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces graticule and scale-line resources only on the supplied map', () => {
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
    const addControl = vi.fn();
    const removeControl = vi.fn();
    const map = { addLayer, removeLayer, addControl, removeControl } as unknown as Map;
    const controls = new ControlServiceImpl({ map });

    const firstGraticule = controls.enableGraticule();
    const secondGraticule = controls.enableGraticule({ showLabels: false, zIndex: 120 });
    const firstScaleLine = controls.enableScaleLine();
    const secondScaleLine = controls.enableScaleLine({ units: 'imperial', bar: false, minWidth: 240 });

    expect(firstGraticule).toBeInstanceOf(Graticule);
    expect(secondGraticule).not.toBe(firstGraticule);
    expect(secondGraticule.getZIndex()).toBe(120);
    expect(removeLayer).toHaveBeenCalledWith(firstGraticule);
    expect(addLayer).toHaveBeenCalledTimes(2);
    expect(firstScaleLine).toBeInstanceOf(ScaleLine);
    expect(secondScaleLine).not.toBe(firstScaleLine);
    expect(secondScaleLine.getUnits()).toBe('imperial');
    expect(removeControl).toHaveBeenCalledWith(firstScaleLine);
    expect(addControl).toHaveBeenCalledTimes(2);

    controls.destroy();
    expect(removeLayer).toHaveBeenLastCalledWith(secondGraticule);
    expect(removeControl).toHaveBeenLastCalledWith(secondScaleLine);
  });

  it('OpenLayers 在插入后抛错时仍保留可清理句柄', () => {
    const layers: unknown[] = [];
    const controlsCollection: unknown[] = [];
    const layerError = new Error('layer listener failed');
    const controlError = new Error('control listener failed');
    const map = {
      addLayer: (layer: unknown) => {
        layers.push(layer);
        throw layerError;
      },
      removeLayer: (layer: unknown) => layers.splice(layers.indexOf(layer), 1)[0],
      getLayers: () => ({ getArray: () => layers }),
      addControl: (control: unknown) => {
        controlsCollection.push(control);
        throw controlError;
      },
      removeControl: (control: unknown) => controlsCollection.splice(controlsCollection.indexOf(control), 1)[0],
      getControls: () => ({ getArray: () => controlsCollection })
    } as unknown as Map;
    const service = new ControlServiceImpl({ map });

    expect(() => service.enableGraticule()).toThrow(layerError);
    expect(service.graticule).toBe(layers[0]);
    service.disableGraticule();
    expect(layers).toEqual([]);

    expect(() => service.enableScaleLine()).toThrow(controlError);
    expect(service.scaleLine).toBe(controlsCollection[0]);
    service.disableScaleLine();
    expect(controlsCollection).toEqual([]);
  });

  it('清理失败后仍终结服务并继续清理其余资源', () => {
    const layers: unknown[] = [];
    const controlsCollection: unknown[] = [];
    const removeError = new Error('remove failed');
    const removeLayer = vi.fn(() => {
      throw removeError;
    });
    const removeControl = vi.fn(() => {
      throw new Error('control remove failed');
    });
    const map = {
      addLayer: (layer: unknown) => layers.push(layer),
      removeLayer,
      getLayers: () => ({ getArray: () => layers }),
      addControl: (control: unknown) => controlsCollection.push(control),
      removeControl,
      getControls: () => ({ getArray: () => controlsCollection })
    } as unknown as Map;
    const service = new ControlServiceImpl({ map });
    service.enableGraticule();
    service.enableScaleLine();

    expect(() => service.destroy()).toThrow(removeError);
    expect(removeLayer).toHaveBeenCalledOnce();
    expect(removeControl).toHaveBeenCalledOnce();
    expect(() => service.enableGraticule()).toThrow(ObjectDisposedError);
    expect(() => service.enableScaleLine()).toThrow(ObjectDisposedError);
  });
});
