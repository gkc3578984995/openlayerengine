import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readOptional = async (path: string) => readFile(path, 'utf8').catch(() => '');

const layers = [
  {
    name: 'CircleLayer',
    label: 'CircleLayer 圆图层',
    route: '/components/circle-layer',
    view: 'CircleLayerView.vue',
    api: 'circleLayerApi.ts',
    examples: ['CircleLayerBasicDemo.vue', 'CircleLayerPatternDemo.vue', 'CircleLayerUpdateDemo.vue'],
    methods: ['add', 'set', 'setPosition'],
    types: ['ICircleParam', 'ISetCircleParam', 'IGeometryFill']
  },
  {
    name: 'PolygonLayer',
    label: 'PolygonLayer 面图层',
    route: '/components/polygon-layer',
    view: 'PolygonLayerView.vue',
    api: 'polygonLayerApi.ts',
    examples: ['PolygonLayerBasicDemo.vue', 'PolygonLayerStyleDemo.vue', 'PolygonLayerUpdateDemo.vue'],
    methods: ['add', 'set', 'setPosition'],
    types: ['IPolygonParam', 'ISetPolygonParam']
  },
  {
    name: 'BillboardLayer',
    label: 'BillboardLayer 广告牌图层',
    route: '/components/billboard-layer',
    view: 'BillboardLayerView.vue',
    api: 'billboardLayerApi.ts',
    examples: ['BillboardLayerBasicDemo.vue', 'BillboardLayerStyleDemo.vue', 'BillboardLayerUpdateDemo.vue'],
    methods: ['add', 'set', 'setPosition', 'getIconExtent'],
    types: ['IBillboardParam', 'ISetBillboardParam']
  },
  {
    name: 'OverlayLayer',
    label: 'OverlayLayer 覆盖物图层',
    route: '/components/overlay-layer',
    view: 'OverlayLayerView.vue',
    api: 'overlayLayerApi.ts',
    examples: ['OverlayLayerBasicDemo.vue', 'OverlayLayerUpdateDemo.vue'],
    methods: ['add', 'set', 'setPosition', 'get', 'remove'],
    types: ['IOverlayParam', 'ISetOverlayParam']
  },
  {
    name: 'PolylineLayer',
    label: 'PolylineLayer 线图层',
    route: '/components/polyline-layer',
    view: 'PolylineLayerView.vue',
    api: 'polylineLayerApi.ts',
    examples: ['PolylineLayerBasicDemo.vue', 'PolylineLayerArrowFlowDemo.vue', 'PolylineLayerFlightDemo.vue', 'PolylineLayerUpdateDemo.vue'],
    methods: ['add', 'addFlightLine', 'setPosition', 'remove', 'setFlightPosition', 'removeFlightLine', 'set', 'hide', 'show'],
    types: ['IPolylineParam', 'ISetPolylineParam', 'IPolylineFlyParam']
  }
] as const;

describe('base layer documentation pages', () => {
  it.each(layers)('$name follows the runnable page contract', async ({ name, view, api, examples, methods, types }) => {
    const viewSource = await readOptional(`website/src/views/${view}`);
    const apiSource = await readOptional(`website/src/docs/${api}`);
    const demoSources = await Promise.all(examples.map((example) => readOptional(`website/src/examples/${example}`)));
    const combinedDemos = demoSources.join('\n');

    expect(viewSource, `${view} must exist`).not.toBe('');
    expect(apiSource, `${api} must exist`).not.toBe('');
    for (const section of ['overview', 'usage', 'examples', 'api', 'tips']) expect(viewSource).toContain(`id="${section}"`);
    expect(viewSource).toContain('<PageAnchor');
    expect(viewSource).toContain('api-constructor');
    expect(viewSource).toContain('api-constructor__signature');
    expect(viewSource).toContain("presentation: 'property'");
    expect(viewSource).toContain("presentation: 'method'");

    for (const example of examples) {
      expect(viewSource).toContain(example.replace('.vue', ''));
      expect(viewSource).toContain(`${example}?raw`);
    }
    for (const type of types) expect(viewSource + apiSource).toContain(type);
    for (const method of methods) expect(combinedDemos, `${name}.${method} must be called by a runnable demo`).toMatch(new RegExp(`\\.${method}\\(`));
    for (const source of demoSources) {
      expect(source).toContain('createConfiguredLayer');
      expect(source).toContain('onBeforeUnmount');
      expect(source).toMatch(/\.destroy\(\)/);
      expect(source).not.toMatch(/https?:\/\//);
    }
  });

  it('PolylineLayer documents current flow and flight cleanup limitations', async () => {
    const [viewSource, flightDemoSource] = await Promise.all([
      readFile('website/src/views/PolylineLayerView.vue', 'utf8'),
      readFile('website/src/examples/PolylineLayerFlightDemo.vue', 'utf8')
    ]);

    expect(viewSource).toContain('透明要素');
    expect(viewSource).toContain('不会解绑飞行线的 postrender 监听');
    expect(viewSource).toContain('流动线不能通过 hide(id) / show(id) 保留并恢复动画');
    expect(flightDemoSource).toContain('SAFE_NOOP_FLIGHT_ID');
    expect(flightDemoSource).toContain('.setFlightPosition(SAFE_NOOP_FLIGHT_ID');
    expect(flightDemoSource).toContain('.removeFlightLine(SAFE_NOOP_FLIGHT_ID');
    expect(flightDemoSource).toContain('当前公开 API 无法主动解绑飞行线的 postrender 监听');
    expect(flightDemoSource).not.toContain('@click="addFlight"');
  });

  it('registers all five pages without adding WindLayer', async () => {
    const [navigation, router, layout] = await Promise.all([
      readFile('website/src/config/navigation.ts', 'utf8'),
      readFile('website/src/router/index.ts', 'utf8'),
      readFile('website/src/layouts/DocsLayout.vue', 'utf8')
    ]);

    for (const { label, route, view } of layers) {
      expect(navigation).toContain(label);
      expect(navigation).toContain(route);
      expect(router).toContain(view.replace('.vue', ''));
      expect(router).toContain(route.replace(/^\//, ''));
      expect(layout).toContain(label);
    }
    expect(navigation).not.toContain('WindLayer');
    expect(router).not.toContain('WindLayerView');
  });
});
