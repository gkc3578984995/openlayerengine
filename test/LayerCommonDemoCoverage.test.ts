import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readOptional = async (path: string) => readFile(path, 'utf8').catch(() => '');

describe('layer method demo coverage', () => {
  it('uses the V2 Layers page as the canonical layer entry', async () => {
    const [navigation, router, layersView] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/views/LayerServiceView.vue', 'utf8')
    ]);

    expect(navigation).toContain("{ label: '图层（Layers）', to: '/components/core/layers' }");
    expect(router).toContain("path: 'components/core/layers', name: 'core-layers', component: LayerServiceView");
    expect(layersView).toContain('<h1>图层（Layers）</h1>');
    expect(layersView).toContain('LayerService');
    expect(navigation).not.toContain("{ label: '图层通用操作'");
    expect(navigation).not.toContain("{ label: 'PointLayer 点图层'");
    expect(router).not.toContain("path: 'components/layer-common'");
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

  it('lists every common-layer example in the page anchor and links its API references with the documented styles', async () => {
    const [commonView, rules] = await Promise.all([readFile('website/src/views/LayerCommonView.vue', 'utf8'), readFile('website/AGENTS.md', 'utf8')]);

    expect(commonView).toContain("{ id: 'example-common-operations', label: '查询、显示控制与生命周期' }");
    expect(commonView).toContain('<div id="example-common-operations">');
    for (const method of ['getUpdatedParam', 'get', 'getLayer', 'hide', 'show', 'setLayerOpacity', 'setLayerIndex', 'destroy']) {
      expect(commonView).toContain(`<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>${method}</a></code>`);
    }
    expect(rules).toContain('每个 `ExampleBlock` 的标题必须在右侧锚点中以同名子项显示');
    expect(rules).toContain('方法使用蓝色可点击的 `code-fn` 样式，属性和类型使用中性可点击代码样式');
  });

  it('uses clickable method and type references in every existing example description', async () => {
    const [globalMethodsView, earthCreateView] = await Promise.all([
      readFile('website/src/views/GlobalMethodsView.vue', 'utf8'),
      readFile('website/src/views/EarthCreateView.vue', 'utf8')
    ]);

    for (const method of ['flyTo', 'animateFlyTo', 'flyHome', 'setMouseStyleToCrosshair', 'disabledMapDrag']) {
      expect(globalMethodsView).toContain(`<code class=&quot;code-fn&quot;><a href=&quot;#api-methods&quot;>${method}</a></code>`);
    }
    expect(earthCreateView).toContain('<ApiReference kind="type" to="#api-type-earth">Earth</ApiReference>');
    expect(globalMethodsView).not.toContain('code-fn-inline');
    expect(earthCreateView).not.toContain('code-fn-inline');
  });
});
