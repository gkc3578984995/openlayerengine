import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readOptional = async (path: string) => readFile(path, 'utf8').catch(() => '');

describe('layer method demo coverage', () => {
  it('places the common layer operations page before PointLayer in the base-layer menu', async () => {
    const [navigation, router, layout, commonView] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8'),
      readOptional('website/src/views/LayerCommonView.vue')
    ]);

    expect(navigation).toContain("{ label: '图层通用操作', to: '/components/layer-common' }");
    expect(navigation.indexOf("{ label: '图层通用操作'")).toBeLessThan(navigation.indexOf("{ label: 'PointLayer 点图层'"));
    expect(router).toContain("path: 'components/layer-common'");
    expect(layout).toContain("route.path === '/components/layer-common'");
    expect(commonView).toContain('<h1>图层通用操作</h1>');
  });

  it('covers PointLayer own methods and inherited Base methods with runnable examples', async () => {
    const [basic, style, flash, update, commonDemo, rules] = await Promise.all([
      readFile('website/src/examples/PointLayerBasicDemo.vue', 'utf8'),
      readFile('website/src/examples/PointLayerStyleDemo.vue', 'utf8'),
      readFile('website/src/examples/PointLayerFlashDemo.vue', 'utf8'),
      readFile('website/src/examples/PointLayerUpdateDemo.vue', 'utf8'),
      readOptional('website/src/examples/LayerCommonDemo.vue'),
      readFile('website/AGENTS.md', 'utf8')
    ]);
    const pointLayerExamples = [basic, style, flash, update].join('\n');

    for (const method of ['add', 'set', 'setPosition', 'continueFlash', 'stopFlash', 'remove']) {
      expect(pointLayerExamples).toContain(`.${method}(`);
    }
    for (const method of ['getUpdatedParam', 'get', 'hide', 'show', 'setLayerOpacity', 'setLayerIndex', 'getLayer', 'destroy']) {
      expect(commonDemo).toContain(`.${method}(`);
    }
    expect(rules).toContain('每个图层自有方法必须至少在本页运行示例中调用一次');
    expect(rules).toContain('继承自 Base 的通用方法必须集中在“图层通用操作”页面演示');
  });

  it('documents inherited methods with API and usage notes instead of a coverage section', async () => {
    const commonView = await readFile('website/src/views/LayerCommonView.vue', 'utf8');

    expect(commonView).toContain("import ApiTable from '../components/docs/ApiTable.vue';");
    expect(commonView).toContain("import { getBaseMethodRows } from '../docs/pointLayerApi';");
    expect(commonView).toContain('<section id="api" class="doc-prose">');
    expect(commonView).toContain('<h3 id="api-methods" class="doc-h3">方法</h3>');
    expect(commonView).toContain('<section id="tips" class="doc-prose">');
    expect(commonView).not.toContain('id="coverage"');
    expect(commonView).not.toContain('方法覆盖');
    for (const method of ['getUpdatedParam', 'get', 'hide', 'show', 'setLayerOpacity', 'setLayerIndex', 'getLayer', 'destroy']) {
      expect(commonView).toContain(`name: '${method}(`);
    }
  });
});
