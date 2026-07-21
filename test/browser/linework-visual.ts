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
  probePolygonTracks(): Record<string, { readonly inner: number; readonly center: number; readonly outer: number }>;
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

const polygonDecorations = ['tick', 'alternating-tick', 'double-tick', 'square', 'circle'] as const;
const polygonFixtures = polygonDecorations.map((decoration, index) => ({ decoration, centerX: -300 + index * 150 }));
for (const { decoration, centerX } of polygonFixtures) {
  const polygonBoundary = lineStyles.polygon({ color: '#e11d48', lines: ['solid', 'dashed'], decoration });
  earth.elements.add({
    id: `visual-polygon-${decoration}`,
    geometry: {
      type: 'polygon',
      controlPoints: [
        [centerX - 50, -325],
        [centerX + 50, -325],
        [centerX + 42, -260],
        [centerX - 42, -260]
      ]
    },
    style: { ...polygonBoundary, fill: { type: 'solid', color: 'rgba(225,29,72,0.14)' } }
  });
}

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
  probePolygonTracks() {
    earth.map.renderSync();
    const viewport = earth.map.getViewport();
    const viewportRect = viewport.getBoundingClientRect();
    const canvases = Array.from(viewport.querySelectorAll('canvas')).flatMap((canvas) => {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rect = canvas.getBoundingClientRect();
      return context === null || rect.width <= 0 || rect.height <= 0 ? [] : [{ canvas, context, rect }];
    });
    const alphaAt = (pixelX: number, pixelY: number): number => {
      const pageX = viewportRect.left + pixelX;
      const pageY = viewportRect.top + pixelY;
      let alpha = 0;
      for (const { canvas, context, rect } of canvases) {
        const x = Math.floor(((pageX - rect.left) * canvas.width) / rect.width);
        const y = Math.floor(((pageY - rect.top) * canvas.height) / rect.height);
        if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
        alpha = Math.max(alpha, context.getImageData(x, y, 1, 1).data[3] ?? 0);
      }
      return alpha;
    };
    const strongPixelCount = (centerX: number, offsetY: number): number => {
      const pixel = earth.map.getPixelFromCoordinate([centerX, -325]);
      if (pixel === null) return 0;
      let maximum = 0;
      for (let row = offsetY - 1; row <= offsetY + 1; row += 1) {
        let count = 0;
        for (let column = -30; column <= 30; column += 1) {
          if (alphaAt(pixel[0] + column, pixel[1] + row) > 180) count += 1;
        }
        maximum = Math.max(maximum, count);
      }
      return maximum;
    };
    return Object.fromEntries(
      polygonFixtures.map(({ decoration, centerX }) => [
        decoration,
        {
          inner: strongPixelCount(centerX, -3),
          center: strongPixelCount(centerX, 0),
          outer: strongPixelCount(centerX, 3)
        }
      ])
    );
  },
  destroy() {
    earth.elements.clear();
    earth.destroy();
  }
};

earth.map.renderSync();
