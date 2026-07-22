import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('website advanced runnable examples', () => {
  it('shows every public pattern fill and every supported application target', async () => {
    const [view, demo] = await Promise.all([read('website/src/views/elements/StylesView.vue'), read('website/src/examples/elements/PatternFillDemo.vue')]);

    expect(view).toContain("import PatternFillDemo from '../../examples/elements/PatternFillDemo.vue';");
    expect(view).toContain("import patternFillSource from '../../examples/elements/PatternFillDemo.vue?raw';");
    expect(view).toContain(':source="patternFillSource"');
    expect(view).toContain(':snippet="patternFillSnippet"');
    expect(view).toContain('<PatternFillDemo ref="patternFillDemoRef" />');
    expect(view).toContain('show-reset');
    expect(view).toContain('show-focus');

    for (const pattern of ['diagonal', 'cross', 'dot', 'horizontal', 'vertical']) {
      expect(demo, pattern).toContain(`value: '${pattern}'`);
    }
    for (const target of ['Polygon.fill', 'CircleSymbol.fill', 'Text.fill', 'Text.backgroundFill']) {
      expect(demo, target).toContain(target);
    }

    expect(demo).toContain('// #region pattern-fill-set');
    expect(demo).toContain('// #region pattern-fill-patch');
    expect(demo).toContain('earth.styles.set(');
    expect(demo).toContain('earth.styles.patch(');
    expect(demo).toContain('type PatternSize = 4 | 8 | 16 | 32 | 64 | 128');
    expect(demo).toContain('const patternSizes = [4, 8, 16, 32, 64, 128]');
    expect(demo).toContain("selectedPattern.value === 'dot' ? { dotRadius: dotRadius.value } : { lineWidth: lineWidth.value }");
    expect(demo).not.toContain(':min="6" :max="36"');
    expect(demo).toContain('defineExpose({ reset, focus })');
    expect(demo).not.toContain('console.');
  });

  it('runs two isolated V2 Earth instances from the lifecycle page', async () => {
    const [view, demo] = await Promise.all([read('website/src/views/EarthInstanceView.vue'), read('website/src/examples/MultiEarthDemo.vue')]);

    expect(view).toContain("import MultiEarthDemo from '../examples/MultiEarthDemo.vue';");
    expect(view).toContain("import multiEarthSource from '../examples/MultiEarthDemo.vue?raw';");
    expect(view).toContain('id="example-multi-earth"');
    expect(view).toContain('title="多地图实例与隔离"');
    expect(view).toContain(':source="multiEarthSource"');
    expect(view).toContain(':snippet="multiEarthSnippet"');
    expect(view).toContain('<MultiEarthDemo ref="multiEarthDemoRef" />');

    expect(demo).toContain('const slots = [');
    expect(demo).toContain('const earth = useEarth({');
    expect(demo).toContain('id: slot.id');
    expect(demo).toContain("createConfiguredLayer(earth, slot.key === 'left' ? 'vector' : 'satellite')");
    expect(demo).toContain("earth.layers.add({ kind: 'vector'");
    expect(demo).toContain('left.elements !== right.elements');
    expect(demo).toContain('left.view !== right.view');
    expect(demo).toContain('left.contextMenu !== right.contextMenu');
    expect(demo).toContain('size: 16, lineWidth: 3');
    expect(demo).toContain('earthByKey(slot.key)?.destroy()');
    expect(demo).toContain('defineExpose({ reset, focus })');
    expect(demo).not.toMatch(/\b(?:addLayer|destroyEarth)\s*\(/u);
    expect(demo).not.toContain('console.');
  });

  it('makes all three layer kinds, deployment basemaps and external ownership observable', async () => {
    const [view, serviceDemo, kindsDemo] = await Promise.all([
      read('website/src/views/LayerServiceView.vue'),
      read('website/src/examples/LayerServiceDemo.vue'),
      read('website/src/examples/LayerKindsDemo.vue')
    ]);

    expect(view).toContain('<LayerServiceDemo ref="layerServiceDemoRef" />');
    expect(view).toContain('<LayerKindsDemo ref="layerKindsDemoRef" />');
    expect(view.match(/show-reset/gu)).toHaveLength(2);
    expect(view.match(/show-focus/gu)).toHaveLength(2);
    expect(serviceDemo).toContain('defineExpose({ reset, focus })');

    for (const kind of ['vector', 'native']) expect(kindsDemo).toContain(`kind: '${kind}'`);
    expect(kindsDemo).toContain('createConfiguredLayer(earth, selectedBasemap.value)');
    expect(kindsDemo).toContain("selectedBasemap.value = 'vector'");
    expect(kindsDemo).toContain("value: 'satellite'");
    expect(kindsDemo).toContain("ownership: 'external'");
    expect(kindsDemo).toContain("id: 'layer-kind-earth-circle'");
    expect(kindsDemo).toContain('new Feature(new Point(');
    expect(kindsDemo).toContain('Earth Element 容器');
    expect(kindsDemo).toContain('OpenLayers VectorLayer');
    expect(kindsDemo).toContain('externalOlLayer.value?.getSource() instanceof VectorSource');
    expect(kindsDemo).toContain('const verifyAtomicClearFailure = () =>');
    expect(kindsDemo).toContain('beforeIds.length === afterIds.length');
    expect(kindsDemo).toContain('直接 clear()（预期失败）');
    expect(kindsDemo).toContain('clear() 的 Element 占用预检是全有或全无');
    expect(view).toContain('所有图层都会原样保留');
    expect(kindsDemo).toContain('defineExpose({ reset, focus })');
  });
});
