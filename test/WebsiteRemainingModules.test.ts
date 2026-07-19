import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const remainingViews = [
  'website/src/views/elements/ElementOverviewView.vue',
  'website/src/views/elements/ElementCreateView.vue',
  'website/src/views/elements/ElementQueryView.vue',
  'website/src/views/elements/ElementUpdateView.vue',
  'website/src/views/elements/ElementCleanupView.vue',
  'website/src/views/elements/ShapesView.vue',
  'website/src/views/elements/StylesView.vue',
  'website/src/views/elements/LineworkView.vue',
  'website/src/views/interactions/DrawView.vue',
  'website/src/views/interactions/EditView.vue',
  'website/src/views/interactions/MeasureView.vue',
  'website/src/views/interactions/TransformView.vue',
  'website/src/views/presentation/AnimationsView.vue',
  'website/src/views/services/ContextMenuView.vue',
  'website/src/views/services/EventsView.vue',
  'website/src/views/services/OverlaysView.vue',
  'website/src/views/services/DescriptorView.vue',
  'website/src/views/reference/UtilsView.vue',
  'website/src/views/reference/ErrorsView.vue'
] as const;

describe('website remaining V2 modules', () => {
  it('replaces every planned page with a full same-source documentation page', () => {
    for (const viewPath of remainingViews) {
      expect(existsSync(resolve(process.cwd(), viewPath)), `${viewPath} should exist`).toBe(true);
      const view = read(viewPath);

      expect(view).toContain('<ExampleBlock');
      expect(view).toContain('.vue?raw');
      expect(view).toContain('<PageAnchor');
      expect(view).toContain('<PublicApiSection');
      expect(view).toMatch(/id="example-[^"]+"/);
      expect(view).not.toContain('页面尚未编写');

      const sourceImport = view.match(/from ['"]([^'"]+\.vue)\?raw['"]/u)?.[1];
      expect(sourceImport, `${viewPath} should import its demo source`).toBeDefined();
      const demoPath = resolve(process.cwd(), dirname(viewPath), sourceImport as string);
      expect(existsSync(demoPath), `${demoPath} should exist`).toBe(true);

      const demo = readFileSync(demoPath, 'utf8');
      expect(demo).toContain('<el-');
      expect(demo).not.toMatch(/<(?:button|input|select|textarea)\b/u);
      expect(demo).not.toMatch(/<el-timeline\b|(?:const\s+)?(?:event)?logs\s*=/u);
      if (/\b(?:new Earth|useEarth)\s*\(/u.test(demo)) {
        expect(demo).toContain('onBeforeUnmount');
        expect(demo).toMatch(/\.destroy\(\)/u);
      }
    }
  });

  it('renders complete properties, constructors, methods and runtime exports from generated TypeDoc data', () => {
    const publicApi = read('website/src/components/docs/PublicApiSection.vue');

    expect(publicApi).toContain("import { apiCatalog, apiRuntimeExports } from '../../generated/api';");
    expect(publicApi).toContain('entry.constructors');
    expect(publicApi).toContain('entry.typeParameters');
    expect(publicApi).toContain('propertyRows(entry)');
    expect(publicApi).toContain('entry.methods');
    expect(publicApi).toContain('entry.signatures');
    expect(publicApi).toContain('signature.typeParameters');
    expect(publicApi).toContain('selectedRuntime');
  });

  it('documents every interaction API with a focused runnable example and no log panel', () => {
    const pages = [
      {
        name: 'Draw',
        view: 'website/src/views/interactions/DrawView.vue',
        demo: 'website/src/examples/interactions/DrawSessionDemo.vue',
        example: 'example-draw-session',
        types: ['DrawService', 'DrawOptions', 'DrawSession', 'DrawSessionEventMap'],
        members: ['start()', 'query() / clear()', 'status / results / finished', 'undo() / redo()', 'finish() / cancel() / destroy()', 'on()'],
        regions: ['draw-session-lifecycle', 'draw-query-clear']
      },
      {
        name: 'Edit',
        view: 'website/src/views/interactions/EditView.vue',
        demo: 'website/src/examples/interactions/EditSessionDemo.vue',
        example: 'example-edit-session',
        types: ['DrawService', 'EditOptions', 'EditSession', 'EditSessionEventMap'],
        members: ['edit()', 'element / status / finished', 'undo() / redo()', 'finish() / cancel() / destroy()', 'on()'],
        regions: ['edit-session-control-points']
      },
      {
        name: 'Measure',
        view: 'website/src/views/interactions/MeasureView.vue',
        demo: 'website/src/examples/interactions/MeasureSessionDemo.vue',
        example: 'example-measure-session',
        types: ['MeasureService', 'MeasureOptions', 'MeasureSession', 'MeasureSessionEventMap', 'MeasureResult', 'MeasureType'],
        members: ['start()', 'clear()', 'status / finished', 'finish() / cancel()', 'on()'],
        regions: ['measure-options-and-results']
      },
      {
        name: 'Transform',
        view: 'website/src/views/interactions/TransformView.vue',
        demo: 'website/src/examples/interactions/TransformSessionDemo.vue',
        example: 'example-transform-session',
        types: [
          'TransformService',
          'TransformOptions',
          'TransformSession',
          'TransformEventMap',
          'TransformReplaceOptions',
          'TransformToolbarHandle',
          'TransformToolbarOptions',
          'TransformToolbarOptionsPatch',
          'TransformToolbarItemSpec',
          'TransformToolbarItemPatch'
        ],
        members: ['start() / select()', 'select() / replaceSelected()', 'copy() / remove()', 'updateOptions() / show() / hide() / destroy()'],
        regions: ['transform-start-select-replace', 'transform-session-and-toolbar']
      }
    ] as const;

    for (const page of pages) {
      const view = read(page.view);
      const demo = read(page.demo);
      expect(view, page.name).toContain('<PublicApiSection');
      expect(view, page.name).not.toContain('<ApiQuickLinks');
      expect(view, page.name).toContain(`href="#${page.example}"`);
      for (const type of page.types) expect(view, `${page.name} should expose ${type}`).toContain(`'${type}'`);
      for (const member of page.members) expect(view, `${page.name} should map ${member} to its example`).toContain(member);
      for (const region of page.regions) expect(demo, `${page.name} should keep the ${region} same-source region`).toContain(`// #region ${region}`);
      expect(demo, page.name).toContain('createConfiguredLayer');
      expect(demo, page.name).toContain('onBeforeUnmount');
      expect(demo, page.name).not.toMatch(/<el-timeline\b|(?:const\s+)?(?:event)?logs\s*=|JSON\.stringify|<pre\b/u);
    }

    const measureDemo = read('website/src/examples/interactions/MeasureSessionDemo.vue');
    expect(measureDemo).toContain('formatter:');
    expect(measureDemo).toContain('line:');
    expect(measureDemo).toContain('point:');
    expect(measureDemo).toContain('text:');
    const transformDemo = read('website/src/examples/interactions/TransformSessionDemo.vue');
    expect(transformDemo).toContain('replaceSelected(next, { retainHistory: false })');
    expect(transformDemo).toContain("toolbar.updateItem('remove'");
    expect(transformDemo).toContain('toolbar.updateOptions(');
  });

  it('removes the placeholder from active routing while preserving the legacy type-catalog deep link', () => {
    const router = read('website/src/router/index.ts');

    expect(router).not.toContain('PlannedModuleView');
    expect(router).not.toContain('plannedRoutes');
    expect(router).toContain("path: 'components/reference/types'");
    expect(router).toContain("redirect: (to) => ({ path: '/api/types', query: to.query, hash: to.hash })");
    for (const viewPath of remainingViews) {
      const relativeImport = viewPath.replace(/^website\/src\//u, '../').replace(/\.vue$/u, '.vue');
      expect(router).toContain(`import('${relativeImport}')`);
    }
  });
});
