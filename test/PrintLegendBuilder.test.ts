import { describe, expect, it, vi } from 'vitest';
import type { ElementStore } from '../src/core/element/ElementStore.js';
import type { LayerManager } from '../src/core/layer/LayerManager.js';
import type { PrintPlan } from '../src/core/print/types.js';
import type { PrintGeometryHitPort } from '../src/core/ports/PrintGeometryHitPort.js';
import { PrintLegendBuilder } from '../src/services/print/PrintLegendBuilder.js';

const plan: PrintPlan = {
  revision: 7,
  pageSizeMm: [297, 210],
  mapFrameMm: { x: 10, y: 36, width: 277, height: 148 },
  outputSizePx: [1123, 794],
  dpi: 96,
  range: {
    sourceMode: 'extent',
    sourceExtent: [0, 0, 100, 100],
    actualExtent: [0, 0, 100, 100],
    footprint: [
      [0, 100],
      [100, 100],
      [100, 0],
      [0, 0]
    ],
    center: [50, 50],
    rotation: 0,
    denominator: 10_000,
    resolution: 1
  }
};

describe('PrintLegendBuilder', () => {
  it('filters by final range and merges equal semantic symbols per layer', () => {
    const elements = [element('a', true), element('b', true), element('outside', true), element('hidden', false)];
    const store = { query: () => elements } as unknown as ElementStore;
    const layers = { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager;
    const hit: PrintGeometryHitPort = { intersectsFootprint: (id) => id !== 'outside', renderOrderOf: (id) => elements.findIndex((item) => item.id === id) };
    const builder = new PrintLegendBuilder({ store, layers, geometryHit: hit });

    const result = builder.generate(plan, { mode: 'auto', showCounts: true });

    expect(result.groups).toEqual([{ id: 'layer:default', title: 'default', order: 0 }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ label: '点标绘', count: 2, groupId: 'layer:default' });
    expect(result.sourceRevision).toBe(7);
  });

  it('resolves only spatial-index candidates and evaluates each candidate Style hit once', () => {
    const elements = new Map<string, ReturnType<typeof element>>();
    for (let index = 0; index < 1000; index += 1) elements.set(`outside-${index}`, element(`outside-${index}`, true));
    elements.set('candidate', element('candidate', true));
    const query = vi.fn(() => {
      throw new Error('full ElementStore scan is forbidden');
    });
    const resolve = vi.fn((elementId: string) => elements.get(elementId));
    const candidateElementIds = vi.fn(() => ['candidate']);
    const isVisibleAt = vi.fn(() => true);
    const intersectsFootprint = vi.fn(() => true);
    const builder = new PrintLegendBuilder({
      store: { query, resolve } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { candidateElementIds, isVisibleAt, intersectsFootprint, renderOrderOf: () => 0 }
    });

    const result = builder.generate(plan);

    expect(result.items).toEqual([expect.objectContaining({ count: 1 })]);
    const presentationFrame = { center: plan.range.center, resolution: plan.range.resolution, rotation: plan.range.rotation };
    expect(candidateElementIds).toHaveBeenCalledWith(plan.range.footprint, plan.range.resolution, ['default'], presentationFrame);
    expect(query).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith('candidate');
    expect(isVisibleAt).toHaveBeenCalledOnce();
    expect(isVisibleAt).toHaveBeenCalledWith('candidate', plan.range.resolution, plan.range.footprint, presentationFrame);
    expect(intersectsFootprint).not.toHaveBeenCalled();
  });

  it('preserves manual items and reports dormant automatic sources', () => {
    const builder = new PrintLegendBuilder({
      store: { query: () => [] } as unknown as ElementStore,
      layers: { query: () => [] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => false, renderOrderOf: () => 0 }
    });
    const result = builder.generate(plan, {
      mode: 'manual',
      groups: [{ id: 'manual', title: '行动要素' }],
      items: [{ id: 'route', groupId: 'manual', label: '主路线', symbol: { kind: 'line', stroke: { color: '#ef4444', widthMm: 0.6 } } }]
    });

    expect(result.groups[0]?.title).toBe('行动要素');
    expect(result.items[0]?.label).toBe('主路线');
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it('replays a manual label over the same source and adds newly visible sources', () => {
    const elements = [element('a', true), { ...element('route', true), type: 'polyline' as const, style: { strokes: [{ color: '#ef4444', width: 2 }] } }];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: (id) => elements.findIndex((item) => item.id === id) }
    });
    const automatic = builder.generate(plan, { mode: 'auto' });
    const point = automatic.items.find((item) => item.label === '点标绘');
    if (point === undefined) throw new Error('missing point legend fixture');

    const result = builder.generate(plan, {
      mode: 'manual',
      groups: automatic.groups,
      items: [{ ...point, label: '集结点' }]
    });

    expect(result.items.some((item) => item.label === '集结点')).toBe(true);
    expect(result.items.some((item) => item.label === '线标绘')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'legend-source-added')).toBe(true);
  });

  it('keeps a custom symbol without a false change warning and detects a real source style change', () => {
    let elements = [element('a', true)];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });
    const automatic = builder.generate(plan, { mode: 'auto' });
    const original = automatic.items[0];
    if (original === undefined) throw new Error('missing legend fixture');
    const manual = {
      ...original,
      label: '指挥所',
      symbol: { kind: 'point' as const, radiusMm: 1.8, fill: { color: '#ef4444' } }
    };

    const customized = builder.generate(plan, { mode: 'manual', groups: automatic.groups, items: [manual] });
    expect(customized.items[0]).toMatchObject({ label: '指挥所', symbol: manual.symbol });
    expect(customized.warnings.some((warning) => warning.code === 'legend-source-changed')).toBe(false);

    elements = [{ ...element('a', true), style: { symbol: { type: 'circle' as const, radius: 8, fill: { type: 'solid' as const, color: '#22c55e' } } } }];
    const changed = builder.generate(plan, { mode: 'manual', groups: automatic.groups, items: [manual] });
    expect(changed.items[0]).toMatchObject({ label: '指挥所', symbol: manual.symbol });
    expect(changed.warnings.map((warning) => warning.code)).toContain('legend-source-changed');
  });

  it('keeps one source identity when the first in-range element changes', () => {
    const elements = [element('a', true), element('b', true)];
    let visibleId = 'a';
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: (id) => id === visibleId, renderOrderOf: (id) => elements.findIndex((item) => item.id === id) }
    });
    const first = builder.generate(plan, { mode: 'auto' });
    const item = first.items[0];
    if (item === undefined) throw new Error('missing legend fixture');
    visibleId = 'b';

    const replayed = builder.generate(plan, { mode: 'manual', groups: first.groups, items: [{ ...item, label: '集结点' }] });

    expect(replayed.items[0]?.label).toBe('集结点');
    expect(replayed.warnings.map((warning) => warning.code)).not.toContain('legend-source-added');
    expect(replayed.warnings.map((warning) => warning.code)).not.toContain('legend-source-missing');
  });

  it('adopts a changed automatic symbol when only the manual label was overridden', () => {
    let elements = [element('a', true)];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });
    const automatic = builder.generate(plan, { mode: 'auto' });
    const original = automatic.items[0];
    if (original === undefined) throw new Error('missing legend fixture');
    elements = [{ ...element('a', true), style: { symbol: { type: 'circle' as const, radius: 8, fill: { type: 'solid' as const, color: '#22c55e' } } } }];

    const changed = builder.generate(plan, {
      mode: 'manual',
      groups: automatic.groups,
      items: [{ ...original, label: '集结点' }]
    });

    expect(changed.items[0]?.label).toBe('集结点');
    expect(changed.items[0]?.symbol).not.toEqual(original.symbol);
    expect(changed.warnings.map((warning) => warning.code)).toContain('legend-source-changed');
  });

  it('aggregates structured styles that cannot be represented without loss into an acknowledged placeholder', () => {
    const elements = [
      {
        ...element('pattern', true),
        type: 'polygon' as const,
        style: { fill: { type: 'pattern' as const, pattern: 'cross' as const, color: '#ef4444', backgroundColor: '#ffffff' } }
      },
      {
        ...element('sprite', true),
        style: { symbol: { type: 'icon' as const, src: '/markers.png', size: [24, 24] as [number, number], offset: [48, 0] as [number, number] } }
      },
      {
        ...element('tinted', true),
        style: { symbol: { type: 'icon' as const, src: '/marker.png', size: [24, 24] as [number, number], color: '#22c55e' } }
      },
      { ...element('text-only', true), style: { text: { text: '指挥所' } } }
    ];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: (id) => elements.findIndex((item) => item.id === id) }
    });

    const result = builder.generate(plan, { mode: 'auto', showCounts: true });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ label: '动态样式（无法自动解析）', count: 4, symbol: { kind: 'line' } });
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'unknown-dynamic-style', subject: 'default', requiresAcknowledgement: true })]);
  });

  it('keeps a directly representable icon as an icon legend item', () => {
    const elements = [
      {
        ...element('icon', true),
        style: {
          symbol: {
            type: 'icon' as const,
            src: '/marker.png',
            size: [32, 20] as [number, number],
            anchor: [0.5, 1] as [number, number],
            crossOrigin: 'anonymous' as const
          }
        }
      }
    ];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });

    const result = builder.generate(plan);

    expect(result.items[0]?.symbol).toEqual({ kind: 'icon', src: '/marker.png', size: [32, 20], anchor: [0.5, 1], crossOrigin: 'anonymous' });
    expect(result.warnings).toEqual([]);
  });

  it('excludes Element sources from fully transparent layers', () => {
    const elements = [element('transparent', true)];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 0, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });

    const result = builder.generate(plan);

    expect(result.groups).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('excludes a source whose canonical style returns no visual at the final resolution', () => {
    const elements = [element('scale-hidden', true)];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, isVisibleAt: (_id, resolution) => resolution < plan.range.resolution, renderOrderOf: () => 0 }
    });

    const result = builder.generate(plan);

    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('orders groups by effective layer zIndex before registration order', () => {
    const elements = [
      { ...element('high', true), layerId: 'high' },
      { ...element('low', true), layerId: 'low' }
    ];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: {
        query: () => [
          { kind: 'vector', id: 'high', visible: true, opacity: 1, zIndex: 10, wrapX: true, declutter: false },
          { kind: 'vector', id: 'low', visible: true, opacity: 1, zIndex: 0, wrapX: true, declutter: false }
        ]
      } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: (id) => elements.findIndex((item) => item.id === id) }
    });

    const result = builder.generate(plan);

    expect(result.groups.map((group) => group.id)).toEqual(['layer:low', 'layer:high']);
    expect(result.items.map((item) => item.groupId)).toEqual(['layer:low', 'layer:high']);
  });

  it('orders distinct symbols inside one layer by structured style zIndex', () => {
    const elements = [
      {
        ...element('high', true),
        style: { symbol: { type: 'circle' as const, radius: 5, fill: { type: 'solid' as const, color: '#ef4444' } }, zIndex: 100 }
      },
      {
        ...element('low', true),
        style: { symbol: { type: 'circle' as const, radius: 5, fill: { type: 'solid' as const, color: '#22c55e' } }, zIndex: 0 }
      }
    ];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: (id) => elements.findIndex((item) => item.id === id) }
    });

    const result = builder.generate(plan);

    expect(result.items.map((item) => (item.symbol.kind === 'point' ? item.symbol.fill?.color : undefined))).toEqual(['#22c55e', '#ef4444']);
  });

  it('retains only lightweight identities needed by a dormant manual source', () => {
    let elements = [element('stable', true)];
    const generations = new Map<string, object>([['stable', {}]]);
    const builder = new PrintLegendBuilder({
      store: { query: () => elements, generationOf: (id: string) => generations.get(id) } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });
    const automatic = builder.generate(plan);
    const source = automatic.items[0];
    if (source === undefined) throw new Error('missing retained source fixture');
    const manual = { ...source, label: '保留覆盖' };

    elements = [];
    const dormant = builder.generate(plan, { mode: 'manual', groups: automatic.groups, items: [manual] });
    expect(dormant.items).toEqual([]);
    expect(dormant.warnings.map((warning) => warning.code)).toContain('legend-source-missing');

    elements = [element('stable', true)];
    const restored = builder.generate(plan, { mode: 'manual', groups: automatic.groups, items: [manual] });
    expect(restored.items[0]?.label).toBe('保留覆盖');
    expect(restored.warnings.map((warning) => warning.code)).not.toContain('legend-source-added');
  });

  it('evicts inactive automatic identities during source churn and clears them on destroy', () => {
    let elements = [element('source-0', true)];
    const generations = new Map<string, object>([['source-0', {}]]);
    const builder = new PrintLegendBuilder({
      store: { query: () => elements, generationOf: (id: string) => generations.get(id) } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });
    const firstKey = builder.generate(plan).items[0]?.sourceKey;
    for (let index = 1; index <= 50; index += 1) {
      const id = `source-${index}`;
      generations.set(id, {});
      elements = [
        {
          ...element(id, true),
          style: {
            symbol: {
              type: 'circle' as const,
              radius: 5,
              fill: { type: 'solid' as const, color: `#${index.toString(16).padStart(6, '0')}` }
            }
          }
        }
      ];
      builder.generate(plan);
    }
    elements = [element('source-0', true)];
    const reintroducedKey = builder.generate(plan).items[0]?.sourceKey;

    expect(reintroducedKey).not.toBe(firstKey);
    expect(() => {
      builder.destroy();
      builder.destroy();
    }).not.toThrow();
  });

  it('replays an override when every Element of the same semantic source is replaced', () => {
    let elements = [element('old', true)];
    const generations = new Map<string, object>([
      ['old', {}],
      ['replacement', {}]
    ]);
    const builder = new PrintLegendBuilder({
      store: { query: () => elements, generationOf: (id: string) => generations.get(id) } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });
    const automatic = builder.generate(plan);
    const source = automatic.items[0];
    if (source === undefined) throw new Error('missing semantic replacement fixture');
    elements = [element('replacement', true)];

    const replayed = builder.generate(plan, {
      mode: 'manual',
      groups: automatic.groups,
      items: [{ ...source, label: '持续保留的业务名称' }]
    });

    expect(replayed.items[0]?.label).toBe('持续保留的业务名称');
    expect(replayed.warnings.map((warning) => warning.code)).not.toContain('legend-source-added');
    expect(replayed.warnings.map((warning) => warning.code)).not.toContain('legend-source-missing');
  });

  it('does not inherit dormant item or group overrides after the same Layer id is recreated', () => {
    let elements = [element('old', true)];
    let layerGeneration = 1;
    const layers = {
      query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }],
      generationOf: () => layerGeneration
    } as unknown as LayerManager;
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });
    const automatic = builder.generate(plan);
    const oldItem = automatic.items[0];
    const oldGroup = automatic.groups[0];
    if (oldItem === undefined || oldGroup === undefined) throw new Error('missing Layer generation fixture');
    const manualItem = { ...oldItem, label: '旧业务名称' };
    const manualGroup = { ...oldGroup, title: '旧业务组', visible: false };

    layerGeneration = 2;
    elements = [element('new', true)];
    const recreated = builder.generate(plan, { mode: 'manual', groups: [manualGroup], items: [manualItem] });
    const currentItem = recreated.items.find((item) => item.sourceKey?.includes('generation:2'));
    const currentGroup = recreated.groups.find((group) => group.id === currentItem?.groupId);

    expect(currentItem).toMatchObject({ label: '点标绘' });
    expect(currentItem?.groupId).not.toBe(oldItem.groupId);
    expect(currentGroup).toMatchObject({ title: 'default' });
    expect(currentGroup).not.toHaveProperty('visible');
    expect(recreated.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['legend-source-added', 'legend-source-missing']));
  });

  it('excludes structured symbols whose complete visual output is transparent', () => {
    const elements = [
      {
        ...element('polygon-transparent', true),
        type: 'polygon' as const,
        style: { fill: { type: 'solid' as const, color: 'rgba(0, 0, 0, 0)' } }
      },
      {
        ...element('line-transparent', true),
        type: 'polyline' as const,
        style: { strokes: [{ color: '#00000000', width: 2 }] }
      },
      {
        ...element('line-zero-width', true),
        type: 'polyline' as const,
        style: { strokes: [{ color: '#1677ff', width: 0 }] }
      },
      {
        ...element('point-transparent', true),
        style: { symbol: { type: 'circle' as const, radius: 5, fill: { type: 'solid' as const, color: [0, 0, 0, 0] as [number, number, number, number] } } }
      },
      {
        ...element('icon-opacity-zero', true),
        style: { symbol: { type: 'icon' as const, src: '/marker.png', size: [24, 24] as [number, number], opacity: 0 } }
      },
      {
        ...element('icon-transparent-tint', true),
        style: { symbol: { type: 'icon' as const, src: '/marker.png', size: [24, 24] as [number, number], color: '#fff0' } }
      }
    ];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: (id) => elements.findIndex((item) => item.id === id) }
    });

    const result = builder.generate(plan);

    expect(result.groups).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps visible text as an acknowledged dynamic source when its base symbol is transparent', () => {
    const elements = [
      {
        ...element('text-over-transparent-symbol', true),
        style: {
          symbol: { type: 'circle' as const, radius: 5, fill: { type: 'solid' as const, color: 'transparent' } },
          text: { text: 'Command post' }
        }
      }
    ];
    const builder = new PrintLegendBuilder({
      store: { query: () => elements } as unknown as ElementStore,
      layers: { query: () => [{ kind: 'vector', id: 'default', visible: true, opacity: 1, wrapX: true, declutter: false }] } as unknown as LayerManager,
      geometryHit: { intersectsFootprint: () => true, renderOrderOf: () => 0 }
    });

    const result = builder.generate(plan);

    expect(result.items).toEqual([
      expect.objectContaining({ label: expect.stringContaining('动态样式'), symbol: { kind: 'line', stroke: expect.any(Object) } })
    ]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'unknown-dynamic-style', requiresAcknowledgement: true })]);
  });
});

function element(id: string, visible: boolean) {
  return {
    id,
    type: 'point' as const,
    geometry: { type: 'point' as const, controlPoints: [[10, 10] as const] },
    style: { symbol: { type: 'circle' as const, radius: 5, fill: { type: 'solid' as const, color: '#1677ff' } } },
    layerId: 'default',
    visible
  };
}
