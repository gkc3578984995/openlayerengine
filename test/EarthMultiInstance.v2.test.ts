import Style from 'ol/style/Style.js';
import Circle from 'ol/geom/Circle.js';
import { fromLonLat } from 'ol/proj.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeHtmlElement, FakeMap } from './helpers/EarthMapHarness.js';

vi.mock('ol/interaction/defaults.js', async () => {
  const { default: DragPan } = await import('ol/interaction/DragPan.js');
  const { FakeCollection: Collection } = await import('./helpers/EarthMapHarness.js');
  return { defaults: () => new Collection([new DragPan()]) };
});

vi.mock('ol/control/defaults.js', async () => {
  const { FakeCollection: Collection } = await import('./helpers/EarthMapHarness.js');
  return { defaults: () => new Collection() };
});
vi.mock('ol/Map.js', async () => ({ default: (await import('./helpers/EarthMapHarness.js')).FakeMap }));

import { ObjectDisposedError } from '../src/core/errors.js';
import { resetEarthRegistryForTests } from '../src/facade/earthRegistry.js';
import { useEarth } from '../src/facade/useEarth.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

beforeEach(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => new FakeHtmlElement() }
  });
});

afterEach(() => {
  resetEarthRegistryForTests();
  if (originalDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
  else Object.defineProperty(globalThis, 'document', originalDocument);
});

describe('Earth v2 多实例真实装配隔离', () => {
  coversCapabilities('earth-named-instance-get-or-create', 'earth-owned-service-reuse', 'earth-destroy-lifecycle', 'control-earth-delegation');

  it('为每个命名实例创建独立服务树并允许相同业务 ID', () => {
    const first = useEarth('map-a');
    const second = useEarth('map-b');
    const firstMap = first.map as unknown as FakeMap;
    const secondMap = second.map as unknown as FakeMap;

    expect(first).not.toBe(second);
    expect(first.map).not.toBe(second.map);
    expect(firstMap.viewport).not.toBe(secondMap.viewport);
    for (const service of [
      'elements',
      'layers',
      'styles',
      'animations',
      'draw',
      'transform',
      'measure',
      'events',
      'contextMenu',
      'overlays',
      'view',
      'controls'
    ] as const) {
      expect(first[service]).not.toBe(second[service]);
    }

    const firstElement = first.elements.add({ id: 'shared', geometry: { type: 'point', controlPoints: [[0, 0]] }, module: 'first' });
    const secondElement = second.elements.add({ id: 'shared', geometry: { type: 'point', controlPoints: [[1, 1]] }, module: 'second' });
    const firstLayer = first.layers.add({ kind: 'vector', id: 'custom' });
    const secondLayer = second.layers.add({ kind: 'vector', id: 'custom' });

    expect(firstElement.state.module).toBe('first');
    expect(secondElement.state.module).toBe('second');
    expect(firstLayer.id).toBe('custom');
    expect(secondLayer.id).toBe('custom');
    expect(first.layers.query()).toHaveLength(2);
    expect(second.layers.query()).toHaveLength(2);

    firstElement.update({ data: { owner: 'first' } });
    first.layers.remove('custom');
    expect(secondElement.state.data).toBeUndefined();
    expect(second.layers.get('custom')).toBe(secondLayer);
    expect(first.elements).toBe(first.elements);
    expect(second.layers).toBe(second.layers);

    const graticule = first.controls.enableGraticule();
    expect(firstMap.getLayers().getArray()).toContain(graticule);
    expect(secondMap.getLayers().getArray()).not.toContain(graticule);
    first.controls.disableGraticule();
  });

  it('为不同 View 投影的 Earth 实例隔离 Circle Feature 半径换算', () => {
    const projected = fromLonLat([120, 60]);
    const mercatorCenter: [number, number] = [projected[0], projected[1]];
    const geographicCenter: [number, number] = [120, 60];
    const mercator = useEarth({ id: 'mercator-circle', target: 'map-a', view: { projection: 'EPSG:3857', center: mercatorCenter } });
    const geographic = useEarth({ id: 'geographic-circle', target: 'map-b', view: { projection: 'EPSG:4326', center: geographicCenter } });

    try {
      const mercatorElement = mercator.elements.add({ id: 'shared-circle', geometry: { type: 'circle', center: mercatorCenter, radius: 1_000 } });
      const geographicElement = geographic.elements.add({ id: 'shared-circle', geometry: { type: 'circle', center: geographicCenter, radius: 1_000 } });
      const mercatorGeometry = mercatorElement.olFeature.getGeometry();
      const geographicGeometry = geographicElement.olFeature.getGeometry();
      if (!(mercatorGeometry instanceof Circle) || !(geographicGeometry instanceof Circle)) throw new Error('测试需要原生 Circle Feature');
      const geographicRadius = geographicGeometry.getRadius();

      expect(mercatorElement.state.geometry).toEqual({ type: 'circle', center: mercatorCenter, radius: 1_000 });
      expect(geographicElement.state.geometry).toEqual({ type: 'circle', center: geographicCenter, radius: 1_000 });
      expect(mercatorGeometry.getRadius()).toBeGreaterThan(1_900);
      expect(geographicRadius).toBeGreaterThan(0.01);
      expect(geographicRadius).toBeLessThan(0.02);
      const mercatorDetails = mercatorElement.geometryDetails;
      const geographicDetails = geographicElement.geometryDetails;
      expect(mercatorDetails.renderGeometry.type).toBe('circle');
      expect(geographicDetails.renderGeometry.type).toBe('circle');
      if (mercatorDetails.renderGeometry.type !== 'circle' || geographicDetails.renderGeometry.type !== 'circle') {
        throw new Error('测试需要参数化 Circle 详情');
      }
      expect(mercatorDetails.renderGeometry.center).toEqual(mercatorCenter);
      expect(mercatorDetails.renderGeometry.radius).toBeCloseTo(mercatorGeometry.getRadius(), 10);
      expect(mercatorDetails.center).toEqual(mercatorCenter);
      expect(mercatorDetails.radius?.meters).toBe(1_000);
      expect(mercatorDetails.radius?.projected).toBeCloseTo(mercatorGeometry.getRadius(), 10);
      expect(mercatorDetails.rangePoints).toEqual([]);
      expect(mercatorDetails.controlPoints).toBeNull();
      expect(mercatorDetails.extent[0]).toBeCloseTo(mercatorCenter[0] - mercatorDetails.renderGeometry.radius, 10);
      expect(mercatorDetails.extent[3]).toBeCloseTo(mercatorCenter[1] + mercatorDetails.renderGeometry.radius, 10);
      expect(geographicDetails.renderGeometry.center).toEqual(geographicCenter);
      expect(geographicDetails.renderGeometry.radius).toBeCloseTo(geographicRadius, 12);
      expect(geographicDetails.radius?.meters).toBe(1_000);
      expect(geographicDetails.radius?.projected).toBeCloseTo(geographicRadius, 12);

      mercatorElement.update({ geometry: { type: 'circle', center: [0, 0], radius: 1_000 } });
      expect(mercatorGeometry.getRadius()).toBeCloseTo(1_000, 6);
      const updatedDetails = mercatorElement.geometryDetails;
      expect(updatedDetails.renderGeometry.type).toBe('circle');
      if (updatedDetails.renderGeometry.type !== 'circle') throw new Error('测试需要参数化 Circle 详情');
      expect(updatedDetails.renderGeometry.center).toEqual([0, 0]);
      expect(updatedDetails.renderGeometry.radius).toBeCloseTo(1_000, 10);
      expect(updatedDetails.extent).toEqual([
        -updatedDetails.renderGeometry.radius,
        -updatedDetails.renderGeometry.radius,
        updatedDetails.renderGeometry.radius,
        updatedDetails.renderGeometry.radius
      ]);
      expect(geographicGeometry.getRadius()).toBe(geographicRadius);
      expect(geographicElement.state.geometry).toEqual({ type: 'circle', center: geographicCenter, radius: 1_000 });
    } finally {
      mercator.destroy();
      geographic.destroy();
    }
  });

  it('隔离 NativeRef、事件、菜单、Overlay、交互和动画状态', () => {
    const first = useEarth('map-a');
    const second = useEarth('map-b');
    const firstMap = first.map as unknown as FakeMap;
    const secondMap = second.map as unknown as FakeMap;
    const firstElement = first.elements.add({ id: 'shared', geometry: { type: 'point', controlPoints: [[0, 0]] } });
    const secondElement = second.elements.add({ id: 'shared', geometry: { type: 'point', controlPoints: [[1, 1]] } });
    first.elements.add({ id: 'animated', geometry: { type: 'point', controlPoints: [[2, 2]] } });
    second.elements.add({ id: 'animated', geometry: { type: 'point', controlPoints: [[3, 3]] } });

    const nativeStyle = new Style();
    first.styles.set({ id: 'shared' }, { nativeStyle });
    second.styles.set({ id: 'shared' }, { nativeStyle });
    expect(firstElement.state.style).not.toBe(secondElement.state.style);

    const firstClick = vi.fn();
    const secondClick = vi.fn();
    first.events.on('click', firstClick);
    second.events.on('click', secondClick);
    firstMap.emit('click', { coordinate: [0, 0], pixel: [0, 0], originalEvent: new Event('click') });
    expect(firstClick).toHaveBeenCalledOnce();
    expect(secondClick).not.toHaveBeenCalled();

    first.contextMenu.register('map', { items: [{ key: 'inspect', label: '检查' }] });
    second.contextMenu.register('map', { items: [{ key: 'inspect', label: '检查' }] });
    first.contextMenu.setItemState('map', 'inspect', { disabled: true });
    expect(first.contextMenu.getItemState('map', 'inspect')).toMatchObject({ disabled: true });
    expect(second.contextMenu.getItemState('map', 'inspect')).toMatchObject({ disabled: false });

    const firstOverlay = first.overlays.add({ id: 'shared-overlay', element: new FakeHtmlElement() as unknown as HTMLElement, position: [0, 0] });
    const secondOverlay = second.overlays.add({ id: 'shared-overlay', element: new FakeHtmlElement() as unknown as HTMLElement, position: [1, 1] });
    firstOverlay.destroy();
    expect(first.overlays.get('shared-overlay')).toBeUndefined();
    expect(second.overlays.get('shared-overlay')).toBe(secondOverlay);

    const firstInteractionCount = firstMap.getInteractions().getArray().length;
    const secondInteractionCount = secondMap.getInteractions().getArray().length;
    const firstDraw = first.draw.start({ type: 'point', layerId: 'default' });
    expect(firstMap.getInteractions().getArray()).toHaveLength(firstInteractionCount + 1);
    expect(secondMap.getInteractions().getArray()).toHaveLength(secondInteractionCount);
    const secondDraw = second.draw.start({ type: 'point', layerId: 'default' });
    expect(secondMap.getInteractions().getArray()).toHaveLength(secondInteractionCount + 1);

    const firstAnimation = first.animations.play({ id: 'animated' }, { type: 'pulse' });
    const secondAnimation = second.animations.play({ id: 'animated' }, { type: 'pulse' });
    const secondGeometryDetails = second.elements.get('animated')?.geometryDetails;
    expect(first.animations.stop({ id: 'animated' })).toBe(1);
    expect(firstAnimation.status).toBe('stopped');
    expect(secondAnimation.status).toBe('running');
    expect(second.elements.get('animated')?.geometryDetails).toEqual(secondGeometryDetails);

    firstDraw.destroy();
    secondDraw.destroy();
  });

  it('销毁 A 会清理 A 的资源，但不会改变 B 的实例、状态或右键屏蔽', () => {
    const first = useEarth('map-a');
    const second = useEarth('map-b');
    const firstMap = first.map as unknown as FakeMap;
    const secondMap = second.map as unknown as FakeMap;
    const firstElement = first.elements.add({ id: 'shared', geometry: { type: 'point', controlPoints: [[0, 0]] } });
    const secondElement = second.elements.add({ id: 'shared', geometry: { type: 'point', controlPoints: [[1, 1]] } });
    const secondAnimation = second.animations.play({ id: 'shared' }, { type: 'pulse' });

    first.destroy();

    expect(first.lifecycle).toBe('destroyed');
    expect(firstMap.disposeCount).toBe(1);
    expect(firstMap.getLayers().getArray()).toEqual([]);
    expect(() => firstElement.state).toThrow(ObjectDisposedError);
    expect(() => firstElement.geometryDetails).toThrow(ObjectDisposedError);
    const secondGeometry = secondElement.state.geometry;
    if (secondGeometry.type !== 'point') throw new Error('测试需要点元素状态');
    expect(secondGeometry.controlPoints).toEqual([[1, 1]]);
    expect(secondElement.geometryDetails).toEqual({
      renderGeometry: { type: 'point', coordinates: [1, 1] },
      extent: [1, 1, 1, 1],
      extentPoints: [
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1]
      ],
      rangePoints: [[[1, 1]]],
      controlPoints: [[1, 1]],
      center: null,
      radius: null
    });
    expect(secondAnimation.status).toBe('running');
    expect(useEarth('map-b')).toBe(second);
    expect(useEarth('map-a')).not.toBe(first);

    const firstContextMenu = new Event('contextmenu', { cancelable: true });
    const secondContextMenu = new Event('contextmenu', { cancelable: true });
    firstMap.viewport.dispatchEvent(firstContextMenu);
    secondMap.viewport.dispatchEvent(secondContextMenu);
    expect(firstContextMenu.defaultPrevented).toBe(false);
    expect(secondContextMenu.defaultPrevented).toBe(true);

    second.destroy();
  });
});
