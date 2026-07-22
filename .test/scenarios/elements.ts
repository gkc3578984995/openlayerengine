import {
  Earth,
  stylePresets,
  type Coordinate,
  type Element,
  type ElementGeometryDetails,
  type ElementPatch,
  type ElementProtectionState,
  type ElementProtectionUpdate,
  type ElementRenderGeometry,
  type ElementSelector,
  type MapExtent,
  type ShapeInput
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition } from '../harness/types.js';

interface DemoData {
  readonly label: string;
  readonly score: number;
}

export const elementsScenario: ScenarioDefinition = {
  id: 'elements',
  group: '图层与元素',
  title: 'Element 元素、Selector 与屏幕命中',
  summary: '验证扁平坐标写入与规范坐标读取、协同保护、完整渲染几何、全部 Selector 字段、更新复制、显隐、移除、原生 Feature、像素命中和屏幕范围。',
  steps: [
    '确认扁平坐标可以创建主元素和折线，读取时会返回规范的嵌套坐标。',
    '执行“检查全部 Selector”，确认 id、ids、module、layerId、type、visible、predicate 均能筛选。',
    '执行完整 update() 与 copy()，观察元素位置、图层、样式、数据和可见性同步变化。',
    '执行像素命中和屏幕范围检查，再分别使用服务与句柄完成显隐、移除和清空。'
  ],
  mount(context) {
    const target = context.createMapTarget('元素验收地图');
    const earth = context.trackEarth(new Earth({ target, view: { center: [0, 0], zoom: 4 }, controls: { attribution: false, rotate: false } }));
    const secondaryLayer = earth.layers.add({ kind: 'vector', id: 'element-secondary', visible: true, opacity: 1, zIndex: 20, wrapX: true, declutter: true });

    const primary = earth.elements.add<DemoData>({
      id: 'element-primary',
      geometry: { type: 'point', controlPoints: [0, 0] },
      style: richPointStyle('主元素'),
      data: { label: '主元素数据', score: 100 },
      module: 'planning',
      layerId: 'default',
      visible: true
    });
    const lineGeometry: ShapeInput<'polyline'> = {
      type: 'polyline',
      controlPoints: [-2_000_000, -1_000_000, -800_000, 1_200_000, 1_000_000, 700_000]
    };
    const line = earth.elements.add<DemoData>({
      id: 'element-line',
      geometry: lineGeometry,
      style: stylePresets['line-default'],
      data: { label: '线路数据', score: 80 },
      module: 'route',
      layerId: secondaryLayer.id,
      visible: true
    });
    const polygon = earth.elements.add<DemoData>({
      id: 'element-hidden-polygon',
      geometry: {
        type: 'polygon',
        controlPoints: [
          [1_000_000, -1_000_000],
          [2_200_000, -900_000],
          [1_700_000, 200_000]
        ]
      },
      style: stylePresets['polygon-default'],
      data: { label: '隐藏区域', score: 20 },
      module: 'planning',
      layerId: secondaryLayer.id,
      visible: false
    });
    context.render(earth);

    const initialProtectionUpdate: ElementProtectionUpdate = { protected: true, operatorId: 'user-42', operatorName: '张三', revision: 1 };
    context.check('ElementService.setProtection() 建立保护', earth.elements.setProtection(line.id, initialProtectionUpdate));
    const initialProtection: ElementProtectionState | undefined = earth.elements.getProtection(line.id);
    context.check('ElementService.getProtection() 返回协作者状态', initialProtection?.operatorName === '张三' && initialProtection.protected);

    context.check('ElementService.add() 使用全部 ElementCreateInput 字段', hasCompleteState(primary));
    context.check('ElementService.get() 返回相同句柄', earth.elements.get(primary.id) === primary);
    context.check(
      '扁平坐标写入后返回嵌套坐标',
      'controlPoints' in line.state.geometry && Array.isArray(line.state.geometry.controlPoints[0]) && line.state.geometry.controlPoints.length === 3
    );
    context.check('Element.id 与 Element.state.id 一致', primary.id === primary.state.id);
    const geometryDetails: ElementGeometryDetails = polygon.geometryDetails;
    const renderGeometry: ElementRenderGeometry = geometryDetails.renderGeometry;
    const mapExtent: MapExtent = geometryDetails.extent;
    context.check('Element.geometryDetails 返回完整 Polygon 与地图范围', renderGeometry.type === 'polygon' && mapExtent.every(Number.isFinite));
    context.check(
      'Element.geometryDetails 统一返回范围角点、最终轮廓点和控制参数',
      geometryDetails.extentPoints.length === 4 &&
        geometryDetails.rangePoints.length === 1 &&
        geometryDetails.controlPoints?.length === 3 &&
        geometryDetails.center === null &&
        geometryDetails.radius === null
    );
    context.check('Element.olFeature 可用于 OpenLayers 互操作', primary.olFeature.getGeometry() !== undefined);
    renderElementStatus(context, earth.elements.query<DemoData>());

    const selectors = context.section('ElementSelector 全字段筛选', '每个按钮都从 ElementService.query() 返回新的只读句柄数组。');
    const selectorActions = context.actions(selectors);
    context.button(
      selectorActions,
      '检查全部 Selector',
      () => {
        const cases: readonly [string, ElementSelector<DemoData>, number][] = [
          ['id', { id: primary.id }, 1],
          ['ids', { ids: [primary.id, line.id] }, 2],
          ['module', { module: 'planning' }, 2],
          ['layerId', { layerId: secondaryLayer.id }, 2],
          ['type', { type: 'polyline' }, 1],
          ['visible', { visible: false }, 1],
          ['predicate', { predicate: (state) => (state.data?.score ?? 0) >= 80 }, 2]
        ];
        for (const [name, selector, expected] of cases) {
          const result = earth.elements.query(selector);
          context.status(
            `Selector.${name}`,
            result.map((element) => element.id)
          );
          context.check(`ElementSelector.${name}`, result.length === expected, { expected, actual: result.length });
        }
      },
      '主要'
    );
    context.button(selectorActions, 'query() 不传 Selector', () => {
      const all = earth.elements.query();
      context.status(
        'query()',
        all.map((element) => element.id)
      );
      context.check('query() 返回全部元素', all.length >= 3);
    });

    const updates = context.section('更新、显隐与复制', '完整 patch 会同时替换 geometry、style、data、module、layerId、visible；句柄 update() 用于局部更新。');
    const updateActions = context.actions(updates);
    context.button(
      updateActions,
      'ElementService.update() 完整 patch',
      () => {
        const patch: ElementPatch<DemoData> = {
          geometry: { type: 'point', controlPoints: [700_000, 500_000] },
          style: richPointStyle('已完整更新'),
          data: { label: '更新后的数据', score: 120 },
          module: 'review',
          layerId: secondaryLayer.id,
          visible: true
        };
        const updated = earth.elements.update<DemoData>({ id: primary.id }, patch);
        context.status(
          'update() 返回元素',
          updated.map((element) => element.state)
        );
        context.check(
          'ElementPatch 全字段已写入',
          updated.length === 1 && updated[0]?.state.module === 'review' && updated[0].state.layerId === secondaryLayer.id
        );
        earth.map.renderSync();
        renderElementStatus(context, earth.elements.query<DemoData>());
      },
      '主要'
    );

    const protectionSection = context.section('协同保护', '保护是当前 Earth 的临时协同运行态：内置 Edit / Transform 会被拦截，程序化同步仍可更新 Element。');
    const protectionActions = context.actions(protectionSection);
    let protectionRevision = 1;
    context.button(protectionActions, '保护点线面', () => {
      earth.elements.show({ id: polygon.id });
      for (const [element, operatorName] of [
        [primary, '王五'],
        [line, '张三'],
        [polygon, '李四']
      ] as const) {
        earth.elements.setProtection(element.id, { protected: true, operatorName, revision: ++protectionRevision });
      }
      context.status(
        '当前保护',
        [primary, line, polygon].map(({ id }) => earth.elements.getProtection(id))
      );
      earth.map.renderSync();
    });
    context.button(protectionActions, '解除全部保护', () => {
      for (const element of [primary, line, polygon]) {
        earth.elements.setProtection(element.id, { protected: false, revision: ++protectionRevision });
      }
      context.check(
        '点线面保护均已解除',
        [primary, line, polygon].every(({ id }) => earth.elements.getProtection(id) === undefined)
      );
      earth.map.renderSync();
    });
    context.button(updateActions, 'Element.update() 更新数据', () => {
      primary.update({ data: { label: '句柄更新', score: 130 }, module: 'handle-update' });
      context.status('primary.state', primary.state);
      context.check('Element.update() 已生效', primary.state.data?.score === 130 && primary.state.module === 'handle-update');
    });
    context.button(updateActions, '切换元素显隐 ElementService.hide() / show()', () => {
      const hidden = earth.elements.hide({ ids: [primary.id, line.id] });
      context.check('hide() 返回被隐藏元素', hidden.length === 2 && hidden.every((element) => !element.state.visible));
      const shown = earth.elements.show({ ids: [primary.id, line.id, polygon.id] });
      context.check('show() 返回被显示元素', shown.length === 3 && shown.every((element) => element.state.visible));
      context.status(
        '当前可见元素',
        earth.elements.query({ visible: true }).map((element) => element.id)
      );
      earth.map.renderSync();
    });
    context.button(
      updateActions,
      'ElementService.copy() 全部覆盖字段',
      () => {
        const copy = earth.elements.copy<DemoData>(primary.id, {
          geometry: { type: 'point', controlPoints: [-1_000_000, 500_000] },
          style: richPointStyle('复制元素'),
          data: { label: '复制数据', score: 60 },
          module: 'copies',
          layerId: 'default',
          visible: true
        });
        context.status('copy.state', copy.state);
        context.check(
          'ElementCopyOptions 全字段已覆盖',
          copy.id !== primary.id && copy.state.module === 'copies' && copy.state.layerId === 'default' && copy.state.visible && copy.state.data?.score === 60
        );
        earth.map.renderSync();
      },
      '主要'
    );

    const hitTest = context.section('像素命中与屏幕范围', '先执行 renderSync()，再使用元素坐标对应的 pixel 验证 atPixel() 与两种 getScreenExtent() 输入。');
    const hitActions = context.actions(hitTest);
    context.button(hitActions, '按像素命中 ElementService.atPixel()', () => {
      earth.map.updateSize();
      earth.map.renderSync();
      const coordinate = pointCoordinate(primary);
      const olPixel = earth.map.getPixelFromCoordinate([...coordinate]);
      if (olPixel.length < 2 || olPixel[0] === undefined || olPixel[1] === undefined) throw new Error('无法从元素坐标获得有效像素');
      const hit = earth.elements.atPixel<DemoData>([olPixel[0], olPixel[1]]);
      context.status('命中结果', hit === undefined ? '未命中' : { elementId: hit.element.id, layerId: hit.layer.id, data: hit.element.state.data });
      context.check('atPixel() 命中主元素及所属图层', hit?.element.id === primary.id && hit.layer.id === primary.state.layerId);
    });
    context.button(hitActions, '获取屏幕范围 ElementService.getScreenExtent()', () => {
      earth.map.updateSize();
      earth.map.renderSync();
      const byId = earth.elements.getScreenExtent(primary.id);
      const byHandle = earth.elements.getScreenExtent(primary);
      context.status('getScreenExtent(id)', byId);
      context.status('getScreenExtent(Element)', byHandle);
      context.check(
        'id 与 Element 两种输入返回相同范围',
        byId !== undefined && byHandle !== undefined && byId.every((value, index) => value === byHandle[index])
      );
    });

    const removal = context.section('移除与清空', '临时元素用于验证句柄 remove()；业务模块用于验证服务 remove(selector)。');
    const removalActions = context.actions(removal);
    context.button(removalActions, 'Element.remove() 移除句柄元素', () => {
      const temporary = earth.elements.add({ geometry: { type: 'point', controlPoints: [[-1_500_000, -700_000]] }, module: 'temporary' });
      const id = temporary.id;
      temporary.remove();
      context.check('Element.remove() 已使句柄失效', earth.elements.get(id) === undefined);
    });
    context.button(removalActions, '按选择器移除 ElementService.remove(selector)', () => {
      const removed = earth.elements.remove({ module: 'route' });
      context.status('remove() 数量', removed);
      context.check('remove(selector) 按模块删除', removed >= 1 && earth.elements.query({ module: 'route' }).length === 0);
    });
    context.button(
      removalActions,
      '清空全部元素 ElementService.clear()',
      () => {
        earth.elements.clear();
        context.status('剩余元素', earth.elements.query().length);
        context.check('clear() 清空全部元素', earth.elements.query().length === 0);
      },
      '危险'
    );

    context.setCode(`
import { Earth, stylePresets } from '@vrsim/earth-engine-ol';

const earth = new Earth({ target: 'map' });
const element = earth.elements.add({
  id: 'vehicle-1',
  geometry: { type: 'point', controlPoints: [0, 0] },
  style: stylePresets['point-default'],
  data: { name: '车辆一' },
  module: 'vehicles',
  layerId: 'default',
  visible: true
});

earth.elements.update({ module: 'vehicles' }, { visible: false });
earth.elements.show({ id: element.id });
const copy = earth.elements.copy(element.id, { module: 'vehicle-copies' });
earth.elements.setProtection(copy.id, {
  protected: true,
  operatorName: '张三',
  revision: 1,
  expiresAt: Date.now() + 30_000
});
console.log(earth.elements.getProtection(copy.id));
earth.elements.setProtection(copy.id, { protected: false, revision: 2 });
const extent = earth.elements.getScreenExtent(copy);
console.log(element.state.geometry); // 读取结果仍是嵌套坐标
console.log(element.geometryDetails); // 完整静态渲染几何与地图坐标范围
`);
  }
};

function richPointStyle(label: string) {
  return {
    symbol: {
      type: 'circle' as const,
      radius: 9,
      fill: { type: 'solid' as const, color: '#1677ff' },
      stroke: { color: '#ffffff', width: 3 }
    },
    text: {
      text: label,
      fontSize: 14,
      fontWeight: 'bold' as const,
      fill: { type: 'solid' as const, color: '#16324f' },
      backgroundFill: { type: 'solid' as const, color: [255, 255, 255, 0.92] as [number, number, number, number] },
      padding: [4, 7, 4, 7],
      offsetY: -22
    }
  };
}

function hasCompleteState(element: Element<DemoData>): boolean {
  const state = element.state;
  return (
    state.id === 'element-primary' &&
    state.type === 'point' &&
    state.geometry.type === 'point' &&
    state.style !== undefined &&
    state.data?.score === 100 &&
    state.module === 'planning' &&
    state.layerId === 'default' &&
    state.visible
  );
}

function pointCoordinate(element: Element): Coordinate {
  const geometry = element.state.geometry;
  if (geometry.type === 'circle' || geometry.type !== 'point') throw new Error('当前元素不是点');
  const coordinate = geometry.controlPoints[0];
  if (coordinate === undefined) throw new Error('点元素缺少控制点');
  return coordinate;
}

function renderElementStatus(context: Parameters<ScenarioDefinition['mount']>[0], elements: readonly Element<DemoData>[]): void {
  context.status(
    'ElementState 列表',
    elements.map((element) => element.state)
  );
  context.status('元素数量', elements.length);
}
