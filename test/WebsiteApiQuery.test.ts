import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { apiModules, findApiModuleByMember, findApiModuleByRuntimeExport } from '../website/src/config/apiModules';
import { apiCatalog, apiRuntimeExports } from '../website/src/generated/api';

const read = (path: string) => readFile(path, 'utf8');

describe('website API query', () => {
  it('assigns every generated type and runtime export to exactly one module', () => {
    const assignedTypes = apiModules.flatMap((module) => module.typeNames);
    const assignedRuntime = apiModules.flatMap((module) => module.runtimeNames);
    const catalogTypes = apiCatalog.map((item) => item.name);
    const runtimeNames = apiRuntimeExports.map((item) => item.name);

    expect(new Set(assignedTypes).size).toBe(assignedTypes.length);
    expect(new Set(assignedRuntime).size).toBe(assignedRuntime.length);
    expect([...assignedTypes].sort()).toEqual([...catalogTypes].sort());
    expect([...assignedRuntime].sort()).toEqual([...runtimeNames].sort());
    expect(findApiModuleByRuntimeExport('useEarth')?.id).toBe('quick-create');
    expect(findApiModuleByMember('ElementService', 'add')?.id).toBe('elements-create');
    expect(findApiModuleByMember('ElementService', 'atPixel')?.id).toBe('elements-query');
    expect(findApiModuleByMember('ElementService', 'setProtection')?.id).toBe('elements-protection');
    expect(findApiModuleByMember('ElementService', 'getProtection')?.id).toBe('elements-protection');
    expect(findApiModuleByMember('Element', 'remove')?.id).toBe('elements-cleanup');
    expect(findApiModuleByMember('DrawService', 'edit')?.id).toBe('interactions-edit');
    expect(findApiModuleByMember('OverlayService', 'createDescriptor')?.id).toBe('services-descriptor');
  });

  it('provides independent method and type query pages with grouped search and exact links', async () => {
    const [layout, methods, types, router] = await Promise.all([
      read('website/src/layouts/ApiQueryLayout.vue'),
      read('website/src/views/api/ApiMethodsView.vue'),
      read('website/src/views/api/ApiTypesView.vue'),
      read('website/src/router/index.ts')
    ]);

    expect(layout).toContain('v-for="item in apiNavItems"');
    expect(layout).toContain('@select="onApiMenuSelect"');
    expect(methods).toContain("kind: 'constructor'");
    expect(methods).toContain("item.kind === 'function' ? 'function' : 'constant'");
    expect(methods).toContain('for (const method of item.methods)');
    expect(methods).toContain('v-model="keyword"');
    expect(methods).toContain('const pageSize = ref(20);');
    expect(methods).toContain('const pagedEntries = computed');
    expect(methods).toContain('<el-pagination');
    expect(methods).toContain("method: 'primary'");
    expect(methods).toContain('v-for="group in groups"');
    expect(methods).toContain(':id="entry.anchor"');
    expect(types).toContain("type CatalogKind = 'class' | 'interface' | 'typeAlias';");
    expect(types).toContain('v-model="keyword"');
    expect(types).toContain('v-for="group in groups"');
    expect(types).toContain(':href="definitionHref(scope.row.anchor)"');
    expect(types).toContain(':href="definitionHref(signature.anchor)"');
    expect(types).toContain(':href="definitionHref(parameter.anchor)"');
    expect(types).toContain('v-if="expanded.includes(item.anchor)"');
    expect(router).toContain("{ path: 'methods', name: 'api-methods', component: ApiMethodsView }");
    expect(router).toContain("{ path: 'types', name: 'api-types', component: ApiTypesView }");
  });

  it('uses /api/types as a complete, hash-addressable type catalog', async () => {
    const types = await read('website/src/views/api/ApiTypesView.vue');

    expect(types).toContain('const definitionHref = (anchor: string): string => `/api/types#${anchor}`;');
    expect(types).toContain('const containsAnchor =');
    expect(types).toContain('const revealHash = async');
    expect(types).toContain('() => route.hash');
    expect(types).toContain('expanded.value = [...expanded.value, item.anchor]');
    expect(types).toContain('variant.properties');
    expect(types).toContain('formatDefaultValue(scope.row.defaultValue)');
    expect(types).toContain('signature.typeParameters.length > 0');
    expect(types).toContain('<TypeExpression :value="signature.returns" />');
    expect(types).toContain('signature.throws?.length');
    expect(types).toContain(':id="parameter.anchor"');

    const shapeInput = apiCatalog.find((item) => item.name === 'ShapeInput');
    const animationSpec = apiCatalog.find((item) => item.name === 'AnimationSpec');
    const descriptorSpec = apiCatalog.find((item) => item.name === 'DescriptorSpec');

    expect(shapeInput?.variants.map((variant) => variant.properties.map((property) => property.name))).toEqual([
      ['center', 'radius', 'type'],
      ['controlPoints', 'type']
    ]);
    expect(animationSpec?.variants).toHaveLength(10);
    expect(animationSpec?.variants.every((variant) => variant.properties.some((property) => property.name === 'type'))).toBe(true);
    expect(descriptorSpec?.variants).toHaveLength(2);
    expect(descriptorSpec?.variants.every((variant) => variant.properties.some((property) => property.name === 'content'))).toBe(true);

    const variantAnchors = apiCatalog.flatMap((item) =>
      item.variants.flatMap((variant) => [variant.anchor, ...variant.properties.map((property) => property.anchor)])
    );
    expect(variantAnchors.every((anchor) => anchor.startsWith('api-type-'))).toBe(true);
    expect(new Set(variantAnchors).size).toBe(variantAnchors.length);
  });

  it('keeps Descriptor as a service peer and preserves its previous deep link', async () => {
    const [navigation, router, overlays] = await Promise.all([
      read('website/src/config/navigation.ts'),
      read('website/src/router/index.ts'),
      read('website/src/views/services/OverlaysView.vue')
    ]);

    expect(navigation).toContain("{ label: 'Descriptor', to: '/components/services/descriptor' }");
    expect(navigation).not.toContain("children: [{ label: 'Descriptor'");
    expect(router).toContain("{ path: 'components/services/overlays/descriptor', redirect: '/components/services/descriptor' }");
    expect(overlays).toContain('/components/services/descriptor#api-service-create-descriptor');
  });
});
