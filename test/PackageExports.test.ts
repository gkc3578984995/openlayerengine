import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ConditionalExport = {
  types: string;
  import: string;
};

type PackageJson = {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  main: string;
  module: string;
  types: string;
  style: string;
  exports: Record<string, ConditionalExport | string>;
  sideEffects: string[];
};

const projectRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as PackageJson;

const conditionalExports = {
  '.': ['./dist/types/index.d.ts', './dist/esm/index.mjs'],
  './core': ['./dist/types/entries/core.d.ts', './dist/esm/core.mjs'],
  './layers': ['./dist/types/base/index.d.ts', './dist/esm/layers.mjs'],
  './draw': ['./dist/types/entries/draw.d.ts', './dist/esm/draw.mjs'],
  './measure': ['./dist/types/entries/measure.d.ts', './dist/esm/measure.mjs'],
  './transform': ['./dist/types/entries/transform.d.ts', './dist/esm/transform.mjs'],
  './plot': ['./dist/types/entries/plot.d.ts', './dist/esm/plot.mjs']
} as const;

describe('package exports', () => {
  it('publishes the version 2 root and feature contracts', () => {
    expect(packageJson.version).toBe('2.0.0');
    expect(packageJson.exports['./style.css']).toBe('./dist/style.css');
    expect(packageJson.exports['./dist/*']).toBeUndefined();

    for (const [subpath, targets] of Object.entries(conditionalExports)) {
      const entry = packageJson.exports[subpath];

      expect(entry).toBeTypeOf('object');
      expect(Object.keys(entry as ConditionalExport)).toEqual(['types', 'import']);
      expect(Object.values(entry as ConditionalExport)).toEqual(targets);
      expect((entry as ConditionalExport).import).toMatch(/\.mjs$/);
      expect((entry as ConditionalExport & { require?: string }).require).toBeUndefined();
    }

    expect(packageJson.main).toBe('./dist/esm/index.mjs');
    expect(packageJson.module).toBe('./dist/esm/index.mjs');
    expect(packageJson.types).toBe('./dist/types/index.d.ts');
    expect(packageJson.style).toBe('./dist/style.css');
    expect(packageJson.sideEffects).toEqual(['./dist/style.css']);
  });

  it('keeps styles out of the JavaScript root entry', () => {
    const rootEntry = readFileSync(resolve(projectRoot, 'src/index.ts'), 'utf8');

    expect(rootEntry).not.toMatch(/(?:import|export)\s+['"][^'"]+\.(?:css|scss)['"]/);
  });

  it('declares every Rollup entry and derives externals from dependencies and peers', () => {
    const config = readFileSync(resolve(projectRoot, 'rollup.config.mjs'), 'utf8');

    expect(packageJson.dependencies['wind-core']).toBe('1.1.2');
    expect(packageJson.dependencies['heatmap.js']).toBeUndefined();
    expect(packageJson.dependencies.mitt).toBeUndefined();
    expect(packageJson.devDependencies['@types/heatmap.js']).toBeUndefined();
    expect(packageJson.devDependencies['rollup-plugin-postcss']).toBeUndefined();

    for (const entryName of ['index', 'core', 'layers', 'draw', 'measure', 'transform', 'plot']) {
      expect(config).toMatch(new RegExp(`\\b${entryName}:\\s*['"]src/`));
    }

    expect(config).toMatch(/Object\.keys\(pkg\.dependencies/);
    expect(config).toMatch(/Object\.keys\(pkg\.peerDependencies/);
    expect(config).toContain('id.startsWith(`${dependency}/`)');
    expect(config).toContain("new Set(['ol-wind', 'wind-core'])");
    expect(config).toMatch(/!bundledDependencies\.has\(dependency\)/);
  });

  it('contains every declared artifact after a build', () => {
    const dist = resolve(projectRoot, 'dist');

    if (!existsSync(dist)) return;

    expect(existsSync(resolve(dist, 'cjs'))).toBe(false);

    const builtFiles = [...Object.values(conditionalExports).flat(), './dist/style.css'];

    for (const file of builtFiles) {
      expect(existsSync(resolve(projectRoot, file))).toBe(true);
    }
  });

  it('loads the built core entry with native Node ESM resolution', () => {
    const coreEntry = resolve(projectRoot, 'dist/esm/core.mjs');

    if (!existsSync(coreEntry)) return;

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const module = await import('./dist/esm/core.mjs'); console.log(['Earth', 'useEarth', 'destroyEarth', 'Camera', 'Controls'].filter(name => name in module).join(','));"
      ],
      { cwd: projectRoot, encoding: 'utf8' }
    );

    expect(output.trim()).toBe('Earth,useEarth,destroyEarth,Camera,Controls');
  });
});
