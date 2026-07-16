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

  it('distinguishes named instance ids from map container isolation', async () => {
    const earthCreate = await readFile('website/src/views/EarthCreateView.vue', 'utf8');

    expect(earthCreate).toContain('同时存在的命名实例应使用不同的');
    expect(earthCreate).toContain('默认实例和直接调用');
    expect(earthCreate).toContain('无需注册');
    expect(earthCreate).toContain('所有并存地图都应绑定不同的 DOM 容器');
    expect(earthCreate).not.toMatch(/每个\s*<code><a href="#api-constructor">Earth<\/a><\/code>\s*实例必须使用不同的/);
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

    expect(version2).toBeGreaterThanOrEqual(0);
    expect(migration).not.toContain('0.x 升级到 1.0.0');
    expect(migration).not.toContain('v1.0.0 迁移指南');
    for (const topic of [
      '只提供 ESM',
      'require',
      '@vrsim/earth-engine-ol/style.css',
      'dist/*',
      'ol@10.9.0',
      'Node 16',
      'useEarth()',
      'useEarth(id)',
      'useEarth(options)',
      'destroyEarth 已删除',
      'earth.layers',
      'earth.elements',
      'earth.styles',
      'earth.draw',
      'earth.measure',
      'earth.transform',
      'earth.events',
      'earth.contextMenu',
      'earth.overlays',
      'earth.animations',
      'Utils 和旧枚举',
      '多环和洞',
      'toLonLat',
      'earth.view.toProjectedCoordinates()',
      'earth.view.toGeographicCoordinates()',
      'setLayerOpacity',
      'throttle()'
    ]) {
      expect(migration).toContain(topic);
    }
    expect(migration).toContain('同一注册键的 `target`、`view` 和 `controls` 仅在首次创建时生效');
    expect(migration).toContain('没有就创建，有就返回');
    expect(migration).toContain('`destroyEarth()`、`destroyEarth(id)`、`createEarth()` 和 `getEarth()` 都不存在');
    expect(migration).toContain('Wind 已删除');
    expect(migration).toContain('2.0.0 的内置 `polygon` 只接受一维 `controlPoints`，当前只生成单环');
    expect(migration).toContain('V1 `setLayerOpacity()` 使用 `0` 到 `100` 的百分比');
    expect(migration).toContain('V2 的 `coordinate` 是当前 View 投影下的地图坐标');
    expect(migration).toContain("`ShapeInput<'circle'>.radius`");
    expect(migration).toContain('`Element.state.geometry.radius`');
    expect(migration).toContain('`element.olFeature` 中原生 OL Circle 的半径仍是 View 投影单位');
    expect(migration).toContain('V2 根导出的 `throttle()` 默认是 `0ms`');
  });

  it('记录实例级坐标转换和米制圆半径', async () => {
    const [methods, migration, example] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/views/MigrationV2View.vue', 'utf8'),
      readFile('website/src/examples/ElementCoordinateStorageDemo.vue', 'utf8')
    ]);

    for (const method of ['toProjectedCoordinates', 'toGeographicCoordinates']) {
      expect(methods).toContain(`name: '${method}'`);
      expect(methods).toContain(`>earth.view.${method}</a>`);
      expect(migration).toContain(`earth.view.${method}()`);
      expect(example).toContain(`earth.view.${method}(`);
    }
    expect(methods).toContain('id="demo-coordinate-conversion"');
    expect(methods).toContain('空数组不可用');
    expect(migration).toContain('圆半径固定使用米');
    expect(migration).toContain('style.symbol.radius');
    expect(migration).toContain('仍然表示 CSS 像素');
    expect(example).toContain('label="圆半径（米）"');
  });

  // README 与 Earth 创建页仍保留既有基线；迁移页必须只展示 V2 的实例销毁方式。
  it('在迁移页删除 destroyEarth 用法，同时记录尚未迁移的旧页面基线', async () => {
    const [readme, earthCreate, migration] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/views/MigrationV2View.vue', 'utf8')
    ]);

    for (const source of [readme, earthCreate]) {
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
    expect(migration).not.toContain("import { destroyEarth, useEarth } from '@vrsim/earth-engine-ol';");
    expect(migration).not.toContain("destroyEarth('overview');");
    expect(migration).toContain('1.x 的 <code>destroyEarth()</code> 和 <code>destroyEarth(id)</code> 已删除');
    expect(migration).toContain('overview.destroy();');
    expect(migration).toContain('defaultEarth.destroy();');
  });

  it('documents the version 1 two-argument signature migration and canonical API links', async () => {
    const [readme, rootMigration, migration, earthCreate] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('MIGRATION.txt', 'utf8'),
      readFile('website/src/views/MigrationV2View.vue', 'utf8'),
      readFile('website/src/views/EarthCreateView.vue', 'utf8')
    ]);

    for (const source of [readme, migration]) {
      expect(source).toContain('useEarth(viewOptions?, options?)');
      expect(source).toContain('useEarth({ view, target, controls })');
      expect(source).toContain('第二个参数会被忽略');
    }
    expect(readme).toContain('必须改为单个 UseEarthOptions 对象');
    expect(rootMigration).toContain('useEarth(viewOptions?, options?)');
    expect(rootMigration).toContain('单个 `EarthOptions` 或 `UseEarthOptions` 配置对象');
    expect(rootMigration).toContain('view: { center, zoom: 6 }');
    expect(rootMigration).toContain('controls: { zoom: true }');
    expect(migration).toMatch(/必须改为单个\s*<code><a href="\/guide\/earth-create#api-type-use-earth-options">UseEarthOptions<\/a><\/code> 对象/);

    expect(migration).toContain("{ id: 'signature', label: '调用签名' }");
    expect(migration).toContain('id="signature"');
    for (const anchor of ['api-use-earth', 'api-constructor', 'api-type-use-earth-options', 'api-methods']) {
      expect(earthCreate).toContain(`id="${anchor}"`);
      expect(migration).toContain(`href="/guide/earth-create#${anchor}"`);
    }
    expect(earthCreate).toContain('id="api-destroy-earth"');
    expect(migration).not.toContain('href="/guide/earth-create#api-destroy-earth"');
  });

  it('documents dependencies removed in version 2 without promising transitive installation', async () => {
    const [rootMigration, migration] = await Promise.all([readFile('MIGRATION.txt', 'utf8'), readFile('website/src/views/MigrationV2View.vue', 'utf8')]);

    for (const dependency of ['heatmap.js', 'lodash', 'mitt', 'ol-wind', 'wind-core', '@types/heatmap.js', '@types/lodash']) {
      expect(rootMigration).toContain(dependency);
    }
    expect(rootMigration).toContain('应由业务项目显式安装，不要依赖本库的传递安装');
    expect(rootMigration).toContain('WindLayerInstance`、`ol-wind` 和 `wind-core` 已全部删除，没有 V2 替代 API');

    for (const dependency of ['heatmap.js', 'mitt', '@types/heatmap.js']) expect(migration).toContain(dependency);
    expect(migration).toContain('业务直接使用这些包时需自行显式安装');
    expect(migration).toContain('不要依赖传递安装');
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
