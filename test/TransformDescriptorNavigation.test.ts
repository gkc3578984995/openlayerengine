import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Transform and Descriptor documentation navigation', () => {
  it('registers both tools as single pages in the map interaction group', async () => {
    const [navigation, router, layout] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8')
    ]);

    const interactionGroup = navigation.slice(navigation.indexOf("title: '地图交互'"));
    expect(interactionGroup).toContain("{ label: 'Transform 图形变换', to: '/components/transform' }");
    expect(interactionGroup).toContain("{ label: 'Descriptor 标牌', to: '/components/descriptor' }");

    expect(router).toContain("import TransformView from '../views/TransformView.vue';");
    expect(router).toContain("import DescriptorView from '../views/DescriptorView.vue';");
    expect(router).toMatch(/path: 'components\/transform',[\s\S]*?name: 'transform',[\s\S]*?component: TransformView/);
    expect(router).toMatch(/path: 'components\/descriptor',[\s\S]*?name: 'descriptor',[\s\S]*?component: DescriptorView/);

    expect(layout).toContain("'/components/transform': 'Transform 图形变换'");
    expect(layout).toContain("'/components/descriptor': 'Descriptor 标牌'");
  });
});
