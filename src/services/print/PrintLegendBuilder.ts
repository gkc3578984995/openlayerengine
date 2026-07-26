import type { Color } from '../../core/common/types.js';
import type { ElementStore } from '../../core/element/ElementStore.js';
import type { ElementState } from '../../core/element/types.js';
import type { LayerManager } from '../../core/layer/LayerManager.js';
import type {
  PrintLegendFillSpec,
  PrintLegendGroup,
  PrintLegendItem,
  PrintLegendResult,
  PrintLegendSpec,
  PrintLegendStrokeSpec,
  PrintLegendSymbolSpec,
  PrintPlan,
  PrintWarning
} from '../../core/print/types.js';
import type { PrintGeometryHitPort } from '../../core/ports/PrintGeometryHitPort.js';
import { isNativeStyleRef, type PatternFillSpec, type SolidFillSpec, type StrokeSpec, type StyleSpec } from '../../core/style/types.js';

export interface PrintLegendBuilderOptions {
  readonly store: ElementStore;
  readonly layers: LayerManager;
  readonly geometryHit: PrintGeometryHitPort;
}

interface LegendSourceBucket {
  readonly layerId: string;
  readonly layerGeneration: unknown;
  readonly layerGenerationKey?: string;
  readonly type: ElementState['type'] | 'dynamic-style';
  readonly label: string;
  readonly symbol: PrintLegendSymbolSpec;
  readonly fingerprint: string;
  readonly elements: readonly Readonly<ElementState>[];
  readonly members: ReadonlySet<unknown>;
  readonly order: number;
}

interface LegendSourceRecord {
  readonly identity: string;
  readonly layerId: string;
  readonly layerGeneration: unknown;
  readonly type: ElementState['type'] | 'dynamic-style';
  readonly label: string;
  readonly fingerprint: string;
  readonly members: ReadonlySet<unknown>;
}

interface LegendSource extends LegendSourceBucket {
  readonly identity: string;
}

/** 根据最终 PrintPlan 生成可追踪、可手工覆盖的打印图例。 */
export class PrintLegendBuilder {
  readonly #store: ElementStore;
  readonly #layers: LayerManager;
  readonly #geometryHit: PrintGeometryHitPort;
  readonly #sourceRecords = new Map<string, LegendSourceRecord>();
  #nextSourceId = 0;

  constructor(options: PrintLegendBuilderOptions) {
    this.#store = options.store;
    this.#layers = options.layers;
    this.#geometryHit = options.geometryHit;
  }

  generate(plan: Readonly<PrintPlan>, spec: Readonly<PrintLegendSpec> = { mode: 'auto' }): PrintLegendResult {
    if (spec.mode === 'manual') {
      const retainedIdentities = new Set(spec.items.flatMap((item) => (item.sourceKey === undefined ? [] : [sourceIdentityOf(item.sourceKey)])));
      const automatic = this.#generateAutomatic(plan, { mode: 'auto', showCounts: true }, retainedIdentities);
      return replayManualLegend(automatic, spec.groups, spec.items, plan.revision);
    }
    return this.#generateAutomatic(plan, spec, new Set());
  }

  destroy(): void {
    this.#sourceRecords.clear();
    this.#nextSourceId = 0;
  }

  #generateAutomatic(
    plan: Readonly<PrintPlan>,
    spec: Readonly<Extract<PrintLegendSpec, { mode: 'auto' }>>,
    retainedIdentities: ReadonlySet<string>
  ): PrintLegendResult {
    const layerStates = this.#layers
      .query()
      .map((layer, registrationOrder) => ({ layer, registrationOrder }))
      .sort((left, right) => (left.layer.zIndex ?? 0) - (right.layer.zIndex ?? 0) || left.registrationOrder - right.registrationOrder)
      .map(({ layer }) => layer);
    const layerOrder = new Map(layerStates.map((layer, index) => [layer.id, index]));
    const visibleLayerIds = new Set(layerStates.filter((layer) => layer.visible && layer.opacity > 0).map((layer) => layer.id));
    const visibleVectorLayerIds = layerStates.filter((layer) => layer.kind === 'vector' && visibleLayerIds.has(layer.id)).map((layer) => layer.id);
    const indexedCandidateIds = this.#geometryHit.candidateElementIds?.(plan.range.footprint, plan.range.resolution, visibleVectorLayerIds);
    const spatialCandidates =
      indexedCandidateIds === undefined
        ? this.#store.query({ visible: true })
        : [...new Set(indexedCandidateIds)].flatMap((elementId) => {
            const element = this.#store.resolve(elementId);
            return element === undefined ? [] : [element];
          });
    const candidates = spatialCandidates
      .filter(
        (element) =>
          element.visible &&
          visibleLayerIds.has(element.layerId) &&
          isElementStylePotentiallyVisible(element) &&
          (this.#geometryHit.isVisibleAt === undefined
            ? this.#geometryHit.intersectsFootprint(element.id, plan.range.footprint, plan.range.resolution)
            : this.#geometryHit.isVisibleAt(element.id, plan.range.resolution, plan.range.footprint))
      )
      .sort(
        (left, right) =>
          (layerOrder.get(left.layerId) ?? 0) - (layerOrder.get(right.layerId) ?? 0) ||
          styleZIndex(left) - styleZIndex(right) ||
          this.#geometryHit.renderOrderOf(left.id) - this.#geometryHit.renderOrderOf(right.id)
      );
    const sources = this.#reconcileSources(candidates, retainedIdentities);
    const sourceByElement = new Map(sources.flatMap((source) => source.elements.map((element) => [element.id, source] as const)));
    const groups = new Map<string, PrintLegendGroup>();
    const merged = new Map<string, PrintLegendItem>();
    const candidateCounts = new Map<string, number>();
    const warnings: PrintWarning[] = [];
    for (const element of candidates) {
      const source = sourceByElement.get(element.id);
      if (source === undefined) continue;
      candidateCounts.set(source.identity, (candidateCounts.get(source.identity) ?? 0) + 1);
      const groupId =
        source.layerGenerationKey === undefined
          ? `layer:${source.layerId}`
          : `layer:${encodeURIComponent(source.layerId)}|generation:${encodeURIComponent(source.layerGenerationKey)}`;
      if (!groups.has(groupId)) groups.set(groupId, { id: groupId, title: source.layerId, order: layerOrder.get(source.layerId) ?? groups.size });
      const current = merged.get(source.identity);
      if (current === undefined) {
        const sourceKey = `${source.identity}|style:${hash(source.fingerprint)}`;
        merged.set(source.identity, {
          id: `auto:${hash(source.identity)}`,
          groupId,
          label: source.label,
          symbol: source.symbol,
          order: merged.size,
          ...(spec.showCounts === false ? {} : { count: 1 }),
          sourceKey
        });
      } else if (spec.showCounts !== false) {
        merged.set(source.identity, { ...current, count: (current.count ?? 0) + 1 });
      }
    }

    for (const source of sources) {
      if (source.type !== 'dynamic-style') continue;
      const count = candidateCounts.get(source.identity) ?? 0;
      if (count === 0) continue;
      warnings.push({
        code: 'unknown-dynamic-style',
        message: `图层 ${source.layerId} 有 ${count} 个动态样式目标无法自动解析，请在手动图例中确认。`,
        subject: source.layerId,
        requiresAcknowledgement: true
      });
    }

    const usedGroups = new Set([...merged.values()].map((item) => item.groupId));
    return freezeResult({
      groups: [...groups.values()].filter((group) => usedGroups.has(group.id)),
      items: [...merged.values()],
      sourceRevision: plan.revision,
      warnings
    });
  }

  #reconcileSources(elements: readonly Readonly<ElementState>[], retainedIdentities: ReadonlySet<string>): readonly LegendSource[] {
    const buckets = createSourceBuckets(elements, this.#store, this.#layers);
    const assigned = new Set<string>();
    const sources: LegendSource[] = [];
    for (const bucket of buckets) {
      let selected: LegendSourceRecord | undefined;
      let selectedScore = -1;
      for (const record of this.#sourceRecords.values()) {
        if (
          assigned.has(record.identity) ||
          record.layerId !== bucket.layerId ||
          record.layerGeneration !== bucket.layerGeneration ||
          record.type !== bucket.type
        )
          continue;
        const memberOverlap = intersectionSize(record.members, bucket.members);
        const sameSemantics = record.fingerprint === bucket.fingerprint && record.label === bucket.label;
        const score = memberOverlap > 0 ? memberOverlap + 1_000_000 : sameSemantics ? 1 : 0;
        if (score <= selectedScore) continue;
        selected = record;
        selectedScore = score;
      }
      const layerIdentity =
        bucket.layerGenerationKey === undefined
          ? encodeURIComponent(bucket.layerId)
          : `${encodeURIComponent(bucket.layerId)}|generation:${encodeURIComponent(bucket.layerGenerationKey)}`;
      const identity = selectedScore > 0 && selected !== undefined ? selected.identity : `${layerIdentity}|${bucket.type}|source:${++this.#nextSourceId}`;
      const source = Object.freeze({ ...bucket, identity });
      this.#sourceRecords.set(
        identity,
        Object.freeze({
          identity,
          layerId: bucket.layerId,
          layerGeneration: bucket.layerGeneration,
          type: bucket.type,
          label: bucket.label,
          fingerprint: bucket.fingerprint,
          members: new Set(bucket.members)
        })
      );
      assigned.add(identity);
      sources.push(source);
    }
    for (const identity of this.#sourceRecords.keys()) {
      if (!assigned.has(identity) && !retainedIdentities.has(identity)) this.#sourceRecords.delete(identity);
    }
    return Object.freeze(sources);
  }
}

function createSourceBuckets(elements: readonly Readonly<ElementState>[], store: ElementStore, layers: LayerManager): readonly LegendSourceBucket[] {
  const buckets = new Map<
    string,
    {
      layerId: string;
      layerGeneration: unknown;
      layerGenerationKey?: string;
      type: ElementState['type'] | 'dynamic-style';
      label: string;
      symbol: PrintLegendSymbolSpec;
      fingerprint: string;
      elements: Readonly<ElementState>[];
      members: Set<unknown>;
      order: number;
    }
  >();
  for (const element of elements) {
    const automaticSymbol = isNativeStyleRef(element.style) ? undefined : symbolFromStyle(element, element.style);
    const dynamic = automaticSymbol === undefined;
    const type = dynamic ? 'dynamic-style' : element.type;
    const symbol: PrintLegendSymbolSpec = automaticSymbol ?? {
      kind: 'line',
      stroke: { color: '#7c3aed', widthMm: 0.5, dashMm: [1.2, 0.8] }
    };
    const fingerprint = stableString(symbol);
    const key = `${element.layerId}|${type}|${fingerprint}`;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      const layerGeneration = readLayerGeneration(layers, element.layerId);
      bucket = {
        layerId: element.layerId,
        layerGeneration: layerGeneration.identity,
        ...(layerGeneration.key === undefined ? {} : { layerGenerationKey: layerGeneration.key }),
        type,
        label: dynamic ? '动态样式（无法自动解析）' : shapeLabel(element.type),
        symbol,
        fingerprint,
        elements: [],
        members: new Set(),
        order: buckets.size
      };
      buckets.set(key, bucket);
    }
    bucket.elements.push(element);
    const generation = typeof store.generationOf === 'function' ? store.generationOf(element.id) : undefined;
    bucket.members.add(generation ?? `id:${element.id}`);
  }
  return Object.freeze(
    [...buckets.values()].map((bucket) =>
      Object.freeze({
        ...bucket,
        elements: Object.freeze([...bucket.elements]),
        members: new Set(bucket.members)
      })
    )
  );
}

function readLayerGeneration(layers: LayerManager, layerId: string): Readonly<{ identity: unknown; key?: string }> {
  const generationOf = (layers as LayerManager & { generationOf?: LayerManager['generationOf'] }).generationOf;
  if (typeof generationOf !== 'function') return Object.freeze({ identity: `legacy:${layerId}` });
  const generation = generationOf.call(layers, layerId);
  return generation === undefined ? Object.freeze({ identity: `legacy:${layerId}` }) : Object.freeze({ identity: generation, key: String(generation) });
}

function intersectionSize(left: ReadonlySet<unknown>, right: ReadonlySet<unknown>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function replayManualLegend(
  automatic: Readonly<PrintLegendResult>,
  manualGroups: readonly Readonly<PrintLegendGroup>[],
  manualItems: readonly Readonly<PrintLegendItem>[],
  revision: number
): PrintLegendResult {
  const groups = new Map(manualGroups.map((group) => [group.id, { ...group }]));
  for (const group of automatic.groups) if (!groups.has(group.id)) groups.set(group.id, { ...group });
  const automaticBySource = new Map(
    automatic.items.flatMap((item) => (item.sourceKey === undefined ? [] : [[sourceIdentityOf(item.sourceKey), item] as const]))
  );
  const manualBySource = new Map(manualItems.flatMap((item) => (item.sourceKey === undefined ? [] : [[sourceIdentityOf(item.sourceKey), item] as const])));
  const items: PrintLegendItem[] = [];
  const warnings: PrintWarning[] = [...automatic.warnings];

  for (const automaticItem of automatic.items) {
    const sourceKey = automaticItem.sourceKey;
    const identity = sourceKey === undefined ? undefined : sourceIdentityOf(sourceKey);
    const override = identity === undefined ? undefined : manualBySource.get(identity);
    if (override === undefined) {
      items.push({ ...automaticItem, order: items.length });
      warnings.push({
        code: 'legend-source-added',
        message: `自动图例新增来源：${automaticItem.label}。`,
        ...(sourceKey === undefined ? {} : { subject: sourceKey }),
        requiresAcknowledgement: true
      });
      continue;
    }
    const sourceChanged = sourceStyleOf(sourceKey) !== sourceStyleOf(override.sourceKey);
    const customSymbol = sourceStyleOf(override.sourceKey) !== hash(stableString(override.symbol));
    if (sourceChanged) {
      warnings.push({
        code: 'legend-source-changed',
        message: `图例来源 ${override.label} 的基础符号已经变化，当前保留手动符号。`,
        subject: sourceKey,
        requiresAcknowledgement: true
      });
    }
    items.push({
      ...automaticItem,
      ...override,
      symbol: sourceChanged && !customSymbol ? automaticItem.symbol : override.symbol,
      count: automaticItem.count,
      sourceKey
    });
  }

  for (const manualItem of manualItems) {
    if (manualItem.sourceKey === undefined) {
      items.push({ ...manualItem });
      continue;
    }
    if (automaticBySource.has(sourceIdentityOf(manualItem.sourceKey))) continue;
    warnings.push({
      code: 'legend-source-missing',
      message: `图例来源 ${manualItem.label} 当前不在打印范围内，覆盖已保留但不会输出。`,
      subject: manualItem.sourceKey,
      requiresAcknowledgement: true
    });
  }

  const usedGroups = new Set(items.filter((item) => item.visible !== false).map((item) => item.groupId));
  return freezeResult({
    groups: [...groups.values()].filter((group) => usedGroups.has(group.id) || manualGroups.some((manual) => manual.id === group.id)),
    items,
    sourceRevision: revision,
    warnings
  });
}

function sourceIdentityOf(sourceKey: string): string {
  const marker = sourceKey.lastIndexOf('|style:');
  return marker < 0 ? sourceKey : sourceKey.slice(0, marker);
}

function sourceStyleOf(sourceKey: string | undefined): string | undefined {
  if (sourceKey === undefined) return undefined;
  const marker = sourceKey.lastIndexOf('|style:');
  return marker < 0 ? undefined : sourceKey.slice(marker + 7);
}

function symbolFromStyle(element: Readonly<ElementState>, style: Readonly<StyleSpec>): PrintLegendSymbolSpec | undefined {
  if ((style.decorations?.length ?? 0) > 0 || style.linework !== undefined) return undefined;
  if (element.type === 'point' && style.symbol?.type === 'icon') {
    if (!isIconPotentiallyVisible(style.symbol) || !isSimpleIcon(style.symbol)) return undefined;
    return {
      kind: 'icon',
      src: style.symbol.src,
      size: Object.freeze([...style.symbol.size]),
      anchor: Object.freeze(style.symbol.anchor === undefined ? [0.5, 0.5] : [...style.symbol.anchor]),
      ...(style.symbol.crossOrigin === 'anonymous' || style.symbol.crossOrigin === 'use-credentials' ? { crossOrigin: style.symbol.crossOrigin } : {})
    };
  }
  if (element.type === 'point') {
    const symbol = style.symbol?.type === 'circle' ? style.symbol : undefined;
    if (
      symbol === undefined ||
      !isSimpleFill(symbol.fill) ||
      !isSimpleStroke(symbol.stroke) ||
      (!isFillPotentiallyVisible(symbol.fill, symbol.stroke?.color ?? lastExplicitStrokeColor(style.strokes)) && !isStrokePotentiallyVisible(symbol.stroke))
    )
      return undefined;
    return {
      kind: 'point',
      radiusMm: Math.max(0.8, Math.min(4, (symbol?.radius ?? 5) * 0.264583)),
      ...(symbol.fill === undefined || !isFillPotentiallyVisible(symbol.fill, symbol.stroke?.color ?? lastExplicitStrokeColor(style.strokes))
        ? {}
        : { fill: legendFill(symbol.fill) }),
      ...(symbol.stroke === undefined || !isStrokePotentiallyVisible(symbol.stroke) ? {} : { stroke: legendStroke(symbol.stroke) })
    };
  }
  const strokes = style.strokes ?? [];
  if (strokes.length > 1 || !strokes.every(isSimpleStroke)) return undefined;
  const stroke = strokes.at(-1);
  if (isLineShape(element.type)) {
    if (stroke === undefined || !isStrokePotentiallyVisible(stroke)) return undefined;
    return { kind: 'line', stroke: legendStroke(stroke) };
  }
  const inheritedColor = lastExplicitStrokeColor(style.strokes);
  const visibleFill = isFillPotentiallyVisible(style.fill, inheritedColor);
  const visibleStroke = isStrokePotentiallyVisible(stroke);
  if (!isSimpleFill(style.fill) || (!visibleFill && !visibleStroke)) return undefined;
  return {
    kind: 'polygon',
    ...(style.fill === undefined || !visibleFill ? {} : { fill: legendFill(style.fill) }),
    ...(stroke === undefined || !visibleStroke ? {} : { stroke: legendStroke(stroke) })
  };
}

function isElementStylePotentiallyVisible(element: Readonly<ElementState>): boolean {
  if (isNativeStyleRef(element.style)) return true;
  const style = element.style;
  if ((style.decorations?.length ?? 0) > 0 || style.linework !== undefined || isTextPotentiallyVisible(style)) return true;
  const inheritedColor = lastExplicitStrokeColor(style.strokes);
  if (element.type === 'point') {
    if (style.symbol?.type === 'icon') return isIconPotentiallyVisible(style.symbol);
    if (style.symbol?.type === 'circle') {
      return isFillPotentiallyVisible(style.symbol.fill, style.symbol.stroke?.color ?? inheritedColor) || isStrokePotentiallyVisible(style.symbol.stroke);
    }
    return false;
  }
  if (isLineShape(element.type)) return (style.strokes ?? []).some(isStrokePotentiallyVisible);
  return isFillPotentiallyVisible(style.fill, inheritedColor) || (style.strokes ?? []).some(isStrokePotentiallyVisible);
}

function isTextPotentiallyVisible(style: Readonly<StyleSpec>): boolean {
  const text = style.text;
  if (text === undefined || text.text.length === 0) return false;
  const inheritedColor = lastExplicitStrokeColor(style.strokes);
  const foregroundVisible = text.fill === undefined || isFillPotentiallyVisible(text.fill, text.stroke?.color ?? inheritedColor);
  return (
    foregroundVisible ||
    isStrokePotentiallyVisible(text.stroke) ||
    isFillPotentiallyVisible(text.backgroundFill, text.backgroundStroke?.color ?? inheritedColor) ||
    isStrokePotentiallyVisible(text.backgroundStroke)
  );
}

function isIconPotentiallyVisible(symbol: Extract<NonNullable<StyleSpec['symbol']>, { type: 'icon' }>): boolean {
  return symbol.opacity !== 0 && (symbol.color === undefined || !isKnownTransparentColor(symbol.color));
}

function isFillPotentiallyVisible(fill: Readonly<SolidFillSpec | PatternFillSpec> | undefined, inheritedColor?: Color): boolean {
  if (fill === undefined) return false;
  if (fill.type === 'solid') return !isKnownTransparentColor(fill.color);
  const patternColor = fill.color ?? inheritedColor ?? '#000000';
  return !isKnownTransparentColor(patternColor) || (fill.backgroundColor !== undefined && !isKnownTransparentColor(fill.backgroundColor));
}

function isStrokePotentiallyVisible(stroke: Readonly<StrokeSpec> | undefined): boolean {
  return stroke !== undefined && stroke.width !== 0 && (stroke.color === undefined || !isKnownTransparentColor(stroke.color));
}

function lastExplicitStrokeColor(strokes: readonly Readonly<StrokeSpec>[] | undefined): Color | undefined {
  if (strokes === undefined) return undefined;
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const color = strokes[index]?.color;
    if (color !== undefined) return color;
  }
  return undefined;
}

function isKnownTransparentColor(color: Color): boolean {
  if (typeof color !== 'string') return color.length === 4 && color[3] <= 0;
  const normalized = color.trim().toLowerCase();
  if (normalized === 'transparent') return true;
  if (/^#[0-9a-f]{4}$/.test(normalized)) return normalized.endsWith('0');
  if (/^#[0-9a-f]{8}$/.test(normalized)) return normalized.endsWith('00');
  const slashAlpha = normalized.match(/\/\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s*\)$/);
  if (slashAlpha !== null) return alphaIsZero(slashAlpha[1]);
  const legacyAlpha = normalized.match(/^(?:rgba|hsla)\([^)]*,\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s*\)$/);
  return legacyAlpha !== null && alphaIsZero(legacyAlpha[1]);
}

function alphaIsZero(value: string): boolean {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed <= 0;
}

function isSimpleIcon(symbol: Extract<NonNullable<StyleSpec['symbol']>, { type: 'icon' }>): symbol is Extract<
  NonNullable<StyleSpec['symbol']>,
  { type: 'icon' }
> & {
  size: [number, number];
} {
  return (
    symbol.size !== undefined &&
    symbol.color === undefined &&
    symbol.offset === undefined &&
    symbol.displacement === undefined &&
    symbol.scale === undefined &&
    symbol.rotation === undefined &&
    symbol.rotateWithView === undefined &&
    symbol.anchorOrigin === undefined &&
    symbol.anchorXUnits === undefined &&
    symbol.anchorYUnits === undefined &&
    symbol.origin === undefined &&
    symbol.opacity === undefined &&
    (symbol.crossOrigin === undefined || symbol.crossOrigin === null || symbol.crossOrigin === 'anonymous' || symbol.crossOrigin === 'use-credentials')
  );
}

function isSimpleFill(fill: Readonly<SolidFillSpec | PatternFillSpec> | undefined): fill is Readonly<SolidFillSpec> | undefined {
  return fill === undefined || fill.type === 'solid';
}

function isSimpleStroke(stroke: Readonly<StrokeSpec> | undefined): boolean {
  return (
    stroke === undefined ||
    (stroke.lineDashOffset === undefined &&
      stroke.lineCap === undefined &&
      stroke.lineJoin === undefined &&
      stroke.miterLimit === undefined &&
      stroke.fitPatternOnce === undefined)
  );
}

function legendStroke(stroke: Readonly<StrokeSpec>): PrintLegendStrokeSpec {
  return {
    color: colorString(stroke.color ?? '#1677ff'),
    widthMm: Math.max(0.15, Math.min(3, (stroke.width ?? 2) * 0.264583)),
    ...(stroke.lineDash === undefined ? {} : { dashMm: Object.freeze(stroke.lineDash.map((value) => Math.max(0, value * 0.264583))) })
  };
}

function legendFill(fill: Readonly<SolidFillSpec>): PrintLegendFillSpec {
  return { color: colorString(fill.color) };
}

function colorString(color: Color): string {
  if (typeof color === 'string') return color;
  const [red, green, blue, alpha] = color;
  return alpha === undefined ? `rgb(${red} ${green} ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function isLineShape(type: ElementState['type']): boolean {
  return type === 'polyline' || type === 'lune-polyline' || type === 'curve-polyline';
}

function styleZIndex(element: Readonly<ElementState>): number {
  return isNativeStyleRef(element.style) ? 0 : (element.style.zIndex ?? 0);
}

function shapeLabel(type: ElementState['type']): string {
  const labels: Partial<Record<ElementState['type'], string>> = {
    point: '点标绘',
    polyline: '线标绘',
    polygon: '面标绘',
    circle: '圆形',
    ellipse: '椭圆',
    rectangle: '矩形',
    triangle: '三角形',
    'attack-arrow': '进攻箭头',
    'tailed-attack-arrow': '燕尾进攻箭头',
    'fine-arrow': '直箭头',
    'double-arrow': '钳击箭头'
  };
  return labels[type] ?? type;
}

function stableString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${key}:${stableString(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string): string {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16_777_619);
  return (result >>> 0).toString(36);
}

function freezeResult(result: PrintLegendResult): PrintLegendResult {
  return deepFreeze({
    groups: result.groups.map((group) => ({ ...group })),
    items: result.items.map((item) => ({ ...item })),
    sourceRevision: result.sourceRevision,
    warnings: result.warnings.map((warning) => ({ ...warning }))
  });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
