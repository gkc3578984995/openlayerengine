import type {
  PrintFontSample,
  PrintLayoutSpec,
  PrintIconLegendSymbol,
  PrintLegendItem,
  PrintLegendLayoutSpec,
  PrintLegendResult,
  PrintLegendSymbolSpec,
  PrintPageInsets,
  PrintPageRect,
  PrintPlan
} from '../../core/print/types.js';
import { InvalidArgumentError, ObjectDisposedError, PrintError } from '../../core/errors.js';
import { sanitizePrintSourceId, type PrintResourceDescriptor } from '../../core/print/PrintResourceSource.js';

/** 由 composition root 注入的固定打印页视觉 token。 */
export interface PrintPageTokens {
  readonly colors: Readonly<{
    paper: string;
    ink: string;
    mutedInk: string;
    legendBackground: string;
    legendBorder: string;
  }>;
  readonly fonts: Readonly<{
    family: string;
    headerSizeMm: number;
    titleSizeMm: number;
    subtitleSizeMm: number;
    legendTitleSizeMm: number;
    legendGroupSizeMm: number;
    legendItemSizeMm: number;
    footerSizeMm: number;
  }>;
  readonly border: Readonly<{
    outerWidthMm: number;
    innerWidthMm: number;
    gapMm: number;
  }>;
  readonly layout: Readonly<{
    headerBandHeightMm: number;
    titleBandHeightMm: number;
    titleGapMm: number;
    frameReserveMm: number;
    mapFooterGapMm: number;
    footerBandHeightMm: number;
  }>;
  readonly header: Readonly<{
    pageInsetMm: number;
    titleGapMm: number;
    metadataGapMm: number;
    dateSlotWidthMm: number;
    issuerSlotWidthMm: number;
  }>;
  readonly legend: Readonly<{
    mapInsetMm: number;
    paddingMm: number;
    borderWidthMm: number;
    rowGapMm: number;
    groupGapMm: number;
    symbolWidthMm: number;
    symbolHeightMm: number;
    symbolTextGapMm: number;
    maxWidthRatio: number;
    maxHeightRatio: number;
  }>;
  readonly footer: Readonly<{
    pageInsetMm: number;
    scaleBarTargetWidthMm: number;
    scaleBarHeightMm: number;
    scaleBarSegments: number;
    northArrowSizeMm: number;
    northArrowLabelGapMm: number;
  }>;
}

export interface PrintCanvasLike {
  width: number;
  height: number;
}

export interface PrintCanvasContext {
  readonly canvas: PrintCanvasLike;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dWidth: number, dHeight: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): Pick<TextMetrics, 'width'>;
  setLineDash(segments: readonly number[]): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
}

export interface PrintCanvasSurface {
  readonly canvas: PrintCanvasLike;
  readonly context: PrintCanvasContext;
}

export type PrintCanvasFactory = (width: number, height: number) => PrintCanvasSurface;

export type PrintLegendImageResolver = (symbol: Readonly<PrintIconLegendSymbol>) => CanvasImageSource | undefined;

export interface PrintLegendImageResources {
  readonly resolve: PrintLegendImageResolver;
  /** 页面编码失败时用于定位可能污染 Canvas 的图例图标，来源已脱敏。 */
  readonly resourceDescriptors: readonly Readonly<PrintResourceDescriptor>[];
  destroy(): void;
}

export interface PrintLegendImageLoadOptions {
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

/** 兼容页面装配层的本地名称，数据契约仍以 Core 的 PrintLegendResult 为唯一真源。 */
export type PrintPageLegendResult = PrintLegendResult;

export interface PrintPageRenderInput {
  readonly plan: Readonly<PrintPlan>;
  readonly layout: Readonly<PrintLayoutSpec>;
  /** 页面四边边距；由 composition root 从 PrintSpec.paper.marginMm 传入。 */
  readonly pageInsets?: number | Readonly<PrintPageInsets>;
  readonly legend: Readonly<PrintLegendResult>;
  /** 手动图例的局部页面渲染输入；公共 PrintLegendResult 不承载版式。 */
  readonly legendLayout?: Readonly<PrintLegendLayoutSpec>;
  readonly mapBitmap: CanvasImageSource;
  /** 0 表示纸面正上方，正值按 Canvas 坐标系顺时针旋转。 */
  readonly trueNorthAngleRadians: number;
  readonly quality?: 'draft' | 'final';
  readonly resolveLegendImage?: PrintLegendImageResolver;
}

interface DrawingMetrics {
  readonly pixelsPerMmX: number;
  readonly pixelsPerMmY: number;
  readonly pixelsPerMm: number;
  readonly tokens: Readonly<PrintPageTokens>;
}

interface LegendRow {
  readonly kind: 'group' | 'item';
  readonly text: string;
  readonly item?: Readonly<PrintLegendItem>;
}

interface LegendSection {
  readonly title: LegendRow | undefined;
  readonly items: readonly LegendRow[];
}

interface ResolvedLegendLayout {
  readonly position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  readonly columns: number;
  readonly direction: 'row' | 'column';
  readonly maxWidthMm: number;
  readonly padding: Readonly<PrintPageInsets>;
  readonly background: string;
  readonly groupGapMm: number;
  readonly itemGapMm: number;
}

interface LegendItemPlacement {
  readonly row: LegendRow;
  readonly column: number;
  readonly line: number;
}

interface PhysicalBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface NorthArrowLayout {
  readonly centerX: number;
  readonly centerY: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly bounds: PhysicalBox;
}

const draftDpi = 96;
const draftLongestEdgePx = 1600;

/** 使用同一 Canvas 2D 绘制路径合成 draft 和 final 固定打印页。 */
export class PrintPageRenderer {
  readonly #tokens: Readonly<PrintPageTokens>;
  readonly #createCanvas: PrintCanvasFactory;
  readonly #surfaces = new Set<PrintCanvasLike>();
  readonly #imageResources = new Set<LoadedLegendImageResources>();
  readonly #imageLoadControllers = new Set<AbortController>();
  #destroyed = false;

  constructor(tokens: Readonly<PrintPageTokens>, createCanvas: PrintCanvasFactory = defaultCanvasFactory) {
    this.#tokens = tokens;
    this.#createCanvas = createCanvas;
  }

  render(input: Readonly<PrintPageRenderInput>): PrintCanvasLike {
    if (this.#destroyed) throw new ObjectDisposedError('Print page renderer has been destroyed');
    validateInput(input);
    const [width, height] = renderOutputSize(input.plan, input.quality ?? 'final');
    const surface = this.#createCanvas(width, height);
    surface.canvas.width = width;
    surface.canvas.height = height;
    this.#surfaces.add(surface.canvas);

    try {
      const metrics = drawingMetrics(input.plan, this.#tokens, [width, height]);
      const pageInsets = resolvePageInsets(input.pageInsets, this.#tokens.header.pageInsetMm);
      const context = surface.context;
      drawPaper(context, width, height, metrics);
      drawMap(context, input.mapBitmap, input.plan.mapFrameMm, metrics);
      drawMapBorder(context, input.plan.mapFrameMm, metrics);
      drawHeaderAndTitles(context, input.plan, input.layout, pageInsets, metrics);
      drawLegend(context, input.plan.mapFrameMm, input.legend, input.legendLayout, metrics, input.resolveLegendImage);
      drawFooter(context, input.plan, input.trueNorthAngleRadians, pageInsets, metrics);
      return surface.canvas;
    } catch (error) {
      this.release(surface.canvas);
      throw error;
    }
  }

  /** 返回本次页面绘制实际可见的字体与文本，供装配层按 unicode-range 等待字体就绪。 */
  fontSamples(input: Readonly<Pick<PrintPageRenderInput, 'plan' | 'layout' | 'legend' | 'quality'>>): readonly Readonly<PrintFontSample>[] {
    if (this.#destroyed) throw new ObjectDisposedError('Print page renderer has been destroyed');
    const metrics = drawingMetrics(input.plan, this.#tokens, renderOutputSize(input.plan, input.quality ?? 'final'));
    const fonts = this.#tokens.fonts;
    const samples: PrintFontSample[] = [];
    addFontSample(
      samples,
      font(fonts.headerSizeMm, false, metrics),
      [input.layout.classification, headerDate(input.layout), headerIssuer(input.layout)]
        .filter((text): text is string => text !== undefined && text.length > 0)
        .join('\n')
    );
    addFontSample(samples, font(fonts.titleSizeMm, true, metrics), input.layout.title);
    addFontSample(samples, font(fonts.subtitleSizeMm, false, metrics), input.layout.subtitle ?? '');
    const sections = legendSections(input.legend);
    if (sections.length > 0) {
      addFontSample(samples, font(fonts.legendTitleSizeMm, true, metrics), '图例');
      addFontSample(
        samples,
        font(fonts.legendGroupSizeMm, true, metrics),
        sections.flatMap((section) => (section.title === undefined ? [] : [section.title.text])).join('\n')
      );
      addFontSample(samples, font(fonts.legendItemSizeMm, false, metrics), sections.flatMap((section) => section.items.map((row) => row.text)).join('\n'));
    }
    const targetGroundMeters = (this.#tokens.footer.scaleBarTargetWidthMm * input.plan.range.denominator) / 1000;
    const groundMeters = niceGroundDistance(targetGroundMeters);
    addFontSample(
      samples,
      font(fonts.footerSizeMm, false, metrics),
      ['0', formatGroundDistance(groundMeters), `比例尺 1∶${formatDenominator(input.plan.range.denominator)}`].join('\n')
    );
    addFontSample(samples, font(fonts.footerSizeMm, true, metrics), 'N');
    return Object.freeze(samples);
  }

  /** 确定释放一次 backing surface；重复释放保持无副作用。 */
  release(canvas: PrintCanvasLike): void {
    this.#surfaces.delete(canvas);
    canvas.width = 1;
    canvas.height = 1;
  }

  async preloadLegendImages(legend: Readonly<PrintLegendResult>, options: Readonly<PrintLegendImageLoadOptions>): Promise<PrintLegendImageResources> {
    if (this.#destroyed) throw new ObjectDisposedError('Print page renderer has been destroyed');
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
      throw new InvalidArgumentError('Print legend image timeoutMs must be positive and finite');
    if (options.signal.aborted) throw new PrintError('cancelled', 'Legend icon loading was cancelled');
    const resourcesToLoad = visibleLegendIcons(legend);
    const controller = new AbortController();
    this.#imageLoadControllers.add(controller);
    const cancel = (): void => controller.abort();
    options.signal.addEventListener('abort', cancel, { once: true });
    const loads = resourcesToLoad.map(
      async ({ symbol, descriptors }) => [legendImageKey(symbol), await loadLegendImage(symbol, descriptors, controller.signal, options.timeoutMs)] as const
    );
    try {
      const entries = await Promise.all(loads);
      if (this.#destroyed || options.signal.aborted) throw new PrintError('cancelled', 'Legend icon loading was cancelled');
      const descriptors = Object.freeze(resourcesToLoad.flatMap((resource) => resource.descriptors));
      const resources = new LoadedLegendImageResources(entries, descriptors, () => this.#imageResources.delete(resources));
      this.#imageResources.add(resources);
      return resources;
    } catch (error) {
      controller.abort();
      const settled = await Promise.allSettled(loads);
      for (const result of settled) if (result.status === 'fulfilled') releaseLegendImage(result.value[1]);
      throw error;
    } finally {
      this.#imageLoadControllers.delete(controller);
      options.signal.removeEventListener('abort', cancel);
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const controller of this.#imageLoadControllers) controller.abort();
    this.#imageLoadControllers.clear();
    for (const resources of [...this.#imageResources]) resources.destroy();
    this.#imageResources.clear();
    for (const canvas of [...this.#surfaces]) this.release(canvas);
    this.#surfaces.clear();
  }
}

class LoadedLegendImageResources implements PrintLegendImageResources {
  readonly #images: Map<string, HTMLImageElement>;
  readonly #onDestroy: () => void;
  readonly resourceDescriptors: readonly Readonly<PrintResourceDescriptor>[];
  #destroyed = false;

  constructor(
    entries: readonly (readonly [string, HTMLImageElement])[],
    resourceDescriptors: readonly Readonly<PrintResourceDescriptor>[],
    onDestroy: () => void
  ) {
    this.#images = new Map(entries);
    this.resourceDescriptors = resourceDescriptors;
    this.#onDestroy = onDestroy;
  }

  readonly resolve: PrintLegendImageResolver = (symbol) => (this.#destroyed ? undefined : this.#images.get(legendImageKey(symbol)));

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const image of this.#images.values()) releaseLegendImage(image);
    this.#images.clear();
    this.#onDestroy();
  }
}

interface LegendIconResource {
  readonly symbol: Readonly<PrintIconLegendSymbol>;
  readonly descriptors: readonly Readonly<PrintResourceDescriptor>[];
}

function visibleLegendIcons(legend: Readonly<PrintLegendResult>): readonly Readonly<LegendIconResource>[] {
  const visibleGroups = new Map(legend.groups.filter((group) => group.visible !== false).map((group) => [group.id, group] as const));
  const icons = new Map<string, { symbol: Readonly<PrintIconLegendSymbol>; descriptors: Map<string, Readonly<PrintResourceDescriptor>> }>();
  for (const item of legend.items) {
    if (item.visible === false || !visibleGroups.has(item.groupId) || item.symbol.kind !== 'icon') continue;
    const key = legendImageKey(item.symbol);
    let resource = icons.get(key);
    if (resource === undefined) {
      resource = { symbol: item.symbol, descriptors: new Map() };
      icons.set(key, resource);
    }
    const descriptor = Object.freeze<PrintResourceDescriptor>({
      layerId: legendLayerId(item),
      resourceType: 'icon',
      sourceId: sanitizePrintSourceId(item.symbol.src)
    });
    resource.descriptors.set(`${descriptor.layerId}\u0000${descriptor.resourceType}\u0000${descriptor.sourceId}`, descriptor);
  }
  return Object.freeze([...icons.values()].map(({ symbol, descriptors }) => Object.freeze({ symbol, descriptors: Object.freeze([...descriptors.values()]) })));
}

function legendLayerId(item: Readonly<PrintLegendItem>): string {
  const encodedFromSource = item.sourceKey?.split('|', 1)[0];
  const encodedFromGroup = item.groupId.startsWith('layer:') ? item.groupId.slice(6).split('|', 1)[0] : undefined;
  const encoded = encodedFromSource ?? encodedFromGroup;
  if (encoded === undefined || encoded.length === 0) return item.groupId.trim() || 'unknown';
  try {
    const layerId = decodeURIComponent(encoded).trim();
    return layerId.length === 0 ? 'legend' : layerId;
  } catch {
    return encoded;
  }
}

function legendImageKey(symbol: Readonly<PrintIconLegendSymbol>): string {
  return JSON.stringify([symbol.crossOrigin ?? '', symbol.src]);
}

function loadLegendImage(
  symbol: Readonly<PrintIconLegendSymbol>,
  descriptors: readonly Readonly<PrintResourceDescriptor>[],
  signal: AbortSignal,
  timeoutMs: number
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const primary = descriptors[0] ?? Object.freeze<PrintResourceDescriptor>({ layerId: 'legend', resourceType: 'icon', sourceId: 'unknown' });
    const details = Object.freeze({ ...primary, candidates: descriptors });
    if (typeof globalThis.Image !== 'function') {
      reject(new PrintError('resource-load-failed', 'Legend icon loading is unavailable in the current environment', { details }));
      return;
    }
    if (signal.aborted) {
      reject(new PrintError('cancelled', 'Legend icon loading was cancelled'));
      return;
    }
    const image = new globalThis.Image();
    let settled = false;
    const finish = (error?: PrintError): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (error === undefined) resolve(image);
      else {
        releaseLegendImage(image);
        reject(error);
      }
    };
    const abort = (): void => finish(new PrintError('cancelled', 'Legend icon loading was cancelled'));
    const timer = globalThis.setTimeout(
      () => finish(new PrintError('resource-timeout', 'Legend icon loading timed out', { details: { ...details, timeoutMs } })),
      timeoutMs
    );
    signal.addEventListener('abort', abort, { once: true });
    image.onload = () => finish();
    image.onerror = (cause) => finish(new PrintError('resource-load-failed', 'Legend icon failed to load', { cause, details }));
    if (symbol.crossOrigin !== undefined) image.crossOrigin = symbol.crossOrigin;
    image.src = symbol.src;
  });
}

function releaseLegendImage(image: HTMLImageElement): void {
  image.onload = null;
  image.onerror = null;
  image.src = '';
}

function drawPaper(context: PrintCanvasContext, width: number, height: number, metrics: DrawingMetrics): void {
  const printPageTokens = metrics.tokens;
  context.save();
  context.fillStyle = printPageTokens.colors.paper;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function drawMap(context: PrintCanvasContext, bitmap: CanvasImageSource, frame: PrintPageRect, metrics: DrawingMetrics): void {
  const target = rectPixels(frame, metrics);
  context.drawImage(bitmap, target.x, target.y, target.width, target.height);
}

function drawMapBorder(context: PrintCanvasContext, frame: PrintPageRect, metrics: DrawingMetrics): void {
  const printPageTokens = metrics.tokens;
  const inner = rectPixels(expandRect(frame, printPageTokens.border.innerWidthMm / 2), metrics);
  const outerOffsetMm = printPageTokens.border.innerWidthMm + printPageTokens.border.gapMm + printPageTokens.border.outerWidthMm / 2;
  const outer = rectPixels(expandRect(frame, outerOffsetMm), metrics);

  context.save();
  context.strokeStyle = printPageTokens.colors.ink;
  context.lineJoin = 'miter';
  context.lineWidth = mm(printPageTokens.border.outerWidthMm, metrics);
  context.strokeRect(outer.x, outer.y, outer.width, outer.height);
  context.lineWidth = mm(printPageTokens.border.innerWidthMm, metrics);
  context.strokeRect(inner.x, inner.y, inner.width, inner.height);
  context.restore();
}

function drawHeaderAndTitles(
  context: PrintCanvasContext,
  plan: PrintPlan,
  layout: PrintLayoutSpec,
  pageInsets: Readonly<PrintPageInsets>,
  metrics: DrawingMetrics
): void {
  const printPageTokens = metrics.tokens;
  const pageWidth = xPixels(plan.pageSizeMm[0], metrics);
  const leftInset = xPixels(Math.max(printPageTokens.header.pageInsetMm, pageInsets.left), metrics);
  const rightInset = xPixels(Math.max(printPageTokens.header.pageInsetMm, pageInsets.right), metrics);
  const contentWidth = pageWidth - leftInset - rightInset;
  const mapTop = yPixels(plan.mapFrameMm.y, metrics);
  const metadataY = yPixels(Math.max(printPageTokens.header.pageInsetMm, pageInsets.top) + printPageTokens.fonts.headerSizeMm, metrics);
  const subtitleY = mapTop - mm(printPageTokens.layout.frameReserveMm + printPageTokens.layout.titleGapMm, metrics);
  const titleY = subtitleY - mm(printPageTokens.fonts.subtitleSizeMm + printPageTokens.header.titleGapMm, metrics);

  context.save();
  context.fillStyle = printPageTokens.colors.ink;
  context.textBaseline = 'alphabetic';
  context.font = font(printPageTokens.fonts.headerSizeMm, false, metrics);
  const metadataGap = mm(printPageTokens.header.metadataGapMm, metrics);
  const pageRight = pageWidth - rightInset;
  const dateSlotWidth = mm(printPageTokens.header.dateSlotWidthMm, metrics);
  const issuerSlotWidth = mm(printPageTokens.header.issuerSlotWidthMm, metrics);
  const issuerLeft = pageRight - issuerSlotWidth;
  const dateRight = issuerLeft - metadataGap;
  const dateLeft = dateRight - dateSlotWidth;
  const classificationWidth = dateLeft - metadataGap - leftInset;
  if (dateSlotWidth <= 0 || issuerSlotWidth <= 0) throw new InvalidArgumentError('layout-text-overflow: header metadata slots must be positive');
  if (layout.classification !== undefined) {
    if (classificationWidth <= 0) throw new InvalidArgumentError('layout-text-overflow: page margins leave no room for classification');
    assertTextFits(context, layout.classification, classificationWidth, 'classification');
    context.textAlign = 'left';
    context.fillText(layout.classification, leftInset, metadataY);
  }
  const date = headerDate(layout);
  const issuer = headerIssuer(layout);
  if (date.length > 0) {
    if (dateLeft < leftInset) throw new InvalidArgumentError('layout-text-overflow: page margins leave no room for date');
    assertTextFits(context, date, dateSlotWidth, 'date');
    context.textAlign = 'right';
    context.fillText(date, dateRight, metadataY);
  }
  if (issuer.length > 0) {
    if (issuerLeft < leftInset) throw new InvalidArgumentError('layout-text-overflow: page margins leave no room for issuer');
    assertTextFits(context, issuer, issuerSlotWidth, 'issuer');
    context.textAlign = 'left';
    context.fillText(issuer, issuerLeft, metadataY);
  }

  context.textAlign = 'center';
  if (layout.title !== undefined) {
    context.font = font(printPageTokens.fonts.titleSizeMm, true, metrics);
    assertTextFits(context, layout.title, contentWidth, 'title');
    context.fillText(layout.title, leftInset + contentWidth / 2, titleY);
  }
  if (layout.subtitle !== undefined) {
    context.font = font(printPageTokens.fonts.subtitleSizeMm, false, metrics);
    context.fillStyle = printPageTokens.colors.mutedInk;
    assertTextFits(context, layout.subtitle, contentWidth, 'subtitle');
    context.fillText(layout.subtitle, leftInset + contentWidth / 2, subtitleY);
  }
  context.restore();
}

function drawLegend(
  context: PrintCanvasContext,
  mapFrame: PrintPageRect,
  legend: PrintLegendResult,
  layoutSpec: Readonly<PrintLegendLayoutSpec> | undefined,
  metrics: DrawingMetrics,
  resolveImage: PrintLegendImageResolver | undefined
): void {
  const printPageTokens = metrics.tokens;
  const sections = legendSections(legend);
  if (sections.length === 0) return;

  const layout = resolveLegendLayout(layoutSpec, mapFrame, metrics);
  const itemPrefixMm = printPageTokens.legend.symbolWidthMm + printPageTokens.legend.symbolTextGapMm;
  const textWidths = measureLegendRows(context, sections, metrics);
  context.save();
  context.font = legendFont('title', metrics);
  const legendTitleWidthMm = context.measureText('图例').width / metrics.pixelsPerMm;
  context.restore();
  const groupWidthMm = Math.max(0, ...sections.flatMap((section) => (section.title === undefined ? [] : [textWidths.get(section.title) ?? 0])));
  const itemWidthMm = Math.max(0, ...sections.flatMap((section) => section.items.map((row) => itemPrefixMm + (textWidths.get(row) ?? 0))));
  const columnGapsMm = layout.itemGapMm * Math.max(0, layout.columns - 1);
  const desiredContentWidthMm = Math.max(legendTitleWidthMm, groupWidthMm, itemWidthMm * layout.columns + columnGapsMm);
  const desiredWidthMm = Math.max(28, desiredContentWidthMm + layout.padding.left + layout.padding.right);
  if (desiredWidthMm > layout.maxWidthMm + 1e-9) {
    throw new InvalidArgumentError(
      `legend-overflow: legend requires ${trimDecimal(desiredWidthMm)}mm but maxWidthMm allows ${trimDecimal(layout.maxWidthMm)}mm`
    );
  }
  const widthMm = desiredWidthMm;
  const contentWidthMm = widthMm - layout.padding.left - layout.padding.right;
  const columnWidthMm = (contentWidthMm - columnGapsMm) / layout.columns;
  if (columnWidthMm <= itemPrefixMm) throw new InvalidArgumentError('legend-overflow: legend columns leave no room for item labels');

  const sectionHeights = sections.map((section) => legendSectionHeight(section, layout, metrics));
  const titleHeightMm = printPageTokens.fonts.legendTitleSizeMm + layout.groupGapMm;
  const contentHeightMm = titleHeightMm + sectionHeights.reduce((sum, height) => sum + height, 0) + layout.groupGapMm * Math.max(0, sections.length - 1);
  const heightMm = layout.padding.top + contentHeightMm + layout.padding.bottom;
  const maxHeightMm = Math.min(mapFrame.height * printPageTokens.legend.maxHeightRatio, mapFrame.height - printPageTokens.legend.mapInsetMm * 2);
  if (heightMm > maxHeightMm + 1e-9) {
    throw new InvalidArgumentError(`legend-overflow: legend requires ${trimDecimal(heightMm)}mm height but only ${trimDecimal(maxHeightMm)}mm is available`);
  }
  const anchorRight = layout.position === 'top-right' || layout.position === 'bottom-right';
  const anchorBottom = layout.position === 'bottom-left' || layout.position === 'bottom-right';
  const box: PrintPageRect = {
    x: anchorRight ? mapFrame.x + mapFrame.width - printPageTokens.legend.mapInsetMm - widthMm : mapFrame.x + printPageTokens.legend.mapInsetMm,
    y: anchorBottom ? mapFrame.y + mapFrame.height - printPageTokens.legend.mapInsetMm - heightMm : mapFrame.y + printPageTokens.legend.mapInsetMm,
    width: widthMm,
    height: heightMm
  };
  if (
    box.x < mapFrame.x + printPageTokens.legend.mapInsetMm - 1e-9 ||
    box.y < mapFrame.y + printPageTokens.legend.mapInsetMm - 1e-9 ||
    box.x + box.width > mapFrame.x + mapFrame.width - printPageTokens.legend.mapInsetMm + 1e-9 ||
    box.y + box.height > mapFrame.y + mapFrame.height - printPageTokens.legend.mapInsetMm + 1e-9
  ) {
    throw new InvalidArgumentError(`legend-overflow: legend at ${layout.position} exceeds the map frame`);
  }
  const boxPixels = rectPixels(box, metrics);

  context.save();
  context.fillStyle = layout.background;
  context.fillRect(boxPixels.x, boxPixels.y, boxPixels.width, boxPixels.height);
  context.strokeStyle = printPageTokens.colors.legendBorder;
  context.lineWidth = mm(printPageTokens.legend.borderWidthMm, metrics);
  context.strokeRect(boxPixels.x, boxPixels.y, boxPixels.width, boxPixels.height);

  let sectionTopMm = box.y + layout.padding.top;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = printPageTokens.colors.ink;
  context.font = legendFont('title', metrics);
  context.fillText('图例', xPixels(box.x + layout.padding.left, metrics), yPixels(sectionTopMm + printPageTokens.fonts.legendTitleSizeMm, metrics));
  sectionTopMm += titleHeightMm;
  for (const [sectionIndex, section] of sections.entries()) {
    if (section.title !== undefined) {
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      context.fillStyle = printPageTokens.colors.mutedInk;
      context.font = legendFont('group', metrics);
      context.fillText(
        section.title.text,
        xPixels(box.x + layout.padding.left, metrics),
        yPixels(sectionTopMm + printPageTokens.fonts.legendGroupSizeMm, metrics)
      );
      sectionTopMm += printPageTokens.fonts.legendGroupSizeMm + layout.groupGapMm;
    }
    const placements = legendItemPlacements(section.items, layout.columns, layout.direction);
    for (const placement of placements) {
      const itemTopMm = sectionTopMm + placement.line * (printPageTokens.fonts.legendItemSizeMm + layout.itemGapMm);
      const columnXmm = box.x + layout.padding.left + placement.column * (columnWidthMm + layout.itemGapMm);
      const textXmm = columnXmm + itemPrefixMm;
      const availableTextWidthMm = columnWidthMm - itemPrefixMm;
      const measuredTextWidthMm = textWidths.get(placement.row) ?? 0;
      if (measuredTextWidthMm > availableTextWidthMm + 1e-9) {
        throw new InvalidArgumentError(
          `legend-overflow: item ${placement.row.item?.id ?? placement.row.text} requires ${trimDecimal(measuredTextWidthMm)}mm text width but only ${trimDecimal(availableTextWidthMm)}mm is available`
        );
      }
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      context.fillStyle = printPageTokens.colors.ink;
      context.font = legendFont('item', metrics);
      if (placement.row.item !== undefined) drawLegendSymbol(context, placement.row.item.symbol, columnXmm, itemTopMm, metrics, resolveImage);
      context.fillText(placement.row.text, xPixels(textXmm, metrics), yPixels(itemTopMm + printPageTokens.fonts.legendItemSizeMm, metrics));
    }
    sectionTopMm += itemGridHeight(section.items.length, layout.columns, layout.direction, printPageTokens.fonts.legendItemSizeMm, layout.itemGapMm);
    if (sectionIndex < sections.length - 1) sectionTopMm += layout.groupGapMm;
  }
  context.restore();
}

function drawLegendSymbol(
  context: PrintCanvasContext,
  symbol: PrintLegendSymbolSpec,
  xMm: number,
  yMm: number,
  metrics: DrawingMetrics,
  resolveImage: PrintLegendImageResolver | undefined
): void {
  const printPageTokens = metrics.tokens;
  const widthMm = printPageTokens.legend.symbolWidthMm;
  const heightMm = printPageTokens.legend.symbolHeightMm;
  assertLegendSymbolFits(symbol, widthMm, heightMm);
  const left = xPixels(xMm, metrics);
  const top = yPixels(yMm, metrics);
  const width = mm(widthMm, metrics);
  const height = mm(heightMm, metrics);
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (symbol.kind === 'point') {
    context.beginPath();
    context.arc(left + width / 2, top + height / 2, mm(symbol.radiusMm ?? 1.5, metrics), 0, Math.PI * 2);
    if (symbol.fill !== undefined) {
      context.fillStyle = symbol.fill.color;
      context.fill();
    }
    if (symbol.stroke !== undefined) {
      context.strokeStyle = symbol.stroke.color;
      context.lineWidth = mm(symbol.stroke.widthMm, metrics);
      context.setLineDash((symbol.stroke.dashMm ?? []).map((value) => mm(value, metrics)));
      context.stroke();
    }
  } else if (symbol.kind === 'line') {
    context.strokeStyle = symbol.stroke.color;
    context.lineWidth = mm(symbol.stroke.widthMm, metrics);
    context.setLineDash((symbol.stroke.dashMm ?? []).map((value) => mm(value, metrics)));
    context.beginPath();
    const halfStroke = mm(symbol.stroke.widthMm / 2, metrics);
    context.moveTo(left + halfStroke, top + height / 2);
    context.lineTo(left + width - halfStroke, top + height / 2);
    context.stroke();
  } else if (symbol.kind === 'polygon') {
    if (symbol.fill !== undefined) {
      context.fillStyle = symbol.fill.color;
      context.fillRect(left, top, width, height);
    }
    if (symbol.stroke !== undefined) {
      context.strokeStyle = symbol.stroke.color;
      context.lineWidth = mm(symbol.stroke.widthMm, metrics);
      context.setLineDash((symbol.stroke.dashMm ?? []).map((value) => mm(value, metrics)));
      const halfStroke = mm(symbol.stroke.widthMm / 2, metrics);
      context.strokeRect(left + halfStroke, top + halfStroke, width - halfStroke * 2, height - halfStroke * 2);
    }
  } else {
    const image = resolveImage?.(symbol);
    if (image !== undefined) {
      const icon = fitIconToLegendSlot(symbol.size, symbol.anchor, left, top, width, height);
      if (
        ![icon.x, icon.y, icon.width, icon.height].every(Number.isFinite) ||
        icon.width <= 0 ||
        icon.height <= 0 ||
        icon.x < left - 1e-6 ||
        icon.y < top - 1e-6 ||
        icon.x + icon.width > left + width + 1e-6 ||
        icon.y + icon.height > top + height + 1e-6
      ) {
        throw new InvalidArgumentError('legend-overflow: icon size or anchor exceeds the fixed legend symbol slot');
      }
      context.drawImage(image, icon.x, icon.y, icon.width, icon.height);
    } else {
      throw new PrintError('resource-load-failed', 'Legend icon was not preloaded before page rendering');
    }
  }
  context.restore();
}

function fitIconToLegendSlot(
  sourceSize: readonly [number, number],
  anchor: readonly [number, number],
  left: number,
  top: number,
  width: number,
  height: number
): PrintPageRect {
  const [sourceWidth, sourceHeight] = sourceSize;
  const [anchorX, anchorY] = anchor;
  const horizontalExtent = Math.max(anchorX, 1 - anchorX) * sourceWidth;
  const verticalExtent = Math.max(anchorY, 1 - anchorY) * sourceHeight;
  const scale = Math.min(width / (horizontalExtent * 2), height / (verticalExtent * 2));
  const iconWidth = sourceWidth * scale;
  const iconHeight = sourceHeight * scale;
  return {
    x: left + width / 2 - iconWidth * anchorX,
    y: top + height / 2 - iconHeight * anchorY,
    width: iconWidth,
    height: iconHeight
  };
}

function assertLegendSymbolFits(symbol: Readonly<PrintLegendSymbolSpec>, widthMm: number, heightMm: number): void {
  const slotRadiusMm = Math.min(widthMm, heightMm) / 2;
  if (symbol.kind === 'point') {
    const extentMm = symbol.radiusMm + (symbol.stroke?.widthMm ?? 0) / 2;
    if (!Number.isFinite(extentMm) || extentMm > slotRadiusMm + 1e-9) {
      throw new InvalidArgumentError(
        `legend-overflow: point symbol needs ${trimDecimal(extentMm * 2)}mm but the slot is ${trimDecimal(slotRadiusMm * 2)}mm high`
      );
    }
    return;
  }
  const strokeWidthMm = symbol.kind === 'line' ? symbol.stroke.widthMm : symbol.kind === 'polygon' ? (symbol.stroke?.widthMm ?? 0) : 0;
  if (!Number.isFinite(strokeWidthMm) || strokeWidthMm > Math.min(widthMm, heightMm) + 1e-9) {
    throw new InvalidArgumentError(`legend-overflow: symbol stroke width ${trimDecimal(strokeWidthMm)}mm exceeds the fixed legend slot`);
  }
}

function drawFooter(context: PrintCanvasContext, plan: PrintPlan, northAngle: number, pageInsets: Readonly<PrintPageInsets>, metrics: DrawingMetrics): void {
  const printPageTokens = metrics.tokens;
  const mapBottomMm = plan.mapFrameMm.y + plan.mapFrameMm.height;
  const footerTopMm = mapBottomMm + printPageTokens.layout.mapFooterGapMm;
  const leftMm = Math.max(printPageTokens.footer.pageInsetMm, pageInsets.left);
  const rightMm = plan.pageSizeMm[0] - Math.max(printPageTokens.footer.pageInsetMm, pageInsets.right);
  const boxes = footerBoxes(context, leftMm, rightMm, footerTopMm, plan.range.denominator, northAngle, metrics);
  const pageBottomMm = plan.pageSizeMm[1] - pageInsets.bottom;
  if (
    boxes.scale.top < footerTopMm - 1e-9 ||
    boxes.north.top < footerTopMm - 1e-9 ||
    boxes.scale.left < pageInsets.left - 1e-9 ||
    boxes.north.left < pageInsets.left - 1e-9 ||
    boxes.scale.right > plan.pageSizeMm[0] - pageInsets.right + 1e-9 ||
    boxes.north.right > plan.pageSizeMm[0] - pageInsets.right + 1e-9 ||
    boxes.scale.bottom > pageBottomMm + 1e-9 ||
    boxes.north.bottom > pageBottomMm + 1e-9 ||
    physicalBoxesOverlap(boxes.scale, boxes.north)
  ) {
    throw new InvalidArgumentError('layout-text-overflow: scale bar text and north arrow overlap or exceed the printable footer bounds');
  }
  drawScaleBar(context, leftMm, footerTopMm, plan.range.denominator, metrics);
  drawNorthArrow(context, rightMm, footerTopMm, northAngle, metrics);
}

function footerBoxes(
  context: PrintCanvasContext,
  leftMm: number,
  rightMm: number,
  topMm: number,
  denominator: number,
  northAngle: number,
  metrics: DrawingMetrics
): Readonly<{ scale: PhysicalBox; north: PhysicalBox }> {
  const tokens = metrics.tokens;
  const targetGroundMeters = (tokens.footer.scaleBarTargetWidthMm * denominator) / 1000;
  const groundMeters = niceGroundDistance(targetGroundMeters);
  const scaleWidthMm = (groundMeters * 1000) / denominator;
  context.save();
  context.font = font(tokens.fonts.footerSizeMm, false, metrics);
  const scaleTextWidthMm = context.measureText(`比例尺 1∶${formatDenominator(denominator)}`).width / metrics.pixelsPerMmX;
  context.restore();
  const north = northArrowLayout(context, rightMm, topMm, northAngle, metrics);
  return {
    scale: {
      left: leftMm,
      right: leftMm + scaleWidthMm + 4 + scaleTextWidthMm,
      top: topMm,
      bottom: topMm + Math.max(tokens.footer.scaleBarHeightMm + 0.6 + tokens.fonts.footerSizeMm, tokens.fonts.footerSizeMm)
    },
    north: north.bounds
  };
}

function northArrowLayout(context: PrintCanvasContext, rightMm: number, topMm: number, angle: number, metrics: DrawingMetrics): NorthArrowLayout {
  const tokens = metrics.tokens;
  const sizeMm = tokens.footer.northArrowSizeMm;
  const halfStrokeMm = 0.1;
  context.save();
  context.font = font(tokens.fonts.footerSizeMm, true, metrics);
  const labelWidthMm = context.measureText('N').width / metrics.pixelsPerMmX;
  context.restore();
  const relativeArrow = rotatedPointBounds(
    [
      [0, -sizeMm / 2],
      [-sizeMm * 0.22, sizeMm * 0.3],
      [0, sizeMm * 0.16],
      [sizeMm * 0.22, sizeMm * 0.3]
    ],
    angle,
    0,
    0,
    halfStrokeMm
  );
  const directionX = Math.sin(angle);
  const directionY = -Math.cos(angle);
  const labelDistanceMm = sizeMm / 2 + tokens.footer.northArrowLabelGapMm + tokens.fonts.footerSizeMm / 2;
  const relativeLabelX = directionX * labelDistanceMm;
  const relativeLabelY = directionY * labelDistanceMm;
  const relativeLabel: PhysicalBox = {
    left: relativeLabelX - labelWidthMm / 2,
    right: relativeLabelX + labelWidthMm / 2,
    top: relativeLabelY - tokens.fonts.footerSizeMm / 2,
    bottom: relativeLabelY + tokens.fonts.footerSizeMm / 2
  };
  const relativeRight = Math.max(relativeArrow.right, relativeLabel.right);
  const relativeTop = Math.min(relativeArrow.top, relativeLabel.top);
  const centerX = rightMm - relativeRight;
  const centerY = topMm - relativeTop;
  const labelX = centerX + relativeLabelX;
  const labelY = centerY + relativeLabelY;
  return {
    centerX,
    centerY,
    labelX,
    labelY,
    bounds: {
      left: centerX + Math.min(relativeArrow.left, relativeLabel.left),
      right: centerX + relativeRight,
      top: centerY + relativeTop,
      bottom: centerY + Math.max(relativeArrow.bottom, relativeLabel.bottom)
    }
  };
}

function rotatedPointBounds(points: readonly (readonly [number, number])[], angle: number, centerX: number, centerY: number, padding: number): PhysicalBox {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const transformed = points.map(([x, y]) => [centerX + x * cosine - y * sine, centerY + x * sine + y * cosine] as const);
  return {
    left: Math.min(...transformed.map(([x]) => x)) - padding,
    right: Math.max(...transformed.map(([x]) => x)) + padding,
    top: Math.min(...transformed.map(([, y]) => y)) - padding,
    bottom: Math.max(...transformed.map(([, y]) => y)) + padding
  };
}

function physicalBoxesOverlap(left: PhysicalBox, right: PhysicalBox): boolean {
  return left.left < right.right - 1e-9 && left.right > right.left + 1e-9 && left.top < right.bottom - 1e-9 && left.bottom > right.top + 1e-9;
}

function drawScaleBar(context: PrintCanvasContext, leftMm: number, topMm: number, denominator: number, metrics: DrawingMetrics): void {
  const printPageTokens = metrics.tokens;
  const targetGroundMeters = (printPageTokens.footer.scaleBarTargetWidthMm * denominator) / 1000;
  const groundMeters = niceGroundDistance(targetGroundMeters);
  const widthMm = (groundMeters * 1000) / denominator;
  const segmentWidthMm = widthMm / printPageTokens.footer.scaleBarSegments;
  const heightMm = printPageTokens.footer.scaleBarHeightMm;

  context.save();
  for (let index = 0; index < printPageTokens.footer.scaleBarSegments; index += 1) {
    context.fillStyle = index % 2 === 0 ? printPageTokens.colors.ink : printPageTokens.colors.paper;
    context.fillRect(xPixels(leftMm + segmentWidthMm * index, metrics), yPixels(topMm, metrics), mm(segmentWidthMm, metrics), mm(heightMm, metrics));
  }
  context.strokeStyle = printPageTokens.colors.ink;
  context.lineWidth = mm(0.2, metrics);
  context.strokeRect(xPixels(leftMm, metrics), yPixels(topMm, metrics), mm(widthMm, metrics), mm(heightMm, metrics));
  context.fillStyle = printPageTokens.colors.ink;
  context.font = font(printPageTokens.fonts.footerSizeMm, false, metrics);
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillText('0', xPixels(leftMm, metrics), yPixels(topMm + heightMm + 0.6, metrics));
  context.textAlign = 'right';
  context.fillText(formatGroundDistance(groundMeters), xPixels(leftMm + widthMm, metrics), yPixels(topMm + heightMm + 0.6, metrics));
  context.textAlign = 'left';
  context.fillText(`比例尺 1∶${formatDenominator(denominator)}`, xPixels(leftMm + widthMm + 4, metrics), yPixels(topMm + 0.1, metrics));
  context.restore();
}

function drawNorthArrow(context: PrintCanvasContext, rightMm: number, topMm: number, angle: number, metrics: DrawingMetrics): void {
  const printPageTokens = metrics.tokens;
  const size = mm(printPageTokens.footer.northArrowSizeMm, metrics);
  const layout = northArrowLayout(context, rightMm, topMm, angle, metrics);
  const centerX = xPixels(layout.centerX, metrics);
  const centerY = yPixels(layout.centerY, metrics);
  context.save();
  context.translate(centerX, centerY);
  context.rotate(angle);
  context.fillStyle = printPageTokens.colors.ink;
  context.strokeStyle = printPageTokens.colors.ink;
  context.lineWidth = mm(0.2, metrics);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(0, -size / 2);
  context.lineTo(-size * 0.22, size * 0.3);
  context.lineTo(0, size * 0.16);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(0, -size / 2);
  context.lineTo(size * 0.22, size * 0.3);
  context.lineTo(0, size * 0.16);
  context.closePath();
  context.stroke();
  context.restore();
  context.save();
  context.fillStyle = printPageTokens.colors.ink;
  context.font = font(printPageTokens.fonts.footerSizeMm, true, metrics);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('N', xPixels(layout.labelX, metrics), yPixels(layout.labelY, metrics));
  context.restore();
}

function legendSections(legend: PrintLegendResult): readonly LegendSection[] {
  const sections: LegendSection[] = [];
  const groups = legend.groups.filter((group) => group.visible !== false).map((group, index) => ({ group, index }));
  groups.sort((left, right) => (left.group.order ?? left.index) - (right.group.order ?? right.index));
  for (const { group } of groups) {
    const items = legend.items.filter((item) => item.groupId === group.id && item.visible !== false).map((item, index) => ({ item, index }));
    items.sort((left, right) => (left.item.order ?? left.index) - (right.item.order ?? right.index));
    if (items.length === 0) continue;
    sections.push({
      title: group.title.length === 0 ? undefined : { kind: 'group', text: group.title },
      items: items.map(({ item }) => ({ kind: 'item', text: printLegendItemText(item), item }))
    });
  }
  return sections;
}

function printLegendItemText(item: Readonly<Pick<PrintLegendItem, 'label' | 'count'>>): string {
  return item.count === undefined || item.count === 1 ? item.label : `${item.label}（${item.count}）`;
}

function resolveLegendLayout(input: Readonly<PrintLegendLayoutSpec> | undefined, mapFrame: PrintPageRect, metrics: DrawingMetrics): ResolvedLegendLayout {
  const tokens = metrics.tokens;
  const position = input?.position ?? 'bottom-left';
  const columns = input?.columns ?? 1;
  const direction = input?.direction ?? 'row';
  const maxAvailableWidth = mapFrame.width - tokens.legend.mapInsetMm * 2;
  const maxWidthMm = Math.min(input?.maxWidthMm ?? mapFrame.width * tokens.legend.maxWidthRatio, maxAvailableWidth);
  const padding = resolveInsets(input?.paddingMm, tokens.legend.paddingMm);
  const background = input?.background ?? tokens.colors.legendBackground;
  const groupGapMm = input?.groupGapMm ?? tokens.legend.groupGapMm;
  const itemGapMm = input?.itemGapMm ?? tokens.legend.rowGapMm;
  if (position !== 'top-left' && position !== 'top-right' && position !== 'bottom-left' && position !== 'bottom-right') {
    throw new InvalidArgumentError('Print legend position must be top-left, top-right, bottom-left, or bottom-right');
  }
  if (!Number.isSafeInteger(columns) || columns <= 0) throw new InvalidArgumentError('Print legend columns must be a positive safe integer');
  if ((direction !== 'row' && direction !== 'column') || !Number.isFinite(maxWidthMm) || maxWidthMm <= 0) {
    throw new InvalidArgumentError('Print legend layout must have a row/column direction and positive maxWidthMm');
  }
  if (background.trim().length === 0 || ![padding.top, padding.right, padding.bottom, padding.left, groupGapMm, itemGapMm].every(isNonNegativeFinite)) {
    throw new InvalidArgumentError('Print legend padding, background, and gaps must be valid finite values');
  }
  return { position, columns, direction, maxWidthMm, padding, background, groupGapMm, itemGapMm };
}

function resolveInsets(value: PrintLegendLayoutSpec['paddingMm'], fallback: number): Readonly<PrintPageInsets> {
  if (value === undefined) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
  return value;
}

function resolvePageInsets(value: number | Readonly<PrintPageInsets> | undefined, fallback: number): Readonly<PrintPageInsets> {
  const resolved = resolveInsets(value, fallback);
  if (![resolved.top, resolved.right, resolved.bottom, resolved.left].every(isNonNegativeFinite)) {
    throw new InvalidArgumentError('Print page insets must contain finite non-negative values');
  }
  return resolved;
}

function measureLegendRows(context: PrintCanvasContext, sections: readonly LegendSection[], metrics: DrawingMetrics): ReadonlyMap<LegendRow, number> {
  const widths = new Map<LegendRow, number>();
  context.save();
  for (const section of sections) {
    if (section.title !== undefined) {
      context.font = legendFont('group', metrics);
      widths.set(section.title, context.measureText(section.title.text).width / metrics.pixelsPerMm);
    }
    context.font = legendFont('item', metrics);
    for (const row of section.items) widths.set(row, context.measureText(row.text).width / metrics.pixelsPerMm);
  }
  context.restore();
  return widths;
}

function legendSectionHeight(section: LegendSection, layout: ResolvedLegendLayout, metrics: DrawingMetrics): number {
  const titleHeight = section.title === undefined ? 0 : metrics.tokens.fonts.legendGroupSizeMm + layout.groupGapMm;
  return titleHeight + itemGridHeight(section.items.length, layout.columns, layout.direction, metrics.tokens.fonts.legendItemSizeMm, layout.itemGapMm);
}

function itemGridHeight(itemCount: number, columns: number, direction: 'row' | 'column', itemHeightMm: number, itemGapMm: number): number {
  if (itemCount === 0) return 0;
  const lines = direction === 'row' ? Math.ceil(itemCount / columns) : Math.min(itemCount, Math.ceil(itemCount / columns));
  return lines * itemHeightMm + Math.max(0, lines - 1) * itemGapMm;
}

function legendItemPlacements(rows: readonly LegendRow[], columns: number, direction: 'row' | 'column'): readonly LegendItemPlacement[] {
  if (direction === 'row') return rows.map((row, index) => ({ row, column: index % columns, line: Math.floor(index / columns) }));
  const lines = Math.ceil(rows.length / columns);
  return rows.map((row, index) => ({ row, column: Math.floor(index / lines), line: index % lines }));
}

function headerDate(layout: PrintLayoutSpec): string {
  return layout.date === undefined || layout.date.length === 0 ? '' : `日期：${layout.date}`;
}

function headerIssuer(layout: PrintLayoutSpec): string {
  return layout.issuer === undefined || layout.issuer.length === 0 ? '' : `签发人：${layout.issuer}`;
}

function addFontSample(samples: PrintFontSample[], fontValue: string, text: string): void {
  if (text.length === 0) return;
  samples.push(Object.freeze({ font: fontValue, text }));
}

function assertTextFits(context: PrintCanvasContext, text: string, availableWidth: number, subject: string): void {
  const measuredWidth = context.measureText(text).width;
  if (measuredWidth > availableWidth + 1e-9) {
    throw new InvalidArgumentError(
      `layout-text-overflow: ${subject} requires ${Math.ceil(measuredWidth)}px but only ${Math.floor(availableWidth)}px is available`
    );
  }
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function drawingMetrics(
  plan: PrintPlan,
  tokens: Readonly<PrintPageTokens>,
  outputSize: readonly [width: number, height: number] = plan.outputSizePx
): DrawingMetrics {
  const pixelsPerMmX = outputSize[0] / plan.pageSizeMm[0];
  const pixelsPerMmY = outputSize[1] / plan.pageSizeMm[1];
  return { pixelsPerMmX, pixelsPerMmY, pixelsPerMm: (pixelsPerMmX + pixelsPerMmY) / 2, tokens };
}

function renderOutputSize(plan: Readonly<PrintPlan>, quality: 'draft' | 'final'): readonly [number, number] {
  if (quality === 'final') return plan.outputSizePx;
  const [width, height] = plan.outputSizePx;
  const scale = Math.min(1, draftDpi / plan.dpi, draftLongestEdgePx / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function rectPixels(rect: PrintPageRect, metrics: DrawingMetrics): PrintPageRect {
  const x = xPixels(rect.x, metrics);
  const y = yPixels(rect.y, metrics);
  const right = xPixels(rect.x + rect.width, metrics);
  const bottom = yPixels(rect.y + rect.height, metrics);
  return { x, y, width: right - x, height: bottom - y };
}

function expandRect(rect: PrintPageRect, amount: number): PrintPageRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function xPixels(value: number, metrics: DrawingMetrics): number {
  return value * metrics.pixelsPerMmX;
}

function yPixels(value: number, metrics: DrawingMetrics): number {
  return value * metrics.pixelsPerMmY;
}

function mm(value: number, metrics: DrawingMetrics): number {
  return value * metrics.pixelsPerMm;
}

function font(sizeMm: number, bold: boolean, metrics: DrawingMetrics): string {
  const printPageTokens = metrics.tokens;
  return `${bold ? '600 ' : ''}${mm(sizeMm, metrics)}px ${printPageTokens.fonts.family}`;
}

function legendFont(kind: 'title' | LegendRow['kind'], metrics: DrawingMetrics): string {
  const printPageTokens = metrics.tokens;
  const size =
    kind === 'title'
      ? printPageTokens.fonts.legendTitleSizeMm
      : kind === 'group'
        ? printPageTokens.fonts.legendGroupSizeMm
        : printPageTokens.fonts.legendItemSizeMm;
  return font(size, kind !== 'item', metrics);
}

function niceGroundDistance(target: number): number {
  const exponent = 10 ** Math.floor(Math.log10(target));
  const normalized = target / exponent;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * exponent;
}

function formatGroundDistance(meters: number): string {
  if (meters >= 1000) return `${trimDecimal(meters / 1000)} km`;
  return `${trimDecimal(meters)} m`;
}

function formatDenominator(value: number): string {
  return String(Math.round(value));
}

function trimDecimal(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function validateInput(input: PrintPageRenderInput): void {
  const [pageWidthMm, pageHeightMm] = input.plan.pageSizeMm;
  const [width, height] = input.plan.outputSizePx;
  if (![pageWidthMm, pageHeightMm, input.plan.dpi, input.plan.range.denominator].every((value) => Number.isFinite(value) && value > 0)) {
    throw new InvalidArgumentError('Print page plan must contain positive finite physical values');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new InvalidArgumentError('Print page output size must contain positive safe integers');
  }
  const frame = input.plan.mapFrameMm;
  if (![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0) {
    throw new InvalidArgumentError('Print map frame must be a finite positive rectangle');
  }
  if (!Number.isFinite(input.trueNorthAngleRadians)) throw new InvalidArgumentError('Print true north angle must be finite');
}

function defaultCanvasFactory(width: number, height: number): PrintCanvasSurface {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new InvalidArgumentError('Unable to create a print OffscreenCanvas 2D context');
    return { canvas, context: context as unknown as PrintCanvasContext };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) throw new InvalidArgumentError('Unable to create a print Canvas 2D context');
    return { canvas, context: context as unknown as PrintCanvasContext };
  }
  throw new InvalidArgumentError('A Canvas factory is required outside a browser environment');
}
