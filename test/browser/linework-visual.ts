import { Earth, lineStyles } from '../../src/index.ts';
import '../../src/assets/style/public.scss';

type VisualTheme = 'light' | 'dark';

interface LineworkVisualPreparation {
  readonly theme: VisualTheme;
  readonly resolution: number;
  readonly rotation: number;
  readonly worldCopy: number;
}

interface LineworkVisualFixture {
  readonly ready: boolean;
  prepare(input: LineworkVisualPreparation): void;
  destroy(): void;
}

declare global {
  interface Window {
    __OL_ENGINE_LINEWORK_VISUAL__: LineworkVisualFixture;
  }
}

const earth = new Earth({
  target: 'map',
  view: { center: [0, 0], resolution: 1, projection: 'EPSG:3857', multiWorld: true },
  controls: { attribution: false, rotate: false, zoom: false }
});

const addPolyline = (id: string, controlPoints: readonly (readonly [number, number])[], style: ReturnType<typeof lineStyles.polyline>, type = 'polyline') => {
  earth.elements.add({
    id,
    geometry: { type: type as 'polyline', controlPoints: controlPoints.map(([x, y]) => [x, y]) },
    style
  });
};

addPolyline(
  'visual-tick',
  [
    [-340, 260],
    [-40, 260]
  ],
  lineStyles.polyline({ decoration: 'tick' })
);
addPolyline(
  'visual-alternating-tick',
  [
    [40, 260],
    [340, 260]
  ],
  lineStyles.polyline({ decoration: 'alternating-tick' })
);
addPolyline(
  'visual-double-tick',
  [
    [-340, 165],
    [-40, 165]
  ],
  lineStyles.polyline({ decoration: 'double-tick' })
);
addPolyline(
  'visual-square',
  [
    [40, 165],
    [340, 165]
  ],
  lineStyles.polyline({ decoration: 'square' })
);
addPolyline(
  'visual-circle',
  [
    [-340, 70],
    [-40, 70]
  ],
  lineStyles.polyline({ decoration: 'circle' })
);
addPolyline(
  'visual-center-cross',
  [
    [40, 70],
    [340, 70]
  ],
  lineStyles.polyline({ decoration: 'center-cross' })
);
addPolyline(
  'visual-center-dot',
  [
    [-340, -25],
    [-40, -25]
  ],
  lineStyles.polyline({ decoration: 'center-dot' })
);
addPolyline(
  'visual-center-dot-pair',
  [
    [40, -25],
    [340, -25]
  ],
  lineStyles.polyline({ decoration: 'center-dot-pair' })
);
addPolyline(
  'visual-double-curve',
  [
    [-340, -120],
    [-260, -80],
    [-155, -155],
    [-40, -120]
  ],
  lineStyles.polyline({ color: '#1677ff', lines: ['dashed', 'solid'], decoration: 'tick' }),
  'curve-polyline'
);
addPolyline(
  'visual-inline-text',
  [
    [40, -120],
    [175, -80],
    [340, -120]
  ],
  lineStyles.polyline({
    lines: 'dashed',
    decoration: 'inline-text',
    text: '供水管线',
    textStyle: { fontSize: 14, color: '#111827', outline: {}, background: { color: '#ffffff', paddingPx: 2 } }
  })
);
addPolyline(
  'visual-caps',
  [
    [-340, -215],
    [-40, -215]
  ],
  lineStyles.polyline({ lines: 'dashed', caps: { start: 'bar', end: 'arrow' }, decoration: 'tick' })
);
addPolyline(
  'visual-slash',
  [
    [40, -215],
    [180, -180],
    [340, -215]
  ],
  lineStyles.polyline({ lines: 'none', decoration: 'slash' })
);

const polygonBoundary = lineStyles.polygon({ color: '#e11d48', lines: ['solid', 'dashed'], decoration: 'square' });
earth.elements.add({
  id: 'visual-polygon',
  geometry: {
    type: 'polygon',
    controlPoints: [
      [-110, -325],
      [110, -325],
      [85, -260],
      [-85, -260]
    ]
  },
  style: { ...polygonBoundary, fill: { type: 'solid', color: 'rgba(225,29,72,0.14)' } }
});

const projectionExtent = earth.map.getView().getProjection().getExtent();
const worldWidth = projectionExtent[2] - projectionExtent[0];

window.__OL_ENGINE_LINEWORK_VISUAL__ = {
  ready: true,
  prepare(input) {
    document.documentElement.dataset.theme = input.theme;
    const view = earth.map.getView();
    view.setCenter([worldWidth * input.worldCopy, 0]);
    view.setResolution(input.resolution);
    view.setRotation(input.rotation);
    earth.map.renderSync();
  },
  destroy() {
    earth.elements.clear();
    earth.destroy();
  }
};

earth.map.renderSync();
