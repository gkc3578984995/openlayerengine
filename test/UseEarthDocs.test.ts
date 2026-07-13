import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stableStyleImport = "import '@vrsim/earth-engine-ol/style.css';";
const forbiddenStyleImport = /@vrsim\/earth-engine-ol\/dist\/index(?:\.es|\.cjs)?\.css/;

async function readVueFiles(directory: string): Promise<Array<{ path: string; source: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return readVueFiles(path);
      if (!entry.isFile() || !entry.name.endsWith('.vue')) return [];
      return [{ path, source: await readFile(path, 'utf8') }];
    })
  );
  return files.flat();
}

describe('useEarth documentation', () => {
  it('uses the stable public stylesheet export throughout tracked docs and examples', async () => {
    const [readme, quickStart, views, examples] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('website/src/views/QuickStartView.vue', 'utf8'),
      readVueFiles('website/src/views'),
      readVueFiles('website/src/examples')
    ]);

    for (const file of [{ path: 'README.md', source: readme }, ...views, ...examples]) {
      expect(file.source, file.path).not.toMatch(forbiddenStyleImport);
    }
    expect(readme).toContain(stableStyleImport);
    expect(quickStart).toContain(stableStyleImport);
    expect(examples.some(({ source }) => source.includes(stableStyleImport))).toBe(true);
    for (const example of examples) expect(example.source, example.path).toContain(stableStyleImport);
  });

  it('documents the real earth creation anchors and linked API references', async () => {
    const view = await readFile('website/src/views/EarthCreateView.vue', 'utf8');
    const anchors = [
      'overview',
      'example-default-earth',
      'example-named-earth',
      'api-use-earth',
      'api-constructor',
      'api-type-use-earth-options',
      'api-methods',
      'tips'
    ];

    for (const anchor of anchors) {
      expect(view).toContain(`id="${anchor}"`);
      expect(view).toContain(`id: '${anchor}'`);
    }
    expect(view).toContain('<code class="code-fn"><a href="#api-use-earth">useEarth</a></code>');
    expect(view).toMatch(/<code class="code-fn"><a href="#api-methods">destroy<\/a><\/code\s*>/);
    expect(view).toContain('<code><a href="#api-type-use-earth-options">UseEarthOptions</a></code>');
    expect(view).not.toContain('code-fn-inline');
  });

  it('uses the runnable default example as the displayed useEarth source', async () => {
    const [view, demo] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/examples/EarthCreateDemo.vue', 'utf8')
    ]);

    expect(view).toContain("import EarthCreateDemo from '../examples/EarthCreateDemo.vue';");
    expect(view).toContain("import earthCreateSource from '../examples/EarthCreateDemo.vue?raw';");
    expect(view).toContain(':source="earthCreateSource"');
    expect(demo).toMatch(/import\s*\{\s*Earth,\s*useEarth\s*\}\s*from '@vrsim\/earth-engine-ol';/);
    expect(demo).toMatch(/useEarth\(\{\s*target: mapId,\s*view: \{ center: BEIJING, zoom: 5 \}\s*\}\)/s);
    expect(demo).toContain('useEarth() === earth');
    expect(demo).toContain('console.assert(useEarth() === earth)');
    expect(demo).not.toMatch(/^\s*useEarth\(\) === earth;\s*$/m);
    expect(demo).toContain("createConfiguredLayer(earth, 'vector')");
  });

  it('creates, retrieves, and cleans up two named earth instances', async () => {
    const demo = await readFile('website/src/examples/MultiEarthDemo.vue', 'utf8');

    expect(demo).toMatch(/useEarth\(\{ id: mapId1, target: mapId1, view: \{ center: BEIJING, zoom: 5 \} \}\)/);
    expect(demo).toMatch(/useEarth\(\{ id: mapId2, target: mapId2, view: \{ center: SHANGHAI, zoom: 6 \} \}\)/);
    expect(demo).toContain('useEarth(mapId1) === earth1');
    expect(demo).toContain('useEarth(mapId2) === earth2');
    expect(demo).toContain("createConfiguredLayer(earth1, 'vector')");
    expect(demo).toContain("createConfiguredLayer(earth2, 'vector')");
    expect(demo).toContain('earthRef1.value?.destroy()');
    expect(demo).toContain('earthRef2.value?.destroy()');
    expect(demo).toContain('console.assert(useEarth(mapId1) === earth1)');
    expect(demo).toContain('console.assert(useEarth(mapId2) === earth2)');
    expect(demo).not.toMatch(/^\s*useEarth\([^\n]*\) === earth\d?;\s*$/m);
  });

  it('keeps a complete root migration contract for version 2', async () => {
    const migration = await readFile('MIGRATION.txt', 'utf8');
    const version2 = migration.indexOf('1.x 升级到 2.0.0');
    const version1 = migration.indexOf('v1.0.0 迁移指南');

    expect(version2).toBeGreaterThanOrEqual(0);
    expect(version1).toBeGreaterThan(version2);
    for (const topic of [
      '仅 ESM',
      'require',
      '@vrsim/earth-engine-ol/style.css',
      './dist/*',
      'useEarth()',
      'useEarth(id)',
      'useEarth(options)',
      'destroyEarth()',
      'destroyEarth(id)'
    ]) {
      expect(migration).toContain(topic);
    }
    expect(migration).toContain('target、view 和 controls 仅在首次创建时生效');
    expect(migration).toContain('不存在对应实例时不会抛错');
  });

  it('documents the public destroyEarth helper and first-creation option semantics', async () => {
    const [readme, earthCreate, migration] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/views/MigrationV2View.vue', 'utf8')
    ]);

    for (const source of [readme, earthCreate, migration]) {
      expect(source).toContain('destroyEarth()');
      expect(source).toContain('destroyEarth(id)');
      expect(source).toContain('不存在对应实例时不会抛错');
      expect(source).toContain('target、view 和 controls 仅在首次创建时生效');
    }

    expect(earthCreate).toContain("{ id: 'api-destroy-earth', label: 'destroyEarth' }");
    expect(earthCreate).toContain('id="api-destroy-earth"');
    expect(earthCreate).toContain('<code>destroyEarth(): void</code>');
    expect(earthCreate).toContain('<code>destroyEarth(id: string): void</code>');
    expect(earthCreate).toMatch(/<code class="code-fn"><a href="#api-destroy-earth">destroyEarth(?:\(\)|\(id\))?<\/a><\/code\s*>/);
    expect(migration).toContain("import { destroyEarth, useEarth } from '@vrsim/earth-engine-ol';");
    expect(migration).toContain("destroyEarth('overview');");
    expect(migration).toContain('destroyEarth();');
  });

  it('documents the version 1 two-argument signature migration and canonical API links', async () => {
    const [readme, rootMigration, migration, earthCreate] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('MIGRATION.txt', 'utf8'),
      readFile('website/src/views/MigrationV2View.vue', 'utf8'),
      readFile('website/src/views/EarthCreateView.vue', 'utf8')
    ]);

    for (const source of [readme, rootMigration, migration]) {
      expect(source).toContain('useEarth(viewOptions?, options?)');
      expect(source).toContain('useEarth({ view, target, controls })');
      expect(source).toContain('第二个参数会被忽略');
    }
    expect(readme).toContain('必须改为单个 UseEarthOptions 对象');
    expect(rootMigration).toContain('必须改为单个 UseEarthOptions 对象');
    expect(migration).toMatch(/必须改为单个\s*<code><a href="\/guide\/earth-create#api-type-use-earth-options">UseEarthOptions<\/a><\/code> 对象/);

    expect(migration).toContain("{ id: 'signature', label: '调用签名' }");
    expect(migration).toContain('id="signature"');
    for (const anchor of ['api-use-earth', 'api-destroy-earth', 'api-constructor', 'api-type-use-earth-options', 'api-methods']) {
      expect(earthCreate).toContain(`id="${anchor}"`);
      expect(migration).toContain(`href="/guide/earth-create#${anchor}"`);
    }
  });

  it('documents dependencies removed in version 2 without promising transitive installation', async () => {
    const [rootMigration, migration] = await Promise.all([readFile('MIGRATION.txt', 'utf8'), readFile('website/src/views/MigrationV2View.vue', 'utf8')]);

    for (const source of [rootMigration, migration]) {
      for (const dependency of ['heatmap.js', 'mitt', '@types/heatmap.js']) expect(source).toContain(dependency);
      expect(source).toContain('业务直接使用这些包时需自行显式安装');
      expect(source).toContain('不要依赖传递安装');
    }
  });

  it('keeps every runnable basemap behind the deployment map source configuration', async () => {
    const examples = await readVueFiles('website/src/examples');

    for (const example of examples) {
      expect(example.source, example.path).not.toMatch(/https?:\/\//);
      if (!example.source.includes('.addLayer(')) continue;
      expect(example.source, example.path).toContain("import { createConfiguredLayer } from '../config/mapSources';");
      expect(example.source, example.path).toContain('createConfiguredLayer(');
    }
  });

  it('registers a complete version 2 migration guide', async () => {
    const [navigation, router, migration] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/views/MigrationV2View.vue', 'utf8')
    ]);

    expect(navigation).toContain("{ label: '2.0 迁移指南', to: '/guide/migration-v2' }");
    expect(router).toContain("import MigrationV2View from '../views/MigrationV2View.vue';");
    expect(router).toContain("path: 'guide/migration-v2'");
    expect(router).toContain('component: MigrationV2View');
    for (const topic of [
      'useEarth()',
      'useEarth(id)',
      'useEarth(options)',
      'style.css',
      './dist/*',
      'ESM',
      '.mjs',
      'earth.destroy()',
      'destroyEarth()',
      'destroyEarth(id)'
    ]) {
      expect(migration).toContain(topic);
    }
    for (const subpath of ['/core', '/layers', '/draw', '/measure', '/transform', '/plot']) expect(migration).toContain(subpath);
  });

  it('describes constructor fallback as the default instance rather than a global singleton', async () => {
    const layerViews = [
      'BillboardLayerView.vue',
      'CircleLayerView.vue',
      'OverlayLayerView.vue',
      'PointLayerView.vue',
      'PolygonLayerView.vue',
      'PolylineLayerView.vue'
    ];

    for (const filename of layerViews) {
      const source = await readFile(`website/src/views/${filename}`, 'utf8');
      expect(source, filename).toContain('默认实例');
      expect(source, filename).not.toContain('全局单例');
    }
  });
});
