import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { shapeTypes } from '../src/index.js';

const read = (path: string) => readFile(path, 'utf8');

const elementDemoPaths = [
  'website/src/examples/elements/ElementOverviewDemo.vue',
  'website/src/examples/elements/ElementCreateDemo.vue',
  'website/src/examples/elements/ElementQueryDemo.vue',
  'website/src/examples/elements/ElementUpdateDemo.vue',
  'website/src/examples/elements/ElementProtectionDemo.vue',
  'website/src/examples/elements/ElementCleanupDemo.vue',
  'website/src/examples/elements/ShapesDemo.vue',
  'website/src/examples/elements/StylesDemo.vue',
  'website/src/examples/elements/LineworkDemo.vue'
] as const;

const snippetViewPaths = [
  'website/src/views/elements/ElementOverviewView.vue',
  'website/src/views/elements/ElementCreateView.vue',
  'website/src/views/elements/ElementQueryView.vue',
  'website/src/views/elements/ElementUpdateView.vue',
  'website/src/views/elements/ElementProtectionView.vue',
  'website/src/views/elements/ElementCleanupView.vue',
  'website/src/views/elements/ShapesView.vue',
  'website/src/views/elements/StylesView.vue',
  'website/src/views/elements/LineworkView.vue'
] as const;

const extractRegion = (source: string, region: string) => {
  const startMarker = `// #region ${region}`;
  const endMarker = `// #endregion ${region}`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `${region} should have a start marker`).toBeGreaterThanOrEqual(0);
  expect(end, `${region} should have an end marker`).toBeGreaterThan(start);
  return source.slice(start + startMarker.length, end);
};

const expectRecordKey = (source: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const alternatives = [`['"]${escaped}['"]`];
  if (/^[A-Za-z_$][\w$]*$/u.test(key)) alternatives.push(escaped);
  expect(source, `shapeExampleByType should declare ${key}`).toMatch(new RegExp(`^\\s*(?:${alternatives.join('|')})\\s*:`, 'mu'));
};

describe('website Element documentation', () => {
  it('derives the shared example catalog from all runtime ShapeTypes', async () => {
    const catalog = await read('website/src/config/shapeExamples.ts');
    const recordStart = catalog.indexOf('const definitions');
    const recordEnd = catalog.indexOf('satisfies Record<ShapeType', recordStart);

    expect(shapeTypes).toHaveLength(20);
    expect(recordStart).toBeGreaterThan(-1);
    expect(recordEnd).toBeGreaterThan(recordStart);
    expect(catalog).toMatch(/shapeExamples[\s\S]{0,240}shapeTypes\.map/u);
    expect(catalog).toContain('shapeExampleGroups');
    expect(catalog).toMatch(/shapeExampleByType[^=]*= Object\.freeze\(definitions\)/u);

    const recordSource = catalog.slice(recordStart, recordEnd);
    for (const type of shapeTypes) expectRecordKey(recordSource, type);
  });

  it('presents quick start, the complete gallery and structured API in task order', async () => {
    const view = await read('website/src/views/elements/ElementOverviewView.vue');
    const orderedSections = [
      'overview',
      'example-element-quick-start',
      'example-all-shapes',
      'common-workflows',
      'api-element',
      'api-element-service',
      'state-model'
    ].map((id) => view.indexOf(`id="${id}"`));
    orderedSections.push(view.indexOf('<PublicApiSection'));

    expect(orderedSections.every((index) => index >= 0)).toBe(true);
    expect(orderedSections).toEqual([...orderedSections].sort((left, right) => left - right));
    expect(view).toContain('创建第一个 Element');
    expect(view).toContain('全部 20 种 Shape');
    expect(view).toContain('<h2 class="doc-h2">Element API</h2>');
    expect(view).toContain('<h3 id="api-element-properties" class="doc-h3">属性</h3>');
    expect(view).toContain('<h3 id="api-element-methods" class="doc-h3">方法</h3>');
    expect(view).toContain("import ShapesDemo from '../../examples/elements/ShapesDemo.vue';");
    expect(view).toContain('<ShapesDemo ref="shapesDemoRef" />');
    expect(view.match(/<ExampleBlock\b/gu)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(view.match(/:snippet=/gu)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(view).toContain('<ApiTable');
    expect(view).toContain('ElementService API');
  });

  it('uses the shared shape catalog in both the catalog page and runnable gallery', async () => {
    const [view, demo] = await Promise.all([read('website/src/views/elements/ShapesView.vue'), read('website/src/examples/elements/ShapesDemo.vue')]);

    expect(view).toContain("from '../../config/shapeExamples';");
    expect(demo).toContain("from '../../config/shapeExamples';");
    expect(view).toMatch(/const shapeRows = shapeExamples\.map\(/u);
    expect(demo).toContain('v-for="group in filteredGroups"');
    expect(demo).toMatch(/geometry:\s*createShapeExampleInput\(/u);
  });

  it('documents and demonstrates complete Element geometry details', async () => {
    const [view, demo] = await Promise.all([read('website/src/views/elements/ElementOverviewView.vue'), read('website/src/examples/elements/ShapesDemo.vue')]);

    expect(view).toContain("name: 'geometryDetails'");
    expect(view).toContain("Element: ['constructor', 'id', 'state', 'geometryDetails', 'olFeature']");
    for (const typeName of ['ElementGeometryDetails', 'ElementRenderGeometry', 'MapExtent']) expect(view).toContain(`'${typeName}'`);
    expect(view).toContain('id="geometry-details"');
    expect(view).toContain("type: 'polygon'");
    for (const fieldName of ['extentPoints', 'rangePoints', 'controlPoints', 'center', 'radius', 'meters', 'projected']) {
      expect(view).toContain(`<code>${fieldName}</code>`);
      expect(demo).toContain(fieldName);
    }
    expect(view).toMatch(/Circle\s+返回冻结的空数组/u);
    expect(view).toContain('其他 Shape 的两个字段均为 <code>null</code>');
    expect(view).toContain('[minX, minY, maxX, maxY]');
    expect(view).toContain('earth.view.toGeographicCoordinates()');
    expect(view).toContain('不会把第 N 个世界中的坐标自动归一化到基础世界');

    expect(demo).toContain('const info = element.geometryDetails;');
    expect(demo).toContain('selectedGeometryDetails.value = info;');
    expect(demo).toContain('earth.view.toGeographicCoordinates(projectedCoordinate)');
    for (const label of ['范围角点', '最终轮廓点', '规范控制点', '圆心', '半径', '经纬度坐标示例']) expect(demo).toContain(`label="${label}"`);
    expect(demo).toContain('/api/types#api-type-element-geometry-details');
    expect(demo).toContain('/api/types#api-type-element-render-geometry');
    expect(demo).toContain('/api/types#api-type-map-extent');
  });

  it('keeps all Element demos free from diagnostic logs, result panels and JSON textareas', async () => {
    const demos = await Promise.all(elementDemoPaths.map(async (path) => ({ path, source: await read(path) })));

    for (const { path, source } of demos) {
      expect(source, path).not.toMatch(/\b(?:lastResult|inspection|styleJson|lineworkJson|geometryJson|logs?|result)\s*=\s*(?:ref|computed)\b/u);
      expect(source, path).not.toMatch(/class="[^"]*(?:__logs?|__result|__geometry-json|__output)[^"]*"/u);
      expect(source, path).not.toMatch(/<el-input\b[^>]*\btype="textarea"/su);
      expect(source, path).not.toContain('JSON.stringify');
      expect(source, path).not.toContain('操作日志');
      expect(source, path).not.toContain('状态 JSON');
    }
  });

  it('renders every map demo on a dedicated high layer over a weakened basemap', async () => {
    const demos = await Promise.all(elementDemoPaths.map(async (path) => ({ path, source: await read(path) })));

    for (const { path, source } of demos) {
      const opacity = source.match(/createConfiguredLayer\(earth,\s*'vector'\)\.update\(\{\s*opacity:\s*(0(?:\.\d+)?)\s*\}\)/u)?.[1];
      expect(opacity, `${path} should weaken its configured basemap`).toBeDefined();
      expect(Number(opacity), `${path} basemap opacity should stay below one`).toBeLessThan(1);
      expect(Number(opacity), `${path} basemap opacity should remain visible`).toBeGreaterThan(0);

      const layerZIndexes = [...source.matchAll(/earth\.layers\.add\(\{\s*kind:\s*'vector'[\s\S]*?\bzIndex:\s*(\d+)/gu)].map((match) => Number(match[1]));
      expect(
        layerZIndexes.some((zIndex) => zIndex >= 20),
        `${path} should add a dedicated vector layer at zIndex >= 20`
      ).toBe(true);
      expect(source, `${path} elements should target the dedicated layer`).toMatch(/\blayerId:\s*[A-Z][A-Z\d_]*_ID\b/u);
    }
  });

  it('shows one large Shape preview with numbered guides and navigation for the complete catalog', async () => {
    const demo = await read('website/src/examples/elements/ShapesDemo.vue');
    const previewScale = demo.match(/const PREVIEW_SCALE = ([\d_]+);/u)?.[1];
    const previewZoom = demo.match(/const PREVIEW_ZOOM = ([\d.]+);/u)?.[1];

    expect(demo).toContain("const DEFAULT_SHAPE: ShapeType = 'polygon';");
    expect(demo).toContain('const selectedType = ref<ShapeType>(DEFAULT_SHAPE);');
    expect(Number(previewScale?.replaceAll('_', ''))).toBeGreaterThanOrEqual(30_000);
    expect(Number(previewZoom)).toBeGreaterThanOrEqual(8);
    expect(demo).toContain('createShapeExampleInput(type, center, PREVIEW_SCALE)');
    expect(demo).toContain('earth.view.animateFlyTo(center, { zoom: PREVIEW_ZOOM, duration: 420 })');
    expect(demo).toContain('earth.elements.remove({ module: SHAPE_MODULE })');
    expect(demo).toContain('earth.elements.remove({ module: HIGHLIGHT_MODULE })');
    expect(demo).toContain('id: `shape-preview-control-${index + 1}`');
    expect(demo).toContain('text: String(index + 1)');
    expect(demo).toContain('lineDash: [9, 7]');
    expect(demo).toContain('const filteredGroups = computed(');
    expect(demo).toContain('v-for="group in filteredGroups"');
    expect(demo).toContain('v-for="example in group.examples"');
    expect(demo).toContain('@click="renderShape(example.type)"');
    expect(demo).toContain('placeholder="搜索中文名或 ShapeType"');
    expect(demo).toContain('aria-label="按图形类别筛选"');
    expect(demo).toContain('找到 {{ filteredCount }} / 20');
    expect(demo).toContain('href="/api/types#api-type-shape-type"');
    expect(demo).toContain('href="/api/types#api-type-shape-input"');
    expect(demo).toContain('href="/api/types#api-type-shape-state"');
    expect(demo).toContain('defineExpose({ reset, focusSelected })');

    const desktopLayout = demo.slice(demo.indexOf('@media (min-width: 1501px)'), demo.indexOf('@media (max-width: 1500px)'));
    expect(desktopLayout).toContain('align-items: stretch;');
    expect(desktopLayout).toContain('flex: 1 1 0;');
    expect(desktopLayout).toContain('height: 100%;');
    expect(desktopLayout).toContain('max-height: none;');
  });

  it('connects the overview example toolbar to stable reset and focus actions', async () => {
    const [view, demo] = await Promise.all([
      read('website/src/views/elements/ElementOverviewView.vue'),
      read('website/src/examples/elements/ElementOverviewDemo.vue')
    ]);

    expect(demo).toContain('defineExpose({ reset, focusSelected })');
    expect(view).toContain('ref="elementOverviewDemoRef"');
    expect(view).toContain('@reset="resetElementOverviewDemo"');
    expect(view).toContain('@focus="focusElementOverviewDemo"');
    expect(view).toContain('<PublicApiSection');
  });

  it('keeps create and query examples focused on their final visible workflows', async () => {
    const [createDemo, queryDemo] = await Promise.all([
      read('website/src/examples/elements/ElementCreateDemo.vue'),
      read('website/src/examples/elements/ElementQueryDemo.vue')
    ]);

    expect(createDemo).not.toContain('lastResult');
    expect(createDemo).not.toContain('createdIds');
    for (const type of ['point', 'polyline', 'circle']) {
      expect(queryDemo, `query demo should seed a ${type} geometry`).toMatch(new RegExp(`geometry:\\s*\\{[\\s\\S]{0,100}?type:\\s*'${type}'`, 'u'));
    }
    expect(queryDemo).not.toContain('atPixel(视口中心)');
    expect(queryDemo).toContain('earth.elements.atPixel<DemoData>([event.pixel[0]!, event.pixel[1]!])');
    expect(queryDemo).toContain("earth.map.on('singleclick', hitAtPixel)");
    expect(queryDemo).toContain("earthRef.value?.map.un('singleclick', hitAtPixel)");
    expect(queryDemo).toContain('class="element-query-demo__screen-extent"');
  });

  it('guards cleared colors and keeps ordinary Linework changes from repeatedly flying the view', async () => {
    const [stylesDemo, lineworkDemo, lineworkView] = await Promise.all([
      read('website/src/examples/elements/StylesDemo.vue'),
      read('website/src/examples/elements/LineworkDemo.vue'),
      read('website/src/views/elements/LineworkView.vue')
    ]);

    expect(stylesDemo).toMatch(/const accentColor = ref<string \| null>\(/u);
    expect(stylesDemo).toMatch(/accentColor\.value \?\? ['"]#[\da-f]+['"]/iu);
    expect(lineworkDemo).toMatch(/const color = ref<string \| null>\(/u);
    expect(lineworkDemo).toMatch(/computed\(\(\) => color\.value \?\? ['"]#[\da-f]+['"]\)/iu);

    const factorySnippet = extractRegion(lineworkDemo, 'linework-factory');
    expect(factorySnippet).toContain('lineStyles.polyline({');
    expect(factorySnippet).toContain('lineStyles.polygon({');
    expect(factorySnippet).toContain('repeatSpacingPx: repeatSpacingPx.value');
    expect(lineworkView).toContain("extractExampleSnippet(lineworkSource, 'linework-factory')");
    expect(lineworkView).toContain("extractExampleSnippet(lineworkSource, 'linework-apply')");
    expect(lineworkView).toContain("name: 'repeatSpacingPx'");
    expect(lineworkView).toContain("'InlinePathTextPlacementSpec'");
    expect(lineworkView).toContain('间距按相邻副本的锚点计算');
    expect(lineworkDemo).toContain('v-model="repeatEnabled"');
    expect(lineworkDemo).toContain('v-model="repeatSpacingPx"');
    expect(lineworkDemo).toContain("'累计长度中点一次'");
    expect(lineworkDemo).toContain('const applyLinework = (focus = false) =>');
    expect(lineworkDemo).toMatch(/watch\(kind,\s*\(\) => applyLinework\(true\)/u);
    expect(lineworkDemo).toMatch(
      /watch\(\[tracks, decoration, startCap, endCap, color, inlineText, repeatEnabled, repeatSpacingPx\],\s*\(\) => applyLinework\(\)/u
    );
    expect(lineworkDemo).toContain('if (focus) earth.view.animateFlyTo');
  });

  it('demonstrates the nativeStyle success, atomic failure and structured recovery loop', async () => {
    const [demo, view] = await Promise.all([read('website/src/examples/elements/StylesDemo.vue'), read('website/src/views/elements/StylesView.vue')]);

    expect(demo).toContain('// #region native-style-boundary');
    expect(demo).toContain('earth.styles.set({ id: PREVIEW_ID }, { nativeStyle: createNativePreviewStyle() })');
    expect(demo).toContain('error instanceof UnsupportedOperationError');
    expect(demo).toContain('state.style === beforeStyle');
    expect(demo).toContain('const restoreStructuredPreset = () =>');
    expect(view).toContain("extractExampleSnippet(stylesSource, 'native-style-boundary')");
    expect(view).toMatch(/原\s*NativeStyleRef 保持不变/u);
  });

  it('uses focused snippets on every task-oriented Element page', async () => {
    const views = await Promise.all(snippetViewPaths.map(async (path) => ({ path, source: await read(path) })));

    for (const { path, source } of views) {
      expect(source, path).toContain('extractExampleSnippet');
      expect(source, path).toMatch(/<ExampleBlock\b[^>]*\s:snippet="[^"]+"/su);
      expect(source, path).toMatch(/<ExampleBlock\b[^>]*\ssource-lang="vue"/su);
      expect(source, path).toMatch(/<ExampleBlock\b[^>]*\ssnippet-lang="typescript"/su);
    }
  });
});
