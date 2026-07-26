import { describe, expect, it, vi } from 'vitest';
import {
  PrintPageRenderer,
  type PrintCanvasContext,
  type PrintCanvasFactory,
  type PrintCanvasLike,
  type PrintPageRenderInput
} from '../src/adapters/dom/PrintPageRenderer.js';
import { PrintViewAdapter } from '../src/adapters/openlayers/PrintViewAdapter.js';
import { printPageTokens } from '../src/builtins/print/tokens.js';
import { CapabilityError, InvalidArgumentError } from '../src/core/errors.js';
import type { PrintLegendResult } from '../src/core/print/types.js';

interface CanvasOperation {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly fillStyle: string;
  readonly strokeStyle: string;
  readonly lineWidth: number;
  readonly font: string;
  readonly textAlign: CanvasTextAlign;
}

interface CanvasHarness {
  readonly canvas: PrintCanvasLike;
  readonly context: PrintCanvasContext;
  readonly operations: CanvasOperation[];
  readonly factory: PrintCanvasFactory;
}

function canvasHarness(): CanvasHarness {
  const canvas = { width: 0, height: 0 };
  const operations: CanvasOperation[] = [];
  const context = {
    canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    save: vi.fn(() => record('save')),
    restore: vi.fn(() => record('restore')),
    beginPath: vi.fn(() => record('beginPath')),
    closePath: vi.fn(() => record('closePath')),
    moveTo: vi.fn((...args: unknown[]) => record('moveTo', ...args)),
    lineTo: vi.fn((...args: unknown[]) => record('lineTo', ...args)),
    arc: vi.fn((...args: unknown[]) => record('arc', ...args)),
    fill: vi.fn(() => record('fill')),
    stroke: vi.fn(() => record('stroke')),
    fillRect: vi.fn((...args: unknown[]) => record('fillRect', ...args)),
    strokeRect: vi.fn((...args: unknown[]) => record('strokeRect', ...args)),
    drawImage: vi.fn((...args: unknown[]) => record('drawImage', ...args)),
    fillText: vi.fn((...args: unknown[]) => record('fillText', ...args)),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    setLineDash: vi.fn((segments: readonly number[]) => record('setLineDash', ...segments)),
    translate: vi.fn((...args: unknown[]) => record('translate', ...args)),
    rotate: vi.fn((...args: unknown[]) => record('rotate', ...args))
  } as unknown as PrintCanvasContext;

  function record(name: string, ...args: unknown[]): void {
    operations.push({
      name,
      args,
      fillStyle: context.fillStyle,
      strokeStyle: context.strokeStyle,
      lineWidth: context.lineWidth,
      font: context.font,
      textAlign: context.textAlign
    });
  }

  return { canvas, context, operations, factory: () => ({ canvas, context }) };
}

function renderInput(quality: 'draft' | 'final' = 'final', legend: PrintLegendResult = defaultLegend()): Readonly<PrintPageRenderInput> {
  return deepFreeze({
    plan: {
      revision: 1,
      pageSizeMm: [200, 150],
      mapFrameMm: { x: 20, y: 45, width: 160, height: 70 },
      outputSizePx: [2000, 1500],
      dpi: 254,
      range: {
        sourceMode: 'view',
        sourceExtent: [0, 0, 8000, 3500],
        actualExtent: [0, 0, 8000, 3500],
        footprint: [
          [0, 3500],
          [8000, 3500],
          [8000, 0],
          [0, 0]
        ],
        center: [4000, 1750],
        rotation: 0,
        denominator: 50000,
        resolution: 50
      }
    },
    layout: {
      classification: '内部',
      title: '规划成果图',
      subtitle: '综合态势',
      date: '2026-07-23',
      issuer: '张三'
    },
    legend,
    mapBitmap: { kind: 'map-bitmap' } as unknown as CanvasImageSource,
    trueNorthAngleRadians: Math.PI / 6,
    quality
  });
}

function defaultLegend(): PrintLegendResult {
  return {
    groups: [{ id: 'operations', title: '行动要素' }],
    items: [
      {
        id: 'point',
        groupId: 'operations',
        label: '目标点',
        symbol: { kind: 'point', radiusMm: 1.5, fill: { color: '#f00' }, stroke: { color: '#000', widthMm: 0.25 } },
        count: 3
      }
    ],
    sourceRevision: 1,
    warnings: []
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function operationsNamed(harness: CanvasHarness, name: string): readonly CanvasOperation[] {
  return harness.operations.filter((operation) => operation.name === name);
}

describe('PrintPageRenderer', () => {
  it('composes the approved fixed page around the supplied map bitmap', () => {
    const harness = canvasHarness();
    const renderer = new PrintPageRenderer(printPageTokens, harness.factory);
    const input = renderInput();

    const result = renderer.render(input);

    expect(result).toBe(harness.canvas);
    expect(result).toMatchObject({ width: 2000, height: 1500 });
    expect(operationsNamed(harness, 'fillRect')[0]).toMatchObject({ args: [0, 0, 2000, 1500], fillStyle: '#ffffff' });
    expect(operationsNamed(harness, 'drawImage')[0]?.args.slice(1)).toEqual([200, 450, 1600, 700]);

    const text = operationsNamed(harness, 'fillText').map((operation) => operation.args[0]);
    expect(text).toEqual(
      expect.arrayContaining(['内部', '日期：2026-07-23', '签发人：张三', '规划成果图', '综合态势', '图例', '行动要素', '目标点（3）', '比例尺 1∶50000', 'N'])
    );

    const borders = operationsNamed(harness, 'strokeRect').slice(0, 2);
    expect(borders).toHaveLength(2);
    expect(borders[0]?.lineWidth).toBeGreaterThan(borders[1]?.lineWidth ?? Infinity);
    const innerBorder = borders[1]!;
    expect(Number(innerBorder.args[0]) + innerBorder.lineWidth / 2).toBeCloseTo(200, 8);
    expect(Number(innerBorder.args[1]) + innerBorder.lineWidth / 2).toBeCloseTo(450, 8);
    expect(Number(innerBorder.args[0]) + Number(innerBorder.args[2]) - innerBorder.lineWidth / 2).toBeCloseTo(1800, 8);
    expect(Number(innerBorder.args[1]) + Number(innerBorder.args[3]) - innerBorder.lineWidth / 2).toBeCloseTo(1150, 8);
    expect(operationsNamed(harness, 'rotate').map((operation) => operation.args[0])).toContain(Math.PI / 6);
    expect(Object.isFrozen(input)).toBe(true);
  });

  it('limits high-DPI draft backing size while preserving every physical coordinate ratio', () => {
    const draftHarness = canvasHarness();
    const finalHarness = canvasHarness();
    const base = renderInput('final');
    const highDpi = {
      ...base,
      plan: { ...base.plan, dpi: 600, outputSizePx: [6000, 4500] as const }
    };
    const draft = new PrintPageRenderer(printPageTokens, draftHarness.factory).render({ ...highDpi, quality: 'draft' });
    const final = new PrintPageRenderer(printPageTokens, finalHarness.factory).render({ ...highDpi, quality: 'final' });

    expect(final).toMatchObject({ width: 6000, height: 4500 });
    expect(draft.width).toBeLessThan(1600);
    expect(draft.height).toBeLessThan(final.height / 5);
    const draftMap = operationsNamed(draftHarness, 'drawImage')[0]!;
    const finalMap = operationsNamed(finalHarness, 'drawImage')[0]!;
    for (const index of [1, 3]) expect(Number(draftMap.args[index]) / draft.width).toBeCloseTo(Number(finalMap.args[index]) / final.width, 6);
    for (const index of [2, 4]) expect(Number(draftMap.args[index]) / draft.height).toBeCloseTo(Number(finalMap.args[index]) / final.height, 6);
  });

  it('draws point, line, polygon and resolved icon legend symbols', () => {
    const icon = { kind: 'legend-icon' } as unknown as CanvasImageSource;
    const resolveLegendImage = vi.fn(() => icon);
    const legend: PrintLegendResult = {
      groups: [{ id: 'symbols', title: '符号' }],
      items: [
        { id: 'point', groupId: 'symbols', label: '点', symbol: { kind: 'point', radiusMm: 1.5, fill: { color: '#f00' } } },
        { id: 'line', groupId: 'symbols', label: '线', symbol: { kind: 'line', stroke: { color: '#0f0', widthMm: 0.5, dashMm: [1, 1] } } },
        {
          id: 'polygon',
          groupId: 'symbols',
          label: '面',
          symbol: { kind: 'polygon', fill: { color: '#00f' }, stroke: { color: '#000', widthMm: 0.25 } }
        },
        { id: 'icon', groupId: 'symbols', label: '图标', symbol: { kind: 'icon', src: 'icon://target', size: [8, 4], anchor: [0.5, 0.5] } }
      ],
      sourceRevision: 1,
      warnings: []
    };
    const harness = canvasHarness();

    new PrintPageRenderer(printPageTokens, harness.factory).render({ ...renderInput('final', legend), resolveLegendImage });

    expect(operationsNamed(harness, 'arc')).not.toHaveLength(0);
    expect(operationsNamed(harness, 'setLineDash').some((operation) => operation.args.length === 2)).toBe(true);
    expect(operationsNamed(harness, 'fillRect').some((operation) => operation.fillStyle === '#00f')).toBe(true);
    expect(resolveLegendImage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'icon', src: 'icon://target' }));
    expect(operationsNamed(harness, 'drawImage').some((operation) => operation.args[0] === icon)).toBe(true);
    expect(() => new PrintPageRenderer(printPageTokens, canvasHarness().factory).render(renderInput('final', legend))).toThrow(/not preloaded/);
  });

  it('lays out manual legend columns by row or column and applies background and asymmetric padding', () => {
    const legend: PrintLegendResult = {
      groups: [{ id: 'group', title: '' }],
      items: ['A', 'B', 'C', 'D'].map((label, order) => ({
        id: label,
        groupId: 'group',
        label,
        order,
        symbol: { kind: 'line' as const, stroke: { color: '#123456', widthMm: 0.4 } }
      })),
      sourceRevision: 1,
      warnings: []
    };
    const rowHarness = canvasHarness();
    const columnHarness = canvasHarness();
    const uniformPaddingHarness = canvasHarness();
    const layout = {
      columns: 2,
      maxWidthMm: 90,
      paddingMm: { top: 1, right: 2, bottom: 3, left: 7 },
      background: '#abcdef',
      groupGapMm: 4,
      itemGapMm: 3
    } as const;

    new PrintPageRenderer(printPageTokens, rowHarness.factory).render({ ...renderInput('final', legend), legendLayout: { ...layout, direction: 'row' } });
    new PrintPageRenderer(printPageTokens, columnHarness.factory).render({ ...renderInput('final', legend), legendLayout: { ...layout, direction: 'column' } });
    new PrintPageRenderer(printPageTokens, uniformPaddingHarness.factory).render({
      ...renderInput('final', legend),
      legendLayout: { ...layout, direction: 'row', paddingMm: 1 }
    });

    const rowText = operationsNamed(rowHarness, 'fillText').filter((operation) => ['A', 'B', 'C', 'D'].includes(String(operation.args[0])));
    const columnText = operationsNamed(columnHarness, 'fillText').filter((operation) => ['A', 'B', 'C', 'D'].includes(String(operation.args[0])));
    expect(rowText[0]?.args[2]).toBe(rowText[1]?.args[2]);
    expect(rowText[0]?.args[1]).toBe(rowText[2]?.args[1]);
    expect(columnText[0]?.args[1]).toBe(columnText[1]?.args[1]);
    expect(columnText[0]?.args[2]).toBe(columnText[2]?.args[2]);
    expect(operationsNamed(rowHarness, 'fillRect').some((operation) => operation.fillStyle === '#abcdef')).toBe(true);
    const uniformA = operationsNamed(uniformPaddingHarness, 'fillText').find((operation) => operation.args[0] === 'A');
    expect(Number(rowText[0]?.args[1])).toBeGreaterThan(Number(uniformA?.args[1]));
  });

  it('anchors manual legends to all four map corners and keeps the default at bottom-left', () => {
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
    const boxes = new Map<(typeof positions)[number] | 'default', CanvasOperation>();
    const renderAt = (position?: (typeof positions)[number]): void => {
      const harness = canvasHarness();
      new PrintPageRenderer(printPageTokens, harness.factory).render({
        ...renderInput(),
        legendLayout: position === undefined ? undefined : { position }
      });
      const background = operationsNamed(harness, 'fillRect').find((operation) => operation.fillStyle === printPageTokens.colors.legendBackground);
      expect(background).toBeDefined();
      boxes.set(position ?? 'default', background!);
    };

    renderAt();
    for (const position of positions) renderAt(position);

    const topLeft = boxes.get('top-left')!;
    const topRight = boxes.get('top-right')!;
    const bottomLeft = boxes.get('bottom-left')!;
    const bottomRight = boxes.get('bottom-right')!;
    expect(topLeft.args[0]).toBe(bottomLeft.args[0]);
    expect(topRight.args[0]).toBe(bottomRight.args[0]);
    expect(Number(topRight.args[0])).toBeGreaterThan(Number(topLeft.args[0]));
    expect(topLeft.args[1]).toBe(topRight.args[1]);
    expect(bottomLeft.args[1]).toBe(bottomRight.args[1]);
    expect(Number(bottomLeft.args[1])).toBeGreaterThan(Number(topLeft.args[1]));
    expect(boxes.get('default')?.args).toEqual(bottomLeft.args);

    const mapLeft = 200;
    const mapTop = 450;
    const mapRight = 1800;
    const mapBottom = 1150;
    const inset = 30;
    for (const box of [topLeft, topRight, bottomLeft, bottomRight]) {
      expect(Number(box.args[0])).toBeGreaterThanOrEqual(mapLeft + inset);
      expect(Number(box.args[1])).toBeGreaterThanOrEqual(mapTop + inset);
      expect(Number(box.args[0]) + Number(box.args[2])).toBeLessThanOrEqual(mapRight - inset);
      expect(Number(box.args[1]) + Number(box.args[3])).toBeLessThanOrEqual(mapBottom - inset);
    }
  });

  it('applies manual group/item gaps and reports legend width or height overflow explicitly', () => {
    const legend: PrintLegendResult = {
      groups: [
        { id: 'first', title: '第一组' },
        { id: 'second', title: '第二组' }
      ],
      items: [
        { id: 'a', groupId: 'first', label: 'A', symbol: { kind: 'point', radiusMm: 1, fill: { color: '#f00' } } },
        { id: 'b', groupId: 'first', label: 'B', symbol: { kind: 'point', radiusMm: 1, fill: { color: '#f00' } } },
        { id: 'c', groupId: 'second', label: 'C', symbol: { kind: 'point', radiusMm: 1, fill: { color: '#f00' } } }
      ],
      sourceRevision: 1,
      warnings: []
    };
    const compact = canvasHarness();
    const spaced = canvasHarness();
    new PrintPageRenderer(printPageTokens, compact.factory).render({
      ...renderInput('final', legend),
      legendLayout: { columns: 1, direction: 'row', maxWidthMm: 80, groupGapMm: 1, itemGapMm: 1 }
    });
    new PrintPageRenderer(printPageTokens, spaced.factory).render({
      ...renderInput('final', legend),
      legendLayout: { columns: 1, direction: 'row', maxWidthMm: 80, groupGapMm: 3, itemGapMm: 2 }
    });
    const compactText = new Map(
      operationsNamed(compact, 'fillText')
        .filter((operation) => ['A', 'B', 'C'].includes(String(operation.args[0])))
        .map((operation) => [operation.args[0], Number(operation.args[2])])
    );
    const spacedText = new Map(
      operationsNamed(spaced, 'fillText')
        .filter((operation) => ['A', 'B', 'C'].includes(String(operation.args[0])))
        .map((operation) => [operation.args[0], Number(operation.args[2])])
    );
    expect((spacedText.get('B') ?? 0) - (spacedText.get('A') ?? 0)).toBeGreaterThan((compactText.get('B') ?? 0) - (compactText.get('A') ?? 0));
    expect((spacedText.get('C') ?? 0) - (spacedText.get('B') ?? 0)).toBeGreaterThan((compactText.get('C') ?? 0) - (compactText.get('B') ?? 0));

    expect(() =>
      new PrintPageRenderer(printPageTokens, canvasHarness().factory).render({
        ...renderInput('final', legend),
        legendLayout: { columns: 2, direction: 'row', maxWidthMm: 12 }
      })
    ).toThrow(/legend-overflow/);
    const manyItems: PrintLegendResult = { ...legend, items: Array.from({ length: 80 }, (_, index) => ({ ...legend.items[0]!, id: `item-${index}` })) };
    expect(() =>
      new PrintPageRenderer(printPageTokens, canvasHarness().factory).render({
        ...renderInput('final', manyItems),
        legendLayout: { columns: 1, direction: 'row', maxWidthMm: 80, itemGapMm: 4 }
      })
    ).toThrow(/legend-overflow/);
  });

  it('includes the overall legend title in width and height preflight', () => {
    const widthHarness = canvasHarness();
    vi.mocked(widthHarness.context.measureText).mockImplementation((text: string) => ({ width: text === '图例' ? 1000 : text.length * 8 }));
    expect(() => new PrintPageRenderer(printPageTokens, widthHarness.factory).render(renderInput())).toThrow(/legend-overflow/);

    const tallTokens = {
      ...printPageTokens,
      fonts: { ...printPageTokens.fonts, legendTitleSizeMm: 60 }
    };
    expect(() => new PrintPageRenderer(tallTokens, canvasHarness().factory).render(renderInput())).toThrow(/legend-overflow/);
  });

  it('preflights footer overlap and printable-bottom overflow as layout-text-overflow', () => {
    const input = renderInput('final', { groups: [], items: [], sourceRevision: 1, warnings: [] });
    expect(() =>
      new PrintPageRenderer(printPageTokens, canvasHarness().factory).render({
        ...input,
        plan: {
          ...input.plan,
          pageSizeMm: [45, 150],
          outputSizePx: [450, 1500],
          mapFrameMm: { x: 10, y: 45, width: 25, height: 70 }
        }
      })
    ).toThrow(/layout-text-overflow/);
    expect(() =>
      new PrintPageRenderer(printPageTokens, canvasHarness().factory).render({ ...input, pageInsets: { top: 5, right: 5, bottom: 30, left: 5 } })
    ).toThrow(/layout-text-overflow/);
  });

  it('uses the rotated north-arrow path AABB while keeping the N label upright', () => {
    const emptyLegend = { groups: [], items: [], sourceRevision: 1, warnings: [] } as const;
    const input = renderInput('final', emptyLegend);
    const narrow = {
      ...input,
      layout: { title: input.layout.title },
      plan: {
        ...input.plan,
        pageSizeMm: [72, 150] as const,
        outputSizePx: [720, 1500] as const,
        mapFrameMm: { x: 10, y: 45, width: 52, height: 70 }
      }
    };
    const renderNarrow = (angle: number): void => {
      const harness = canvasHarness();
      vi.mocked(harness.context.measureText).mockImplementation((text: string) => ({ width: text.startsWith('比例尺') ? 319 : 8 }));
      new PrintPageRenderer(printPageTokens, harness.factory).render({ ...narrow, trueNorthAngleRadians: angle });
    };
    expect(() => renderNarrow(0)).not.toThrow();
    expect(() => renderNarrow(Math.PI / 4)).toThrow(/layout-text-overflow/);
    expect(() => renderNarrow(Math.PI / 2)).toThrow(/layout-text-overflow/);

    const harness = canvasHarness();
    new PrintPageRenderer(printPageTokens, harness.factory).render({ ...renderInput('final', emptyLegend), trueNorthAngleRadians: Math.PI / 4 });
    const north = operationsNamed(harness, 'fillText').find((operation) => operation.args[0] === 'N');
    expect(north?.args[1]).toBeGreaterThan(0);
    expect(north?.args[2]).toBeGreaterThan(0);

    const eastHarness = canvasHarness();
    new PrintPageRenderer(printPageTokens, eastHarness.factory).render({ ...renderInput('final', emptyLegend), trueNorthAngleRadians: Math.PI / 2 });
    const eastCenter = operationsNamed(eastHarness, 'translate').at(-1);
    const eastLabel = operationsNamed(eastHarness, 'fillText').find((operation) => operation.args[0] === 'N');
    expect(Number(eastLabel?.args[1])).toBeGreaterThan(Number(eastCenter?.args[0]));
    expect(Number(eastLabel?.args[2])).toBeCloseTo(Number(eastCenter?.args[1]), 6);

    const northHarness = canvasHarness();
    const northInput = renderInput('final', emptyLegend);
    new PrintPageRenderer(printPageTokens, northHarness.factory).render({ ...northInput, trueNorthAngleRadians: 0 });
    const northLabel = operationsNamed(northHarness, 'fillText').find((operation) => operation.args[0] === 'N');
    const pixelsPerMmY = northInput.plan.outputSizePx[1] / northInput.plan.pageSizeMm[1];
    const footerTopMm = northInput.plan.mapFrameMm.y + northInput.plan.mapFrameMm.height + printPageTokens.layout.mapFooterGapMm;
    expect(Number(northLabel?.args[2]) / pixelsPerMmY - printPageTokens.fonts.footerSizeMm / 2).toBeGreaterThanOrEqual(footerTopMm);
  });

  it('exposes stable font samples containing every actually rendered label', () => {
    const harness = canvasHarness();
    const renderer = new PrintPageRenderer(printPageTokens, harness.factory);
    const input = renderInput();
    renderer.render(input);

    const first = renderer.fontSamples(input);
    const second = renderer.fontSamples(input);
    const textFonts = new Map(operationsNamed(harness, 'fillText').map((operation) => [String(operation.args[0]), operation.font]));
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toHaveLength(8);
    for (const label of ['内部', '日期：2026-07-23', '签发人：张三', '规划成果图', '综合态势', '图例', '行动要素', '目标点（3）', '比例尺 1∶50000', 'N']) {
      expect(first).toContainEqual(expect.objectContaining({ font: textFonts.get(label), text: expect.stringContaining(label) }));
    }
  });

  it('releases backing surfaces idempotently and destroys every retained surface', () => {
    const canvases: PrintCanvasLike[] = [];
    const factory: PrintCanvasFactory = () => {
      const harness = canvasHarness();
      canvases.push(harness.canvas);
      return { canvas: harness.canvas, context: harness.context };
    };
    const renderer = new PrintPageRenderer(printPageTokens, factory);
    const first = renderer.render(renderInput());
    renderer.render(renderInput());
    renderer.render(renderInput());

    renderer.release(first);
    renderer.release(first);
    expect(first).toEqual({ width: 1, height: 1 });
    expect(canvases.slice(1)).toEqual([expect.objectContaining({ width: 2000, height: 1500 }), expect.objectContaining({ width: 2000, height: 1500 })]);
    renderer.destroy();
    renderer.destroy();
    expect(canvases).toEqual(Array.from({ length: 3 }, () => ({ width: 1, height: 1 })));
  });

  it('uses asymmetric page insets for header/title alignment and both footer anchors', () => {
    const defaultHarness = canvasHarness();
    const insetHarness = canvasHarness();
    new PrintPageRenderer(printPageTokens, defaultHarness.factory).render(renderInput());
    new PrintPageRenderer(printPageTokens, insetHarness.factory).render({
      ...renderInput(),
      pageInsets: { top: 20, right: 30, bottom: 15, left: 25 }
    });
    const classification = operationsNamed(insetHarness, 'fillText').find((operation) => operation.args[0] === '内部');
    const title = operationsNamed(insetHarness, 'fillText').find((operation) => operation.args[0] === '规划成果图');
    expect(classification?.args[1]).toBe(250);
    expect(title?.args[1]).toBe(975);
    const footerRects = operationsNamed(insetHarness, 'fillRect').filter((operation) => Number(operation.args[1]) > 1150 && Number(operation.args[2]) < 500);
    expect(footerRects.some((operation) => operation.args[0] === 250)).toBe(true);
    const defaultNorth = operationsNamed(defaultHarness, 'translate').at(-1);
    const insetNorth = operationsNamed(insetHarness, 'translate').at(-1);
    expect(Number(insetNorth?.args[0])).toBeLessThan(Number(defaultNorth?.args[0]));
  });

  it('keeps independent date and issuer header slots when either value is empty', () => {
    const complete = canvasHarness();
    const dateOnly = canvasHarness();
    const issuerOnly = canvasHarness();
    const input = renderInput();
    new PrintPageRenderer(printPageTokens, complete.factory).render(input);
    new PrintPageRenderer(printPageTokens, dateOnly.factory).render({ ...input, layout: { ...input.layout, issuer: '' } });
    new PrintPageRenderer(printPageTokens, issuerOnly.factory).render({ ...input, layout: { ...input.layout, date: '' } });

    const textX = (harness: CanvasHarness, text: string): unknown =>
      operationsNamed(harness, 'fillText').find((operation) => operation.args[0] === text)?.args[1];
    expect(textX(dateOnly, '日期：2026-07-23')).toBe(textX(complete, '日期：2026-07-23'));
    expect(textX(issuerOnly, '签发人：张三')).toBe(textX(complete, '签发人：张三'));
    expect(textX(dateOnly, '签发人：张三')).toBeUndefined();
    expect(textX(issuerOnly, '日期：2026-07-23')).toBeUndefined();
  });

  it('keeps date and issuer in a compact stable right-side cluster', () => {
    const harness = canvasHarness();
    const input = renderInput();
    new PrintPageRenderer(printPageTokens, harness.factory).render(input);

    const date = operationsNamed(harness, 'fillText').find((operation) => operation.args[0] === '日期：2026-07-23');
    const issuer = operationsNamed(harness, 'fillText').find((operation) => operation.args[0] === '签发人：张三');
    const pixelsPerMm = input.plan.outputSizePx[0] / input.plan.pageSizeMm[0];
    expect(date?.textAlign).toBe('right');
    expect(issuer?.textAlign).toBe('left');
    expect(Number(issuer?.args[1]) - Number(date?.args[1])).toBeCloseTo(printPageTokens.header.metadataGapMm * pixelsPerMm, 8);
    expect(Number(issuer?.args[1]) + printPageTokens.header.issuerSlotWidthMm * pixelsPerMm).toBeCloseTo(
      input.plan.outputSizePx[0] - printPageTokens.header.pageInsetMm * pixelsPerMm,
      8
    );
  });

  it('keeps title and footer decorations visibly clear of the outer map border', () => {
    const harness = canvasHarness();
    const input = renderInput();
    new PrintPageRenderer(printPageTokens, harness.factory).render(input);

    const outerBorder = operationsNamed(harness, 'strokeRect')[0]!;
    const subtitle = operationsNamed(harness, 'fillText').find((operation) => operation.args[0] === '综合态势')!;
    const scaleSegment = operationsNamed(harness, 'fillRect').find((operation) => {
      const y = Number(operation.args[1]);
      const width = Number(operation.args[2]);
      return y > 1150 && width < 500 && (operation.fillStyle === printPageTokens.colors.ink || operation.fillStyle === printPageTokens.colors.paper);
    })!;
    const pixelsPerMmY = input.plan.outputSizePx[1] / input.plan.pageSizeMm[1];
    const outerTop = Number(outerBorder.args[1]) - outerBorder.lineWidth / 2;
    const outerBottom = Number(outerBorder.args[1]) + Number(outerBorder.args[3]) + outerBorder.lineWidth / 2;
    expect(outerTop - Number(subtitle.args[2])).toBeGreaterThanOrEqual(3 * pixelsPerMmY);
    expect(Number(scaleSegment.args[1]) - outerBottom).toBeGreaterThanOrEqual(3 * pixelsPerMmY);
  });

  it('preflights real symbol bounds and scales extreme icon size/anchor into its fixed slot', () => {
    const symbolLegend = (symbol: PrintLegendResult['items'][number]['symbol']): PrintLegendResult => ({
      groups: [{ id: 'symbols', title: '' }],
      items: [{ id: 'symbol', groupId: 'symbols', label: '极值', symbol }],
      sourceRevision: 1,
      warnings: []
    });
    expect(() =>
      new PrintPageRenderer(printPageTokens, canvasHarness().factory).render(
        renderInput('final', symbolLegend({ kind: 'point', radiusMm: 3, fill: { color: '#f00' }, stroke: { color: '#000', widthMm: 1 } }))
      )
    ).toThrow(/legend-overflow/);
    expect(() =>
      new PrintPageRenderer(printPageTokens, canvasHarness().factory).render(
        renderInput('final', symbolLegend({ kind: 'line', stroke: { color: '#000', widthMm: 5 } }))
      )
    ).toThrow(/legend-overflow/);

    const icon = { kind: 'extreme-icon' } as unknown as CanvasImageSource;
    const harness = canvasHarness();
    const legend = symbolLegend({ kind: 'icon', src: 'icon://extreme', size: [10000, 1], anchor: [1000, -500] });
    new PrintPageRenderer(printPageTokens, harness.factory).render({ ...renderInput('final', legend), resolveLegendImage: () => icon });
    const operation = operationsNamed(harness, 'drawImage').find((candidate) => candidate.args[0] === icon);
    expect(operation).toBeDefined();
    expect(Number(operation?.args[3])).toBeGreaterThan(0);
    expect(Number(operation?.args[4])).toBeGreaterThan(0);
  });

  it.each([
    ['classification', { classification: '密'.repeat(300) }],
    ['header metadata', { date: '2026'.repeat(200), issuer: '签发人' }],
    ['title', { title: '主标题'.repeat(300) }],
    ['subtitle', { subtitle: '副标题'.repeat(300) }]
  ])('reports layout-text-overflow for %s', (_subject, patch) => {
    const input = renderInput();
    const harness = canvasHarness();
    expect(() => new PrintPageRenderer(printPageTokens, harness.factory).render({ ...input, layout: { ...input.layout, ...patch } })).toThrow(
      /layout-text-overflow/
    );
  });

  it('preloads real icon images with crossOrigin and releases resolver resources', async () => {
    const originalImage = globalThis.Image;
    const instances: FakeImage[] = [];
    class FakeImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      #src = '';

      constructor() {
        instances.push(this);
      }

      get src(): string {
        return this.#src;
      }

      set src(value: string) {
        this.#src = value;
        if (value.length > 0) queueMicrotask(() => this.onload?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });
    const legend: PrintLegendResult = {
      groups: [{ id: 'icons', title: '' }],
      items: [
        {
          id: 'icon',
          groupId: 'icons',
          label: '图标',
          symbol: { kind: 'icon', src: 'https://example.test/icon.png', size: [24, 12], anchor: [0.5, 0.5], crossOrigin: 'anonymous' }
        }
      ],
      sourceRevision: 1,
      warnings: []
    };
    const harness = canvasHarness();
    const renderer = new PrintPageRenderer(printPageTokens, harness.factory);
    try {
      const resources = await renderer.preloadLegendImages(legend, { signal: new AbortController().signal, timeoutMs: 1000 });
      expect(instances).toHaveLength(1);
      expect(instances[0]).toMatchObject({ crossOrigin: 'anonymous', src: 'https://example.test/icon.png' });
      expect(resources.resourceDescriptors).toEqual([{ layerId: 'icons', resourceType: 'icon', sourceId: 'https://example.test/icon.png' }]);
      expect(resources.resolve(legend.items[0]!.symbol as Extract<(typeof legend.items)[number]['symbol'], { kind: 'icon' }>)).toBe(instances[0]);
      renderer.render({ ...renderInput('final', legend), resolveLegendImage: resources.resolve });
      expect(operationsNamed(harness, 'drawImage').some((operation) => operation.args[0] === instances[0])).toBe(true);
      resources.destroy();
      expect(instances[0]?.src).toBe('');
    } finally {
      renderer.destroy();
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage });
    }
  });

  it('honors abort and timeout while preloading legend icons', async () => {
    const originalImage = globalThis.Image;
    class PendingImage {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      src = '';
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: PendingImage });
    const legend: PrintLegendResult = {
      groups: [{ id: 'icons', title: '' }],
      items: [{ id: 'icon', groupId: 'icons', label: '图标', symbol: { kind: 'icon', src: 'pending://icon', size: [10, 10], anchor: [0.5, 0.5] } }],
      sourceRevision: 1,
      warnings: []
    };
    const renderer = new PrintPageRenderer(printPageTokens, canvasHarness().factory);
    vi.useFakeTimers();
    try {
      const timeout = renderer.preloadLegendImages(legend, { signal: new AbortController().signal, timeoutMs: 25 });
      const timeoutExpectation = expect(timeout).rejects.toMatchObject({ code: 'resource-timeout' });
      await vi.advanceTimersByTimeAsync(25);
      await timeoutExpectation;
      const controller = new AbortController();
      const cancelled = renderer.preloadLegendImages(legend, { signal: controller.signal, timeoutMs: 1000 });
      const cancelledExpectation = expect(cancelled).rejects.toMatchObject({ code: 'cancelled' });
      controller.abort();
      await cancelledExpectation;
      const destroyed = renderer.preloadLegendImages(legend, { signal: new AbortController().signal, timeoutMs: 1000 });
      const destroyedExpectation = expect(destroyed).rejects.toMatchObject({ code: 'cancelled' });
      renderer.destroy();
      await destroyedExpectation;
    } finally {
      vi.useRealTimers();
      renderer.destroy();
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage });
    }
  });

  it('rejects non-finite north angles before creating a canvas', () => {
    const harness = canvasHarness();
    const input = { ...renderInput(), trueNorthAngleRadians: Number.NaN };

    expect(() => new PrintPageRenderer(printPageTokens, harness.factory).render(input)).toThrow(InvalidArgumentError);
    expect(harness.operations).toHaveLength(0);
  });

  it('uses the composition-root token value instead of importing a builtin singleton', () => {
    const harness = canvasHarness();
    const tokens = { ...printPageTokens, colors: { ...printPageTokens.colors, paper: '#fefefe' } };

    new PrintPageRenderer(tokens, harness.factory).render(renderInput());

    expect(operationsNamed(harness, 'fillRect')[0]?.fillStyle).toBe('#fefefe');
  });
});

describe('PrintViewAdapter lifecycle', () => {
  it('cleans fake Observable keys once and ignores stale view-change callbacks after repeated destroy', () => {
    const mapListeners = new Map<string, () => void>();
    const fakeView = {
      on: vi.fn((type: string, listener: () => void) => ({ target: fakeView, type, listener })),
      un: vi.fn()
    };
    const fakeMap = {
      on: vi.fn((type: string, listener: () => void) => {
        mapListeners.set(type, listener);
        return { target: fakeMap, type, listener };
      }),
      un: vi.fn(),
      getView: vi.fn(() => fakeView)
    };
    const adapter = new PrintViewAdapter(fakeMap as never);
    const staleViewChange = mapListeners.get('change:view');

    staleViewChange?.();
    expect(fakeView.on).toHaveBeenCalledTimes(6);
    expect(fakeView.un).toHaveBeenCalledTimes(3);

    adapter.destroy();
    adapter.destroy();
    expect(fakeMap.un).toHaveBeenCalledTimes(2);
    expect(fakeView.un).toHaveBeenCalledTimes(6);

    staleViewChange?.();
    expect(fakeView.on).toHaveBeenCalledTimes(6);
    expect(fakeView.un).toHaveBeenCalledTimes(6);
  });

  it('keeps print footprints in the View projection when a global user projection is active', () => {
    const previous = getUserProjection();
    clearUserProjection();
    const view = new View({ projection: 'EPSG:3857', center: [1_000_000, 1_000_000], resolution: 2, rotation: Math.PI / 6 });
    const map = printViewMap(view, [400, 200]);
    const adapter = new PrintViewAdapter(map as never);
    try {
      const baseline = adapter.snapshot();
      useGeographic();
      const withUserProjection = adapter.snapshot();
      expect(withUserProjection.center[0]).toBeCloseTo(baseline.center[0], 8);
      expect(withUserProjection.center[1]).toBeCloseTo(baseline.center[1], 8);
      for (const [index, coordinate] of withUserProjection.footprint.entries()) {
        expect(coordinate[0]).toBeCloseTo(baseline.footprint[index]![0], 8);
        expect(coordinate[1]).toBeCloseTo(baseline.footprint[index]![1], 8);
      }
    } finally {
      if (previous === null) clearUserProjection();
      else setUserProjection(previous);
      adapter.destroy();
    }
  });

  it('calculates north against the requested print rotation and rejects geographic poles', () => {
    const view = new View({ projection: 'EPSG:3857', center: [0, 0], resolution: 1, rotation: Math.PI / 3 });
    const adapter = new PrintViewAdapter(printViewMap(view, [100, 100]) as never);

    expect(adapter.northAngleAt([0, 0], 0)).toBeCloseTo(0, 6);
    expect(adapter.northAngleAt([0, 0], Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(() => adapter.northAngleAt(fromLonLat([0, 90]) as [number, number], 0)).toThrowError(CapabilityError);
    adapter.destroy();
  });
});

function printViewMap(view: View, size: readonly [number, number]): object {
  const map = {
    on: (type: string, listener: () => void) => ({ target: map, type, listener }),
    un: () => undefined,
    getView: () => view,
    getSize: () => size
  };
  return map;
}
import View from 'ol/View.js';
import { clearUserProjection, fromLonLat, getUserProjection, setUserProjection, useGeographic } from 'ol/proj.js';
