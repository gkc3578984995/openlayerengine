import { useEarth } from '../../src/index.ts';
import '../../src/assets/style/public.scss';

interface MapOnlySnapshot {
  readonly elementCount: number;
  readonly center: readonly number[];
  readonly zoom?: number;
  readonly resolution?: number;
  readonly layers: number;
  readonly interactions: number;
  readonly overlays: number;
}

interface MapOnlyFixture {
  readonly ready: boolean;
  populate(count: number): MapOnlySnapshot;
  clear(): MapOnlySnapshot;
  resetView(worldIndex?: number): MapOnlySnapshot;
  snapshot(): MapOnlySnapshot;
}

declare global {
  interface Window {
    __OL_ENGINE_MAP_ONLY__: MapOnlyFixture;
  }
}

const target = document.querySelector<HTMLElement>('#map');
if (target === null) throw new Error('纯地图性能测试缺少地图容器');

const earth = useEarth({
  id: 'map-only-performance',
  target,
  view: { center: [0, 0], zoom: 3, multiWorld: true },
  controls: { zoom: false, rotate: false, attribution: false }
});

earth.map.updateSize();
earth.map.renderSync();

window.__OL_ENGINE_MAP_ONLY__ = Object.freeze<MapOnlyFixture>({
  ready: true,
  populate(count) {
    if (!Number.isInteger(count) || count < 0 || count > 10_000) throw new Error('元素数量必须是 0 到 10000 之间的整数');
    earth.elements.clear();
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const spacing = 110_000;
    const offset = ((columns - 1) * spacing) / 2;
    for (let index = 0; index < count; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      earth.elements.add({
        id: `map-only-point-${index}`,
        module: 'map-only-performance',
        geometry: { type: 'point', controlPoints: [[column * spacing - offset, offset - row * spacing]] },
        style: {
          symbol: {
            type: 'circle',
            radius: 4,
            fill: { type: 'solid', color: index % 2 === 0 ? '#2563eb' : '#16a34a' },
            stroke: { color: '#ffffff', width: 1 }
          }
        }
      });
    }
    earth.map.renderSync();
    return snapshot();
  },
  clear() {
    earth.elements.clear();
    earth.map.renderSync();
    return snapshot();
  },
  resetView(worldIndex = 0) {
    if (!Number.isInteger(worldIndex) || Math.abs(worldIndex) > 100) throw new Error('世界索引必须是 -100 到 100 之间的整数');
    const view = earth.map.getView();
    const extent = view.getProjection().getExtent();
    const worldWidth = extent[2] - extent[0];
    view.cancelAnimations();
    view.setCenter([worldWidth * worldIndex, 0]);
    view.setZoom(3);
    earth.map.renderSync();
    return snapshot();
  },
  snapshot
});

function snapshot(): MapOnlySnapshot {
  const view = earth.map.getView();
  return Object.freeze({
    elementCount: earth.elements.query().length,
    center: Object.freeze([...(view.getCenter() ?? [])]),
    ...(view.getZoom() === undefined ? {} : { zoom: view.getZoom() }),
    ...(view.getResolution() === undefined ? {} : { resolution: view.getResolution() }),
    layers: earth.map.getLayers().getLength(),
    interactions: earth.map.getInteractions().getLength(),
    overlays: earth.map.getOverlays().getLength()
  });
}
