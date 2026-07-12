import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('website API presentation', () => {
  it('gives API columns semantic property and method presentation classes', async () => {
    const apiTable = await readFile('website/src/components/docs/ApiTable.vue', 'utf8');

    expect(apiTable).toContain("presentation?: 'property' | 'method';");
    expect(apiTable).toContain(':class="col.presentation ? `api-table__${col.presentation}` : undefined"');
    expect(apiTable).toContain('v-html="row[col.prop] || \'—\'"');
  });

  it('marks all API name columns and constructor sections with semantic presentation', async () => {
    const [earthCreate, globalMethods, pointLayer] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/views/PointLayerView.vue', 'utf8')
    ]);

    expect(earthCreate).toContain("{ prop: 'name', label: '属性名', width: 160, presentation: 'property' }");
    expect(earthCreate).toContain("{ prop: 'name', label: '方法名', width: 260, presentation: 'method' }");
    expect(globalMethods).toContain("{ prop: 'name', label: '方法名', width: 280, presentation: 'method' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '属性名', width: 140, presentation: 'property' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '方法名', width: 240, presentation: 'method' }");
    expect(pointLayer).toContain("{ prop: 'name', label: '属性', width: 160, presentation: 'property' }");

    for (const view of [earthCreate, pointLayer]) {
      expect(view).toContain('class="api-constructor"');
      expect(view).toContain('class="api-constructor__signature"');
    }
  });

  it('defines the shared visual hierarchy and documents it for contributors', async () => {
    const [styles, rules] = await Promise.all([readFile('website/src/assets/styles/index.scss', 'utf8'), readFile('website/AGENTS.md', 'utf8')]);

    expect(styles).toContain('.api-constructor {');
    expect(styles).toContain('.api-constructor__signature code {');
    expect(styles).toContain('.api-table__property {');
    expect(styles).toContain('.api-table__property a {');
    expect(styles).toContain('.api-table__method {');
    expect(styles).toContain('.api-table__method .code-fn {');
    expect(styles).toMatch(/\.api-table__method\s*\{[^}]*background: var\(--el-fill-color, #f0f2f5\);[^}]*font-family:/s);
    expect(styles).not.toContain('.api-table code.code-fn {');
    expect(rules).toContain('API 表格中的构造器、属性名和方法名使用固定视觉层级');
    expect(rules).toContain('api-table__property');
    expect(rules).toContain('api-table__method');
    expect(rules).toContain('浅灰背景的深灰代码块');
    expect(rules).toContain('api-constructor__signature');
    expect(rules).toContain('相关类型定义应位于构造参数之后、方法之前');
    expect(rules).toContain('每个类型定义必须拥有独立的右侧锚点');
    expect(rules).toContain('方法名列只展示方法名称');
    expect(rules).toContain('无参数的方法在参数列中使用 `—`');
  });

  it('renders third-level API outline entries with a distinct style', async () => {
    const [pageAnchor, styles] = await Promise.all([
      readFile('website/src/components/docs/PageAnchor.vue', 'utf8'),
      readFile('website/src/assets/styles/index.scss', 'utf8')
    ]);

    expect(pageAnchor).toContain('v-for="grandchild in child.children"');
    expect(pageAnchor).toContain('class="page-anchor__grandchild"');
    expect(styles).toContain('.page-anchor__grandchild.el-anchor__item {');
  });

  it('uses only the parent menu name in the PointLayer eyebrow', async () => {
    const [pointLayer, rules] = await Promise.all([readFile('website/src/views/PointLayerView.vue', 'utf8'), readFile('website/AGENTS.md', 'utf8')]);

    expect(pointLayer).toContain('<span class="doc-hero__eyebrow">基础图层</span>');
    expect(pointLayer).not.toContain('API 自动同步');
    expect(rules).toContain('顶部眉标题只展示父级菜单名称');
  });

  it('orders PointLayer types before methods and exposes every type in the outline', async () => {
    const [pointLayer, helpers] = await Promise.all([
      readFile('website/src/views/PointLayerView.vue', 'utf8'),
      readFile('website/src/docs/pointLayerApi.ts', 'utf8')
    ]);

    expect(pointLayer.indexOf('<h3 id="api-types"')).toBeLessThan(pointLayer.indexOf('<h3 id="api-methods"'));
    expect(pointLayer).toContain("id: 'api-types'");
    expect(pointLayer).toContain("label: '类型定义'");
    expect(pointLayer).toContain('children: [');
    for (const id of ['api-pointparam', 'api-setpointparam', 'api-type-irgbcolor', 'api-type-ifill', 'api-type-istroke', 'api-type-ilabel']) {
      expect(pointLayer).toContain(`{ id: '${id}'`);
    }
    expect(helpers).toContain("const methodName = row.name.split('(', 1)[0];");
    expect(helpers).toContain('return { ...row, name: methodName, params: linkDocumentedTypes(method.params)');
    expect(helpers).toContain('return { ...row, name: methodName, params: method.params, returns: method.returns };');
  });

  it('keeps quick-start API method names signature-free and links documented references', async () => {
    const [earthCreate, globalMethods] = await Promise.all([
      readFile('website/src/views/EarthCreateView.vue', 'utf8'),
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8')
    ]);
    const earthScript = earthCreate.split('</script>', 1)[0];
    const globalScript = globalMethods.split('</script>', 1)[0];

    for (const source of [earthScript, globalScript]) {
      expect(source).not.toMatch(/name:\s*['"][^'"]*\(/);
    }

    for (const method of ['addLayer', 'removeLayer', 'createOsmLayer', 'createXyzLayer', 'flyTo', 'animateFlyTo', 'destroy']) {
      expect(earthScript).toContain(`name: '${method}'`);
    }
    for (const method of [
      'flyTo',
      'animateFlyTo',
      'flyHome',
      'enableGraticule',
      'disableGraticule',
      'enableScaleLine',
      'disableScaleLine',
      'setMouseStyle',
      'setMouseStyleToCrosshair',
      'setMouseStyleToDefault',
      'disabledMapDrag',
      'enableMapDrag',
      'getFeatureAtPixel',
      'getLayerAtFeature'
    ]) {
      expect(globalScript).toContain(`name: '${method}'`);
    }
    for (const [method, path, anchor] of [
      ['useGlobalEvent', '/components/global-event', 'api-constructor'],
      ['useContextMenu', '/components/context-menu', 'api-constructor'],
      ['useDrawTool', '/components/dynamic-draw', 'api-constructor'],
      ['useMeasure', '/components/measure', 'api-methods']
    ]) {
      expect(globalScript).toContain(`name: '<code class="code-fn"><a href="${path}#${anchor}">${method}</a></code>'`);
    }

    expect(earthCreate).toContain('<code><a href="#api-constructor">Earth</a></code> 是所有图层能力的入口');
    expect(earthCreate).toContain('每个 <code><a href="#api-constructor">Earth</a></code> 实例');
    expect(globalMethods).toContain('<code class="code-fn"><a href="#api-methods">flyHome</a></code>');
    expect(globalMethods).toContain('<code class="code-fn"><a href="#api-methods">getFeatureAtPixel</a></code>');
  });

  it('labels the Earth instance-method page consistently without changing its route', async () => {
    const [navigation, layout, globalMethods, router] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8'),
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8')
    ]);

    expect(navigation).toContain("{ label: 'Earth 实例方法', to: '/guide/global-methods' }");
    expect(layout).toContain("return 'Earth 实例方法';");
    expect(globalMethods).toContain('<h1>Earth 实例方法</h1>');
    expect(globalMethods).toContain('<PageAnchor title="Earth 实例方法" :items="anchors" />');
    expect(router).toContain("path: 'guide/global-methods'");
  });

  it('keeps linked Earth method names in the API-table method presentation', async () => {
    const [globalMethods, styles] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/assets/styles/index.scss', 'utf8')
    ]);

    expect(globalMethods).toContain('<code class="code-fn"><a href="/components/global-event#api-constructor">useGlobalEvent</a></code>');
    expect(globalMethods).toContain('<code class="code-fn"><a href="/components/context-menu#api-constructor">useContextMenu</a></code>');
    expect(styles).toMatch(/\.api-table__method \.code-fn a\s*\{[^}]*color: inherit;/s);
  });
});
