import { describe, expect, it } from 'vitest';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import { createPrintPlan, normalizePrintOptions, normalizePrintSpec, PRINT_CSS_DPI } from '../src/core/print/PrintPlanner.js';
import type { PrintPlannerContext, PrintSpec, PrintViewSnapshot } from '../src/core/print/types.js';

const limits = Object.freeze({ minDpi: 72, maxDpi: 600, maxCanvasDimension: 10_000, maxCanvasPixels: 64_000_000 });

describe('PrintPlanner', () => {
  it('规范化完整 PrintSpec，并补齐自动图例和内容策略', () => {
    const margin = { top: 5, right: 6, bottom: 7, left: 8 };
    const groups = [{ id: 'operations', title: '行动' }];
    const items = [
      {
        id: 'route',
        groupId: 'operations',
        label: '路线',
        symbol: { kind: 'line' as const, stroke: { color: '#f00', widthMm: 0.4, dashMm: [2, 1] } }
      }
    ];
    const manual = spec({
      paper: { size: 'A3', orientation: 'portrait', marginMm: margin, dpi: 300 },
      legend: { mode: 'manual', groups, items, layout: { columns: 2, paddingMm: 1 } }
    });

    const normalized = normalizePrintSpec(manual);
    const alias = normalizePrintOptions(manual);

    expect(normalized).toEqual(alias);
    expect(normalized.paper).toEqual({ size: 'A3', orientation: 'portrait', marginMm: margin, dpi: 300 });
    expect(normalized.content).toEqual({ animations: 'current-frame', domOverlays: 'exclude', controls: 'exclude' });
    expect(normalized.legend).toEqual({
      mode: 'manual',
      groups,
      items,
      layout: { columns: 2, paddingMm: { top: 1, right: 1, bottom: 1, left: 1 } }
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.paper.marginMm)).toBe(true);
    expect(Object.isFrozen((normalized.legend as { readonly groups: readonly unknown[] }).groups)).toBe(true);
    expect(Object.isFrozen((normalized.legend as { readonly items: readonly { readonly symbol: object }[] }).items[0]?.symbol)).toBe(true);

    margin.left = 99;
    groups[0]!.title = '已修改';
    items[0]!.symbol.stroke.dashMm![0] = 99;
    expect(normalized.paper.marginMm.left).toBe(8);
    expect((normalized.legend as { readonly groups: readonly { readonly title: string }[] }).groups[0]?.title).toBe('行动');
    expect(
      (
        normalized.legend as {
          readonly items: readonly { readonly symbol: { readonly kind: 'line'; readonly stroke: { readonly dashMm?: readonly number[] } } }[];
        }
      ).items[0]?.symbol.stroke.dashMm
    ).toEqual([2, 1]);
  });

  it('用固定毫米 token 规划 A4 横向页面和净地图框', () => {
    const result = createPrintPlan(spec(), view(), context());

    expect(result.validation).toEqual({ revision: 7, issues: [], warnings: [], canPreview: true, canExport: true });
    expect(result.plan).toMatchObject({
      revision: 7,
      pageSizeMm: [297, 210],
      mapFrameMm: { x: 12, y: 38, width: 273, height: 144 },
      outputSizePx: [3508, 2480],
      dpi: 300
    });
    expect(result.plan?.range.sourceExtent).toEqual([-500, -250, 500, 250]);
    expect(result.plan?.range.actualExtent[0]).toBeCloseTo(-500, 10);
    expect(result.plan?.range.actualExtent[2]).toBeCloseTo(500, 10);
    expect(result.plan?.range.actualExtent[1]).toBeCloseTo((-500 * 144) / 273, 10);
    expect(result.plan?.range.actualExtent[3]).toBeCloseTo((500 * 144) / 273, 10);
    expect(result.plan?.range.denominator).toBeCloseTo(1_000_000 / 273, 10);
    expect(result.plan?.range.resolution).toBeCloseTo(1000 / ((273 / 25.4) * PRINT_CSS_DPI), 12);
  });

  it('固定比例尺只由纸面净地图框、中心局部单位和 denominator 决定', () => {
    const result = createPrintPlan(
      spec({ range: { source: { mode: 'extent', extent: [-1000, -500, 1000, 500] }, scale: { mode: 'fixed', denominator: 10_000 } } }),
      view(),
      context()
    );

    expect(result.plan?.range.center).toEqual([0, 0]);
    expect(result.plan?.range.denominator).toBe(10_000);
    expect(result.plan?.range.resolution).toBeCloseTo((10_000 * 0.0254) / 96, 12);
    const expectedFootprint = [
      [-1365, 720],
      [1365, 720],
      [1365, -720],
      [-1365, -720]
    ] as const;
    for (let index = 0; index < expectedFootprint.length; index += 1) {
      expect(result.plan?.range.footprint[index]?.[0]).toBeCloseTo(expectedFootprint[index][0], 10);
      expect(result.plan?.range.footprint[index]?.[1]).toBeCloseTo(expectedFootprint[index][1], 10);
    }
    expect(result.validation.issues).toEqual([]);
  });

  it('保留 rotation，并以真实四角计算 actualExtent', () => {
    const rotated = view({ rotation: Math.PI / 2 });
    const result = createPrintPlan(
      spec({ range: { source: { mode: 'extent', extent: [-100, -50, 100, 50] }, scale: { mode: 'fixed', denominator: 10_000 } } }),
      rotated,
      context()
    );

    expect(result.plan?.range.rotation).toBe(Math.PI / 2);
    expect(result.plan?.range.footprint[0]?.[0]).toBeCloseTo(-720, 10);
    expect(result.plan?.range.footprint[0]?.[1]).toBeCloseTo(-1365, 10);
    expect(result.plan?.range.footprint[2]?.[0]).toBeCloseTo(720, 10);
    expect(result.plan?.range.footprint[2]?.[1]).toBeCloseTo(1365, 10);
    expect(result.plan?.range.actualExtent[0]).toBeCloseTo(-720, 10);
    expect(result.plan?.range.actualExtent[3]).toBeCloseTo(1365, 10);
  });

  it('fit 在旋转坐标轴中完整包含来源，并只对称扩展短边', () => {
    const result = createPrintPlan(
      spec({ range: { source: { mode: 'extent', extent: [-100, -50, 100, 50] }, scale: { mode: 'fit' } } }),
      view({ rotation: Math.PI / 2 }),
      context()
    );

    expect(result.plan?.range.footprint[0]?.[0]).toBeCloseTo(-100, 10);
    expect(result.plan?.range.footprint[0]?.[1]).toBeCloseTo((-100 * 273) / 144, 10);
    expect(result.plan?.range.actualExtent[0]).toBeCloseTo(-100, 10);
    expect(result.plan?.range.actualExtent[1]).toBeCloseTo((-100 * 273) / 144, 10);
    expect(result.plan?.range.actualExtent[2]).toBeCloseTo(100, 10);
    expect(result.plan?.range.actualExtent[3]).toBeCloseTo((100 * 273) / 144, 10);
  });

  it('box 尚未完成时不偷用 View 范围，并返回 range-unresolved', () => {
    const result = createPrintPlan(spec({ range: { source: { mode: 'box' }, scale: { mode: 'fit' } } }), view(), context());

    expect(result.plan).toBeUndefined();
    expect(result.validation).toEqual({
      revision: 7,
      issues: [{ code: 'range-unresolved', message: 'Box print range has not been selected', subject: 'range.source' }],
      warnings: [],
      canPreview: false,
      canExport: false
    });
  });

  it('使用已完成 box 的中心和 footprint 规划 fit 与 fixed', () => {
    const boxRange = {
      center: [300, 400] as const,
      footprint: [
        [200, 450],
        [400, 450],
        [400, 350],
        [200, 350]
      ] as const,
      rotation: 0
    };
    const fit = createPrintPlan(spec({ range: { source: { mode: 'box' }, scale: { mode: 'fit' } } }), view(), context({ boxRange }));
    const fixed = createPrintPlan(spec({ range: { source: { mode: 'box' }, scale: { mode: 'fixed', denominator: 1000 } } }), view(), context({ boxRange }));

    expect(fit.plan?.range.center).toEqual([300, 400]);
    expect(fit.plan?.range.sourceExtent).toEqual([200, 350, 400, 450]);
    expect(fixed.plan?.range.center).toEqual([300, 400]);
    expect(fixed.validation.issues).toEqual([]);
  });

  it('fixed 无法包含 view 或 extent 来源时产生阻断 issue', () => {
    const result = createPrintPlan(
      spec({ range: { source: { mode: 'extent', extent: [-1000, -500, 1000, 500] }, scale: { mode: 'fixed', denominator: 5000 } } }),
      view(),
      context()
    );

    expect(result.plan).toBeDefined();
    expect(result.validation.issues.map((issue) => issue.code)).toContain('fixed-scale-crops-source');
    expect(result.validation.canPreview).toBe(false);
    expect(result.validation.canExport).toBe(false);
  });

  it('缺少真北时阻断，局部比例变化时保留需要确认的 warning', () => {
    const missingNorth = createPrintPlan(spec(), view(), context({ northDirection: undefined }));
    const localScale = createPrintPlan(
      spec({ range: { source: { mode: 'view' }, scale: { mode: 'fixed', denominator: 10_000 } } }),
      view({ scaleVariesByPosition: true }),
      context()
    );

    expect(missingNorth.validation.issues.map((issue) => issue.code)).toEqual(['north-direction-unavailable']);
    expect(localScale.validation.warnings).toEqual([
      {
        code: 'scale-valid-at-center',
        message: 'The fixed scale is locally valid at the print center because projection scale varies by position',
        subject: 'range.scale',
        requiresAcknowledgement: true
      }
    ]);
    expect(localScale.validation.canPreview).toBe(true);
    expect(localScale.validation.canExport).toBe(false);
  });

  it('基础状态打印明确提示动画展示被排除', () => {
    const result = createPrintPlan(spec({ content: { animations: 'base' } }), view(), context());

    expect(result.validation.warnings).toEqual([
      {
        code: 'animations-excluded',
        message: 'The print snapshot excludes animation presentation and uses base Element state',
        subject: 'content.animations',
        requiresAcknowledgement: true
      }
    ]);
    expect(result.validation.canPreview).toBe(true);
    expect(result.validation.canExport).toBe(false);
  });

  it('按 orientation 解析自定义纸张，并在 DPI 仅改变输出采样时保持地理范围', () => {
    const custom = spec({ paper: { size: { widthMm: 100, heightMm: 200 }, orientation: 'landscape', marginMm: 5, dpi: 254 } });
    const first = createPrintPlan(custom, view(), context());
    const highDpi = createPrintPlan(
      spec({ paper: { size: { widthMm: 100, heightMm: 200 }, orientation: 'landscape', marginMm: 5, dpi: 508 } }),
      view(),
      context()
    );

    expect(first.plan?.pageSizeMm).toEqual([200, 100]);
    expect(first.plan?.outputSizePx).toEqual([2000, 1000]);
    expect(first.plan?.mapFrameMm).toEqual({ x: 7, y: 33, width: 186, height: 44 });
    expect(highDpi.plan?.range).toEqual(first.plan?.range);
    expect(highDpi.plan?.outputSizePx).toEqual([4000, 2000]);
  });

  it('在分配 Canvas 前把 DPI、单边和总像素预算超限报告为稳定阻断项', () => {
    const tooManyPixels = context({ limits: { ...limits, maxCanvasPixels: 8_000_000 } });
    const tooWide = context({ limits: { ...limits, maxCanvasDimension: 3000 } });
    const dpiOutOfRange = context({ limits: { ...limits, maxDpi: 200 } });

    for (const plannerContext of [tooManyPixels, tooWide, dpiOutOfRange]) {
      const result = createPrintPlan(spec(), view(), plannerContext);
      expect(result.plan?.outputSizePx).toEqual([3508, 2480]);
      expect(result.validation).toMatchObject({
        canPreview: false,
        canExport: false,
        issues: [{ code: 'pixel-budget-exceeded', subject: 'paper.dpi' }]
      });
      expect(result.validation.issues[0]?.message).toContain('A4');
      expect(result.validation.issues[0]?.message).toContain('300 DPI');
      expect(result.validation.issues[0]?.message).toContain('3508×2480px');
      expect(result.validation.issues[0]?.message).toContain('limits');
    }
  });

  it('同时保留尚未框选与像素预算超限两个阻断项', () => {
    const result = createPrintPlan(
      spec({ range: { source: { mode: 'box' }, scale: { mode: 'fit' } } }),
      view(),
      context({ limits: { ...limits, maxCanvasPixels: 8_000_000 } })
    );

    expect(result.plan).toBeUndefined();
    expect(result.validation.issues.map((issue) => issue.code)).toEqual(['range-unresolved', 'pixel-budget-exceeded']);
  });

  it('拒绝固定单行版式字段中的换行符', () => {
    const invalidLayouts = [{ title: '第一行\n第二行' }, { title: '标题', date: '2026-07-23\r内部' }, { title: '标题', issuer: '张三\u2028李四' }];

    for (const layout of invalidLayouts) {
      expect(() => normalizePrintSpec(spec({ layout }))).toThrowError(InvalidArgumentError);
    }
  });

  it('拒绝不能形成净地图框的边距和纸张', () => {
    expect(() =>
      createPrintPlan(spec({ paper: { size: { widthMm: 50, heightMm: 50 }, orientation: 'portrait', marginMm: 5, dpi: 300 } }), view(), context())
    ).toThrowError(/map frame of at least 20mm/);
    expect(() => normalizePrintSpec(spec({ paper: { size: 'A4', orientation: 'portrait', marginMm: 110, dpi: 300 } }))).toThrowError(
      /margins must leave a positive page frame/
    );
  });

  it('严格拒绝未知字段、非法对象、非法范围、空标题和错误图例引用', () => {
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, 'range', { get: () => ({ source: { mode: 'view' }, scale: { mode: 'fit' } }), enumerable: true });

    const invalid = [
      () => normalizePrintSpec({ ...spec(), extra: true } as never),
      () => normalizePrintSpec(accessor as never),
      () => normalizePrintSpec(spec({ layout: { title: '   ' } })),
      () => normalizePrintSpec(spec({ paper: { size: 'a4' as never, orientation: 'landscape', marginMm: 10, dpi: 300 } })),
      () => normalizePrintSpec(spec({ range: { source: { mode: 'extent', extent: [1, 0, 0, 1] }, scale: { mode: 'fit' } } })),
      () => normalizePrintSpec(spec({ range: { source: { mode: 'view' }, scale: { mode: 'fixed', denominator: 0 } } })),
      () =>
        normalizePrintSpec(
          spec({
            legend: {
              mode: 'manual',
              groups: [{ id: 'one', title: '一组' }],
              items: [{ id: 'item', groupId: 'missing', label: '无组', symbol: { kind: 'point', radiusMm: 1 } }]
            }
          })
        )
    ];

    for (const operation of invalid) expect(operation).toThrowError(InvalidArgumentError);
  });

  it('局部投影比例不可用时抛出 CapabilityError，不退化为一单位一米', () => {
    expect(() => createPrintPlan(spec(), view({ metersPerViewUnitAtCenter: 0 }), context())).toThrowError(CapabilityError);
    expect(() => createPrintPlan(spec(), view({ metersPerViewUnitAtCenter: Number.NaN }), context())).toThrowError(CapabilityError);
  });
});

function spec(overrides: Partial<PrintSpec> = {}): PrintSpec {
  return {
    range: { source: { mode: 'view' }, scale: { mode: 'fit' } },
    paper: { size: 'A4', orientation: 'landscape', marginMm: 10, dpi: 300 },
    layout: { title: '态势图' },
    ...overrides
  };
}

function view(overrides: Partial<PrintViewSnapshot> = {}): PrintViewSnapshot {
  return {
    center: [0, 0],
    footprint: [
      [-500, 250],
      [500, 250],
      [500, -250],
      [-500, -250]
    ],
    rotation: 0,
    metersPerViewUnitAtCenter: 1,
    ...overrides
  };
}

function context(overrides: Partial<PrintPlannerContext> = {}): PrintPlannerContext {
  return { revision: 7, limits, northDirection: 0, ...overrides };
}
