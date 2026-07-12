import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
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

  it('ships editable vector and satellite URL templates', async () => {
    const raw = await readFile('website/public/map-sources.json', 'utf8');
    const mapSources = JSON.parse(raw);

    expect(mapSources.vector.urlTemplate).toMatch(/\{z\}.*\{x\}.*\{y\}|\{z\}.*\{y\}.*\{x\}/);
    expect(mapSources.satellite.urlTemplate).toMatch(/\{z\}.*\{x\}.*\{y\}|\{z\}.*\{y\}.*\{x\}/);
  });

  it('keeps tile service URLs out of documentation examples', async () => {
    const examplesDirectory = 'website/src/examples';
    const files = (await readdir(examplesDirectory)).filter((file) => file.endsWith('.vue'));
    const contents = await Promise.all(files.map((file) => readFile(path.join(examplesDirectory, file), 'utf8')));

    expect(contents.join('\n')).not.toMatch(/https:\/\/(tile\.openstreetmap\.org|server\.arcgisonline\.com|webrd\d+\.is\.autonavi\.com)/);
  });
});
