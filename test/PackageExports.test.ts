import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

interface ConditionalExport {
  readonly types: string;
  readonly import: string;
}

interface PackageJson {
  readonly version: string;
  readonly type: string;
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly bundleDependencies?: readonly string[];
  readonly bundledDependencies?: readonly string[];
  readonly peerDependencies: Record<string, string>;
  readonly peerDependenciesMeta: Record<string, { readonly optional: boolean }>;
  readonly devDependencies: Record<string, string>;
  readonly main: string;
  readonly module: string;
  readonly types: string;
  readonly style: string;
  readonly exports: Record<string, ConditionalExport | string>;
  readonly sideEffects: readonly string[];
}

const projectRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as PackageJson;

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return listFiles(file, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [file] : [];
  });
}

describe('2.0 发布入口', () => {
  coversCapabilities(
    'public-root-api',
    'public-style-explicit-entry',
    'public-base-subclass-extension',
    'public-low-level-plot-api',
    'public-feature-metadata-keys',
    'public-legacy-type-only-ast'
  );

  it('只发布 ESM 根入口和样式入口', () => {
    expect(packageJson.version).toBe('2.0.0');
    expect(packageJson.type).toBe('module');
    expect(Object.keys(packageJson.exports)).toEqual(['.', './style.css']);
    expect(packageJson.exports['.']).toEqual({ types: './dist/types/index.d.ts', import: './dist/esm/index.mjs' });
    expect(packageJson.exports['./style.css']).toBe('./dist/style.css');
    expect(packageJson.main).toBe('./dist/esm/index.mjs');
    expect(packageJson.module).toBe('./dist/esm/index.mjs');
    expect(packageJson.types).toBe('./dist/types/index.d.ts');
    expect(packageJson.style).toBe('./dist/style.css');
    expect(packageJson.sideEffects).toEqual(['./dist/style.css']);
  });

  it('没有普通、可选或打包运行时依赖，并把 OL 保持为可选 peer', () => {
    expect(packageJson.dependencies ?? {}).toEqual({});
    expect(packageJson.optionalDependencies ?? {}).toEqual({});
    expect(packageJson.bundleDependencies ?? packageJson.bundledDependencies ?? []).toEqual([]);
    expect(packageJson.peerDependencies).toEqual({ ol: '^10.9.0' });
    expect(packageJson.peerDependenciesMeta).toEqual({ ol: { optional: true } });
    expect(packageJson.devDependencies.ol).toBe('10.9.0');
    expect(packageJson.devDependencies['@types/lodash']).toBeUndefined();
  });

  it('Rollup 只构建根入口并仅外置 OL', () => {
    const config = readFileSync(resolve(projectRoot, 'rollup.config.mjs'), 'utf8');

    expect(config).toMatch(/input:\s*\{\s*index:\s*['"]src\/index\.ts['"]\s*\}/s);
    expect(config).toContain("id === 'ol' || id.startsWith('ol/')");
    expect(config).not.toMatch(/\b(?:core|layers|draw|measure|transform|plot):\s*['"]src\//);
    expect(config).not.toContain('lodash');
    expect(config).not.toContain('externalDependencies');
  });

  it('构建结果只包含声明的入口且不泄漏源码别名', () => {
    const dist = resolve(projectRoot, 'dist');
    if (!existsSync(dist)) return;

    for (const file of ['dist/esm/index.mjs', 'dist/types/index.d.ts', 'dist/style.css']) {
      expect(existsSync(resolve(projectRoot, file))).toBe(true);
    }
    for (const removed of ['core.mjs', 'layers.mjs', 'draw.mjs', 'measure.mjs', 'transform.mjs', 'plot.mjs']) {
      expect(existsSync(resolve(projectRoot, 'dist/esm', removed))).toBe(false);
    }
    const declarationLeaks = listFiles(resolve(projectRoot, 'dist/types'), '.d.ts').filter((file) => readFileSync(file, 'utf8').includes('@/'));
    expect(declarationLeaks).toEqual([]);
  });

  it('严格类型消费者只通过根入口使用 v2 API', () => {
    if (!existsSync(resolve(projectRoot, 'dist/types/index.d.ts'))) return;

    execFileSync(
      process.execPath,
      [
        resolve(projectRoot, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--types',
        'node',
        resolve(projectRoot, 'test/fixtures/PackageConsumer.ts')
      ],
      { cwd: projectRoot, encoding: 'utf8' }
    );
  });

  it('Node 可加载根 ESM，并拒绝所有旧 subpath', () => {
    if (!existsSync(resolve(projectRoot, 'dist/esm/index.mjs'))) return;

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const api = await import('@vrsim/earth-engine-ol'); console.log(['Earth','Element','Layer','useEarth'].filter(name => name in api).join(','));"
      ],
      { cwd: projectRoot, encoding: 'utf8' }
    );
    expect(output.trim()).toBe('Earth,Element,Layer,useEarth');

    for (const subpath of ['core', 'layers', 'draw', 'measure', 'transform', 'plot']) {
      expect(() =>
        execFileSync(process.execPath, ['--input-type=module', '--eval', `await import('@vrsim/earth-engine-ol/${subpath}')`], {
          cwd: projectRoot,
          encoding: 'utf8',
          stdio: 'pipe'
        })
      ).toThrow();
    }
  });
});
