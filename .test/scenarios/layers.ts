import { Earth, type Layer, type LayerKind, type TileUrlFunction } from '@vrsim/earth-engine-ol';
import VectorLayer from 'ol/layer/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import type { ScenarioDefinition } from '../harness/types.js';

const transparentTile =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"%3E%3Crect width="256" height="256" fill="%23eef4ff"/%3E%3C/svg%3E';

export const layersScenario: ScenarioDefinition = {
  id: 'layers',
  group: '图层与元素',
  title: 'Layer 图层类型与生命周期',
  summary: '一次创建 vector、全部 tile 分支和 native 图层，并通过 LayerService 与 Layer 句柄验证查询、更新、显隐、移除、清空及资源 ownership。',
  steps: [
    '确认地图显示 vector 验收图形；OSM 可联网时同时显示底图，离线时不影响其他验收。',
    '调整透明度和 zIndex，执行 Layer.update()，再通过 show()/hide() 检查可见性。',
    '执行按 kind 查询，确认 vector、tile、native 三类句柄及状态字段完整。',
    '分别使用 Layer.remove()、LayerService.remove() 和 LayerService.clear()，确认句柄与服务状态同步。'
  ],
  mount(context) {
    const externalTileSource = new XYZ({ url: transparentTile });
    const externalNativeSource = new VectorSource();
    const externalNativeLayer = new VectorLayer({ source: externalNativeSource, visible: false, opacity: 0.65, zIndex: 31 });
    context.track(() => externalTileSource.dispose());
    context.track(() => externalNativeSource.dispose());
    context.track(() => externalNativeLayer.dispose());

    const target = context.createMapTarget('图层验收地图');
    const earth = context.trackEarth(new Earth({ target, view: { center: [0, 0], zoom: 3 }, controls: { attribution: true, rotate: false } }));

    const vector = earth.layers.add({ kind: 'vector', id: 'acceptance-vector', visible: true, opacity: 0.9, zIndex: 20, wrapX: false, declutter: true });
    const generated = earth.layers.add({ kind: 'vector' });
    const osm = earth.layers.add({ kind: 'tile', id: 'tile-osm', preset: 'osm', visible: true, opacity: 0.45, zIndex: 0 });
    const xyzUrl = earth.layers.add({
      kind: 'tile',
      id: 'tile-xyz-url',
      preset: 'xyz',
      url: transparentTile,
      attributions: '验收用透明瓦片',
      visible: false,
      opacity: 0.8,
      zIndex: 1
    });
    const tileUrlFunction: TileUrlFunction = ([z, x, y]) => `${transparentTile}#${z}/${x}/${y}`;
    const xyzCallback = earth.layers.add({
      kind: 'tile',
      id: 'tile-xyz-callback',
      preset: 'xyz',
      tileUrlFunction,
      attributions: ['验收瓦片 A', '验收瓦片 B'],
      visible: false,
      opacity: 0.7,
      zIndex: 2
    });
    const compact = earth.layers.add({
      kind: 'tile',
      id: 'tile-compact',
      preset: 'compact-xyz',
      baseUrl: './acceptance-tiles',
      visible: false,
      opacity: 0.6,
      zIndex: 3
    });
    const customExternal = earth.layers.add({
      kind: 'tile',
      id: 'tile-source-external',
      source: externalTileSource,
      ownership: 'external',
      visible: false,
      opacity: 0.55,
      zIndex: 4
    });
    const customEarth = earth.layers.add({
      kind: 'tile',
      id: 'tile-source-earth',
      source: new XYZ({ url: transparentTile }),
      ownership: 'earth',
      visible: false,
      opacity: 0.5,
      zIndex: 5
    });
    const nativeExternal = earth.layers.add({ kind: 'native', id: 'native-external', layer: externalNativeLayer, ownership: 'external' });
    const nativeEarth = earth.layers.add({
      kind: 'native',
      id: 'native-earth',
      layer: new VectorLayer({ source: new VectorSource(), visible: false, opacity: 0.75, zIndex: 32 }),
      ownership: 'earth'
    });

    earth.elements.add({
      id: 'layer-visual-element',
      layerId: vector.id,
      geometry: {
        type: 'polygon',
        controlPoints: [
          [-2_000_000, -1_000_000],
          [2_000_000, -1_000_000],
          [2_000_000, 1_000_000],
          [-2_000_000, 1_000_000]
        ]
      },
      style: {
        strokes: [
          { color: '#ffffff', width: 8 },
          { color: '#1677ff', width: 4, lineDash: [16, 10] }
        ],
        fill: { type: 'solid', color: [22, 119, 255, 0.18] },
        text: {
          text: 'acceptance-vector',
          fontSize: 16,
          fontWeight: 'bold',
          fill: { type: 'solid', color: '#16324f' },
          backgroundFill: { type: 'solid', color: [255, 255, 255, 0.9] },
          padding: [5, 8, 5, 8]
        }
      }
    });
    context.render(earth);

    const initialLayers = [vector, generated, osm, xyzUrl, xyzCallback, compact, customExternal, customEarth, nativeExternal, nativeEarth];
    context.check(
      'LayerService.add() 已覆盖全部图层输入分支',
      initialLayers.every((layer) => earth.layers.get(layer.id) === layer)
    );
    context.check('自动生成 Layer.id', generated.id.length > 0 && generated.id !== 'default');
    context.check('tileUrlFunction 可按瓦片坐标生成 URL', tileUrlFunction([3, 4, 2]).endsWith('#3/4/2'));
    context.check(
      'Layer.olLayer 暴露原生 OpenLayers 图层',
      initialLayers.every((layer) => layer.olLayer !== undefined)
    );
    renderLayerStatus(context, earth.layers.query());

    const presentation = context.section('图层显示参数', '通过 Layer.update() 修改 LayerPatch 的 visible、opacity、zIndex，再使用便捷显隐方法。');
    const opacity = context.number(presentation, '矢量图层透明度 opacity', 0.5, { min: 0, max: 1, step: 0.05 });
    const zIndex = context.number(presentation, '矢量图层层级 zIndex', 40, { step: 1 });
    const presentationActions = context.actions(presentation);
    context.button(presentationActions, '更新图层 Layer.update()', () => {
      vector.update({ visible: true, opacity: opacity.valueAsNumber, zIndex: zIndex.valueAsNumber });
      context.status('vector.state', vector.state);
      context.check('LayerPatch 已同步到句柄属性', vector.visible && vector.opacity === opacity.valueAsNumber && vector.zIndex === zIndex.valueAsNumber);
      earth.map.renderSync();
    });
    context.button(presentationActions, '隐藏图层 Layer.hide()', () => {
      vector.hide();
      context.status('vector.visible', vector.visible);
      context.check('Layer.hide() 隐藏图层', !vector.visible);
    });
    context.button(presentationActions, '显示图层 Layer.show()', () => {
      vector.show();
      context.status('vector.visible', vector.visible);
      context.check('Layer.show() 显示图层', vector.visible);
      earth.map.renderSync();
    });

    const queries = context.section('查询与句柄属性', 'LayerService.query(kind) 支持三种 kind；Layer.state 是不可变快照。');
    const kind = context.select<LayerKind>(
      queries,
      '图层类型 kind',
      [
        { label: '矢量 vector', value: 'vector' },
        { label: '瓦片 tile', value: 'tile' },
        { label: '原生 native', value: 'native' }
      ],
      'vector'
    );
    const queryActions = context.actions(queries);
    context.button(queryActions, '按 ID 获取 LayerService.get()', () => {
      const found = earth.layers.get(vector.id);
      context.status('get(vector.id)', found?.state);
      context.check('get() 返回同一 Layer 句柄', found === vector);
    });
    context.button(queryActions, '按类型查询 LayerService.query(kind)', () => {
      const results = earth.layers.query(kind.value as LayerKind);
      context.status(
        `query(${kind.value})`,
        results.map((layer) => layer.id)
      );
      context.check('query(kind) 只返回对应类型', results.length > 0 && results.every((layer) => layer.kind === kind.value));
    });
    context.button(queryActions, '检查 Layer 全部 getter', () => {
      context.status('Layer getter', {
        id: vector.id,
        state: vector.state,
        kind: vector.kind,
        visible: vector.visible,
        opacity: vector.opacity,
        zIndex: vector.zIndex,
        olLayer: vector.olLayer.constructor.name
      });
      context.check('vector 状态包含专属字段', vector.state.kind === 'vector' && vector.state.wrapX === false && vector.state.declutter === true);
    });

    const removal = context.section('移除与清空', '先移除无元素图层；clear() 前会清空元素，满足图层占用保护规则。');
    const removalActions = context.actions(removal);
    context.button(removalActions, 'Layer.remove() 移除自动图层', () => {
      generated.remove();
      context.check('Layer.remove() 已移除图层', earth.layers.get(generated.id) === undefined);
    });
    context.button(removalActions, 'LayerService.remove() 移除 compact 图层', () => {
      const removed = earth.layers.remove(compact.id);
      context.check('LayerService.remove() 返回 true', removed && earth.layers.get(compact.id) === undefined);
    });
    context.button(
      removalActions,
      'LayerService.clear() 清空全部图层',
      () => {
        earth.elements.clear();
        earth.layers.clear();
        context.status(
          '剩余图层',
          earth.layers.query().map((layer) => layer.id)
        );
        context.check('LayerService.clear() 清空全部图层', earth.layers.query().length === 0);
      },
      '危险'
    );

    context.setCode(`
import { Earth } from '@vrsim/earth-engine-ol';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';

const earth = new Earth({ target: 'map' });

const vector = earth.layers.add({
  kind: 'vector',
  id: 'business',
  visible: true,
  opacity: 0.9,
  zIndex: 20,
  wrapX: false,
  declutter: true
});

const osm = earth.layers.add({ kind: 'tile', preset: 'osm' });
const native = earth.layers.add({
  kind: 'native',
  layer: new VectorLayer({ source: new VectorSource() }),
  ownership: 'earth'
});

vector.update({ opacity: 0.6, zIndex: 30 });
vector.hide();
vector.show();
`);
  }
};

function renderLayerStatus(context: Parameters<ScenarioDefinition['mount']>[0], layers: readonly Layer[]): void {
  const counts: Record<LayerKind, number> = { vector: 0, tile: 0, native: 0 };
  for (const layer of layers) counts[layer.kind] += 1;
  context.status(
    '全部 Layer.id',
    layers.map((layer) => layer.id)
  );
  context.status('Layer.kind 统计', counts);
  context.status(
    'Layer.state 快照',
    layers.map((layer) => layer.state)
  );
}
