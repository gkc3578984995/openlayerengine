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

describe('2.0 快速上手文档', () => {
  it('只使用稳定的公开样式入口', async () => {
    const [readme, quickStart, earthCreateDemo, views, examples] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('website/src/views/QuickStartView.vue', 'utf8'),
      readFile('website/src/examples/EarthCreateDemo.vue', 'utf8'),
      readVueFiles('website/src/views'),
      readVueFiles('website/src/examples')
    ]);

    for (const file of [{ path: 'README.md', source: readme }, ...views, ...examples]) {
      expect(file.source, file.path).not.toMatch(forbiddenStyleImport);
    }
    for (const source of [readme, quickStart, earthCreateDemo]) expect(source).toContain(stableStyleImport);
  });

  it('安装页精确记录发布工具链、OL、ESM 和离线依赖闭包', async () => {
    const [quickStart, packageSource] = await Promise.all([readFile('website/src/views/QuickStartView.vue', 'utf8'), readFile('package.json', 'utf8')]);
    const packageJson = JSON.parse(packageSource) as {
      engines: { node: string; npm: string };
      peerDependencies: { ol: string };
      peerDependenciesMeta: { ol: { optional: boolean } };
    };

    expect(packageJson.engines).toEqual({ node: '>=24.18.0 <25', npm: '>=11 <12' });
    expect(packageJson.peerDependencies.ol).toBe('^10.9.0');
    expect(packageJson.peerDependenciesMeta.ol.optional).toBe(true);

    for (const contract of [
      '&gt;=24.18.0 &lt;25',
      '&gt;=11 &lt;12',
      'npm install @vrsim/earth-engine-ol@2.0.0 ol@10.9.0',
      '"ol": "10.9.0"',
      'ESM only',
      '仅提供 ESM 入口',
      "import { useEarth, type UseEarthOptions } from '@vrsim/earth-engine-ol';",
      stableStyleImport,
      'optional peer 不等于运行时可选',
      '完整依赖闭包',
      '单独准备 OpenLayers 的依赖仍不足以安装真实业务',
      'npm ci --cache ./npm-cache',
      'npm ci --offline --cache ./npm-cache',
      'ol@10.9.0 ./vrsim-earth-engine-ol-2.0.0.tgz'
    ]) {
      expect(quickStart).toContain(contract);
    }
    expect(quickStart).toContain('只公开包根入口');
    expect(quickStart).not.toMatch(/@vrsim\/earth-engine-ol\/(?:dist|core|layers|draw|measure|transform|plot)\b/);
  });

  it('让 Earth 创建页的全部成员锚点和 API 引用都可以直接点击', async () => {
    const [view, apiReference, apiTable, generatedApi] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/components/docs/ApiReference.vue', 'utf8'),
      readFile('website/src/components/docs/ApiTable.vue', 'utf8'),
      readFile('website/src/generated/api.ts', 'utf8')
    ]);
    const members = {
      type: ['api-type-earth', 'api-type-use-earth-options', 'api-type-layer'],
      property: [
        'api-property-id',
        'api-property-target',
        'api-property-view',
        'api-property-controls',
        'api-property-layers',
        'api-property-earth-view',
        'api-property-lifecycle'
      ],
      method: ['api-method-use-earth', 'api-method-layers-add', 'api-method-to-projected-coordinates', 'api-method-fly-to', 'api-method-destroy']
    } as const;
    const memberAnchors = Object.values(members).flat();

    for (const [kind, anchors] of Object.entries(members)) {
      expect(view).toContain(`presentation: '${kind}'`);
      for (const anchor of anchors) {
        expect(view, `${anchor} 缺少页内导航项`).toContain(`id: '${anchor}'`);
        if (anchor === 'api-type-use-earth-options') {
          expect(view).toContain(':type-names="[\'UseEarthOptions\']"');
          expect(generatedApi).toContain(`"anchor": "${anchor}"`);
        } else {
          expect(view, `${anchor} 缺少 API 表成员锚点`).toContain(`anchor: '${anchor}'`);
        }
      }
    }

    expect(apiReference).toContain('<a :href="props.to"');
    expect(apiReference).toContain('api-reference--${props.kind}');
    expect(apiReference).toContain(':data-api-kind="props.kind"');
    expect(apiTable).toContain(':id="columnIndex === 0 ? row.anchor : undefined"');
    expect(apiTable).toContain('api-table__${col.presentation}');
    expect(apiTable).toContain(':href="`#${row.anchor}`"');
    expect(apiTable).toContain('<el-link');

    const references = [...view.matchAll(/<ApiReference\b[^>]*\bkind="(method|property|type)"[^>]*\bto="(#[^"]+)"/g)];
    expect(references.length).toBeGreaterThan(0);
    for (const kind of Object.keys(members))
      expect(
        references.some((reference) => reference[1] === kind),
        kind
      ).toBe(true);
    for (const reference of references) expect(memberAnchors, reference[2]).toContain(reference[2].slice(1));
  });

  it('展示与运行完全同源的第一张地图示例', async () => {
    const [view, demo] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/examples/EarthCreateDemo.vue', 'utf8')
    ]);

    expect(view).toContain("import EarthCreateDemo from '../examples/EarthCreateDemo.vue';");
    expect(view).toContain("import earthCreateSource from '../examples/EarthCreateDemo.vue?raw';");
    expect(view).toContain(':source="earthCreateSource"');
    expect(view).toContain('<EarthCreateDemo />');
    expect(view).not.toContain('MultiEarthDemo');

    expect(demo).toMatch(/import\s*\{\s*useEarth\s*\}\s*from '@vrsim\/earth-engine-ol';/);
    expect(demo).toContain("import type { Earth } from '@vrsim/earth-engine-ol';");
    expect(demo).toContain(stableStyleImport);
    expect(demo).toMatch(/useEarth\(\{\s*target: mapTarget\.value,\s*view: \{ zoom: 5 \},\s*controls:/s);
    expect(demo).toContain("createConfiguredLayer(earth, 'vector')");
    expect(demo).toContain('earth.view.toProjectedCoordinates([116.4074, 39.9042])');
    expect(demo).toContain('earth.view.flyTo(beijing, 5)');
    expect(demo).toContain('earth.destroy()');
    expect(demo).toContain('lastStatus.value = earth.lifecycle');
    expect(demo).toContain('onBeforeUnmount(destroyMap)');
    expect(demo).toContain('<el-button');
    expect(demo).toContain('<el-tag');
    expect(demo).not.toMatch(/<(?:button|input|select|textarea)\b/);

    for (const source of [view, demo]) expect(source).not.toMatch(/\b(?:destroyEarth|addLayer|createXyzLayer)\s*\(/);
  });

  it('通过 LayerService 创建部署期配置的底图', async () => {
    const mapSources = await readFile('website/src/config/mapSources.ts', 'utf8');

    expect(mapSources).toContain('export const createConfiguredLayer = (earth: Earth, name: MapSourceName): Layer =>');
    expect(mapSources).toContain('return earth.layers.add({');
    expect(mapSources).toContain("kind: 'tile'");
    expect(mapSources).toContain("preset: 'xyz'");
    expect(mapSources).toContain('tileUrlFunction: (coordinate) => createTileUrl(source.urlTemplate, coordinate)');
    expect(mapSources).toContain('attributions: source.attributions');
    expect(mapSources).not.toMatch(/\bearth\.addLayer\s*\(/);
    expect(mapSources).not.toMatch(/\bcreateXyzLayer\s*\(/);
  });

  it('在根迁移文档保留完整的 2.0 发布与能力边界', async () => {
    const migration = await readFile('MIGRATION.txt', 'utf8');

    for (const contract of [
      '# @vrsim/earth-engine-ol 1.x 升级到 2.0.0',
      'Node `>=24.18.0 <25`',
      'npm `>=11 <12`',
      'ol@10.9.0',
      '只提供 ESM',
      '@vrsim/earth-engine-ol/style.css',
      '完整业务环境仍需提前准备 OL 10.9.0 及其依赖闭包',
      '只携带两个裸 tgz 或只预热 OL 依赖都不足以保证完整业务项目可离线安装',
      '业务锁文件中的全部依赖都必须已经存在于缓存或离线制品中',
      '普通 Polygon 的多环和洞结构目前也没有 V2 对应能力',
      '2.0.0 的内置 `polygon` 只接受一维 `controlPoints`，当前只生成单环',
      '把外环和内环拆成多个单环元素会填满原来的洞',
      'lineStyles.polyline()',
      'lineStyles.polygon()',
      'animationTypes',
      'measureTypes',
      'shapeTypes',
      'stylePresets'
    ]) {
      expect(migration).toContain(contract);
    }

    for (const service of [
      'earth.elements;',
      'earth.layers;',
      'earth.styles;',
      'earth.animations;',
      'earth.draw;',
      'earth.transform;',
      'earth.measure;',
      'earth.events;',
      'earth.contextMenu;',
      'earth.overlays;',
      'earth.view;',
      'earth.controls;'
    ]) {
      expect(migration).toContain(service);
    }
  });
});
