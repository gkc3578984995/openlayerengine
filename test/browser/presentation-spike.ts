import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import Map from 'ol/Map.js';
import { getVectorContext } from 'ol/render.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import View from 'ol/View.js';
import { NativeRefRegistry } from '../../src/adapters/openlayers/NativeRefRegistry.js';
import { createTransparentStyleProxy, StyleCompiler } from '../../src/adapters/openlayers/style/StyleCompiler.js';
import type { StyleSpec } from '../../src/core/style/types.js';

interface PresentationSpikeSnapshot {
  readonly sourceIds: readonly string[];
  readonly hits: Readonly<Record<string, readonly string[]>>;
  readonly proxyPixels: Readonly<Record<string, readonly [number, number, number, number]>>;
  readonly worldWrapPixel: readonly [number, number, number, number];
  readonly declutterPixel: readonly [number, number, number, number];
  readonly replacementPixel: readonly [number, number, number, number];
  readonly replacementHits: readonly string[];
  readonly alpha: Readonly<{ before: number; during: number; after: number }>;
}

declare global {
  interface Window {
    __PRESENTATION_SPIKE__: {
      readonly ready: boolean;
      snapshot(): PresentationSpikeSnapshot;
    };
  }
}

const target = document.getElementById('map');
if (!(target instanceof HTMLElement)) throw new Error('Map target is missing');

const compiler = new StyleCompiler(new NativeRefRegistry());
const source = new VectorSource<Feature>({ wrapX: true });
const layer = new VectorLayer({ source, declutter: true });
const map = new Map({
  target,
  layers: [layer],
  controls: [],
  view: new View({ center: [0, 0], resolution: 1, projection: 'EPSG:3857', multiWorld: true })
});

const probes = new globalThis.Map<string, readonly [number, number]>();
addProxy('point', new Point([-220, 110]), {
  symbol: { type: 'circle', radius: 12, fill: { type: 'solid', color: '#1677ff' }, stroke: { color: '#ffffff', width: 2 } },
  text: { text: 'POINT', offsetY: 22, fill: { type: 'solid', color: '#ffffff' } }
});
addProxy('icon', new Point([-70, 110]), {
  symbol: {
    type: 'icon',
    src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="24"%3E%3Crect width="32" height="24" fill="red"/%3E%3C/svg%3E',
    size: [32, 24]
  }
});
addProxy(
  'polyline',
  new LineString([
    [-260, 20],
    [-170, 20],
    [-120, -10]
  ]),
  { strokes: [{ color: '#00ff00', width: 8 }], decorations: [{ type: 'arrow', placement: 'end' }] },
  [-190, 20]
);
addProxy(
  'polygon',
  new Polygon([
    [
      [-80, 30],
      [20, 30],
      [20, -50],
      [-80, -50],
      [-80, 30]
    ]
  ]),
  { fill: { type: 'pattern', pattern: 'cross', color: '#ffcc00' }, strokes: [{ color: '#ffcc00', width: 5 }] },
  [-30, -10]
);
addProxy('circle', new Circle([120, -10], 45), { fill: { type: 'solid', color: '#ff00ff' }, strokes: [{ color: '#ffffff', width: 5 }] });
addProxy(
  'linework-glyph',
  new LineString([
    [-300, -100],
    [-120, -100]
  ]),
  {
    linework: {
      tracks: [
        { offset: -3, stroke: { color: '#ff0000', width: 2, lineDash: [8, 6] } },
        { offset: 3, stroke: { color: '#ff0000', width: 2 } }
      ],
      decorations: [
        {
          placement: { kind: 'repeat', spacing: 24 },
          sequence: [
            {
              primitives: [{ type: 'circle', center: [0, 0], radius: 3, fill: { type: 'solid', color: '#ff0000' } }]
            }
          ]
        }
      ],
      contour: { kind: 'open' }
    }
  },
  [-210, -97]
);
addProxy(
  'linework-text',
  new LineString([
    [-300, -180],
    [-100, -180]
  ]),
  {
    linework: {
      tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2, lineDash: [8, 6] } }],
      inlineText: {
        text: 'PIPE',
        fontFamily: 'sans-serif',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        fill: { type: 'solid', color: '#000000' },
        gapPadding: 6
      },
      contour: { kind: 'open' }
    }
  },
  [-200, -180]
);

const worldWrapTarget = document.createElement('div');
worldWrapTarget.style.cssText = 'position:absolute;left:700px;top:0;width:160px;height:120px;';
document.body.append(worldWrapTarget);
const projectionExtent = map.getView().getProjection().getExtent();
const worldWidth = projectionExtent[2] - projectionExtent[0];
const worldWrapSource = new VectorSource<Feature>({ wrapX: true });
const worldWrapMap = new Map({
  target: worldWrapTarget,
  layers: [new VectorLayer({ source: worldWrapSource })],
  controls: [],
  view: new View({ center: [worldWidth, 0], resolution: 1, projection: 'EPSG:3857', multiWorld: true })
});
const worldWrapFeature = new Feature(
  new LineString([
    [-20, 0],
    [20, 0]
  ])
);
worldWrapFeature.setStyle(
  compiler.compile({
    linework: {
      tracks: [],
      decorations: [
        {
          placement: { kind: 'repeat', spacing: 100 },
          sequence: [
            {
              primitives: [{ type: 'circle', center: [0, 0], radius: 6, fill: { type: 'solid', color: '#ff0000' } }]
            }
          ]
        }
      ],
      contour: { kind: 'open' }
    }
  })
);
worldWrapSource.addFeature(worldWrapFeature);

const declutterCoordinate = [230, 110] as const;
const competitor = new Feature(new Point([...declutterCoordinate]));
competitor.setId('declutter-competitor');
competitor.setStyle(
  compiler.compile({
    symbol: { type: 'circle', radius: 18, fill: { type: 'solid', color: '#00ff00' } },
    text: { text: 'COMPETITOR', fill: { type: 'solid', color: '#00ff00' } },
    zIndex: 0
  })
);
source.addFeature(competitor);
addProxy(
  'declutter-proxy',
  new Point([...declutterCoordinate]),
  {
    symbol: { type: 'circle', radius: 22, fill: { type: 'solid', color: '#ff0000' } },
    text: { text: 'PROXY', fill: { type: 'solid', color: '#ff0000' } },
    zIndex: 10
  },
  declutterCoordinate
);

const replacementCoordinate = [150, -140] as const;
const underlay = new Feature(
  new Polygon([
    [
      [100, -100],
      [200, -100],
      [200, -180],
      [100, -180],
      [100, -100]
    ]
  ])
);
underlay.setId('replacement-underlay');
underlay.setStyle(new Style({ fill: new Fill({ color: '#0000ff' }) }));
source.addFeature(underlay);
const underlayGeometry = underlay.getGeometry();
if (underlayGeometry === undefined) throw new Error('Replacement underlay geometry is missing');
const replacement = new Feature(underlayGeometry.clone());
replacement.setId('replacement-not-in-source');
const replacementStyle = new Style({ fill: new Fill({ color: '#ff0000' }), stroke: new Stroke({ color: '#ff0000', width: 1 }) });
let alpha = { before: 1, during: 0.5, after: 1 };
layer.on('postrender', (event) => {
  const context = event.context;
  if (context === undefined || !('globalAlpha' in context) || !('save' in context) || !('restore' in context)) return;
  const canvas = context as CanvasRenderingContext2D;
  alpha = { before: canvas.globalAlpha, during: canvas.globalAlpha * 0.5, after: canvas.globalAlpha };
  canvas.save();
  try {
    canvas.globalAlpha *= 0.5;
    getVectorContext(event).drawFeature(replacement, replacementStyle);
  } finally {
    canvas.restore();
    alpha = { ...alpha, after: canvas.globalAlpha };
  }
});

let ready = false;
window.__PRESENTATION_SPIKE__ = {
  get ready() {
    return ready;
  },
  snapshot() {
    if (!ready) throw new Error('Presentation spike is not ready');
    const hits: Record<string, readonly string[]> = {};
    for (const [id, coordinate] of probes) hits[id] = hitIds(coordinate);
    const proxyPixels: Record<string, readonly [number, number, number, number]> = {};
    for (const id of ['linework-glyph', 'linework-text']) {
      const coordinate = probes.get(id);
      if (coordinate !== undefined) proxyPixels[id] = pixelColor(coordinate);
    }
    return Object.freeze({
      sourceIds: Object.freeze(
        source
          .getFeatures()
          .map((feature) => String(feature.getId()))
          .sort()
      ),
      hits: Object.freeze(hits),
      proxyPixels: Object.freeze(proxyPixels),
      worldWrapPixel: pixelColorFor(worldWrapMap, worldWrapTarget, [worldWidth, 0]),
      declutterPixel: pixelColor(declutterCoordinate),
      replacementPixel: pixelColor(replacementCoordinate),
      replacementHits: Object.freeze(hitIds(replacementCoordinate)),
      alpha: Object.freeze(alpha)
    });
  }
};

let mainReady = false;
let worldWrapReady = false;
const updateReady = (): void => {
  ready = mainReady && worldWrapReady;
};
map.once('rendercomplete', () => {
  mainReady = true;
  updateReady();
});
worldWrapMap.once('rendercomplete', () => {
  worldWrapReady = true;
  updateReady();
});
map.renderSync();
worldWrapMap.renderSync();

function addProxy(id: string, geometry: Point | LineString | Polygon | Circle, spec: StyleSpec, hitCoordinate?: readonly [number, number]): void {
  const feature = new Feature(geometry);
  feature.setId(id);
  feature.setStyle(createTransparentStyleProxy(compiler.compile(spec)));
  source.addFeature(feature);
  const coordinate = hitCoordinate ?? representativeCoordinate(geometry);
  probes.set(id, Object.freeze([coordinate[0], coordinate[1]]));
}

function representativeCoordinate(geometry: Point | LineString | Polygon | Circle): readonly [number, number] {
  if (geometry instanceof Point) return geometry.getCoordinates() as [number, number];
  if (geometry instanceof Circle) return geometry.getCenter() as [number, number];
  if (geometry instanceof Polygon) return geometry.getInteriorPoint().getCoordinates() as [number, number];
  return geometry.getCoordinateAt(0.5) as [number, number];
}

function hitIds(coordinate: readonly [number, number]): string[] {
  const pixel = map.getPixelFromCoordinate([...coordinate]);
  const ids: string[] = [];
  map.forEachFeatureAtPixel(
    pixel,
    (feature) => {
      ids.push(String(feature.getId()));
      return undefined;
    },
    { hitTolerance: 2, checkWrapped: true }
  );
  return ids;
}

function pixelColor(coordinate: readonly [number, number]): [number, number, number, number] {
  return pixelColorFor(map, target, coordinate);
}

function pixelColorFor(activeMap: Map, activeTarget: HTMLElement, coordinate: readonly [number, number]): [number, number, number, number] {
  const pixel = activeMap.getPixelFromCoordinate([...coordinate]);
  const canvas = activeTarget.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Map canvas is missing');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('Map canvas context is missing');
  const scaleX = canvas.width / activeTarget.clientWidth;
  const scaleY = canvas.height / activeTarget.clientHeight;
  const data = context.getImageData(Math.round(pixel[0] * scaleX), Math.round(pixel[1] * scaleY), 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}
