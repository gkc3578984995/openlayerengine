import { describe, expect, it } from 'vitest';
import { lineStyles } from '../src/builtins/styles/lineStyles.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { Color } from '../src/core/common/types.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { LineworkSpec, StylePatch, StyleSpec } from '../src/core/style/types.js';
import { assertLineworkShapeCompatibility, assertStructuredStyleSpec, StyleService } from '../src/services/style/StyleService.js';

describe('lineStyles', () => {
  it('展开 polyline 与 polygon 的冻结默认值', () => {
    expect(lineStyles.polyline()).toEqual({
      linework: {
        tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
        contour: { kind: 'open' }
      }
    });
    expect(lineStyles.polygon()).toEqual({
      linework: {
        tracks: [{ offset: 0, stroke: { color: '#ff0000', width: 2 } }],
        contour: { kind: 'closed', rings: 'outer', seam: 'preserve-spacing' }
      }
    });
    expect(Object.isFrozen(lineStyles)).toBe(true);
  });

  it('让双轨独立选择实虚线并继承统一颜色', () => {
    const style = lineStyles.polyline({ color: '#1677ff', lines: ['dashed', 'solid'] as const, decoration: 'tick' });

    expect(style.linework?.tracks).toEqual([
      { offset: -3, stroke: { color: '#1677ff', width: 2, lineDash: [8, 6], lineDashOffset: 0 } },
      { offset: 3, stroke: { color: '#1677ff', width: 2 } }
    ]);
    const decoration = style.linework?.decorations?.[0];
    expect(decoration?.placement).toEqual({ kind: 'repeat', spacing: 32, phase: 0 });
    expect(decoration !== undefined && 'sequence' in decoration ? decoration.sequence[0].primitives[0] : undefined).toMatchObject({
      type: 'segment',
      stroke: { color: '#1677ff' }
    });
  });

  it('分别展开起终点端帽，且 glyph 颜色跟随线饰颜色', () => {
    const style = lineStyles.polyline({
      color: '#00aa66',
      caps: { start: 'bar', end: 'arrow' },
      decoration: 'none'
    });

    const start = style.linework?.caps?.start?.glyph.primitives[0];
    const end = style.linework?.caps?.end?.glyph.primitives[0];
    expect(start).toEqual({
      type: 'segment',
      from: [0, -7],
      to: [0, 7],
      stroke: { color: '#00aa66', width: 2 }
    });
    expect(end).toMatchObject({ type: 'polygon', fill: { type: 'solid', color: '#00aa66' } });
  });

  it('覆盖全部内置 tracked decoration 和纯 slash 结构', () => {
    const repeated = ['tick', 'alternating-tick', 'double-tick', 'square', 'circle'] as const;
    const centered = ['center-cross', 'center-dot', 'center-dot-pair'] as const;

    for (const decoration of repeated) {
      const spec = lineStyles.polyline({ decoration });
      expect(spec.linework?.decorations?.[0].placement.kind).toBe('repeat');
    }
    for (const decoration of centered) {
      const spec = lineStyles.polyline({ decoration });
      expect(spec.linework?.decorations?.[0].placement.kind).toBe('center');
    }

    const slash = lineStyles.polyline({ lines: 'none', decoration: 'slash' });
    expect(slash.linework?.tracks).toEqual([]);
    expect(slash.linework?.decorations?.[0]).toMatchObject({ placement: { kind: 'repeat', spacing: 12, phase: 0 } });
    const slashDecoration = slash.linework?.decorations?.[0];
    const primitive = slashDecoration !== undefined && 'sequence' in slashDecoration ? slashDecoration.sequence[0].primitives[0] : undefined;
    expect(primitive).toEqual({
      type: 'segment',
      from: [-3, 6],
      to: [3, -6],
      stroke: { color: '#ff0000', width: 2 }
    });
    expect(primitive).not.toHaveProperty('lineDash');
  });

  it('把 inline-text 展开为默认 12px 黑色文本并支持独立外观', () => {
    const defaults = lineStyles.polyline({ decoration: 'inline-text', text: '供水管线' });
    expect(defaults.linework?.inlineText).toEqual({
      text: '供水管线',
      fontFamily: 'sans-serif',
      fontSize: 12,
      fontWeight: 'normal',
      fontStyle: 'normal',
      fill: { type: 'solid', color: '#000000' },
      gapPadding: 6
    });
    expect(defaults.linework?.decorations).toBeUndefined();

    const custom = lineStyles.polygon({
      color: '#2563eb',
      lines: ['solid', 'dashed'] as const,
      decoration: 'inline-text',
      text: '通信线路',
      textStyle: {
        fontSize: 14,
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontWeight: 'bold',
        fontStyle: 'italic',
        color: '#111827',
        outline: {},
        background: { color: '#ffffff' }
      }
    });
    expect(custom.linework?.inlineText).toEqual({
      text: '通信线路',
      fontFamily: 'Microsoft YaHei, sans-serif',
      fontSize: 14,
      fontWeight: 'bold',
      fontStyle: 'italic',
      fill: { type: 'solid', color: '#111827' },
      stroke: { color: '#ffffff', width: 2 },
      backgroundFill: { type: 'solid', color: '#ffffff' },
      backgroundPadding: 2,
      gapPadding: 6
    });
  });

  it('不修改输入，并让每次输出及内部可变颜色互相隔离', () => {
    const color: Exclude<Color, string> = [12, 34, 56, 0.5];
    const options = { color, lines: ['dashed', 'solid'] as const, decoration: 'tick' as const };
    const first = lineStyles.polyline(options);
    const second = lineStyles.polyline(options);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.linework).not.toBe(second.linework);
    expect(first.linework?.tracks[0].stroke.color).not.toBe(color);
    expect(first.linework?.tracks[0].stroke.color).not.toBe(first.linework?.tracks[1].stroke.color);

    const firstColor = first.linework?.tracks[0].stroke.color;
    if (typeof firstColor !== 'string' && firstColor !== undefined) firstColor[0] = 255;
    first.linework?.tracks[0].stroke.lineDash?.push(99);

    expect(color).toEqual([12, 34, 56, 0.5]);
    expect(second.linework?.tracks[0].stroke.color).toEqual([12, 34, 56, 0.5]);
    expect(second.linework?.tracks[0].stroke.lineDash).toEqual([8, 6]);
  });

  it.each([
    [{ unknown: true }],
    [{ color: '   ' }],
    [{ lines: ['solid'] }],
    [{ lines: ['solid', 'dashed'], caps: { end: 'arrow' } }],
    [{ lines: 'solid', decoration: 'slash' }],
    [{ lines: 'none', decoration: 'none' }],
    [{ lines: 'none', decoration: 'slash', text: '非法' }],
    [{ decoration: 'inline-text', text: '   ' }],
    [{ decoration: 'circle', textStyle: { fontSize: 14 } }],
    [{ decoration: 'inline-text', text: '文字', textStyle: { fontSize: Number.NaN } }],
    [{ decoration: 'inline-text', text: '文字', textStyle: { background: {} } }]
  ])('同步拒绝非法 polyline 工厂参数 %#', (options) => {
    expect(() => lineStyles.polyline(options as never)).toThrow(InvalidArgumentError);
  });

  it('同步拒绝 Polygon caps、未知字段和非法双轨长度', () => {
    expect(() => lineStyles.polygon({ caps: { start: 'bar' } } as never)).toThrow(InvalidArgumentError);
    expect(() => lineStyles.polygon({ lines: ['solid', 'dashed', 'solid'], decoration: 'tick' } as never)).toThrow(InvalidArgumentError);
    expect(() => lineStyles.polygon({ decoration: 'tick', spacing: 20 } as never)).toThrow(InvalidArgumentError);
  });
});

describe('linework StyleSpec contract', () => {
  it('严格拒绝顶层旧描边冲突、装饰虚线和不确定中点占位', () => {
    const linework = lineStyles.polyline({ decoration: 'center-dot' }).linework as LineworkSpec;
    expect(() => assertStructuredStyleSpec({ strokes: [{ color: '#000000' }], linework })).toThrow(InvalidArgumentError);
    expect(() => assertStructuredStyleSpec({ decorations: [], linework })).toThrow(InvalidArgumentError);

    const dashedGlyph = lineStyles.polyline({ decoration: 'tick' }) as StyleSpec;
    const decoration = dashedGlyph.linework?.decorations?.[0];
    if (decoration !== undefined && 'sequence' in decoration) {
      const primitive = decoration.sequence[0].primitives[0];
      if (primitive.type === 'segment') (primitive.stroke as never as { lineDash: number[] }).lineDash = [2, 2];
    }
    expect(() => assertStructuredStyleSpec(dashedGlyph)).toThrow(InvalidArgumentError);

    const bothCenters = lineStyles.polyline({ decoration: 'center-dot' });
    if (bothCenters.linework !== undefined) {
      bothCenters.linework.inlineText = lineStyles.polyline({ decoration: 'inline-text', text: '文字' }).linework?.inlineText;
    }
    expect(() => assertStructuredStyleSpec(bothCenters)).toThrow(InvalidArgumentError);

    expect(() =>
      assertStructuredStyleSpec({
        linework: { tracks: [{ offset: 0, stroke: { color: '   ', width: 2 } }], contour: { kind: 'open' } }
      })
    ).toThrow(InvalidArgumentError);
    expect(() =>
      assertStructuredStyleSpec({
        linework: {
          tracks: [{ offset: 0, stroke: { color: '#ff0000', lineDash: [8, 6], fitPatternOnce: true } }],
          contour: { kind: 'open' }
        }
      } as never)
    ).toThrow(/fitPatternOnce/);
  });

  it('整体替换或删除 linework patch，不深层合并旧轨道', () => {
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
    const service = new StyleService(store);
    const state: ElementState = {
      id: 'line',
      type: 'polyline',
      geometry: {
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [10, 0]
        ]
      },
      style: lineStyles.polyline({ lines: 'dashed', decoration: 'circle' }),
      layerId: 'default',
      visible: true
    };
    store.add(state);
    const replacement = lineStyles.polyline({ color: '#1677ff', caps: { end: 'arrow' } }).linework as LineworkSpec;

    service.patch({ id: 'line' }, { linework: replacement });
    expect((store.get('line')?.style as StyleSpec).linework).toEqual(replacement);
    expect((store.get('line')?.style as StyleSpec).linework?.decorations).toBeUndefined();

    const deleting: StylePatch = { linework: undefined };
    service.patch({ id: 'line' }, deleting);
    expect((store.get('line')?.style as StyleSpec).linework).toBeUndefined();
  });

  it('clone 与 serialize 返回可写且深度隔离的 linework 数据', () => {
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
    const service = new StyleService(store);
    const source = lineStyles.polyline({
      color: [10, 20, 30, 0.5],
      lines: ['dashed', 'solid'] as const,
      decoration: 'inline-text',
      text: '中点'
    });
    const cloned = service.clone(source) as StyleSpec;
    const serialized = service.serialize(source);

    expect(cloned).toEqual(source);
    expect(serialized).toEqual(source);
    expect(cloned.linework).not.toBe(source.linework);
    expect(serialized.linework?.tracks[0].stroke).not.toBe(source.linework?.tracks[0].stroke);

    cloned.linework?.tracks[0].stroke.lineDash?.push(99);
    const clonedColor = cloned.linework?.tracks[0].stroke.color;
    if (typeof clonedColor !== 'string' && clonedColor !== undefined) clonedColor[0] = 255;
    if (serialized.linework?.inlineText !== undefined) serialized.linework.inlineText.text = '已序列化';

    expect(source.linework?.tracks[0].stroke.lineDash).toEqual([8, 6]);
    expect(source.linework?.tracks[0].stroke.color).toEqual([10, 20, 30, 0.5]);
    expect(source.linework?.inlineText?.text).toBe('中点');
  });

  it('同步校验 Shape 与开放、闭合 contour 的兼容性', () => {
    const open = lineStyles.polyline();
    const closed = lineStyles.polygon();
    const registry = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
    expect(() => assertLineworkShapeCompatibility(open, registry.get('polyline'))).not.toThrow();
    expect(() => assertLineworkShapeCompatibility(open, registry.get('curve-polyline'))).not.toThrow();
    expect(() => assertLineworkShapeCompatibility(closed, registry.get('polygon'))).not.toThrow();
    expect(() => assertLineworkShapeCompatibility(open, registry.get('polygon'))).toThrow(InvalidArgumentError);
    expect(() => assertLineworkShapeCompatibility(closed, registry.get('polyline'))).toThrow(InvalidArgumentError);
    expect(() => assertLineworkShapeCompatibility(open, registry.get('point'))).toThrow(InvalidArgumentError);
    expect(() => assertLineworkShapeCompatibility(open, registry.get('circle'))).toThrow(InvalidArgumentError);
  });
});
