import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import { LayerServiceImpl } from '../src/facade/LayerService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

describe('public layer specifications', () => {
  coversCapabilities('earth-raster-osm-preset', 'earth-raster-xyz-compact-preset', 'earth-raster-custom-tile-url-function', 'layer-wrap-x-option');

  it('passes the strict exact-optional consumer type fixture', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
    const fixture = fileURLToPath(new URL('./fixtures/LayerSpecTypes.ts', import.meta.url));

    expect(() =>
      execFileSync(
        process.execPath,
        [
          tsc,
          '--noEmit',
          '--pretty',
          'false',
          '--strict',
          '--exactOptionalPropertyTypes',
          '--skipLibCheck',
          'false',
          '--types',
          'node',
          '--target',
          'ES2022',
          '--module',
          'ESNext',
          '--moduleResolution',
          'Bundler',
          fixture
        ],
        { cwd: root, encoding: 'utf8' }
      )
    ).not.toThrow();
  });

  it('rejects malformed runtime records without evaluating accessors', () => {
    const map = createTestMap();
    const refs = new NativeRefRegistry();
    const store = new ElementStore(new ShapeRegistry());
    const adapter = new LayerAdapter(map, refs);
    const manager = new LayerManager(store, adapter);
    const service = new LayerServiceImpl(manager, adapter, refs);
    let getterCalls = 0;
    const accessor = { kind: 'vector' } as Record<PropertyKey, unknown>;
    Object.defineProperty(accessor, 'id', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'unsafe';
      }
    });
    const symbolRecord = { kind: 'vector', [Symbol('extra')]: true };
    const invalid: unknown[] = [
      null,
      [],
      { kind: 'vector', source: {} },
      { kind: 'tile', preset: 'xyz' },
      { kind: 'tile', preset: 'xyz', url: 'x', tileUrlFunction: () => 'y' },
      { kind: 'tile', preset: 'compact-xyz' },
      { kind: 'tile', preset: 'osm', url: 'x' },
      { kind: 'native' },
      { kind: 'vector', unknown: true },
      accessor,
      symbolRecord
    ];

    for (const spec of invalid) expect(() => service.add(spec as never)).toThrow(InvalidArgumentError);
    expect(getterCalls).toBe(0);
    expect(service.query().map(({ id }) => id)).toEqual(['default']);
  });
});
