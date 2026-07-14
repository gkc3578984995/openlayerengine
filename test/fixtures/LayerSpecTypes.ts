import TileSource from 'ol/source/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import type { PublicLayerSpec } from '../../src/facade/types.js';

declare const tileSource: TileSource;

const valid: PublicLayerSpec[] = [
  { kind: 'vector' },
  { kind: 'vector', id: 'business', visible: false, opacity: 0, zIndex: 2, wrapX: false, declutter: true },
  { kind: 'tile', preset: 'osm' },
  { kind: 'tile', preset: 'xyz', url: 'https://example.test/{z}/{x}/{y}.png', attributions: ['example'] },
  { kind: 'tile', preset: 'xyz', tileUrlFunction: ([z, x, y]) => `${z}/${x}/${y}` },
  { kind: 'tile', preset: 'compact-xyz', baseUrl: 'https://example.test/tiles' },
  { kind: 'tile', source: tileSource },
  { kind: 'tile', source: tileSource, ownership: 'earth' },
  { kind: 'native', layer: new VectorLayer({ source: new VectorSource() }) },
  { kind: 'native', id: 'native', layer: new VectorLayer({ source: new VectorSource() }), ownership: 'earth' }
];

void valid;

// @ts-expect-error native layers require a layer
const missingNativeLayer: PublicLayerSpec = { kind: 'native' };
// @ts-expect-error xyz requires exactly one URL mechanism
const emptyXyz: PublicLayerSpec = { kind: 'tile', preset: 'xyz' };
// @ts-expect-error xyz cannot mix URL mechanisms
const mixedXyz: PublicLayerSpec = { kind: 'tile', preset: 'xyz', url: 'x', tileUrlFunction: () => 'y' };
// @ts-expect-error compact-xyz requires baseUrl
const emptyCompact: PublicLayerSpec = { kind: 'tile', preset: 'compact-xyz' };
// @ts-expect-error OSM does not accept url
const osmUrl: PublicLayerSpec = { kind: 'tile', preset: 'osm', url: 'x' };
// @ts-expect-error OSM does not accept a custom source
const osmSource: PublicLayerSpec = { kind: 'tile', preset: 'osm', source: tileSource };
// @ts-expect-error vector layers never accept a source
const vectorSource: PublicLayerSpec = { kind: 'vector', source: tileSource };
// @ts-expect-error ownership belongs only to user native resources
const ownedPreset: PublicLayerSpec = { kind: 'tile', preset: 'osm', ownership: 'earth' };
// @ts-expect-error exact optional properties reject explicit undefined
const undefinedWrapX: PublicLayerSpec = { kind: 'vector', wrapX: undefined };
// @ts-expect-error exact optional properties reject explicit undefined
const undefinedOwnership: PublicLayerSpec = { kind: 'native', layer: new VectorLayer({}), ownership: undefined };

void [missingNativeLayer, emptyXyz, mixedXyz, emptyCompact, osmUrl, osmSource, vectorSource, ownedPreset, undefinedWrapX, undefinedOwnership];
