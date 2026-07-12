import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_SOURCES, createTileUrl, getMapSource, loadMapSources, setMapSources } from '../website/src/config/mapSources';

afterEach(() => setMapSources(undefined));

describe('website runtime map sources', () => {
  it('uses a valid runtime configuration and expands XYZ placeholders', () => {
    setMapSources({
      vector: { urlTemplate: 'https://maps.example/vector/{z}/{x}/{y}.png' },
      satellite: { urlTemplate: 'https://maps.example/satellite/{z}/{y}/{x}.jpg', opacity: 0.4 }
    });

    expect(getMapSource('satellite')).toEqual({
      urlTemplate: 'https://maps.example/satellite/{z}/{y}/{x}.jpg',
      opacity: 0.4
    });
    expect(createTileUrl(getMapSource('vector').urlTemplate, [6, 11, 22])).toBe('https://maps.example/vector/6/11/22.png');
    expect(DEFAULT_MAP_SOURCES.vector.urlTemplate).toContain('{z}');
  });

  it('falls back to defaults when configuration is incomplete or malformed', () => {
    setMapSources({ vector: { urlTemplate: 'https://maps.example/{z}/{x}/{y}.png' } });

    expect(getMapSource('vector')).toEqual(DEFAULT_MAP_SOURCES.vector);
    expect(getMapSource('satellite')).toEqual(DEFAULT_MAP_SOURCES.satellite);
  });

  it('keeps defaults when the runtime configuration request fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await loadMapSources(async () => {
      throw new Error('network unavailable');
    });

    expect(getMapSource('vector')).toEqual(DEFAULT_MAP_SOURCES.vector);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
