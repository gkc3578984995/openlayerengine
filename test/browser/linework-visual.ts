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
  probeCasingSides(): Record<string, { readonly above: number; readonly center: number; readonly below: number }>;
  probeCapColors(): {
    readonly bar: { readonly foreground: number; readonly casing: number };
    readonly arrow: { readonly foreground: number; readonly casing: number };
  };
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
  lineStyles.polyline({
    color: '#475569',
    tracks: { mode: 'single', width: 4 },
    casing: { color: '#facc15', type: 'inner', width: 3 },
    decoration: 'tick'
  })
);
addPolyline(
  'visual-alternating-tick',
  [
    [40, 260],
    [340, 260]
  ],
  lineStyles.polyline({
    color: '#475569',
    tracks: { mode: 'single', width: 4 },
    casing: { color: '#facc15', type: 'outer', width: 3 },
    decoration: 'alternating-tick'
  })
);
addPolyline(
  'visual-double-tick',
  [
    [-340, 165],
    [-40, 165]
  ],
  lineStyles.polyline({
    color: '#475569',
    tracks: { mode: 'double', width: 10 },
    casing: { color: '#facc15', type: 'center', width: 3 },
    decoration: 'double-tick'
  })
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
  lineStyles.polyline({ tracks: { width: 14 }, decoration: 'center-cross' })
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
  lineStyles.polyline({
    color: '#1677ff',
    tracks: { mode: 'double', patterns: ['dashed', 'solid'], width: 3 },
    casing: { color: '#fde047', type: 'center', width: 2 },
    decoration: 'tick'
  }),
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
    tracks: { mode: 'single', pattern: 'dashed', width: 3 },
    casing: { color: '#facc15', type: 'center', width: 2 },
    decoration: {
      type: 'inline-text',
      text: '供水管线',
      style: { fontSize: 14, color: '#111827', outline: {}, background: { color: '#ffffff', paddingPx: 2 } }
    }
  })
);
addPolyline(
  'visual-caps',
  [
    [-340, -215],
    [-40, -215]
  ],
  lineStyles.polyline({
    tracks: { mode: 'single', pattern: 'dashed', width: 14 },
    casing: { color: '#facc15', type: 'outer', width: 3 },
    caps: { start: 'bar', end: 'arrow' },
    decoration: 'tick'
  })
);
addPolyline(
  'visual-slash',
  [
    [40, -215],
    [180, -180],
    [340, -215]
  ],
  lineStyles.polyline({ tracks: { mode: 'none' }, decoration: 'slash' })
);

const polygonDecorations = ['tick', 'alternating-tick', 'double-tick', 'square', 'circle'] as const;
const polygonCasingTypes = ['inner', 'outer', 'center', 'inner', 'outer'] as const;
const polygonFixtures = polygonDecorations.map((decoration, index) => ({
  casingType: polygonCasingTypes[index] ?? 'center',
  decoration,
  centerX: -300 + index * 150
}));
for (const { casingType, decoration, centerX } of polygonFixtures) {
  const polygonBoundary = lineStyles.polygon({
    color: '#475569',
    tracks: { mode: 'double', patterns: ['solid', 'dashed'], width: 3 },
    casing: { color: '#facc15', type: casingType, width: 3 },
    decoration
  });
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

function probeYellowRows(coordinate: readonly [number, number], sideOffset = 4): { readonly above: number; readonly center: number; readonly below: number } {
  const viewport = earth.map.getViewport();
  const viewportRect = viewport.getBoundingClientRect();
  const pixel = earth.map.getPixelFromCoordinate(coordinate);
  if (pixel === null) return { above: 0, center: 0, below: 0 };

  const canvases = Array.from(viewport.querySelectorAll('canvas')).flatMap((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rect = canvas.getBoundingClientRect();
    return context === null || rect.width <= 0 || rect.height <= 0 ? [] : [{ canvas, context, rect }];
  });
  const isYellowAt = (pixelX: number, pixelY: number): boolean => {
    const pageX = viewportRect.left + pixelX;
    const pageY = viewportRect.top + pixelY;
    return canvases.some(({ canvas, context, rect }) => {
      const x = Math.floor(((pageX - rect.left) * canvas.width) / rect.width);
      const y = Math.floor(((pageY - rect.top) * canvas.height) / rect.height);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(x, y, 1, 1).data;
      return red > 180 && green > 140 && blue < 120 && alpha > 160;
    });
  };
  const countRow = (offsetY: number): number => {
    let maximum = 0;
    for (let row = offsetY - 1; row <= offsetY + 1; row += 1) {
      let count = 0;
      for (let column = -35; column <= 35; column += 1) {
        if (isYellowAt(pixel[0] + column, pixel[1] + row)) count += 1;
      }
      maximum = Math.max(maximum, count);
    }
    return maximum;
  };
  return { above: countRow(-sideOffset), center: countRow(0), below: countRow(sideOffset) };
}

function probeCapColors(): {
  readonly bar: { readonly foreground: number; readonly casing: number };
  readonly arrow: { readonly foreground: number; readonly casing: number };
} {
  const viewport = earth.map.getViewport();
  const viewportRect = viewport.getBoundingClientRect();
  const canvases = Array.from(viewport.querySelectorAll('canvas')).flatMap((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rect = canvas.getBoundingClientRect();
    return context === null || rect.width <= 0 || rect.height <= 0 ? [] : [{ canvas, context, rect }];
  });
  const colorAt = (pixelX: number, pixelY: number): readonly [number, number, number, number] => {
    let result: readonly [number, number, number, number] = [0, 0, 0, 0];
    for (const { canvas, context, rect } of canvases) {
      const x = Math.floor(((viewportRect.left + pixelX - rect.left) * canvas.width) / rect.width);
      const y = Math.floor(((viewportRect.top + pixelY - rect.top) * canvas.height) / rect.height);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(x, y, 1, 1).data;
      if (alpha > result[3]) result = [red, green, blue, alpha];
    }
    return result;
  };
  const count = (
    coordinate: readonly [number, number],
    bounds: readonly [minimumX: number, maximumX: number, minimumY: number, maximumY: number],
    predicate: (color: readonly [number, number, number, number]) => boolean
  ): number => {
    const pixel = earth.map.getPixelFromCoordinate(coordinate);
    if (pixel === null) return 0;
    let total = 0;
    for (let offsetY = bounds[2]; offsetY <= bounds[3]; offsetY += 1) {
      for (let offsetX = bounds[0]; offsetX <= bounds[1]; offsetX += 1) {
        if (predicate(colorAt(pixel[0] + offsetX, pixel[1] + offsetY))) total += 1;
      }
    }
    return total;
  };
  const isForeground = ([red, green, blue, alpha]: readonly [number, number, number, number]): boolean => red > 180 && green < 100 && blue < 100 && alpha > 160;
  const isCasing = ([red, green, blue, alpha]: readonly [number, number, number, number]): boolean => red > 180 && green > 140 && blue < 120 && alpha > 160;

  return {
    bar: {
      foreground: count([-340, -215], [-1, 1, -14, 14], isForeground),
      casing: count([-340, -215], [-3, 0, -14, 14], isCasing)
    },
    arrow: {
      foreground: count([-40, -215], [-17, 1, -12, 12], isForeground),
      casing: count([-40, -215], [-17, 1, -13, 13], isCasing)
    }
  };
}

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
  probeCasingSides() {
    earth.map.renderSync();
    return {
      openInner: probeYellowRows([-190, 260]),
      openOuter: probeYellowRows([190, 260]),
      openCenter: probeYellowRows([-190, 165]),
      polygonInner: probeYellowRows([-300, -325], 6),
      polygonOuter: probeYellowRows([-150, -325], 6),
      polygonCenter: probeYellowRows([0, -325], 6)
    };
  },
  probeCapColors() {
    earth.map.renderSync();
    return probeCapColors();
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
