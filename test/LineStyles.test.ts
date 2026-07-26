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
    const style = lineStyles.polyline({ color: '#1677ff', tracks: { mode: 'double', patterns: ['dashed', 'solid'] }, decoration: 'tick' });

    expect(style.linework?.tracks).toEqual([
      { offset: -3, stroke: { color: '#1677ff', width: 2, lineDash: [8, 6], lineDashOffset: 0 } },
      { offset: 3, stroke: { color: '#1677ff', width: 2 } }
    ]);
    const decoration = style.linework?.decorations?.[0];
    expect(decoration?.placement).toEqual({ kind: 'repeat', spacing: 32, phase: 0 });
    expect(decoration).not.toHaveProperty('cutoutPadding');
    expect(decoration !== undefined && 'sequence' in decoration ? decoration.sequence[0].primitives[0] : undefined).toMatchObject({
      type: 'segment',
      stroke: { color: '#1677ff' }
    });
  });

  it('展开自定义轨道宽度与规范 casing 默认值', () => {
    const single = lineStyles.polyline({ tracks: { width: 4 }, casing: { color: '#ffff00' } });
    expect(single.linework?.tracks).toEqual([{ offset: 0, stroke: { color: '#ff0000', width: 4 } }]);
    expect(single.linework?.casing).toEqual({ color: '#ffff00', type: 'center', width: 2 });

    const double = lineStyles.polygon({
      color: '#111111',
      tracks: { mode: 'double', patterns: ['solid', 'dashed'], width: 3 },
      casing: { color: [255, 255, 0, 0.8], type: 'inner', width: 5 }
    });
    expect(double.linework?.tracks).toEqual([
      { offset: -3.5, stroke: { color: '#111111', width: 3 } },
      { offset: 3.5, stroke: { color: '#111111', width: 3, lineDash: [8, 6], lineDashOffset: 0 } }
    ]);
    expect(double.linework?.casing).toEqual({ color: [255, 255, 0, 0.8], type: 'inner', width: 5 });
  });

  it('让宽双轨保持固定 4px 净间隙', () => {
    const style = lineStyles.polyline({ tracks: { mode: 'double', patterns: ['solid', 'dashed'], width: 10 } });

    expect(style.linework?.tracks).toEqual([
      { offset: -7, stroke: { color: '#ff0000', width: 10 } },
      { offset: 7, stroke: { color: '#ff0000', width: 10, lineDash: [8, 6], lineDashOffset: 0 } }
    ]);
  });

  it('允许开放单轨同时使用 casing 与 caps', () => {
    const style = lineStyles.polyline({
      tracks: { pattern: 'dashed', width: 3 },
      casing: { color: '#ffffff', type: 'outer' },
      caps: { start: 'bar', end: 'arrow' }
    });

    expect(style.linework?.tracks).toHaveLength(1);
    expect(style.linework?.casing).toEqual({ color: '#ffffff', type: 'outer', width: 2 });
    expect(style.linework?.caps?.start).toBeDefined();
    expect(style.linework?.caps?.end).toBeDefined();
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

  it('让端帽随宽单轨扩张并保持默认 2px 输出不变', () => {
    const defaults = lineStyles.polyline({ tracks: { width: 2 }, caps: { start: 'bar', end: 'arrow' } });
    const wide = lineStyles.polyline({ tracks: { width: 14 }, caps: { start: 'bar', end: 'arrow' } });

    expect(defaults.linework?.caps?.start?.glyph.primitives[0]).toMatchObject({ from: [0, -7], to: [0, 7] });
    expect(defaults.linework?.caps?.end?.glyph.primitives[0]).toMatchObject({
      points: [
        [0, 0],
        [-11, -6],
        [-11, 6]
      ]
    });
    expect(wide.linework?.caps?.start?.glyph.primitives[0]).toMatchObject({ from: [0, -13], to: [0, 13] });
    expect(wide.linework?.caps?.end?.glyph.primitives[0]).toMatchObject({
      points: [
        [0, 0],
        [-17, -12],
        [-17, 12]
      ]
    });
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

    const slash = lineStyles.polyline({ tracks: { mode: 'none' }, decoration: 'slash' });
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

  it('让普通沿线装饰按宽轨包络扩张，并保持中心装饰尺寸不变', () => {
    const wideSingle = lineStyles.polyline({ tracks: { width: 14 }, decoration: 'tick' });
    const wideDouble = lineStyles.polyline({ tracks: { mode: 'double', width: 10 }, decoration: 'circle' });
    const defaultCenter = lineStyles.polyline({ decoration: 'center-cross' }).linework?.decorations?.[0];
    const wideCenter = lineStyles.polyline({ tracks: { width: 14 }, decoration: 'center-cross' }).linework?.decorations?.[0];
    const singleTick = wideSingle.linework?.decorations?.[0];
    const doubleCircle = wideDouble.linework?.decorations?.[0];

    expect(singleTick !== undefined && 'sequence' in singleTick ? singleTick.sequence[0].primitives[0] : undefined).toMatchObject({
      from: [0, -13],
      to: [0, 13]
    });
    expect(doubleCircle !== undefined && 'sequence' in doubleCircle ? doubleCircle.sequence[0].primitives[0] : undefined).toMatchObject({ radius: 12 });
    expect(wideCenter).toEqual(defaultCenter);
  });

  it.each([
    ['center-cross', 4],
    ['center-dot', 3],
    ['center-dot-pair', 3]
  ] as const)('让 %s 按固定 CSS 像素间距整体重复并保留轨道切口', (decoration, cutoutPadding) => {
    const style = lineStyles.polyline({ decoration: { type: decoration, repeatSpacingPx: 36 } });
    const repeated = style.linework?.decorations?.[0];

    expect(repeated).toMatchObject({
      placement: { kind: 'repeat', spacing: 36, phase: 0 },
      cutoutPadding,
      sequence: [{ primitives: expect.any(Array) }]
    });
    expect(repeated).not.toHaveProperty('glyph');
  });

  it('把 inline-text 展开为默认 12px 黑色文本并支持独立外观', () => {
    const defaults = lineStyles.polyline({ decoration: { type: 'inline-text', text: '供水管线' } });
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
      tracks: { mode: 'double', patterns: ['solid', 'dashed'] },
      decoration: {
        type: 'inline-text',
        text: '通信线路',
        style: {
          fontSize: 14,
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontWeight: 'bold',
          fontStyle: 'italic',
          color: '#111827',
          outline: {},
          background: { color: '#ffffff' }
        }
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

    const repeated = lineStyles.polygon({ decoration: { type: 'inline-text', text: '重复路径文字', repeatSpacingPx: 64 } });
    expect(repeated.linework?.inlineText?.placement).toEqual({ kind: 'repeat', spacing: 64, phase: 0 });
  });

  it('不修改输入，并让每次输出及内部可变颜色互相隔离', () => {
    const color: Exclude<Color, string> = [12, 34, 56, 0.5];
    const casingColor: Exclude<Color, string> = [255, 255, 0, 0.8];
    const options = {
      color,
      tracks: { mode: 'double' as const, patterns: ['dashed', 'solid'] as const },
      casing: { color: casingColor, type: 'center' as const },
      decoration: 'tick' as const
    };
    const first = lineStyles.polyline(options);
    const second = lineStyles.polyline(options);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.linework).not.toBe(second.linework);
    expect(first.linework?.tracks[0].stroke.color).not.toBe(color);
    expect(first.linework?.tracks[0].stroke.color).not.toBe(first.linework?.tracks[1].stroke.color);
    expect(first.linework?.casing?.color).not.toBe(casingColor);
    expect(first.linework?.casing?.color).not.toBe(second.linework?.casing?.color);

    const firstColor = first.linework?.tracks[0].stroke.color;
    if (typeof firstColor !== 'string' && firstColor !== undefined) firstColor[0] = 255;
    const firstCasingColor = first.linework?.casing?.color;
    if (typeof firstCasingColor !== 'string' && firstCasingColor !== undefined) firstCasingColor[0] = 0;
    first.linework?.tracks[0].stroke.lineDash?.push(99);

    expect(color).toEqual([12, 34, 56, 0.5]);
    expect(casingColor).toEqual([255, 255, 0, 0.8]);
    expect(second.linework?.tracks[0].stroke.color).toEqual([12, 34, 56, 0.5]);
    expect(second.linework?.tracks[0].stroke.lineDash).toEqual([8, 6]);
    expect(second.linework?.casing?.color).toEqual([255, 255, 0, 0.8]);
  });

  it.each([
    [{ unknown: true }],
    [{ color: '   ' }],
    [{ lines: 'solid' }],
    [{ tracks: { unknown: true } }],
    [{ tracks: { mode: 'unknown' } }],
    [{ tracks: { mode: 'single', patterns: ['solid', 'dashed'] } }],
    [{ tracks: { mode: 'double', pattern: 'solid' } }],
    [{ tracks: { mode: 'double', patterns: ['solid'] } }],
    [{ tracks: { mode: 'double', patterns: [undefined, 'solid'] } }],
    [{ tracks: { mode: 'none', width: 2 }, decoration: 'slash' }],
    [{ tracks: { width: 0 } }],
    [{ tracks: { width: Number.NaN } }],
    [{ tracks: { mode: 'double' }, caps: { end: 'arrow' } }],
    [{ tracks: { mode: 'single' }, decoration: 'slash' }],
    [{ tracks: { mode: 'none' }, decoration: 'none' }],
    [{ tracks: { mode: 'none' }, decoration: 'slash', casing: { color: '#ffff00' } }],
    [{ decoration: 'inline-text' }],
    [{ decoration: { type: 'inline-text', text: '   ' } }],
    [{ decoration: { type: 'circle', repeatSpacingPx: 20 } }],
    [{ decoration: { type: 'center-dot', text: '非法' } }],
    [{ decoration: { type: 'center-dot', repeatSpacingPx: 0 } }],
    [{ decoration: { type: 'center-dot', repeatSpacingPx: Number.NaN } }],
    [{ decoration: { type: 'center-dot', repeatSpacingPx: Number.POSITIVE_INFINITY } }],
    [{ decoration: { type: 'inline-text', text: '文字', repeatSpacingPx: -1 } }],
    [{ decoration: { type: 'inline-text', text: '文字', style: { fontSize: Number.NaN } } }],
    [{ decoration: { type: 'inline-text', text: '文字', style: { background: {} } } }],
    [{ casing: {} }],
    [{ casing: { color: '#ffff00', type: 'invalid' } }],
    [{ casing: { color: '#ffff00', width: 0 } }],
    [{ casing: { color: '   ' } }]
  ])('同步拒绝非法 polyline 工厂参数 %#', (options) => {
    expect(() => lineStyles.polyline(options as never)).toThrow(InvalidArgumentError);
  });

  it('把显式 undefined 的 repeatSpacingPx 按省略处理', () => {
    expect(lineStyles.polyline({ decoration: { type: 'center-dot', repeatSpacingPx: undefined } })).toEqual(lineStyles.polyline({ decoration: 'center-dot' }));
    expect(lineStyles.polyline({ decoration: { type: 'inline-text', text: '文字', repeatSpacingPx: undefined } })).toEqual(
      lineStyles.polyline({ decoration: { type: 'inline-text', text: '文字' } })
    );
  });

  it('同步拒绝 Polygon caps、未知字段和非法双轨长度', () => {
    expect(() => lineStyles.polygon({ caps: { start: 'bar' } } as never)).toThrow(InvalidArgumentError);
    expect(() => lineStyles.polygon({ tracks: { mode: 'double', patterns: ['solid', 'dashed', 'solid'] }, decoration: 'tick' } as never)).toThrow(
      InvalidArgumentError
    );
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
      bothCenters.linework.inlineText = lineStyles.polyline({ decoration: { type: 'inline-text', text: '文字' } }).linework?.inlineText;
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

  it('严格校验规范 PathCasingSpec 与前景轨道约束', () => {
    const valid = lineStyles.polyline({ casing: { color: '#ffff00', type: 'inner', width: 3 } });
    expect(() => assertStructuredStyleSpec(valid)).not.toThrow();

    const invalidCasings = [
      { type: 'center', width: 2 },
      { color: '#ffff00', width: 2 },
      { color: '#ffff00', type: 'center' },
      { color: '   ', type: 'center', width: 2 },
      { color: '#ffff00', type: 'invalid', width: 2 },
      { color: '#ffff00', type: 'center', width: 0 },
      { color: '#ffff00', type: 'center', width: Number.NaN },
      { color: '#ffff00', type: 'center', width: 2, unknown: true }
    ];
    for (const casing of invalidCasings) {
      expect(() =>
        assertStructuredStyleSpec({
          linework: { tracks: [{ offset: 0, stroke: { color: '#000000', width: 2 } }], casing }
        } as never)
      ).toThrow(InvalidArgumentError);
    }

    expect(() =>
      assertStructuredStyleSpec({
        linework: {
          tracks: [],
          casing: { color: '#ffff00', type: 'center', width: 2 },
          decorations: lineStyles.polyline({ decoration: 'tick' }).linework?.decorations
        }
      })
    ).toThrow(InvalidArgumentError);
  });

  it('严格校验重复文本 placement 与重复 glyph 切口', () => {
    const repeatedText = lineStyles.polyline({ decoration: { type: 'inline-text', text: '管线', repeatSpacingPx: 48 } });
    const repeatedGlyph = lineStyles.polyline({ decoration: { type: 'center-cross', repeatSpacingPx: 32 } });
    const explicitCenterText = lineStyles.polyline({ decoration: { type: 'inline-text', text: '中点' } });
    if (explicitCenterText.linework?.inlineText !== undefined) explicitCenterText.linework.inlineText.placement = { kind: 'center' };
    expect(() => assertStructuredStyleSpec(repeatedText)).not.toThrow();
    expect(() => assertStructuredStyleSpec(repeatedGlyph)).not.toThrow();
    expect(() => assertStructuredStyleSpec(explicitCenterText)).not.toThrow();

    const invalidTextPlacements = [
      { kind: 'repeat' },
      { kind: 'repeat', spacing: 0 },
      { kind: 'repeat', spacing: Number.NaN },
      { kind: 'repeat', spacing: 24, phase: Number.POSITIVE_INFINITY },
      { kind: 'center', spacing: 24 },
      { kind: 'unknown' }
    ];
    for (const placement of invalidTextPlacements) {
      const invalid = lineStyles.polyline({ decoration: { type: 'inline-text', text: '管线' } });
      if (invalid.linework?.inlineText !== undefined) invalid.linework.inlineText.placement = placement as never;
      expect(() => assertStructuredStyleSpec(invalid)).toThrow(InvalidArgumentError);
    }

    for (const cutoutPadding of [-1, Number.NaN]) {
      const invalidCutout = lineStyles.polyline({ decoration: { type: 'center-dot', repeatSpacingPx: 32 } });
      const decoration = invalidCutout.linework?.decorations?.[0];
      if (decoration !== undefined) decoration.cutoutPadding = cutoutPadding;
      expect(() => assertStructuredStyleSpec(invalidCutout)).toThrow(InvalidArgumentError);
    }

    const lowLevelCutout = lineStyles.polyline({ decoration: 'tick' });
    const ordinaryRepeat = lowLevelCutout.linework?.decorations?.[0];
    if (ordinaryRepeat !== undefined) ordinaryRepeat.cutoutPadding = 2;
    expect(() => assertStructuredStyleSpec(lowLevelCutout)).not.toThrow();
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
      style: lineStyles.polyline({ tracks: { pattern: 'dashed' }, decoration: 'circle' }),
      layerId: 'default',
      visible: true
    };
    store.add(state);
    const replacement = lineStyles.polyline({ color: '#1677ff', casing: { color: '#ffffff', type: 'outer', width: 4 }, caps: { end: 'arrow' } })
      .linework as LineworkSpec;

    service.patch({ id: 'line' }, { linework: replacement });
    expect((store.get('line')?.style as StyleSpec).linework).toEqual(replacement);
    expect((store.get('line')?.style as StyleSpec).linework?.casing).toEqual({ color: '#ffffff', type: 'outer', width: 4 });
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
      tracks: { mode: 'double', patterns: ['dashed', 'solid'] },
      casing: { color: [255, 255, 255, 0.75], type: 'center', width: 3 },
      decoration: { type: 'inline-text', text: '中点', repeatSpacingPx: 48 }
    });
    const cloned = service.clone(source) as StyleSpec;
    const serialized = service.serialize(source);

    expect(cloned).toEqual(source);
    expect(serialized).toEqual(source);
    expect(cloned.linework).not.toBe(source.linework);
    expect(serialized.linework?.tracks[0].stroke).not.toBe(source.linework?.tracks[0].stroke);
    expect(serialized.linework?.casing).not.toBe(source.linework?.casing);

    cloned.linework?.tracks[0].stroke.lineDash?.push(99);
    const clonedColor = cloned.linework?.tracks[0].stroke.color;
    if (typeof clonedColor !== 'string' && clonedColor !== undefined) clonedColor[0] = 255;
    const clonedCasingColor = cloned.linework?.casing?.color;
    if (typeof clonedCasingColor !== 'string' && clonedCasingColor !== undefined) clonedCasingColor[0] = 0;
    if (serialized.linework?.inlineText !== undefined) serialized.linework.inlineText.text = '已序列化';
    const clonedPlacement = cloned.linework?.inlineText?.placement;
    if (clonedPlacement?.kind === 'repeat') clonedPlacement.phase = 12;

    expect(source.linework?.tracks[0].stroke.lineDash).toEqual([8, 6]);
    expect(source.linework?.tracks[0].stroke.color).toEqual([10, 20, 30, 0.5]);
    expect(source.linework?.casing).toEqual({ color: [255, 255, 255, 0.75], type: 'center', width: 3 });
    expect(source.linework?.inlineText?.text).toBe('中点');
    expect(source.linework?.inlineText?.placement).toEqual({ kind: 'repeat', spacing: 48, phase: 0 });
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
