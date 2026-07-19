import type { Earth, Layer, TileUrlFunction } from '@vrsim/earth-engine-ol';

export type MapSourceName = 'vector' | 'satellite';

export interface MapSourceConfig {
  urlTemplate: string;
  opacity: number;
  attributions: string | readonly string[];
}

export type MapSources = Record<MapSourceName, MapSourceConfig>;

export const DEFAULT_MAP_SOURCES: MapSources = {
  vector: {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opacity: 1,
    attributions: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>'
  },
  satellite: {
    urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.65,
    attributions: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }
};

let mapSources: MapSources = DEFAULT_MAP_SOURCES;

const isUrlTemplate = (value: unknown): value is string => typeof value === 'string' && /\{z\}/.test(value) && /\{x\}/.test(value) && /\{y\}/.test(value);
const isOpacity = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;
const isAttributions = (value: unknown): value is string | readonly string[] =>
  (typeof value === 'string' && value.trim().length > 0) ||
  (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0));
const copyAttributions = (value: string | readonly string[]): string | readonly string[] => (typeof value === 'string' ? value : [...value]);

export const resolveMapSources = (value: unknown): MapSources => {
  if (!value || typeof value !== 'object') return DEFAULT_MAP_SOURCES;

  const candidate = value as {
    vector?: Partial<MapSourceConfig>;
    satellite?: Partial<MapSourceConfig>;
  };
  if (
    !isUrlTemplate(candidate.vector?.urlTemplate) ||
    !isAttributions(candidate.vector?.attributions) ||
    !isUrlTemplate(candidate.satellite?.urlTemplate) ||
    !isAttributions(candidate.satellite?.attributions)
  ) {
    return DEFAULT_MAP_SOURCES;
  }

  return {
    vector: {
      urlTemplate: candidate.vector.urlTemplate,
      opacity: isOpacity(candidate.vector.opacity) ? candidate.vector.opacity : 1,
      attributions: copyAttributions(candidate.vector.attributions)
    },
    satellite: {
      urlTemplate: candidate.satellite.urlTemplate,
      opacity: isOpacity(candidate.satellite.opacity) ? candidate.satellite.opacity : 0.65,
      attributions: copyAttributions(candidate.satellite.attributions)
    }
  };
};

export const setMapSources = (value: unknown): void => {
  mapSources = resolveMapSources(value);
};

export const getMapSource = (name: MapSourceName): MapSourceConfig => mapSources[name];

export const createTileUrl = (template: string, [z, x, y]: Parameters<TileUrlFunction>[0]): string => {
  return template.split('{z}').join(String(z)).split('{x}').join(String(x)).split('{y}').join(String(y));
};

export const createConfiguredLayer = (earth: Earth, name: MapSourceName): Layer => {
  const source = getMapSource(name);
  return earth.layers.add({
    kind: 'tile',
    preset: 'xyz',
    tileUrlFunction: (coordinate) => createTileUrl(source.urlTemplate, coordinate),
    attributions: source.attributions,
    opacity: source.opacity
  });
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
