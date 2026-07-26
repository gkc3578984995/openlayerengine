import { CapabilityError, InvalidArgumentError } from '../errors.js';
import type {
  NormalizedPrintPaperSpec,
  NormalizedPrintSpec,
  PrintBoxRangeSnapshot,
  PrintContentSpec,
  PrintExtent,
  PrintFootprint,
  PrintLayoutSpec,
  PrintLegendFillSpec,
  PrintLegendGroup,
  PrintLegendItem,
  PrintLegendLayoutSpec,
  PrintLegendSpec,
  PrintLegendStrokeSpec,
  PrintLegendSymbolSpec,
  PrintPageInsets,
  PrintPageRect,
  PrintPaperSize,
  PrintPlan,
  PrintPlannerContext,
  PrintPlannerLimits,
  PrintPlanningResult,
  PrintRangeSource,
  PrintResolvedRange,
  PrintResourceSpec,
  PrintScaleSpec,
  PrintSpec,
  PrintValidationIssue,
  PrintValidationReport,
  PrintViewSnapshot,
  PrintWarning
} from './types.js';

/** 物理比例与地图 resolution 换算使用的固定 CSS 像素密度。 */
export const PRINT_CSS_DPI = 96;

const MM_PER_INCH = 25.4;
const METERS_PER_MILLIMETER = 0.001;

// 具体毫米值属于内置成品版式，不进入 PrintSpec 公共配置。
const HEADER_BAND_HEIGHT_MM = 8;
const TITLE_BAND_HEIGHT_MM = 16;
const TITLE_MAP_GAP_MM = 4;
const MAP_FRAME_RESERVE_MM = 2;
const MAP_FOOTER_GAP_MM = 5;
const FOOTER_BAND_HEIGHT_MM = 14;
const MIN_MAP_FRAME_MM = 20;

const specFields = new Set(['range', 'paper', 'layout', 'legend', 'content', 'resources']);
const rangeFields = new Set(['source', 'scale']);
const paperFields = new Set(['size', 'orientation', 'marginMm', 'dpi']);
const pageSizeFields = new Set(['widthMm', 'heightMm']);
const insetFields = new Set(['top', 'right', 'bottom', 'left']);
const layoutFields = new Set(['classification', 'title', 'subtitle', 'date', 'issuer']);
const contentFields = new Set(['animations', 'domOverlays', 'controls']);
const resourceFields = new Set(['timeoutMs']);
const autoLegendFields = new Set(['mode', 'showCounts']);
const manualLegendFields = new Set(['mode', 'groups', 'items', 'layout']);
const legendGroupFields = new Set(['id', 'title', 'visible', 'order']);
const legendItemFields = new Set(['id', 'groupId', 'label', 'symbol', 'visible', 'order', 'count', 'sourceKey']);
const legendLayoutFields = new Set(['position', 'columns', 'direction', 'maxWidthMm', 'paddingMm', 'background', 'groupGapMm', 'itemGapMm']);
const strokeFields = new Set(['color', 'widthMm', 'dashMm']);
const fillFields = new Set(['color']);
const viewFields = new Set(['center', 'footprint', 'rotation', 'metersPerViewUnitAtCenter', 'scaleVariesByPosition']);
const contextFields = new Set(['revision', 'limits', 'boxRange', 'northDirection']);
const limitFields = new Set(['minDpi', 'maxDpi', 'maxCanvasDimension', 'maxCanvasPixels']);
const boxRangeFields = new Set(['center', 'footprint', 'rotation']);

type Point2 = readonly [number, number];

interface NormalizedViewSnapshot {
  readonly center: Point2;
  readonly footprint: PrintFootprint;
  readonly rotation: number;
  readonly metersPerViewUnitAtCenter: number;
  readonly scaleVariesByPosition: boolean;
}

interface NormalizedPlannerContext {
  readonly revision: number;
  readonly limits: Readonly<PrintPlannerLimits>;
  readonly boxRange: Readonly<PrintBoxRangeSnapshot> | undefined;
  readonly northDirection: number | undefined;
}

interface SourceGeometry {
  readonly mode: 'view' | 'box' | 'extent';
  readonly center: Point2;
  readonly footprint: PrintFootprint;
  readonly extent: PrintExtent;
  readonly rotation: number;
}

/** 严格校验、复制并冻结完整 PrintSpec。 */
export function normalizePrintSpec(input: PrintSpec): Readonly<NormalizedPrintSpec> {
  const record = inspectRecord(input, 'Print spec');
  assertFields(record, specFields, 'Print spec');
  const range = normalizeRange(record.range);
  const paper = normalizePaper(record.paper);
  const layout = normalizeLayout(record.layout);
  const legend = record.legend === undefined ? Object.freeze({ mode: 'auto' as const }) : normalizeLegend(record.legend);
  const content = normalizeContent(record.content);
  const resources = record.resources === undefined ? undefined : normalizeResources(record.resources);

  return Object.freeze({ range, paper, layout, legend, content, ...(resources === undefined ? {} : { resources }) });
}

/** @deprecated 内部兼容名；新代码使用 normalizePrintSpec。 */
export function normalizePrintOptions(input: PrintSpec): Readonly<NormalizedPrintSpec> {
  return normalizePrintSpec(input);
}

/** 根据确定 spec、View 快照和平台限制生成纯数据 PrintPlan 与 validation。 */
export function createPrintPlan(spec: PrintSpec, view: PrintViewSnapshot, context: PrintPlannerContext): Readonly<PrintPlanningResult> {
  const normalizedSpec = normalizePrintSpec(spec);
  const snapshot = normalizeViewSnapshot(view);
  const normalizedContext = normalizePlannerContext(context);
  const pageSizeMm = resolvePageSizeMm(normalizedSpec.paper);
  const mapFrameMm = createMapFrameMm(pageSizeMm, normalizedSpec.paper.marginMm);
  const outputSizePx = resolveOutputSizePx(normalizedSpec.paper, pageSizeMm, normalizedContext.limits);
  const budgetIssue = createPixelBudgetIssue(normalizedSpec.paper, outputSizePx, normalizedContext.limits);

  if (normalizedSpec.range.source.mode === 'box' && normalizedContext.boxRange === undefined) {
    const issue = freezeIssue('range-unresolved', '尚未完成地图框选', 'range.source');
    return Object.freeze({
      plan: undefined,
      validation: createValidation(normalizedContext.revision, budgetIssue === undefined ? [issue] : [issue, budgetIssue], [])
    });
  }

  const source = resolveSourceGeometry(normalizedSpec.range.source, snapshot, normalizedContext.boxRange);
  const logicalMapSize = Object.freeze({
    width: millimetersToPixels(mapFrameMm.width, PRINT_CSS_DPI),
    height: millimetersToPixels(mapFrameMm.height, PRINT_CSS_DPI)
  });
  const range = resolveRange(source, normalizedSpec.range.scale, snapshot, logicalMapSize);
  const issues: PrintValidationIssue[] = budgetIssue === undefined ? [] : [budgetIssue];
  const warnings: PrintWarning[] = [];

  if (normalizedContext.northDirection === undefined) {
    issues.push(freezeIssue('north-direction-unavailable', '无法计算打印中心的真北方向', 'layout.northArrow'));
  }
  if (
    normalizedSpec.range.scale.mode === 'fixed' &&
    source.mode !== 'box' &&
    !footprintContains(range.footprint, source.footprint, range.center, range.rotation)
  ) {
    issues.push(freezeIssue('fixed-scale-crops-source', '固定比例尺下的地图框无法完整容纳来源范围', 'range.scale'));
  }
  if (normalizedSpec.range.scale.mode === 'fixed' && snapshot.scaleVariesByPosition) {
    warnings.push(freezeWarning('scale-valid-at-center', '当前投影的比例随位置变化，固定比例尺仅在打印中心准确', true, 'range.scale'));
  }
  if (normalizedSpec.content.animations === 'base') {
    warnings.push(freezeWarning('animations-excluded', '打印快照已排除动画效果，将使用 Element 基础状态', true, 'content.animations'));
  }

  const plan = Object.freeze({
    revision: normalizedContext.revision,
    pageSizeMm,
    mapFrameMm,
    outputSizePx,
    range,
    dpi: normalizedSpec.paper.dpi
  }) satisfies PrintPlan;
  return Object.freeze({ plan, validation: createValidation(normalizedContext.revision, issues, warnings) });
}

function normalizeRange(input: unknown): Readonly<{ source: PrintRangeSource; scale: PrintScaleSpec }> {
  const record = inspectRecord(input, 'Print range');
  assertFields(record, rangeFields, 'Print range');
  return Object.freeze({ source: normalizeRangeSource(record.source), scale: normalizeScale(record.scale) });
}

function normalizeRangeSource(input: unknown): PrintRangeSource {
  const record = inspectRecord(input, 'Print range source');
  const mode = record.mode;
  if (mode === 'view' || mode === 'box') {
    assertFields(record, new Set(['mode']), 'Print range source');
    return Object.freeze({ mode });
  }
  if (mode === 'extent') {
    assertFields(record, new Set(['mode', 'extent']), 'Print range source');
    return Object.freeze({ mode, extent: normalizeExtent(record.extent, 'Print range extent') });
  }
  throw new InvalidArgumentError('Print range source mode must be view, box, or extent');
}

function normalizeScale(input: unknown): PrintScaleSpec {
  const record = inspectRecord(input, 'Print scale');
  if (record.mode === 'fit') {
    assertFields(record, new Set(['mode']), 'Print scale');
    return Object.freeze({ mode: 'fit' });
  }
  if (record.mode === 'fixed') {
    assertFields(record, new Set(['mode', 'denominator']), 'Print scale');
    return Object.freeze({ mode: 'fixed', denominator: positiveFinite(record.denominator, 'Print scale denominator') });
  }
  throw new InvalidArgumentError('Print scale mode must be fit or fixed');
}

function normalizePaper(input: unknown): Readonly<NormalizedPrintPaperSpec> {
  const record = inspectRecord(input, 'Print paper');
  assertFields(record, paperFields, 'Print paper');
  const size = normalizePaperSize(record.size);
  const orientation = record.orientation;
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    throw new InvalidArgumentError('Print paper orientation must be portrait or landscape');
  }
  const marginMm = normalizeInsets(record.marginMm, 'Print paper marginMm', true);
  const dpi = positiveFinite(record.dpi, 'Print paper dpi');
  const normalized = Object.freeze({ size, orientation, marginMm, dpi }) satisfies NormalizedPrintPaperSpec;
  const page = resolvePageSizeMm(normalized);
  if (marginMm.left + marginMm.right >= page[0] || marginMm.top + marginMm.bottom >= page[1]) {
    throw new InvalidArgumentError('Print paper margins must leave a positive page frame');
  }
  return normalized;
}

function normalizePaperSize(input: unknown): PrintPaperSize {
  if (input === 'A4' || input === 'A3') return input;
  const record = inspectRecord(input, 'Custom print paper size');
  assertFields(record, pageSizeFields, 'Custom print paper size');
  return Object.freeze({
    widthMm: positiveFinite(record.widthMm, 'Custom print paper widthMm'),
    heightMm: positiveFinite(record.heightMm, 'Custom print paper heightMm')
  });
}

function normalizeLayout(input: unknown): Readonly<PrintLayoutSpec> {
  const record = inspectRecord(input, 'Print layout');
  assertFields(record, layoutFields, 'Print layout');
  return Object.freeze({
    ...optionalSingleLineText(record, 'classification', 'Print classification'),
    title: singleLineText(record.title, 'Print title', true),
    ...optionalSingleLineText(record, 'subtitle', 'Print subtitle'),
    ...optionalSingleLineText(record, 'date', 'Print date'),
    ...optionalSingleLineText(record, 'issuer', 'Print issuer')
  });
}

function normalizeContent(input: unknown): Readonly<Required<PrintContentSpec>> {
  const record = input === undefined ? Object.create(null) : inspectRecord(input, 'Print content');
  assertFields(record, contentFields, 'Print content');
  const animations = record.animations === undefined ? 'current-frame' : record.animations;
  if (animations !== 'current-frame' && animations !== 'base') throw new InvalidArgumentError('Print content animations must be current-frame or base');
  if (record.domOverlays !== undefined && record.domOverlays !== 'exclude') throw new InvalidArgumentError('Print content domOverlays must be exclude');
  if (record.controls !== undefined && record.controls !== 'exclude') throw new InvalidArgumentError('Print content controls must be exclude');
  return Object.freeze({ animations, domOverlays: 'exclude', controls: 'exclude' });
}

function normalizeResources(input: unknown): Readonly<PrintResourceSpec> {
  const record = inspectRecord(input, 'Print resources');
  assertFields(record, resourceFields, 'Print resources');
  if (record.timeoutMs === undefined) return Object.freeze({});
  return Object.freeze({ timeoutMs: positiveFinite(record.timeoutMs, 'Print resource timeoutMs') });
}

function normalizeLegend(input: unknown): PrintLegendSpec {
  const record = inspectRecord(input, 'Print legend');
  if (record.mode === 'auto') {
    assertFields(record, autoLegendFields, 'Print auto legend');
    if (record.showCounts !== undefined && typeof record.showCounts !== 'boolean') {
      throw new InvalidArgumentError('Print auto legend showCounts must be a boolean');
    }
    return Object.freeze({ mode: 'auto', ...(record.showCounts === undefined ? {} : { showCounts: record.showCounts }) });
  }
  if (record.mode !== 'manual') throw new InvalidArgumentError('Print legend mode must be auto or manual');
  assertFields(record, manualLegendFields, 'Print manual legend');
  const groups = normalizeLegendGroups(record.groups);
  const groupIds = new Set(groups.map((group) => group.id));
  const items = normalizeLegendItems(record.items, groupIds);
  const layout = record.layout === undefined ? undefined : normalizeLegendLayout(record.layout);
  return Object.freeze({ mode: 'manual', groups, items, ...(layout === undefined ? {} : { layout }) });
}

function normalizeLegendGroups(input: unknown): readonly Readonly<PrintLegendGroup>[] {
  const source = inspectDenseArray(input, 'Print legend groups');
  const ids = new Set<string>();
  const groups = source.map((value, index) => {
    const label = `Print legend group[${index}]`;
    const record = inspectRecord(value, label);
    assertFields(record, legendGroupFields, label);
    const id = nonEmptyString(record.id, `${label}.id`);
    if (ids.has(id)) throw new InvalidArgumentError(`Duplicate Print legend group id: ${id}`);
    ids.add(id);
    return Object.freeze({
      id,
      title: nonEmptyString(record.title, `${label}.title`),
      ...optionalBoolean(record, 'visible', `${label}.visible`),
      ...optionalFinite(record, 'order', `${label}.order`)
    });
  });
  return Object.freeze(groups);
}

function normalizeLegendItems(input: unknown, groupIds: ReadonlySet<string>): readonly Readonly<PrintLegendItem>[] {
  const source = inspectDenseArray(input, 'Print legend items');
  const ids = new Set<string>();
  const items = source.map((value, index) => {
    const label = `Print legend item[${index}]`;
    const record = inspectRecord(value, label);
    assertFields(record, legendItemFields, label);
    const id = nonEmptyString(record.id, `${label}.id`);
    if (ids.has(id)) throw new InvalidArgumentError(`Duplicate Print legend item id: ${id}`);
    ids.add(id);
    const groupId = nonEmptyString(record.groupId, `${label}.groupId`);
    if (!groupIds.has(groupId)) throw new InvalidArgumentError(`${label}.groupId does not reference a Print legend group: ${groupId}`);
    return Object.freeze({
      id,
      groupId,
      label: nonEmptyString(record.label, `${label}.label`),
      symbol: normalizeLegendSymbol(record.symbol, `${label}.symbol`),
      ...optionalBoolean(record, 'visible', `${label}.visible`),
      ...optionalFinite(record, 'order', `${label}.order`),
      ...optionalNonNegativeInteger(record, 'count', `${label}.count`),
      ...optionalNonEmptyString(record, 'sourceKey', `${label}.sourceKey`)
    });
  });
  return Object.freeze(items);
}

function normalizeLegendLayout(input: unknown): Readonly<PrintLegendLayoutSpec> {
  const record = inspectRecord(input, 'Print legend layout');
  assertFields(record, legendLayoutFields, 'Print legend layout');
  const position = record.position ?? 'bottom-left';
  if (position !== 'top-left' && position !== 'top-right' && position !== 'bottom-left' && position !== 'bottom-right') {
    throw new InvalidArgumentError('Print legend position must be top-left, top-right, bottom-left, or bottom-right');
  }
  let direction: 'row' | 'column' | undefined;
  if (record.direction !== undefined) {
    if (record.direction !== 'row' && record.direction !== 'column') throw new InvalidArgumentError('Print legend direction must be row or column');
    direction = record.direction;
  }
  return Object.freeze({
    position,
    ...optionalPositiveInteger(record, 'columns', 'Print legend columns'),
    ...(direction === undefined ? {} : { direction }),
    ...optionalPositive(record, 'maxWidthMm', 'Print legend maxWidthMm'),
    ...(record.paddingMm === undefined ? {} : { paddingMm: normalizeInsets(record.paddingMm, 'Print legend paddingMm', true) }),
    ...optionalNonEmptyString(record, 'background', 'Print legend background'),
    ...optionalNonNegative(record, 'groupGapMm', 'Print legend groupGapMm'),
    ...optionalNonNegative(record, 'itemGapMm', 'Print legend itemGapMm')
  });
}

function normalizeLegendSymbol(input: unknown, label: string): PrintLegendSymbolSpec {
  const record = inspectRecord(input, label);
  if (record.kind === 'point') {
    assertFields(record, new Set(['kind', 'radiusMm', 'fill', 'stroke']), label);
    return Object.freeze({
      kind: 'point',
      radiusMm: positiveFinite(record.radiusMm, `${label}.radiusMm`),
      ...(record.fill === undefined ? {} : { fill: normalizeFill(record.fill, `${label}.fill`) }),
      ...(record.stroke === undefined ? {} : { stroke: normalizeStroke(record.stroke, `${label}.stroke`) })
    });
  }
  if (record.kind === 'line') {
    assertFields(record, new Set(['kind', 'stroke']), label);
    return Object.freeze({ kind: 'line', stroke: normalizeStroke(record.stroke, `${label}.stroke`) });
  }
  if (record.kind === 'polygon') {
    assertFields(record, new Set(['kind', 'fill', 'stroke']), label);
    if (record.fill === undefined && record.stroke === undefined) throw new InvalidArgumentError(`${label} must define fill or stroke`);
    return Object.freeze({
      kind: 'polygon',
      ...(record.fill === undefined ? {} : { fill: normalizeFill(record.fill, `${label}.fill`) }),
      ...(record.stroke === undefined ? {} : { stroke: normalizeStroke(record.stroke, `${label}.stroke`) })
    });
  }
  if (record.kind === 'icon') {
    assertFields(record, new Set(['kind', 'src', 'size', 'anchor', 'crossOrigin']), label);
    const crossOrigin = record.crossOrigin;
    if (crossOrigin !== undefined && crossOrigin !== 'anonymous' && crossOrigin !== 'use-credentials') {
      throw new InvalidArgumentError(`${label}.crossOrigin must be anonymous or use-credentials`);
    }
    return Object.freeze({
      kind: 'icon',
      src: nonEmptyString(record.src, `${label}.src`),
      size: normalizePair(record.size, `${label}.size`, true),
      anchor: normalizePair(record.anchor, `${label}.anchor`, false),
      ...(crossOrigin === undefined ? {} : { crossOrigin })
    });
  }
  throw new InvalidArgumentError(`${label}.kind must be point, line, polygon, or icon`);
}

function normalizeFill(input: unknown, label: string): Readonly<PrintLegendFillSpec> {
  const record = inspectRecord(input, label);
  assertFields(record, fillFields, label);
  return Object.freeze({ color: nonEmptyString(record.color, `${label}.color`) });
}

function normalizeStroke(input: unknown, label: string): Readonly<PrintLegendStrokeSpec> {
  const record = inspectRecord(input, label);
  assertFields(record, strokeFields, label);
  let dashMm: readonly number[] | undefined;
  if (record.dashMm !== undefined) {
    const source = inspectDenseArray(record.dashMm, `${label}.dashMm`);
    if (source.length === 0) throw new InvalidArgumentError(`${label}.dashMm cannot be empty`);
    const values = source.map((value, index) => nonNegativeFinite(value, `${label}.dashMm[${index}]`));
    if (values.every((value) => value === 0)) throw new InvalidArgumentError(`${label}.dashMm must contain a positive length`);
    dashMm = Object.freeze(values);
  }
  return Object.freeze({
    color: nonEmptyString(record.color, `${label}.color`),
    widthMm: positiveFinite(record.widthMm, `${label}.widthMm`),
    ...(dashMm === undefined ? {} : { dashMm })
  });
}

function normalizeViewSnapshot(input: PrintViewSnapshot): Readonly<NormalizedViewSnapshot> {
  const record = inspectRecord(input, 'Print view snapshot');
  assertFields(record, viewFields, 'Print view snapshot');
  const metersPerViewUnitAtCenter = record.metersPerViewUnitAtCenter;
  if (typeof metersPerViewUnitAtCenter !== 'number' || !Number.isFinite(metersPerViewUnitAtCenter) || metersPerViewUnitAtCenter <= 0) {
    throw new CapabilityError('Print planning requires a finite positive metersPerViewUnitAtCenter');
  }
  if (record.scaleVariesByPosition !== undefined && typeof record.scaleVariesByPosition !== 'boolean') {
    throw new InvalidArgumentError('Print view scaleVariesByPosition must be a boolean');
  }
  return Object.freeze({
    center: normalizeCoordinate(record.center, 'Print view center'),
    footprint: normalizeFootprint(record.footprint, 'Print view footprint'),
    rotation: finiteNumber(record.rotation, 'Print view rotation'),
    metersPerViewUnitAtCenter,
    scaleVariesByPosition: record.scaleVariesByPosition === true
  });
}

function normalizePlannerContext(input: PrintPlannerContext): Readonly<NormalizedPlannerContext> {
  const record = inspectRecord(input, 'Print planner context');
  assertFields(record, contextFields, 'Print planner context');
  const revision = nonNegativeSafeInteger(record.revision, 'Print planner revision');
  const limits = normalizeLimits(record.limits);
  const boxRange = record.boxRange === undefined ? undefined : normalizeBoxRange(record.boxRange);
  const northDirection = record.northDirection === undefined ? undefined : finiteNumber(record.northDirection, 'Print north direction');
  return Object.freeze({ revision, limits, boxRange, northDirection });
}

function normalizeLimits(input: unknown): Readonly<PrintPlannerLimits> {
  const record = inspectRecord(input, 'Print planner limits');
  assertFields(record, limitFields, 'Print planner limits');
  const minDpi = positiveFinite(record.minDpi, 'Print minimum DPI');
  const maxDpi = positiveFinite(record.maxDpi, 'Print maximum DPI');
  if (minDpi > maxDpi) throw new InvalidArgumentError('Print minimum DPI cannot exceed maximum DPI');
  return Object.freeze({
    minDpi,
    maxDpi,
    maxCanvasDimension: positiveSafeInteger(record.maxCanvasDimension, 'Print maximum Canvas dimension'),
    maxCanvasPixels: positiveSafeInteger(record.maxCanvasPixels, 'Print maximum Canvas pixels')
  });
}

function normalizeBoxRange(input: unknown): Readonly<PrintBoxRangeSnapshot> {
  const record = inspectRecord(input, 'Print box range');
  assertFields(record, boxRangeFields, 'Print box range');
  return Object.freeze({
    center: normalizeCoordinate(record.center, 'Print box center'),
    footprint: normalizeFootprint(record.footprint, 'Print box footprint'),
    rotation: finiteNumber(record.rotation, 'Print box rotation')
  });
}

function resolvePageSizeMm(paper: NormalizedPrintPaperSpec): readonly [number, number] {
  let first: number;
  let second: number;
  if (paper.size === 'A4') [first, second] = [210, 297];
  else if (paper.size === 'A3') [first, second] = [297, 420];
  else [first, second] = [paper.size.widthMm, paper.size.heightMm];
  const shortSide = Math.min(first, second);
  const longSide = Math.max(first, second);
  return paper.orientation === 'portrait' ? Object.freeze([shortSide, longSide]) : Object.freeze([longSide, shortSide]);
}

function createMapFrameMm(page: readonly [number, number], margins: PrintPageInsets): Readonly<PrintPageRect> {
  const innerX = margins.left;
  const innerY = margins.top;
  const innerWidth = page[0] - margins.left - margins.right;
  const innerHeight = page[1] - margins.top - margins.bottom;
  const x = innerX + MAP_FRAME_RESERVE_MM;
  const y = innerY + HEADER_BAND_HEIGHT_MM + TITLE_BAND_HEIGHT_MM + TITLE_MAP_GAP_MM + MAP_FRAME_RESERVE_MM;
  const width = innerWidth - MAP_FRAME_RESERVE_MM * 2;
  const height =
    innerHeight - HEADER_BAND_HEIGHT_MM - TITLE_BAND_HEIGHT_MM - TITLE_MAP_GAP_MM - MAP_FRAME_RESERVE_MM * 2 - MAP_FOOTER_GAP_MM - FOOTER_BAND_HEIGHT_MM;
  if (![x, y, width, height].every(Number.isFinite) || width < MIN_MAP_FRAME_MM || height < MIN_MAP_FRAME_MM) {
    throw new InvalidArgumentError(`纸张和边距必须至少保留 ${MIN_MAP_FRAME_MM}mm × ${MIN_MAP_FRAME_MM}mm 的地图框`);
  }
  return Object.freeze({ x, y, width, height });
}

function resolveOutputSizePx(paper: NormalizedPrintPaperSpec, page: readonly [number, number], limits: PrintPlannerLimits): readonly [number, number] {
  const width = Math.round(millimetersToPixels(page[0], paper.dpi));
  const height = Math.round(millimetersToPixels(page[1], paper.dpi));
  const pixels = width * height;
  const label = typeof paper.size === 'string' ? paper.size : `${paper.size.widthMm}mm×${paper.size.heightMm}mm 自定义纸张`;
  const limitSummary = `DPI ${limits.minDpi}-${limits.maxDpi}，单边 ${limits.maxCanvasDimension}px，总像素 ${limits.maxCanvasPixels}`;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(pixels)) {
    throw new InvalidArgumentError(`${label} 在 ${paper.dpi} DPI 下产生无效像素尺寸 ${width}×${height}；当前限制：${limitSummary}`);
  }
  return Object.freeze([width, height]);
}

function createPixelBudgetIssue(
  paper: Readonly<NormalizedPrintPaperSpec>,
  outputSizePx: readonly [number, number],
  limits: Readonly<PrintPlannerLimits>
): Readonly<PrintValidationIssue> | undefined {
  const [width, height] = outputSizePx;
  const pixels = width * height;
  if (
    paper.dpi >= limits.minDpi &&
    paper.dpi <= limits.maxDpi &&
    width <= limits.maxCanvasDimension &&
    height <= limits.maxCanvasDimension &&
    pixels <= limits.maxCanvasPixels
  ) {
    return undefined;
  }
  const label = typeof paper.size === 'string' ? paper.size : `${paper.size.widthMm}mm×${paper.size.heightMm}mm 自定义纸张`;
  return freezeIssue(
    'pixel-budget-exceeded',
    `${label} 在 ${paper.dpi} DPI 下将生成 ${width}×${height}px（共 ${pixels} 像素）；当前限制：DPI ${limits.minDpi}-${limits.maxDpi}，单边 ${limits.maxCanvasDimension}px，总像素 ${limits.maxCanvasPixels}`,
    'paper.dpi'
  );
}

function resolveSourceGeometry(
  source: PrintRangeSource,
  view: NormalizedViewSnapshot,
  boxRange: Readonly<PrintBoxRangeSnapshot> | undefined
): Readonly<SourceGeometry> {
  if (source.mode === 'view') {
    return Object.freeze({
      mode: source.mode,
      center: view.center,
      footprint: view.footprint,
      extent: extentFromFootprint(view.footprint),
      rotation: view.rotation
    });
  }
  if (source.mode === 'extent') {
    const center = Object.freeze([(source.extent[0] + source.extent[2]) / 2, (source.extent[1] + source.extent[3]) / 2]) as Point2;
    return Object.freeze({ mode: source.mode, center, footprint: footprintFromExtent(source.extent), extent: source.extent, rotation: view.rotation });
  }
  if (boxRange === undefined) throw new InvalidArgumentError('Print box range is unresolved');
  return Object.freeze({
    mode: source.mode,
    center: boxRange.center as Point2,
    footprint: boxRange.footprint,
    extent: extentFromFootprint(boxRange.footprint),
    rotation: boxRange.rotation
  });
}

function resolveRange(
  source: SourceGeometry,
  scale: PrintScaleSpec,
  view: NormalizedViewSnapshot,
  logicalMapSize: Readonly<{ width: number; height: number }>
): Readonly<PrintResolvedRange> {
  let resolution: number;
  let denominator: number;
  if (scale.mode === 'fixed') {
    denominator = scale.denominator;
    resolution = (denominator * MM_PER_INCH * METERS_PER_MILLIMETER) / (PRINT_CSS_DPI * view.metersPerViewUnitAtCenter);
  } else {
    resolution = fitResolution(source.center, source.footprint, source.rotation, logicalMapSize);
    denominator = (resolution * view.metersPerViewUnitAtCenter * PRINT_CSS_DPI) / (MM_PER_INCH * METERS_PER_MILLIMETER);
  }
  if (!Number.isFinite(resolution) || resolution <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    throw new CapabilityError('Print planning could not derive a finite positive scale at the print center');
  }
  const footprint = createFootprint(source.center, logicalMapSize.width * resolution, logicalMapSize.height * resolution, source.rotation);
  return Object.freeze({
    sourceMode: source.mode,
    sourceExtent: source.extent,
    actualExtent: extentFromFootprint(footprint),
    footprint,
    center: freezeCoordinate(source.center[0], source.center[1]),
    rotation: source.rotation,
    denominator,
    resolution
  });
}

function fitResolution(center: Point2, footprint: PrintFootprint, rotation: number, mapSize: Readonly<{ width: number; height: number }>): number {
  const axes = viewAxes(rotation);
  let halfWidth = 0;
  let halfHeight = 0;
  for (const coordinate of footprint) {
    const dx = coordinate[0] - center[0];
    const dy = coordinate[1] - center[1];
    halfWidth = Math.max(halfWidth, Math.abs(dx * axes.right[0] + dy * axes.right[1]));
    halfHeight = Math.max(halfHeight, Math.abs(dx * axes.up[0] + dy * axes.up[1]));
  }
  const resolution = Math.max((halfWidth * 2) / mapSize.width, (halfHeight * 2) / mapSize.height);
  if (!Number.isFinite(resolution) || resolution <= 0) throw new InvalidArgumentError('Print source footprint must cover a positive area');
  return resolution;
}

function createFootprint(center: Point2, width: number, height: number, rotation: number): PrintFootprint {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new CapabilityError('Print planning produced an invalid footprint size');
  }
  const axes = viewAxes(rotation);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corner = (rightAmount: number, upAmount: number): Point2 =>
    freezeCoordinate(center[0] + axes.right[0] * rightAmount + axes.up[0] * upAmount, center[1] + axes.right[1] * rightAmount + axes.up[1] * upAmount);
  return Object.freeze([corner(-halfWidth, halfHeight), corner(halfWidth, halfHeight), corner(halfWidth, -halfHeight), corner(-halfWidth, -halfHeight)]);
}

function footprintFromExtent(extent: PrintExtent): PrintFootprint {
  return Object.freeze([
    freezeCoordinate(extent[0], extent[3]),
    freezeCoordinate(extent[2], extent[3]),
    freezeCoordinate(extent[2], extent[1]),
    freezeCoordinate(extent[0], extent[1])
  ]);
}

function extentFromFootprint(footprint: PrintFootprint): PrintExtent {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const coordinate of footprint) {
    minX = Math.min(minX, coordinate[0]);
    minY = Math.min(minY, coordinate[1]);
    maxX = Math.max(maxX, coordinate[0]);
    maxY = Math.max(maxY, coordinate[1]);
  }
  return freezeExtent(minX, minY, maxX, maxY, 'Print footprint extent');
}

function footprintContains(container: PrintFootprint, target: PrintFootprint, center: readonly number[], rotation: number): boolean {
  const axes = viewAxes(rotation);
  const halfWidth = distance(container[0], container[1]) / 2;
  const halfHeight = distance(container[1], container[2]) / 2;
  const tolerance = Math.max(halfWidth, halfHeight, 1) * 1e-10;
  return target.every((coordinate) => {
    const dx = coordinate[0] - center[0];
    const dy = coordinate[1] - center[1];
    const horizontal = Math.abs(dx * axes.right[0] + dy * axes.right[1]);
    const vertical = Math.abs(dx * axes.up[0] + dy * axes.up[1]);
    return horizontal <= halfWidth + tolerance && vertical <= halfHeight + tolerance;
  });
}

function viewAxes(rotation: number): Readonly<{ right: Point2; up: Point2 }> {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return Object.freeze({ right: freezeCoordinate(cosine, sine), up: freezeCoordinate(-sine, cosine) });
}

function distance(first: readonly number[], second: readonly number[]): number {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function millimetersToPixels(millimeters: number, dpi: number): number {
  return (millimeters * dpi) / MM_PER_INCH;
}

function createValidation(revision: number, issues: readonly PrintValidationIssue[], warnings: readonly PrintWarning[]): Readonly<PrintValidationReport> {
  const frozenIssues = Object.freeze([...issues]);
  const frozenWarnings = Object.freeze([...warnings]);
  return Object.freeze({
    revision,
    issues: frozenIssues,
    warnings: frozenWarnings,
    canPreview: frozenIssues.length === 0,
    canExport: frozenIssues.length === 0 && frozenWarnings.every((warning) => !warning.requiresAcknowledgement)
  });
}

function freezeIssue(code: string, message: string, subject?: string): Readonly<PrintValidationIssue> {
  return Object.freeze({ code, message, ...(subject === undefined ? {} : { subject }) });
}

function freezeWarning(code: string, message: string, requiresAcknowledgement: boolean, subject?: string): Readonly<PrintWarning> {
  return Object.freeze({ code, message, ...(subject === undefined ? {} : { subject }), requiresAcknowledgement });
}

function normalizeInsets(input: unknown, label: string, allowUniform: boolean): Readonly<PrintPageInsets> {
  if (allowUniform && typeof input === 'number') {
    const value = nonNegativeFinite(input, label);
    return Object.freeze({ top: value, right: value, bottom: value, left: value });
  }
  const record = inspectRecord(input, label);
  assertFields(record, insetFields, label);
  return Object.freeze({
    top: nonNegativeFinite(record.top, `${label}.top`),
    right: nonNegativeFinite(record.right, `${label}.right`),
    bottom: nonNegativeFinite(record.bottom, `${label}.bottom`),
    left: nonNegativeFinite(record.left, `${label}.left`)
  });
}

function normalizeCoordinate(input: unknown, label: string): Point2 {
  const values = inspectDenseArray(input, label);
  if (values.length !== 2 && values.length !== 3) throw new InvalidArgumentError(`${label} must contain two or three finite numbers`);
  for (let index = 0; index < values.length; index += 1) finiteNumber(values[index], `${label}[${index}]`);
  return freezeCoordinate(values[0] as number, values[1] as number);
}

function normalizeFootprint(input: unknown, label: string): PrintFootprint {
  const values = inspectDenseArray(input, label);
  if (values.length !== 4) throw new InvalidArgumentError(`${label} must contain four coordinates`);
  const footprint = Object.freeze(values.map((value, index) => normalizeCoordinate(value, `${label}[${index}]`))) as unknown as PrintFootprint;
  let twiceArea = 0;
  for (let index = 0; index < footprint.length; index += 1) {
    const current = footprint[index];
    const next = footprint[(index + 1) % footprint.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  if (!Number.isFinite(twiceArea) || twiceArea === 0) {
    throw new InvalidArgumentError(`${label} must cover a positive area`);
  }
  return footprint;
}

function normalizeExtent(input: unknown, label: string): PrintExtent {
  const values = inspectDenseArray(input, label);
  if (values.length !== 4) throw new InvalidArgumentError(`${label} must contain four finite numbers`);
  return freezeExtent(
    finiteNumber(values[0], `${label}[0]`),
    finiteNumber(values[1], `${label}[1]`),
    finiteNumber(values[2], `${label}[2]`),
    finiteNumber(values[3], `${label}[3]`),
    label
  );
}

function freezeExtent(minX: number, minY: number, maxX: number, maxY: number, label: string): PrintExtent {
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX >= maxX || minY >= maxY) {
    throw new InvalidArgumentError(`${label} must have finite min/max values with positive width and height`);
  }
  return Object.freeze([minX, minY, maxX, maxY]);
}

function freezeCoordinate(x: number, y: number): Point2 {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new CapabilityError('Print planning produced a non-finite coordinate');
  return Object.freeze([x, y]);
}

function normalizePair(input: unknown, label: string, positive: boolean): readonly [number, number] {
  const values = inspectDenseArray(input, label);
  if (values.length !== 2) throw new InvalidArgumentError(`${label} must contain two finite numbers`);
  const normalize = positive ? positiveFinite : finiteNumber;
  return Object.freeze([normalize(values[0], `${label}[0]`), normalize(values[1], `${label}[1]`)]);
}

function inspectRecord(input: unknown, label: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError(`${label} must be a plain object`);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new InvalidArgumentError(`${label} cannot contain symbol properties`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} cannot contain accessor properties`);
    record[key] = descriptor.value;
  }
  return record;
}

function inspectDenseArray(input: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(input)) throw new InvalidArgumentError(`${label} must be an array`);
  if (Object.getPrototypeOf(input) !== Array.prototype) throw new InvalidArgumentError(`${label} must be a plain array`);
  for (const key of Reflect.ownKeys(input)) {
    if (key === 'length') continue;
    if (typeof key !== 'string') throw new InvalidArgumentError(`${label} cannot contain symbol properties`);
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= input.length || String(index) !== key) {
      throw new InvalidArgumentError(`${label} cannot contain non-index properties`);
    }
  }
  const values = new Array<unknown>(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, index);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError(`${label} must be a dense data array`);
    values[index] = descriptor.value;
  }
  return values;
}

function assertFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new InvalidArgumentError(`Unknown ${label.toLowerCase()} field: ${key}`);
}

function optionalSingleLineText(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, string>> {
  if (record[key] === undefined) return {};
  return { [key]: singleLineText(record[key], label) };
}

function singleLineText(value: unknown, label: string, requireNonEmpty = false): string {
  if (typeof value !== 'string') throw new InvalidArgumentError(`${label} must be a string`);
  if (requireNonEmpty && value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  if (/\r|\n|\u2028|\u2029/u.test(value)) throw new InvalidArgumentError(`${label} must be a single-line string`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, boolean>> {
  if (record[key] === undefined) return {};
  if (typeof record[key] !== 'boolean') throw new InvalidArgumentError(`${label} must be a boolean`);
  return { [key]: record[key] };
}

function optionalFinite(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, number>> {
  if (record[key] === undefined) return {};
  return { [key]: finiteNumber(record[key], label) };
}

function optionalPositive(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, number>> {
  if (record[key] === undefined) return {};
  return { [key]: positiveFinite(record[key], label) };
}

function optionalNonNegative(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, number>> {
  if (record[key] === undefined) return {};
  return { [key]: nonNegativeFinite(record[key], label) };
}

function optionalPositiveInteger(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, number>> {
  if (record[key] === undefined) return {};
  return { [key]: positiveSafeInteger(record[key], label) };
}

function optionalNonNegativeInteger(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, number>> {
  if (record[key] === undefined) return {};
  return { [key]: nonNegativeSafeInteger(record[key], label) };
}

function optionalNonEmptyString(record: Record<string, unknown>, key: string, label: string): Readonly<Record<string, string>> {
  if (record[key] === undefined) return {};
  return { [key]: nonEmptyString(record[key], label) };
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError(`${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidArgumentError(`${label} must be finite`);
  return value;
}

function positiveFinite(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result <= 0) throw new InvalidArgumentError(`${label} must be greater than zero`);
  return result;
}

function nonNegativeFinite(value: unknown, label: string): number {
  const result = finiteNumber(value, label);
  if (result < 0) throw new InvalidArgumentError(`${label} must be non-negative`);
  return result;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidArgumentError(`${label} must be a non-negative safe integer`);
  }
  return value;
}
