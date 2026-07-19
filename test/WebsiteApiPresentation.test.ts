import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('website V2 API presentation', () => {
  it('renders exported identifiers in type expressions as exact catalog links', async () => {
    const [apiTable, typeExpression, catalogView] = await Promise.all([
      read('website/src/components/docs/ApiTable.vue'),
      read('website/src/components/docs/TypeExpression.vue'),
      read('website/src/views/api/ApiTypesView.vue')
    ]);

    expect(apiTable).toContain('linkTypes?: boolean;');
    expect(apiTable).toContain('<TypeExpression v-if="col.linkTypes"');
    expect(apiTable).toContain('underline="never"');
    expect(typeExpression).toContain("import { publicTypeAnchors } from '../../generated/api';");
    expect(typeExpression).toContain("path: '/api/types'");
    expect(typeExpression).toContain('hash: `#${part.anchor}`');
    expect(typeExpression).toContain('查看 ${part.text} 类型定义');

    expect(catalogView).toContain('const containsAnchor =');
    expect(catalogView).toContain("anchor.startsWith('api-type-')");
    expect(catalogView).toContain('expanded.value = [...expanded.value, item.anchor]');
    expect(catalogView).toContain(':id="scope.row.anchor"');
    expect(catalogView).toContain(':id="parameter.anchor"');
  });

  it('keeps property, method, type and constructor semantics visibly distinct', async () => {
    const [apiTable, apiReference, styles, rules] = await Promise.all([
      read('website/src/components/docs/ApiTable.vue'),
      read('website/src/components/docs/ApiReference.vue'),
      read('website/src/assets/styles/index.scss'),
      read('website/AGENTS.md')
    ]);

    expect(apiTable).toContain("| 'type';");
    expect(apiTable).toContain(':class="col.presentation ? `api-table__${col.presentation}` : undefined"');
    expect(apiReference).toContain("type ApiReferenceKind = 'method' | 'property' | 'type' | 'constructor';");
    for (const selector of ['.api-constructor {', '.api-table__property {', '.api-table__method {', '.api-table__type {', '.type-expression__link {']) {
      expect(styles).toContain(selector);
    }
    expect(rules).toContain('不能只依赖颜色区分语义');
    expect(rules).toContain('OpenLayers 外部类型');
  });

  it('fully documents the four core pages with same-source runnable examples', async () => {
    const pageEntries = [
      ['EarthInstanceView', 'EarthInstanceDemo', 'Earth API'],
      ['ViewServiceView', 'ViewServiceDemo', 'ViewService API'],
      ['LayerServiceView', 'LayerServiceDemo', 'Layers API'],
      ['ControlServiceView', 'ControlServiceDemo', 'ControlService API']
    ] as const;

    for (const [viewName, demoName, heading] of pageEntries) {
      const view = await read(`website/src/views/${viewName}.vue`);
      const demo = await read(`website/src/examples/${demoName}.vue`);

      expect(view).toContain(`import ${demoName} from '../examples/${demoName}.vue';`);
      expect(view).toContain(`import ${demoName[0].toLowerCase()}${demoName.slice(1, -4)}Source from '../examples/${demoName}.vue?raw';`);
      expect(view).toContain(heading);
      expect(view).toContain('<ExampleBlock');
      expect(view).toContain('<ApiTable');
      expect(view).toContain('<PageAnchor');
      expect(demo).toContain('<el-');
      expect(demo).toContain('onBeforeUnmount');
      expect(demo).toContain('.destroy()');
      expect(demo).not.toMatch(/<(?:button|input|select|textarea)\b/);
    }
  });

  it('links every core parameter table to the generated type catalog', async () => {
    const pages = await Promise.all([
      read('website/src/views/EarthInstanceView.vue'),
      read('website/src/views/ViewServiceView.vue'),
      read('website/src/views/LayerServiceView.vue'),
      read('website/src/views/ControlServiceView.vue')
    ]);

    for (const page of pages) {
      expect(page).toContain("{ prop: 'params', label: '参数'");
      expect(page).toContain('linkTypes: true');
      expect(page).toContain('/api/types#api-type-');
    }

    expect(pages[0]).toContain('options: UseEarthOptions');
    expect(pages[1]).toContain('options?: FlyToOptions');
    expect(pages[2]).toContain('spec: PublicLayerSpec');
    expect(pages[3]).toContain('options?: GraticuleOptions');
  });

  it('expands the OpenLayers control aliases without pretending their fields are local exports', async () => {
    const controls = await read('website/src/views/ControlServiceView.vue');

    for (const property of ['showLabels', 'lonLabelFormatter', 'latLabelFormatter', 'strokeStyle', 'intervals', 'wrapX', 'properties']) {
      expect(controls).toContain(`name: '${property}'`);
    }
    for (const property of ['minWidth', 'maxWidth', 'render', 'target', 'units', 'bar', 'steps', 'text', 'dpi']) {
      expect(controls).toContain(`name: '${property}'`);
    }
    expect(controls).toContain('类型目录可查询它的导出身份与别名表达式');
    expect(controls).toContain('OpenLayers 外部描边类型');
  });

  it('provides a generated, searchable catalog for every root-exported type', async () => {
    const [view, generator, coverage] = await Promise.all([
      read('website/src/views/api/ApiTypesView.vue'),
      read('scripts/docs/api-docs.mjs'),
      read('scripts/docs/check-api-coverage.mjs')
    ]);

    expect(view).toContain('v-model="keyword"');
    expect(view).toContain('v-model="selectedKind"');
    expect(view).toContain('v-for="group in groups"');
    expect(view).toContain('v-for="item in group.items"');
    expect(view).toContain('<TypeExpression :value="item.type" />');
    expect(generator).toContain('export const apiCatalog =');
    expect(generator).toContain('export const publicTypeAnchors =');
    expect(coverage).toContain('model.apiCatalog.length === 152');
    expect(coverage).toContain('api-type-use-earth-options-property-target');
    expect(coverage).toContain('api-type-view-service-method-fly-to');
  });

  it('keeps the catalog readable in semantic themes and narrow layouts', async () => {
    const styles = await read('website/src/assets/styles/index.scss');

    expect(styles).toMatch(/\.type-catalog__filters\s*\{[^}]*grid-template-columns:/s);
    expect(styles).toMatch(/\.type-catalog__signature\s*\{[^}]*var\(--doc-surface-soft\)/s);
    expect(styles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.type-catalog__filters\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(styles).toContain('.type-expression__link:focus-visible {');
  });
});
