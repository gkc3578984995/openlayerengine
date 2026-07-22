import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('website Element protection documentation', () => {
  it('publishes a canonical routed page and API ownership', async () => {
    const [navigation, router, modules, overview, publicApi] = await Promise.all([
      read('website/src/config/navigation.ts'),
      read('website/src/router/index.ts'),
      read('website/src/config/apiModules.ts'),
      read('website/src/views/elements/ElementOverviewView.vue'),
      read('V2_PUBLIC_API.md')
    ]);

    expect(navigation).toContain("{ label: '协同保护模式', to: '/components/elements/protection' }");
    expect(router).toContain("import('../views/elements/ElementProtectionView.vue')");
    expect(router).toContain("{ path: 'components/elements/protection', name: 'element-protection', component: ElementProtectionView }");
    expect(modules).toContain("id: 'elements-protection'");
    expect(modules).toContain("typeNames: ['ElementProtectionUpdate', 'ElementProtectionState']");
    expect(modules).toContain("'ElementService.setProtection': 'elements-protection'");
    expect(modules).toContain("'ElementService.getProtection': 'elements-protection'");
    expect(overview).toContain("href: '/components/elements/protection#api-method-set-protection'");
    expect(overview).toContain("href: '/components/elements/protection#api-method-get-protection'");
    expect(publicApi).toContain('type ElementProtectionUpdate');
    expect(publicApi).toContain('earth.elements.setProtection(point.id, protection)');
    expect(publicApi).toContain('ElementProtectedError');
  });

  it('documents runtime state, interaction boundaries and same-source methods', async () => {
    const view = await read('website/src/views/elements/ElementProtectionView.vue');

    expect(view).toContain("import ElementProtectionDemo from '../../examples/elements/ElementProtectionDemo.vue';");
    expect(view).toContain("import elementProtectionSource from '../../examples/elements/ElementProtectionDemo.vue?raw';");
    expect(view).toContain("extractExampleSnippet(elementProtectionSource, 'element-protection')");
    expect(view).toContain("extractExampleSnippet(elementProtectionSource, 'element-protection-interactions')");
    expect(view).toContain('<ElementProtectionDemo ref="elementProtectionDemoRef" />');
    expect(view).toContain('title="点、图片点、线与面保护"');
    expect(view).toContain('id="runtime-model"');
    expect(view).toContain('id="interaction-boundary"');
    expect(view).toContain('id="collaboration-ordering"');
    expect(view).toContain("anchor: 'api-method-set-protection'");
    expect(view).toContain("anchor: 'api-method-get-protection'");
    expect(view).toContain("const apiTypes = ['ElementProtectionUpdate', 'ElementProtectionState', 'ElementService'] as const;");
    expect(view).toContain("const apiMembers = { ElementService: ['setProtection', 'getProtection'] } as const;");
    expect(view.indexOf('<ExampleBlock')).toBeLessThan(view.indexOf('<PublicApiSection'));
  });

  it('runs protection for point, image point, line and polygon targets', async () => {
    const demo = await read('website/src/examples/elements/ElementProtectionDemo.vue');

    expect(demo).toContain("type DemoKind = 'point' | 'image' | 'polyline' | 'polygon';");
    expect(demo.match(/geometry: \{ type: 'point'/gu)).toHaveLength(2);
    expect(demo).toContain("type: 'icon'");
    expect(demo).toContain("type: 'polyline'");
    expect(demo).toContain("type: 'polygon'");
    expect(demo).toContain('earth.elements.setProtection(target.id, update)');
    expect(demo).toContain('earth.elements.getProtection(target.id)');
    expect(demo).toContain('expiresAt');
    expect(demo).toContain('error instanceof ElementProtectedError');
    expect(demo).toContain('earth.draw.edit(element');
    expect(demo).toContain('earth.transform.select(element');
    expect(demo).toContain('@click="tryBuiltInTransform"');
    expect(demo).toContain("createConfiguredLayer(earth, 'vector').update({ opacity: 0.46 })");
    expect(demo).toContain("earth.layers.add({ kind: 'vector', id: BUSINESS_LAYER_ID, zIndex: 30");
    expect(demo).toContain('defineExpose({ reset: seed, focusSelected })');
    expect(demo).toContain('earthRef.value?.destroy()');
    expect(await read('website/src/views/elements/ElementProtectionView.vue')).toContain('不会穿透并选中下层 Element');
  });

  it('keeps expiry refresh timers independent per Element and clears every timer at lifecycle boundaries', async () => {
    const demo = await read('website/src/examples/elements/ElementProtectionDemo.vue');

    expect(demo).toContain('const expiryRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>()');
    expect(demo).toContain('cancelExpiryRefresh(target.id)');
    expect(demo).toContain('expiryRefreshTimers.get(target.id) !== timer');
    expect(demo).toContain('expiryRefreshTimers.set(target.id, timer)');
    expect(demo).toContain('expiryRefreshTimers.delete(target.id)');
    expect(demo).toContain('for (const timer of expiryRefreshTimers.values()) clearTimeout(timer)');
    expect(demo).toContain('expiryRefreshTimers.clear()');
    expect(demo.match(/cancelAllExpiryRefreshes\(\);/gu)).toHaveLength(2);
    expect(demo).not.toContain('let expiryRefreshTimer:');
  });
});
