import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import DragPan from 'ol/interaction/DragPan.js';
import Graticule from 'ol/layer/Graticule.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { ObjectDisposedError } from '../src/core/errors.js';
import { ControlServiceImpl } from '../src/facade/ControlService.js';
import { ViewServiceImpl } from '../src/facade/ViewService.js';

const extent = [-20_037_508.342789244, -20_037_508.342789244, 20_037_508.342789244, 20_037_508.342789244] as const;
const worldWidth = extent[2] - extent[0];

function createViewHarness(options: { center?: number[]; zoom?: number; coordinateAtPixel?: number[] | null } = {}) {
  const center = options.center ?? [0, 0];
  const zoom = options.zoom ?? 7;
  const projection = { getExtent: vi.fn(() => [...extent]) };
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
