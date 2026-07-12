import type { Earth } from '@vrsim/earth-engine-ol';
import type TileLayer from 'ol/layer/Tile';
import type { TileCoord } from 'ol/tilecoord';
import type XYZ from 'ol/source/XYZ';

export type MapSourceName = 'vector' | 'satellite';

export interface MapSourceConfig {
  urlTemplate: string;
  opacity: number;
}

export type MapSources = Record<MapSourceName, MapSourceConfig>;

export const DEFAULT_MAP_SOURCES: MapSources = {
  vector: {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opacity: 1
  },
  satellite: {
    urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.65
  }
};

let mapSources: MapSources = DEFAULT_MAP_SOURCES;

const isUrlTemplate = (value: unknown): value is string => typeof value === 'string' && /\{z\}/.test(value) && /\{x\}/.test(value) && /\{y\}/.test(value);
const isOpacity = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

export const resolveMapSources = (value: unknown): MapSources => {
  if (!value || typeof value !== 'object') return DEFAULT_MAP_SOURCES;

  const candidate = value as {
    vector?: Partial<MapSourceConfig>;
    satellite?: Partial<MapSourceConfig>;
  };
  if (!isUrlTemplate(candidate.vector?.urlTemplate) || !isUrlTemplate(candidate.satellite?.urlTemplate)) return DEFAULT_MAP_SOURCES;

  return {
    vector: {
      urlTemplate: candidate.vector.urlTemplate,
      opacity: isOpacity(candidate.vector.opacity) ? candidate.vector.opacity : 1
    },
    satellite: {
      urlTemplate: candidate.satellite.urlTemplate,
      opacity: isOpacity(candidate.satellite.opacity) ? candidate.satellite.opacity : 0.65
    }
  };
};

export const setMapSources = (value: unknown): void => {
  mapSources = resolveMapSources(value);
};

export const getMapSource = (name: MapSourceName): MapSourceConfig => mapSources[name];

export const createTileUrl = (template: string, [z, x, y]: TileCoord): string => {
  return template.split('{z}').join(String(z)).split('{x}').join(String(x)).split('{y}').join(String(y));
};

export const createConfiguredLayer = (earth: Earth, name: MapSourceName): TileLayer<XYZ> => {
  const source = getMapSource(name);
  const layer = earth.createXyzLayer((coordinate) => createTileUrl(source.urlTemplate, coordinate));
  layer.setOpacity(source.opacity);
  return layer;
};

export const loadMapSources = async (fetcher: typeof fetch = fetch): Promise<void> => {
  try {
    const response = await fetcher(`${import.meta.env.BASE_URL}map-sources.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`map source configuration request failed: ${response.status}`);
    setMapSources(await response.json());
  } catch (error) {
    setMapSources(undefined);
    console.warn('Unable to load runtime map source configuration; using defaults.', error);
  }
};
