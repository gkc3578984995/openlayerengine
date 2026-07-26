import { BrowserPrintAdapter } from '../adapters/dom/BrowserPrintAdapter.js';
import { PrintDialogAdapter } from '../adapters/dom/PrintDialogAdapter.js';
import { PrintPageRenderer, type PrintCanvasLike, type PrintLegendImageResources, type PrintPageLegendResult } from '../adapters/dom/PrintPageRenderer.js';
import { PrintBoxSelectionAdapter, type PrintBoxSelectionResult } from '../adapters/openlayers/PrintBoxSelectionAdapter.js';
import { PrintMapRenderer, type PrintMapSnapshot } from '../adapters/openlayers/PrintMapRenderer.js';
import { PrintViewAdapter, type OpenLayersPrintViewSnapshot } from '../adapters/openlayers/PrintViewAdapter.js';
import type { Coordinate } from '../core/common/types.js';
import { CapabilityError, InteractionConflictError, InvalidArgumentError, ObjectDisposedError, PrintError } from '../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../core/ports/ErrorReporter.js';
import { createPrintPlan, normalizePrintSpec } from '../core/print/PrintPlanner.js';
import { createCorsTaintedCanvasError, type PrintResourceDescriptor } from '../core/print/PrintResourceSource.js';
import type {
  NormalizedPrintSpec,
  PrintBoxRangeSnapshot,
  PrintExtent,
  PrintFontSample,
  PrintLegendResult,
  PrintPlan,
  PrintPlannerContext,
  PrintResolvedRange,
  PrintSpec,
  PrintValidationIssue,
  PrintValidationReport,
  PrintViewSnapshot,
  PrintWarning
} from '../core/print/types.js';
import type { PrintLegendBuilder } from '../services/print/PrintLegendBuilder.js';
import type { PrintFrozenSnapshot, PrintSnapshotService } from '../services/print/PrintSnapshotService.js';
import type {
  BrowserPrintResult,
  PrintArtifact,
  PrintCapabilities,
  PrintCapabilityLimits,
  PrintCreateOptions,
  PrintDialogHandle,
  PrintDialogOptions,
  PrintExportOptions,
  PrintExportResult,
  PrintFacade,
  PrintPdfEncoder,
  PrintPreviewOptions,
  PrintPreviewResult,
  PrintPrintableLayerFactory,
  PrintSession,
  PrintSessionEventListener,
  PrintSessionEventMap,
  PrintSessionEventType,
  PrintSessionStatus
} from './printTypes.js';

export interface PrintFacadeDependencies {
  readonly target: HTMLElement;
  readonly view: PrintViewAdapter;
  readonly boxSelection: PrintBoxSelectionAdapter;
  readonly mapRenderer: PrintMapRenderer;
  readonly pageRenderer: PrintPageRenderer;
  readonly browserPrint: BrowserPrintAdapter;
  readonly legendBuilder: PrintLegendBuilder;
  readonly snapshot?: PrintSnapshotService<PrintMapSnapshot, PrintPrintableLayerFactory>;
  readonly limits?: Partial<PrintCapabilityLimits>;
  readonly errorReporter?: ErrorReporter;
}

const defaultLimits: PrintCapabilityLimits = Object.freeze({
  minDpi: 72,
  maxDpi: 600,
  maxCanvasDimension: 16_384,
  maxCanvasPixels: 64_000_000,
  defaultResourceTimeoutMs: 15_000
});

/** 组装 headless PrintSession 与可选五屏 DOM 工作台。 */
export class PrintFacadeImpl implements PrintFacade {
  readonly #dependencies: PrintFacadeDependencies;
  readonly #limits: Readonly<PrintCapabilityLimits>;
  readonly #dialogs = new Set<PrintDialogAdapter>();
  #active: PrintSessionImpl | undefined;
  #disposed = false;

  constructor(dependencies: PrintFacadeDependencies) {
    this.#dependencies = dependencies;
    this.#limits = Object.freeze({ ...defaultLimits, ...dependencies.limits });
  }

  get capabilities(): Readonly<PrintCapabilities> {
    return Object.freeze({
      ui: typeof document !== 'undefined',
      png: true as const,
      pdf: this.#active?.hasPdfEncoder ?? false,
      browserPrint: this.#dependencies.browserPrint.available,
      limits: this.#limits
    });
  }

  create(options: PrintCreateOptions = {}): PrintSession {
    this.#assertActive();
    assertCreateOptions(options);
    if (this.#active !== undefined) {
      if ((options.sessionConflictPolicy ?? 'replace') === 'reject') throw new InteractionConflictError('已有活动的打印会话。');
      const active = this.#active;
      for (const dialog of [...this.#dialogs]) dialog.destroy();
      active.cancel();
      active.destroy();
    } else if (this.#dialogs.size > 0) {
      for (const dialog of [...this.#dialogs]) dialog.destroy();
    }
    const session = new PrintSessionImpl({
      view: this.#dependencies.view,
      boxSelection: this.#dependencies.boxSelection,
      mapRenderer: this.#dependencies.mapRenderer,
      pageRenderer: this.#dependencies.pageRenderer,
      browserPrint: this.#dependencies.browserPrint,
      legendBuilder: this.#dependencies.legendBuilder,
      ...(this.#dependencies.snapshot === undefined ? {} : { snapshot: this.#dependencies.snapshot }),
      limits: this.#limits,
      errorReporter: this.#dependencies.errorReporter ?? defaultErrorReporter,
      interactionPolicy: options.interactionConflictPolicy ?? 'replace',
      ...(options.pdfEncoder === undefined ? {} : { pdfEncoder: options.pdfEncoder }),
      ...(options.printableLayerFactory === undefined ? {} : { printableLayerFactory: options.printableLayerFactory }),
      onTerminal: () => {
        if (this.#active === session) this.#active = undefined;
      }
    });
    this.#active = session;
    if (options.initialSpec !== undefined) {
      try {
        session.update(options.initialSpec);
      } catch (error) {
        session.destroy();
        throw error;
      }
    }
    return session;
  }

  open(options: PrintDialogOptions = {}): PrintDialogHandle {
    this.#assertActive();
    if (typeof document === 'undefined') throw new CapabilityError('内置打印界面需要浏览器 document。');
    const target = options.target ?? this.#dependencies.target;
    if (!(target instanceof HTMLElement)) throw new InvalidArgumentError('打印对话框挂载目标必须是 HTMLElement。');
    const session = this.create(options);
    let dialog: PrintDialogAdapter | undefined;
    try {
      dialog = new PrintDialogAdapter({
        session,
        target,
        capabilities: this.capabilities,
        embedded: options.target !== undefined,
        onDestroy: () => {
          if (dialog !== undefined) this.#dialogs.delete(dialog);
        }
      });
      this.#dialogs.add(dialog);
      dialog.focus();
      return dialog;
    } catch (error) {
      if (dialog === undefined) session.destroy();
      else dialog.destroy();
      throw error;
    }
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const dialog of [...this.#dialogs]) dialog.destroy();
    this.#dialogs.clear();
    this.#active?.destroy();
    this.#active = undefined;
    this.#dependencies.snapshot?.destroy();
    this.#dependencies.legendBuilder.destroy?.();
    this.#dependencies.boxSelection.destroy();
    this.#dependencies.mapRenderer.destroy();
    this.#dependencies.view.destroy();
    this.#dependencies.browserPrint.destroy();
    this.#dependencies.pageRenderer.destroy?.();
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('PrintFacade 已销毁。');
  }
}

interface PrintSessionDependencies {
  readonly view: PrintViewAdapter;
  readonly boxSelection: PrintBoxSelectionAdapter;
  readonly mapRenderer: PrintMapRenderer;
  readonly pageRenderer: PrintPageRenderer;
  readonly browserPrint: BrowserPrintAdapter;
  readonly legendBuilder: PrintLegendBuilder;
  readonly snapshot?: PrintSnapshotService<PrintMapSnapshot, PrintPrintableLayerFactory>;
  readonly limits: Readonly<PrintCapabilityLimits>;
  readonly errorReporter: ErrorReporter;
  readonly interactionPolicy: 'replace' | 'reject';
  readonly pdfEncoder?: PrintPdfEncoder;
  readonly printableLayerFactory?: PrintPrintableLayerFactory;
  readonly onTerminal: () => void;
}

interface PreviewProductionContext {
  readonly plan: Readonly<PrintPlan>;
  readonly spec: Readonly<NormalizedPrintSpec>;
  readonly northDirection: number | undefined;
  readonly validation: Readonly<PrintValidationReport>;
  readonly transient: boolean;
}

class PrintSessionImpl implements PrintSession {
  readonly #dependencies: PrintSessionDependencies;
  readonly #listeners = new Map<PrintSessionEventType, Set<(event: never) => void>>();
  readonly #unsubscribers: Array<() => void> = [];
  #status: PrintSessionStatus = 'draft';
  #spec: Readonly<NormalizedPrintSpec> | undefined;
  #plan: Readonly<PrintPlan> | undefined;
  #legend: Readonly<PrintLegendResult> | undefined;
  #preview: Readonly<PrintPreviewResult> | undefined;
  #previewQuality: 'draft' | 'final' | undefined;
  #finalPreview: Readonly<PrintPreviewResult> | undefined;
  #finalPresentationRevision: number | undefined;
  #validation: Readonly<PrintValidationReport> = emptyValidation();
  #baseValidation: Readonly<PrintValidationReport> = emptyValidation();
  #boxRange: Readonly<PrintBoxRangeSnapshot> | undefined;
  #boxProjectionCode: string | undefined;
  #extentProjectionCode: string | undefined;
  #extentProjectionInvalidated = false;
  #northDirection: number | undefined;
  #revision = 0;
  #operationGeneration = 0;
  #operation: AbortController | undefined;
  #destroyed = false;
  #viewInvalidationQueued = false;
  #contentInvalidationQueued = false;
  #externalInvalidationScheduled = false;
  #subscriptionsReleased = false;
  #terminalNotified = false;
  #selectionGeneration = 0;
  #selectionController: AbortController | undefined;

  constructor(dependencies: PrintSessionDependencies) {
    this.#dependencies = dependencies;
    this.#unsubscribers.push(dependencies.view.subscribe(() => this.#onViewChanged()));
    if (dependencies.snapshot !== undefined) this.#unsubscribers.push(dependencies.snapshot.subscribe(() => this.#onContentChanged()));
  }

  get status(): PrintSessionStatus {
    return this.#status;
  }

  get spec(): Readonly<PrintSpec> | undefined {
    return this.#spec;
  }

  get plan(): Readonly<PrintPlan> | undefined {
    return this.#plan;
  }

  get legendResult(): Readonly<PrintLegendResult> | undefined {
    return this.#legend;
  }

  get previewResult(): Readonly<PrintPreviewResult> | undefined {
    return this.#preview;
  }

  get previewQuality(): 'draft' | 'final' | undefined {
    return this.#previewQuality;
  }

  get validation(): Readonly<PrintValidationReport> {
    return this.#validation;
  }

  get hasPdfEncoder(): boolean {
    return this.#dependencies.pdfEncoder !== undefined;
  }

  update(spec: PrintSpec): void {
    this.#assertUsable();
    const normalized = normalizePrintSpec(spec);
    const revision = this.#revision + 1;
    const previousSpec = this.#spec;
    const previousBox = this.#boxRange;
    let nextBox: Readonly<PrintBoxRangeSnapshot> | undefined;
    let planning:
      | {
          readonly plan: Readonly<PrintPlan> | undefined;
          readonly validation: Readonly<PrintValidationReport>;
          readonly northDirection: number | undefined;
          readonly projectionCode: string;
        }
      | undefined;
    if (previousSpec?.range.source.mode === 'box' && normalized.range.source.mode === 'box' && previousBox !== undefined) {
      const candidate = this.#planFor(normalized, revision, previousBox);
      if (normalized.range.scale.mode === 'fixed') {
        nextBox = previousBox;
        planning = candidate;
        if (candidate.plan !== undefined) {
          nextBox = Object.freeze({ center: previousBox.center, footprint: candidate.plan.range.footprint, rotation: previousBox.rotation });
          planning = this.#planFor(normalized, revision, nextBox);
        }
      } else if (previousSpec.range.scale.mode === 'fit' && candidate.plan !== undefined) {
        nextBox = previousBox;
        planning = candidate;
      }
    }
    planning ??= this.#planFor(normalized, revision, nextBox);
    let nextExtentProjectionCode: string | undefined;
    let nextExtentProjectionInvalidated = false;
    if (normalized.range.source.mode === 'extent') {
      const previousExtent = previousSpec?.range.source.mode === 'extent' ? previousSpec.range.source.extent : undefined;
      const explicitlyRebound = previousExtent === undefined || !samePrintExtent(previousExtent, normalized.range.source.extent);
      const projectionChanged = this.#extentProjectionCode !== undefined && this.#extentProjectionCode !== planning.projectionCode;
      if ((this.#extentProjectionInvalidated || projectionChanged) && !explicitlyRebound) {
        planning = Object.freeze({
          plan: undefined,
          validation: unresolvedValidation(revision, '指定打印范围属于另一个 View 投影，请重新提交该范围。'),
          northDirection: undefined,
          projectionCode: planning.projectionCode
        });
        nextExtentProjectionInvalidated = true;
      } else {
        nextExtentProjectionCode = planning.projectionCode;
      }
    }
    const nextLegend =
      normalized.legend.mode === 'manual' && planning.plan !== undefined
        ? this.#dependencies.legendBuilder.generate(planning.plan, normalized.legend)
        : undefined;
    const nextValidation = mergeValidation(planning.validation, nextLegend?.warnings ?? []);

    this.#abortSelection();
    this.#dependencies.boxSelection.cancel();
    this.#abortOperation();
    this.#revision = revision;
    this.#spec = normalized;
    this.#boxRange = nextBox;
    this.#boxProjectionCode = nextBox === undefined ? undefined : this.#boxProjectionCode;
    this.#extentProjectionCode = nextExtentProjectionCode;
    this.#extentProjectionInvalidated = nextExtentProjectionInvalidated;
    this.#plan = planning.plan;
    this.#northDirection = planning.northDirection;
    this.#legend = nextLegend;
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    this.#baseValidation = planning.validation;
    this.#validation = nextValidation;
    this.#setStatus(this.#plan === undefined ? 'draft' : 'ready');
    if (!this.#isCurrentRevision(revision)) return;
    this.#emit('specchange', { type: 'specchange', spec: normalized, revision });
    if (!this.#isCurrentRevision(revision)) return;
    if (this.#plan !== undefined) this.#emit('rangechange', { type: 'rangechange', range: this.#plan.range, revision });
    if (!this.#isCurrentRevision(revision)) return;
    this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision });
  }

  async selectArea(): Promise<Readonly<PrintResolvedRange>> {
    const spec = this.#requireSpec();
    if (spec.range.source.mode !== 'box') {
      if (spec.range.source.mode === 'extent' && this.#extentProjectionInvalidated) {
        const projectionCode = this.#dependencies.view.snapshot().projectionCode;
        this.#extentProjectionCode = projectionCode;
        this.#extentProjectionInvalidated = false;
      }
      const revision = this.#revision;
      this.#replan();
      if (!this.#isCurrentRevision(revision)) throw cancelledError();
      if (this.#plan === undefined) throw new CapabilityError('无法解析打印范围。');
      return this.#plan.range;
    }

    const previewPlanning = this.#planFor(spec, this.#revision, temporaryBoxRange(this.#dependencies.view.snapshot()));
    const frame = previewPlanning.plan?.mapFrameMm;
    if (frame === undefined) throw new CapabilityError('当前打印页面没有可框选的地图区域。');
    const viewSnapshot = this.#dependencies.view.snapshot();
    const fixedSizeCssPixels =
      spec.range.scale.mode === 'fixed' && previewPlanning.plan !== undefined
        ? ([
            ((frame.width / 25.4) * 96 * previewPlanning.plan.range.resolution) / viewSnapshot.resolution,
            ((frame.height / 25.4) * 96 * previewPlanning.plan.range.resolution) / viewSnapshot.resolution
          ] as const)
        : undefined;

    this.#abortSelection();
    this.#dependencies.boxSelection.cancel();
    const controller = new AbortController();
    const generation = ++this.#selectionGeneration;
    const startedRevision = this.#revision;
    this.#selectionController = controller;
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    try {
      this.#setStatus('selecting');
      if (controller.signal.aborted || generation !== this.#selectionGeneration || !this.#isCurrentRevision(startedRevision) || this.#spec !== spec) {
        throw cancelledError();
      }
      const result = await this.#dependencies.boxSelection.select({
        aspectRatio: frame.width / frame.height,
        ...(fixedSizeCssPixels === undefined ? {} : { fixedSizeCssPixels }),
        onChange: (draft) => this.#queueSelectionDraft(draft, generation, startedRevision, spec),
        policy: this.#dependencies.interactionPolicy,
        signal: controller.signal
      });
      if (
        controller.signal.aborted ||
        generation !== this.#selectionGeneration ||
        startedRevision !== this.#revision ||
        this.#spec !== spec ||
        this.#status === 'cancelled' ||
        this.#status === 'destroyed'
      ) {
        throw cancelledError();
      }
      const currentProjectionCode = this.#dependencies.view.snapshot().projectionCode;
      if (currentProjectionCode !== viewSnapshot.projectionCode) throw cancelledError();
      const nextBox = Object.freeze({ center: result.center, footprint: result.footprint, rotation: result.rotation });
      const nextRevision = this.#revision + 1;
      const planning = this.#planFor(spec, nextRevision, nextBox);
      if (planning.plan === undefined) throw new CapabilityError('无法根据所选范围生成打印方案。');
      const nextLegend = this.#legend === undefined ? undefined : this.#dependencies.legendBuilder.generate(planning.plan, spec.legend);
      this.#abortOperation();
      this.#revision = nextRevision;
      this.#boxRange = nextBox;
      this.#boxProjectionCode = currentProjectionCode;
      this.#plan = planning.plan;
      this.#northDirection = planning.northDirection;
      this.#legend = nextLegend;
      this.#preview = undefined;
      this.#previewQuality = undefined;
      this.#finalPreview = undefined;
      this.#finalPresentationRevision = undefined;
      this.#baseValidation = planning.validation;
      this.#validation = mergeValidation(planning.validation, nextLegend?.warnings ?? []);
      this.#setStatus('ready');
      if (!this.#isCurrentRevision(nextRevision)) throw cancelledError();
      this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision: this.#revision });
      if (!this.#isCurrentRevision(nextRevision)) throw cancelledError();
      this.#emit('rangechange', { type: 'rangechange', range: planning.plan.range, revision: this.#revision });
      if (!this.#isCurrentRevision(nextRevision)) throw cancelledError();
      this.#queueCommittedSelectionPreview(nextRevision);
      return planning.plan.range;
    } catch (error) {
      if (
        isCancelled(error) &&
        !controller.signal.aborted &&
        generation === this.#selectionGeneration &&
        startedRevision === this.#revision &&
        this.#spec === spec &&
        this.#status !== 'cancelled' &&
        this.#status !== 'destroyed'
      ) {
        this.#commitBoxCancellation();
        throw error;
      }
      if (
        generation === this.#selectionGeneration &&
        this.#status !== 'cancelled' &&
        this.#status !== 'destroyed' &&
        !(error instanceof PrintError && error.code === 'cancelled' && startedRevision !== this.#revision)
      ) {
        this.#setStatus(this.#plan === undefined ? 'draft' : 'ready');
      }
      if (isCancelled(error)) throw error;
      if (!this.#isCurrentRevision(startedRevision)) throw cancelledError();
      return this.#fail(error);
    } finally {
      if (this.#selectionController === controller) this.#selectionController = undefined;
    }
  }

  async generateLegend(): Promise<PrintLegendResult> {
    const spec = this.#requireSpec();
    const revision = this.#revision;
    if (!this.#isCurrentExternalRevision(revision)) throw cancelledError();
    if (spec.range.source.mode === 'extent' && this.#extentProjectionInvalidated) {
      throw new CapabilityError('必须在当前 View 投影下重新提交指定打印范围。');
    }
    try {
      const planning = this.#planFor(spec, this.#revision, this.#boxRange);
      if (!this.#isCurrentExternalRevision(revision)) throw cancelledError();
      if (planning.plan === undefined) throw new CapabilityError('请先确定打印范围，再生成图例。');
      const result = this.#dependencies.legendBuilder.generate(planning.plan, spec.legend);
      if (!this.#isCurrentExternalRevision(revision)) throw cancelledError();
      const validation = mergeValidation(planning.validation, result.warnings);
      this.#plan = planning.plan;
      this.#northDirection = planning.northDirection;
      this.#legend = result;
      this.#preview = undefined;
      this.#previewQuality = undefined;
      this.#finalPreview = undefined;
      this.#finalPresentationRevision = undefined;
      this.#baseValidation = planning.validation;
      this.#validation = validation;
      this.#setStatus('ready');
      if (!this.#isCurrentExternalRevision(revision)) throw cancelledError();
      this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision: this.#revision });
      if (!this.#isCurrentExternalRevision(revision)) throw cancelledError();
      return result;
    } catch (error) {
      if (error instanceof ObjectDisposedError) throw error;
      if (isCancelled(error)) throw error;
      if (!this.#isCurrentExternalRevision(revision)) throw cancelledError();
      return this.#fail(error);
    }
  }

  async preview(options: PrintPreviewOptions = {}): Promise<PrintPreviewResult> {
    void this.#requireSpec();
    this.#assertNoActiveSelection();
    assertPreviewOptions(options);
    const quality = options.quality ?? 'draft';
    const startedRevision = this.#revision;
    const operation = this.#beginOperation('previewing');
    try {
      const result = await this.#producePreview(quality, operation, true);
      this.#assertPreviewOperation(operation, result.revision);
      this.#completeOperation(operation);
      this.#setStatus('ready');
      if (!this.#isCurrentRevision(result.revision)) throw cancelledError();
      return result;
    } catch (error) {
      this.#settleFailedOperation(operation);
      if (isCancelled(error)) throw error;
      if (operation.generation !== this.#operationGeneration || !this.#isCurrentRevision(startedRevision)) throw cancelledError();
      return this.#fail(error);
    }
  }

  async export(options: PrintExportOptions): Promise<PrintExportResult> {
    const spec = this.#requireSpec();
    this.#assertNoActiveSelection();
    assertExportOptions(options);
    const exportValidation = mergeValidation(this.#baseValidation, this.#legend?.warnings ?? []);
    if (exportValidation.issues.length > 0) throw new CapabilityError('请先处理所有阻止打印的问题，再执行导出。');
    const startedRevision = this.#revision;
    const operation = this.#beginOperation(options.format === 'browser-print' ? 'printing' : 'exporting');
    try {
      const cached = this.#cachedFinalPreview();
      const preview = cached ?? (await this.#producePreview('final', operation, true));
      if (cached !== undefined) this.#validation = cached.validation;
      this.#assertOperation(operation);
      let result: PrintExportResult;
      if (options.format === 'png') {
        result = artifact('png', preview.blob, preview, this.#validation.warnings);
      } else if (options.format === 'pdf') {
        const encoder = options.encoder ?? this.#dependencies.pdfEncoder;
        if (encoder === undefined) throw new CapabilityError('导出 PDF 需要提供 PrintPdfEncoder。');
        let pdf: Blob;
        try {
          pdf = await abortAware(
            Promise.resolve().then(() =>
              encoder.encode({
                png: preview.blob,
                pageWidthMm: preview.plan.pageSizeMm[0],
                pageHeightMm: preview.plan.pageSizeMm[1],
                dpi: preview.plan.dpi,
                signal: operation.controller.signal
              })
            ),
            operation.controller.signal
          );
        } catch (cause) {
          if (operation.controller.signal.aborted) throw cancelledError();
          throw new PrintError('pdf-encode-failed', 'PDF 编码失败。', { cause });
        }
        this.#assertOperation(operation);
        if (!(pdf instanceof Blob) || pdf.type !== 'application/pdf' || pdf.size === 0) {
          throw new PrintError('pdf-encode-failed', 'PDF encoder 必须返回非空的 application/pdf Blob。');
        }
        result = artifact('pdf', pdf, preview, this.#validation.warnings);
      } else {
        await this.#dependencies.browserPrint.print({
          blob: preview.blob,
          pageWidthMm: preview.plan.pageSizeMm[0],
          pageHeightMm: preview.plan.pageSizeMm[1],
          ...(options.documentTitle === undefined ? {} : { documentTitle: options.documentTitle }),
          timeoutMs: spec.resources?.timeoutMs ?? this.#dependencies.limits.defaultResourceTimeoutMs,
          signal: operation.controller.signal
        });
        result = Object.freeze<BrowserPrintResult>({ dialogOpened: true });
      }
      this.#assertOperation(operation);
      if (options.format !== 'browser-print') this.#completeOperation(operation);
      this.#setStatus('ready');
      if (!this.#isCurrentRevision(preview.revision)) throw cancelledError();
      this.#emit('export', { type: 'export', result, revision: this.#revision });
      if (!this.#isCurrentRevision(preview.revision)) throw cancelledError();
      return result;
    } catch (error) {
      this.#settleFailedOperation(operation);
      if (isCancelled(error)) throw error;
      if (operation.generation !== this.#operationGeneration || !this.#isCurrentRevision(startedRevision)) throw cancelledError();
      return this.#fail(error);
    }
  }

  cancel(): void {
    if (this.#status === 'cancelled' || this.#status === 'destroyed') return;
    this.#abortSelection();
    this.#abortOperation();
    this.#dependencies.boxSelection.cancel();
    this.#setStatus('cancelled');
    if (this.#destroyed || !this.#hasStatus('cancelled')) return;
    this.#emit('cancel', { type: 'cancel', revision: this.#revision });
    if (this.#destroyed || !this.#hasStatus('cancelled')) return;
    this.#releaseSubscriptions();
    this.#releaseHeavyReferences();
    this.#notifyTerminal();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#abortSelection();
    this.#abortOperation();
    this.#dependencies.boxSelection.cancel();
    this.#releaseSubscriptions();
    this.#releaseHeavyReferences();
    this.#destroyed = true;
    this.#setStatus('destroyed');
    this.#listeners.clear();
    this.#notifyTerminal();
  }

  on<T extends PrintSessionEventType>(type: T, listener: PrintSessionEventListener<T>): () => void {
    this.#assertUsable();
    if (!isEventType(type) || typeof listener !== 'function') throw new InvalidArgumentError('打印事件类型未知或监听器无效。');
    let listeners = this.#listeners.get(type);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(type, listeners);
    }
    listeners.add(listener as (event: never) => void);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners?.delete(listener as (event: never) => void);
    };
  }

  async #producePreview(
    quality: 'draft' | 'final',
    operation: Readonly<{ generation: number; controller: AbortController }>,
    publish: boolean,
    context?: Readonly<PreviewProductionContext>
  ): Promise<PrintPreviewResult> {
    const plan = context?.plan ?? this.#plan;
    const spec = context?.spec ?? this.#spec;
    if (plan === undefined || spec === undefined) throw new CapabilityError('请先确定打印范围，再生成预览。');
    const baseValidation = context?.validation ?? this.#baseValidation;
    const eligibility = mergeValidation(baseValidation, context?.transient === true ? [] : (this.#legend?.warnings ?? []));
    if (!eligibility.canPreview) throw new CapabilityError('请先处理所有阻止打印的问题，再生成预览。');
    const timeoutMs = spec.resources?.timeoutMs ?? this.#dependencies.limits.defaultResourceTimeoutMs;
    const deadline = createResourceDeadline(timeoutMs, operation.controller.signal);
    let frozen: Readonly<PrintFrozenSnapshot<PrintMapSnapshot>> | undefined;
    let mapBitmap: Awaited<ReturnType<PrintMapRenderer['render']>> | undefined;
    let legendImages: PrintLegendImageResources | undefined;
    let pageCanvas: PrintCanvasLike | undefined;
    let resourceSubject = 'map';
    try {
      frozen = this.#dependencies.snapshot?.capture(plan, spec, this.#dependencies.printableLayerFactory);
      const legend = frozen?.legend ?? this.#dependencies.legendBuilder.generate(plan, spec.legend);
      this.#assertOperation(operation);
      const successfulValidation = mergeValidation(baseValidation, legend.warnings);
      if (quality === 'final') {
        resourceSubject = 'fonts';
        const fontSamples = (
          this.#dependencies.pageRenderer as PrintPageRenderer & {
            fontSamples?: PrintPageRenderer['fontSamples'];
          }
        ).fontSamples;
        const pageFonts =
          typeof fontSamples === 'function' ? fontSamples.call(this.#dependencies.pageRenderer, { plan, layout: spec.layout, legend, quality }) : [];
        await waitForDocumentFonts([...pageFonts, ...(frozen?.map.fontSamples ?? [])], deadline.remainingMs(), deadline.signal);
      }
      const preload = (
        this.#dependencies.pageRenderer as PrintPageRenderer & {
          preloadLegendImages?: PrintPageRenderer['preloadLegendImages'];
        }
      ).preloadLegendImages;
      if (typeof preload === 'function') {
        resourceSubject = 'legend';
        legendImages = await preload.call(this.#dependencies.pageRenderer, legend, {
          signal: deadline.signal,
          timeoutMs: deadline.remainingMs()
        });
      }
      resourceSubject = 'map';
      mapBitmap =
        frozen === undefined
          ? await this.#dependencies.mapRenderer.render(
              plan,
              { quality, timeoutMs: deadline.remainingMs(), signal: deadline.signal },
              this.#dependencies.printableLayerFactory
            )
          : await this.#dependencies.mapRenderer.renderSnapshot(frozen.map, plan, {
              quality,
              timeoutMs: deadline.remainingMs(),
              signal: deadline.signal
            });
      this.#assertOperation(operation);
      deadline.assertActive();
      pageCanvas = this.#dependencies.pageRenderer.render({
        plan,
        layout: spec.layout,
        pageInsets: spec.paper.marginMm,
        legend: legend as unknown as PrintPageLegendResult,
        ...(spec.legend.mode === 'manual' && spec.legend.layout !== undefined ? { legendLayout: spec.legend.layout } : {}),
        mapBitmap: mapBitmap.canvas,
        trueNorthAngleRadians: context?.northDirection ?? this.#northDirection ?? 0,
        quality,
        ...(legendImages === undefined ? {} : { resolveLegendImage: legendImages.resolve })
      });
      const blob = await canvasToPng(pageCanvas, deadline.signal, legendImages?.resourceDescriptors ?? []);
      this.#assertOperation(operation);
      deadline.assertActive();
      const result = Object.freeze<PrintPreviewResult>({
        blob,
        widthPx: pageCanvas.width,
        heightPx: pageCanvas.height,
        revision: plan.revision,
        plan,
        validation: successfulValidation
      });
      if (publish) {
        this.#preview = result;
        this.#previewQuality = quality;
        if (context?.transient !== true) {
          this.#legend = legend;
          this.#validation = successfulValidation;
        }
        if (quality === 'final' && context?.transient !== true) {
          this.#finalPreview = result;
          this.#finalPresentationRevision = frozen?.map.animationRevision ?? this.#expectedPresentationRevision();
        }
        if (context?.transient !== true) {
          this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision: this.#revision });
          this.#assertPreviewOperation(operation, plan.revision);
        }
        this.#emit('previewchange', { type: 'previewchange', result, revision: this.#revision });
        this.#assertPreviewOperation(operation, plan.revision);
      }
      return result;
    } catch (error) {
      const failure = deadline.remap(error);
      const issue = validationIssueFromRenderError(failure);
      if (context?.transient !== true && issue !== undefined && !isCancelled(failure)) {
        this.#publishRuntimeIssue(issue.code, issue.message, issue.subject);
        this.#assertPreviewOperation(operation, plan.revision);
      }
      if (context?.transient !== true && failure instanceof PrintError && (failure.code === 'resource-timeout' || failure.code === 'resource-load-failed')) {
        this.#publishRuntimeIssue('resource-not-ready', failure.message, resourceSubject);
        this.#assertPreviewOperation(operation, plan.revision);
      }
      throw failure;
    } finally {
      deadline.destroy();
      const release = (this.#dependencies.pageRenderer as PrintPageRenderer & { release?: PrintPageRenderer['release'] }).release;
      if (pageCanvas !== undefined && typeof release === 'function') release.call(this.#dependencies.pageRenderer, pageCanvas);
      legendImages?.destroy();
      mapBitmap?.destroy();
      frozen?.destroy();
    }
  }

  #planFor(
    spec: Readonly<NormalizedPrintSpec>,
    revision: number,
    boxRange: Readonly<PrintBoxRangeSnapshot> | undefined
  ): {
    readonly plan: Readonly<PrintPlan> | undefined;
    readonly validation: Readonly<PrintValidationReport>;
    readonly northDirection: number | undefined;
    readonly projectionCode: string;
  } {
    const adapterSnapshot = this.#dependencies.view.snapshot();
    const center = planningCenter(spec, adapterSnapshot, boxRange);
    const targetRotation = spec.range.source.mode === 'box' && boxRange !== undefined ? boxRange.rotation : adapterSnapshot.rotation;
    const metersPerViewUnitAtCenter = this.#dependencies.view.metersPerViewUnitAt(center);
    let northDirection: number | undefined;
    try {
      northDirection = this.#dependencies.view.northAngleAt(center, targetRotation);
    } catch {
      northDirection = undefined;
    }
    const viewSnapshot: PrintViewSnapshot = Object.freeze({
      center,
      footprint: adapterSnapshot.footprint,
      rotation: targetRotation,
      metersPerViewUnitAtCenter,
      scaleVariesByPosition: false
    });
    const context: PrintPlannerContext = Object.freeze({
      revision,
      limits: Object.freeze({
        minDpi: this.#dependencies.limits.minDpi,
        maxDpi: this.#dependencies.limits.maxDpi,
        maxCanvasDimension: this.#dependencies.limits.maxCanvasDimension,
        maxCanvasPixels: this.#dependencies.limits.maxCanvasPixels
      }),
      ...(boxRange === undefined ? {} : { boxRange }),
      ...(northDirection === undefined ? {} : { northDirection })
    });
    let result = createPrintPlan(spec, viewSnapshot, context);
    if (spec.range.scale.mode === 'fixed' && result.plan !== undefined) {
      const scaleProbe = this.#dependencies.view as PrintViewAdapter & {
        scaleVariesByPositionAt?: PrintViewAdapter['scaleVariesByPositionAt'];
      };
      const sourceFootprint = printSourceFootprint(spec, adapterSnapshot, boxRange);
      const scaleVariesByPosition =
        typeof scaleProbe.scaleVariesByPositionAt === 'function'
          ? scaleProbe.scaleVariesByPositionAt(center, [...sourceFootprint, ...result.plan.range.footprint])
          : adapterSnapshot.scaleVariesByPosition;
      if (scaleVariesByPosition) {
        result = createPrintPlan(spec, Object.freeze({ ...viewSnapshot, scaleVariesByPosition: true }), context);
      }
    }
    const renderer = this.#dependencies.mapRenderer as PrintMapRenderer & {
      validationIssues?: (plan?: Readonly<PrintPlan>) => readonly Readonly<{ code: string; message: string; subject?: string }>[];
    };
    const contentIssues =
      result.plan === undefined
        ? []
        : (this.#dependencies.snapshot?.validationIssues(result.plan, this.#dependencies.printableLayerFactory) ??
          (typeof renderer.validationIssues === 'function' ? renderer.validationIssues(result.plan, this.#dependencies.printableLayerFactory) : []));
    const structuralValidation = mergeValidationIssues(result.validation, contentIssues);
    const validation = mergeValidation(
      structuralValidation,
      this.#dependencies.browserPrint.available
        ? [
            Object.freeze({
              code: 'printer-scaling-not-guaranteed',
              message: '实际输出比例取决于打印机和浏览器是否设置为实际大小（100%）。',
              subject: 'browser-print',
              requiresAcknowledgement: true
            })
          ]
        : []
    );
    return Object.freeze({ plan: result.plan, validation, northDirection, projectionCode: adapterSnapshot.projectionCode });
  }

  #replan(): void {
    const spec = this.#spec;
    if (spec === undefined) return;
    if (spec.range.source.mode === 'extent' && this.#extentProjectionInvalidated) return;
    const revision = this.#revision;
    const planning = this.#planFor(spec, revision, this.#boxRange);
    const nextLegend =
      planning.plan === undefined || (spec.legend.mode === 'auto' && this.#legend === undefined)
        ? undefined
        : this.#dependencies.legendBuilder.generate(planning.plan, spec.legend);
    this.#plan = planning.plan;
    this.#northDirection = planning.northDirection;
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    this.#legend = nextLegend;
    this.#baseValidation = planning.validation;
    this.#validation = mergeValidation(planning.validation, nextLegend?.warnings ?? []);
    this.#setStatus(this.#plan === undefined ? 'draft' : 'ready');
    if (!this.#isCurrentRevision(revision)) return;
    this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision });
  }

  #onViewChanged(): void {
    if (this.#spec?.range.source.mode === 'box' && this.#boxRange !== undefined) {
      try {
        if (this.#dependencies.view.snapshot().projectionCode === this.#boxProjectionCode) return;
      } catch {
        // View 暂时不可解析时仍需进入统一失效流程，避免保留旧的打印结果。
      }
    }
    if (this.#spec?.range.source.mode === 'extent' && this.#extentProjectionCode !== undefined) {
      try {
        if (this.#dependencies.view.snapshot().projectionCode !== this.#extentProjectionCode) this.#extentProjectionInvalidated = true;
      } catch {
        // 统一失效流程会把暂时不可解析的 View 转为阻断状态。
      }
    }
    this.#queueExternalInvalidation('view');
  }

  #onContentChanged(): void {
    this.#queueExternalInvalidation('content');
  }

  #queueExternalInvalidation(kind: 'view' | 'content'): void {
    if (this.#destroyed || this.#status === 'cancelled' || this.#status === 'destroyed' || this.#spec === undefined) return;
    if (kind === 'view') this.#viewInvalidationQueued = true;
    else this.#contentInvalidationQueued = true;
    this.#abortOperation();
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    if (this.#externalInvalidationScheduled) return;
    this.#externalInvalidationScheduled = true;
    queueMicrotask(() => {
      this.#externalInvalidationScheduled = false;
      const viewChanged = this.#viewInvalidationQueued;
      this.#viewInvalidationQueued = false;
      this.#contentInvalidationQueued = false;
      if (this.#destroyed || this.#status === 'cancelled' || this.#status === 'destroyed' || this.#spec === undefined) return;
      const previousRange = this.#plan?.range;
      this.#abortSelection();
      this.#dependencies.boxSelection.cancel();
      this.#abortOperation();
      this.#revision += 1;
      const revision = this.#revision;
      try {
        const viewSnapshot = this.#dependencies.view.snapshot();
        if (this.#spec.range.source.mode === 'box' && this.#boxRange !== undefined && viewSnapshot.projectionCode !== this.#boxProjectionCode) {
          const error = new CapabilityError('已完成的打印框属于另一个 View 投影，请重新框选打印范围。');
          this.#boxRange = undefined;
          this.#boxProjectionCode = undefined;
          this.#commitInvalidExternalState(error);
          if (this.#isCurrentRevision(revision)) this.#emitError(error);
          return;
        }
        if (
          this.#spec.range.source.mode === 'extent' &&
          (this.#extentProjectionInvalidated || this.#extentProjectionCode === undefined || viewSnapshot.projectionCode !== this.#extentProjectionCode)
        ) {
          const error = new CapabilityError('指定打印范围属于另一个 View 投影，请重新提交该范围。');
          this.#extentProjectionCode = undefined;
          this.#extentProjectionInvalidated = true;
          this.#commitInvalidExternalState(error);
          if (this.#isCurrentRevision(revision)) this.#emitError(error);
          return;
        }
        this.#replan();
        if (!this.#isCurrentRevision(revision)) return;
        const nextPlan = this.#plan;
        if (viewChanged && nextPlan !== undefined && !sameResolvedRange(previousRange, nextPlan.range)) {
          this.#emit('rangechange', { type: 'rangechange', range: nextPlan.range, revision: nextPlan.revision });
        }
      } catch (error) {
        this.#commitInvalidExternalState(error);
        if (this.#isCurrentRevision(revision)) this.#emitError(error);
      }
    });
  }

  #abortSelection(): void {
    this.#selectionController?.abort();
    this.#selectionController = undefined;
    this.#selectionGeneration += 1;
  }

  #queueSelectionDraft(result: Readonly<PrintBoxSelectionResult>, generation: number, startedRevision: number, spec: Readonly<NormalizedPrintSpec>): void {
    if (
      generation !== this.#selectionGeneration ||
      startedRevision !== this.#revision ||
      this.#selectionController?.signal.aborted !== false ||
      this.#spec !== spec ||
      this.#status === 'cancelled' ||
      this.#status === 'destroyed'
    ) {
      return;
    }
    const boxRange = Object.freeze({ center: result.center, footprint: result.footprint, rotation: result.rotation });
    let planning: {
      readonly plan: Readonly<PrintPlan> | undefined;
      readonly validation: Readonly<PrintValidationReport>;
      readonly northDirection: number | undefined;
    };
    try {
      planning = this.#planFor(spec, this.#revision, boxRange);
    } catch {
      return;
    }
    if (planning.plan === undefined) return;
    const operation = this.#beginOperation('selecting');
    const context: PreviewProductionContext = Object.freeze({
      plan: planning.plan,
      spec,
      northDirection: planning.northDirection,
      validation: planning.validation,
      transient: true
    });
    void this.#producePreview('draft', operation, true, context).then(
      () => this.#completeOperation(operation),
      () => this.#completeOperation(operation)
    );
  }

  #queueCommittedSelectionPreview(revision: number): void {
    queueMicrotask(() => {
      if (!this.#isCurrentRevision(revision) || this.#plan === undefined || this.#spec === undefined) return;
      let operation: Readonly<{ generation: number; controller: AbortController }>;
      try {
        operation = this.#beginOperation('ready');
      } catch {
        return;
      }
      void this.#producePreview('draft', operation, true).then(
        () => this.#completeOperation(operation),
        () => {
          this.#settleFailedOperation(operation);
        }
      );
    });
  }

  #cachedFinalPreview(): Readonly<PrintPreviewResult> | undefined {
    const cached = this.#finalPreview;
    if (cached === undefined || cached.revision !== this.#revision) return undefined;
    const expectedPresentationRevision = this.#expectedPresentationRevision();
    if (expectedPresentationRevision !== undefined && this.#finalPresentationRevision !== expectedPresentationRevision) return undefined;
    return cached;
  }

  #assertNoActiveSelection(): void {
    if (this.#selectionController?.signal.aborted === false) {
      throw new InteractionConflictError('正在框选打印范围，暂时不能预览或导出。');
    }
  }

  #expectedPresentationRevision(): number | undefined {
    if ((this.#spec?.content?.animations ?? 'current-frame') !== 'current-frame') return undefined;
    return this.#dependencies.snapshot?.presentationRevision;
  }

  #publishRuntimeIssue(code: string, message: string, subject?: string): void {
    if (this.#destroyed || this.#status === 'cancelled' || this.#status === 'destroyed') return;
    const issue = Object.freeze({ code, message, ...(subject === undefined ? {} : { subject }) });
    const structuralKeys = new Set(this.#baseValidation.issues.map((candidate) => `${candidate.code}\u0000${candidate.subject ?? ''}`));
    const runtimeIssues =
      this.#validation.revision === this.#baseValidation.revision
        ? this.#validation.issues.filter((candidate) => !structuralKeys.has(`${candidate.code}\u0000${candidate.subject ?? ''}`))
        : [];
    const withIssue = mergeValidationIssues(this.#baseValidation, [...runtimeIssues, issue]);
    this.#validation = mergeValidation(withIssue, this.#legend?.warnings ?? []);
    this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision: this.#revision });
  }

  #commitInvalidExternalState(error: unknown): void {
    const revision = this.#revision;
    this.#plan = undefined;
    this.#legend = undefined;
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    this.#northDirection = undefined;
    this.#baseValidation = unresolvedValidation(this.#revision, error instanceof Error ? error.message : String(error));
    this.#validation = this.#baseValidation;
    this.#setStatus('draft');
    if (!this.#isCurrentRevision(revision)) return;
    this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision });
  }

  #commitBoxCancellation(): void {
    this.#abortOperation();
    this.#revision += 1;
    this.#boxRange = undefined;
    this.#boxProjectionCode = undefined;
    this.#extentProjectionCode = undefined;
    this.#extentProjectionInvalidated = false;
    this.#plan = undefined;
    this.#legend = undefined;
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    this.#northDirection = undefined;
    this.#baseValidation = unresolvedValidation(this.#revision, '打印框选已取消，尚未提交有效范围。');
    this.#validation = this.#baseValidation;
    const revision = this.#revision;
    this.#setStatus('draft');
    if (!this.#isCurrentRevision(revision)) return;
    this.#emit('validationchange', { type: 'validationchange', validation: this.#validation, revision });
  }

  #releaseSubscriptions(): void {
    if (this.#subscriptionsReleased) return;
    this.#subscriptionsReleased = true;
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe();
  }

  #releaseHeavyReferences(): void {
    this.#spec = undefined;
    this.#plan = undefined;
    this.#legend = undefined;
    this.#preview = undefined;
    this.#previewQuality = undefined;
    this.#finalPreview = undefined;
    this.#finalPresentationRevision = undefined;
    this.#boxRange = undefined;
    this.#boxProjectionCode = undefined;
    this.#extentProjectionCode = undefined;
    this.#extentProjectionInvalidated = false;
    this.#northDirection = undefined;
  }

  #notifyTerminal(): void {
    if (this.#terminalNotified) return;
    this.#terminalNotified = true;
    this.#dependencies.onTerminal();
  }

  #beginOperation(status: PrintSessionStatus): Readonly<{ generation: number; controller: AbortController }> {
    this.#abortOperation();
    const controller = new AbortController();
    const generation = ++this.#operationGeneration;
    const revision = this.#revision;
    const operation = Object.freeze({ generation, controller });
    this.#operation = controller;
    this.#setStatus(status);
    this.#assertPreviewOperation(operation, revision);
    return operation;
  }

  #abortOperation(): void {
    this.#operation?.abort();
    this.#operation = undefined;
    this.#operationGeneration += 1;
  }

  #assertOperation(operation: Readonly<{ generation: number; controller: AbortController }>): void {
    if (operation.controller.signal.aborted || operation.generation !== this.#operationGeneration || this.#operation !== operation.controller)
      throw cancelledError();
  }

  #assertPreviewOperation(operation: Readonly<{ generation: number; controller: AbortController }>, revision: number): void {
    this.#assertOperation(operation);
    if (revision !== this.#revision) throw cancelledError();
  }

  #settleFailedOperation(operation: Readonly<{ generation: number; controller: AbortController }>): void {
    if (this.#operation !== operation.controller) return;
    this.#operation = undefined;
    if (!this.#destroyed && this.#status !== 'cancelled') this.#setStatus(this.#plan === undefined ? 'draft' : 'ready');
  }

  #completeOperation(operation: Readonly<{ generation: number; controller: AbortController }>): void {
    if (this.#operation === operation.controller) this.#operation = undefined;
  }

  #isCurrentRevision(revision: number): boolean {
    return !this.#destroyed && this.#status !== 'cancelled' && this.#status !== 'destroyed' && revision === this.#revision;
  }

  #isCurrentExternalRevision(revision: number): boolean {
    return this.#isCurrentRevision(revision) && !this.#externalInvalidationScheduled && !this.#viewInvalidationQueued && !this.#contentInvalidationQueued;
  }

  #hasStatus(status: PrintSessionStatus): boolean {
    return this.#status === status;
  }

  #setStatus(status: PrintSessionStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#emit('statuschange', { type: 'statuschange', status, revision: this.#revision });
  }

  #emit<T extends PrintSessionEventType>(type: T, event: PrintSessionEventMap[T]): void {
    const frozenEvent = Object.freeze({ ...event }) as PrintSessionEventMap[T];
    const emittedStatus = type === 'statuschange' ? (frozenEvent as PrintSessionEventMap['statuschange']).status : undefined;
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      try {
        listener(frozenEvent as never);
      } catch (error) {
        this.#reportListenerError(error, type);
      }
      if (frozenEvent.revision !== this.#revision) break;
      if (emittedStatus !== undefined && this.#status !== emittedStatus) break;
      if (type === 'cancel' && this.#status !== 'cancelled') break;
      if (type !== 'statuschange' && type !== 'cancel' && !this.#isCurrentRevision(frozenEvent.revision)) break;
    }
  }

  #reportListenerError(error: unknown, type: PrintSessionEventType): void {
    try {
      const reported = (this.#dependencies.errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'PrintSession',
        operation: `emit:${type}`
      });
      void Promise.resolve(reported).catch(() => undefined);
    } catch {
      // ErrorReporter 失败不能中断状态提交、其他 listener 或递归触发 error 事件。
    }
  }

  #emitError(error: unknown): void {
    this.#emit('error', { type: 'error', error, revision: this.#revision });
  }

  #fail(error: unknown): never {
    this.#emitError(error);
    throw error;
  }

  #requireSpec(): Readonly<NormalizedPrintSpec> {
    this.#assertUsable();
    if (this.#spec === undefined) throw new InvalidArgumentError('PrintSession 需要完整的 PrintSpec。');
    return this.#spec;
  }

  #assertUsable(): void {
    if (this.#destroyed || this.#status === 'destroyed' || this.#status === 'cancelled') throw new ObjectDisposedError('PrintSession 已不再活动。');
  }
}

function emptyValidation(): Readonly<PrintValidationReport> {
  return Object.freeze({
    revision: 0,
    issues: Object.freeze([{ code: 'range-unresolved', message: '尚未提交完整打印配置。' }]),
    warnings: Object.freeze([]),
    canPreview: false,
    canExport: false
  });
}

function unresolvedValidation(revision: number, message: string): Readonly<PrintValidationReport> {
  return Object.freeze({
    revision,
    issues: Object.freeze([Object.freeze({ code: 'range-unresolved', message })]),
    warnings: Object.freeze([]),
    canPreview: false,
    canExport: false
  });
}

function mergeValidation(report: Readonly<PrintValidationReport>, warnings: readonly PrintWarning[]): Readonly<PrintValidationReport> {
  const merged = [...report.warnings];
  for (const warning of warnings) {
    if (!merged.some((candidate) => candidate.code === warning.code && candidate.subject === warning.subject)) merged.push(warning);
  }
  const frozenWarnings = Object.freeze(merged.map((warning) => Object.freeze({ ...warning })));
  return Object.freeze({
    ...report,
    warnings: frozenWarnings,
    canExport: report.issues.length === 0 && frozenWarnings.every((warning) => !warning.requiresAcknowledgement)
  });
}

function mergeValidationIssues(report: Readonly<PrintValidationReport>, issues: readonly Readonly<PrintValidationIssue>[]): Readonly<PrintValidationReport> {
  const merged = [...report.issues];
  for (const issue of issues) {
    if (!merged.some((candidate) => candidate.code === issue.code && candidate.subject === issue.subject)) merged.push(issue);
  }
  const frozenIssues = Object.freeze(merged.map((issue) => Object.freeze({ ...issue })));
  return Object.freeze({
    ...report,
    issues: frozenIssues,
    canPreview: frozenIssues.length === 0,
    canExport: frozenIssues.length === 0 && report.warnings.every((warning) => !warning.requiresAcknowledgement)
  });
}

function validationIssueFromRenderError(error: unknown): Readonly<PrintValidationIssue> | undefined {
  if (error instanceof CapabilityError) {
    const match = /^layer-not-printable:([^:]+):([\s\S]*)$/u.exec(error.message);
    if (match !== null) {
      let subject = match[1];
      if (subject !== undefined) {
        try {
          subject = decodeURIComponent(subject);
        } catch {
          // 非法转义仍保留安全的 factory subject 文本。
        }
      }
      return Object.freeze({ code: 'layer-not-printable', message: match[2] || error.message, ...(subject === undefined ? {} : { subject }) });
    }
  }
  if (error instanceof CapabilityError && error.message.startsWith('Animation current-frame snapshot is unavailable')) {
    const subject = /:\s*([^:]+)$/u.exec(error.message)?.[1];
    return Object.freeze({
      code: 'animation-snapshot-unavailable',
      message: '目标存在活动的交互预览，无法冻结当前动画帧。',
      ...(subject === undefined ? {} : { subject })
    });
  }
  if (error instanceof CapabilityError && error.message.startsWith('Map text fonts cannot be audited')) {
    return Object.freeze({ code: 'layer-not-printable', message: '无法审计地图文字使用的字体。', subject: 'map-text-fonts' });
  }
  if (!(error instanceof InvalidArgumentError)) return undefined;
  const match = /^(layout-text-overflow|legend-overflow):\s*(.*)$/u.exec(error.message);
  if (match === null) return undefined;
  return Object.freeze({ code: match[1], message: match[2] || error.message, subject: match[1] === 'legend-overflow' ? 'legend' : 'layout' });
}

function sameResolvedRange(left: Readonly<PrintResolvedRange> | undefined, right: Readonly<PrintResolvedRange> | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.sourceMode === right.sourceMode &&
    sameNumbers(left.sourceExtent, right.sourceExtent) &&
    sameNumbers(left.actualExtent, right.actualExtent) &&
    left.footprint.length === right.footprint.length &&
    left.footprint.every((coordinate, index) => sameNumbers(coordinate, right.footprint[index] ?? [])) &&
    sameNumbers(left.center, right.center) &&
    left.rotation === right.rotation &&
    left.denominator === right.denominator &&
    left.resolution === right.resolution
  );
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePrintExtent(left: PrintExtent, right: PrintExtent): boolean {
  return sameNumbers(left, right);
}

function isCancelled(error: unknown): error is PrintError {
  return error instanceof PrintError && error.code === 'cancelled';
}

async function waitForDocumentFonts(fontSamples: readonly Readonly<PrintFontSample>[], timeoutMs: number, signal: AbortSignal): Promise<void> {
  if (typeof document === 'undefined') return;
  const fonts = (document as Document & { readonly fonts?: FontFaceSet }).fonts;
  if (fonts === undefined) return;
  const uniqueSamples = [
    ...new Map(
      fontSamples.filter(({ font, text }) => font.length > 0 && text.length > 0).map((sample) => [`${sample.font}\u0000${sample.text}`, sample])
    ).values()
  ];
  const fontSet = fonts as FontFaceSet & {
    load?: (font: string, text?: string) => Promise<readonly FontFace[]>;
    check?: (font: string, text?: string) => boolean;
  };
  const loadAll = Promise.all([
    Promise.resolve(fonts.ready),
    ...uniqueSamples.map(({ font, text }) => (typeof fontSet.load === 'function' ? fontSet.load(font, text) : Promise.resolve([])))
  ]).catch((cause: unknown) => {
    throw new PrintError('resource-load-failed', '打印字体加载失败。', { cause });
  });
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(cancelledError()));
    const timeout = globalThis.setTimeout(
      () => finish(() => reject(new PrintError('resource-timeout', '等待打印字体就绪超时。', { details: { timeoutMs } }))),
      timeoutMs
    );
    signal.addEventListener('abort', onAbort, { once: true });
    void loadAll.then(
      () => finish(resolve),
      (cause) => finish(() => reject(cause))
    );
    if (signal.aborted) onAbort();
  });
  if (typeof fontSet.check === 'function') {
    for (const { font, text } of uniqueSamples) {
      let ready = false;
      try {
        ready = fontSet.check(font, text);
      } catch (cause) {
        throw new PrintError('resource-load-failed', '无法确认打印字体是否就绪。', { cause });
      }
      if (!ready) throw new PrintError('resource-load-failed', `打印字体尚未就绪：${font}`);
    }
  }
}

interface ResourceDeadline {
  readonly signal: AbortSignal;
  remainingMs(): number;
  assertActive(): void;
  remap(error: unknown): unknown;
  destroy(): void;
}

function createResourceDeadline(timeoutMs: number, parentSignal: AbortSignal): ResourceDeadline {
  const controller = new AbortController();
  const expiresAt = Date.now() + timeoutMs;
  let timedOut = false;
  let destroyed = false;
  const timeoutError = (cause?: unknown): PrintError =>
    new PrintError('resource-timeout', '等待打印资源就绪超时。', {
      ...(cause === undefined ? {} : { cause }),
      details: { timeoutMs }
    });
  const abortFromParent = (): void => controller.abort();
  const expire = (): void => {
    if (destroyed || timedOut) return;
    timedOut = true;
    controller.abort();
  };
  const timer = globalThis.setTimeout(expire, timeoutMs);
  parentSignal.addEventListener('abort', abortFromParent, { once: true });
  if (parentSignal.aborted) abortFromParent();
  const assertActive = (): void => {
    if (!timedOut && Date.now() >= expiresAt) expire();
    if (timedOut) throw timeoutError();
    if (parentSignal.aborted || controller.signal.aborted) throw cancelledError();
  };
  return {
    signal: controller.signal,
    remainingMs() {
      assertActive();
      return Math.max(1, Math.ceil(expiresAt - Date.now()));
    },
    assertActive,
    remap(error) {
      return timedOut ? timeoutError(error) : error;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      globalThis.clearTimeout(timer);
      parentSignal.removeEventListener('abort', abortFromParent);
    }
  };
}

function planningCenter(
  spec: Readonly<NormalizedPrintSpec>,
  view: Readonly<OpenLayersPrintViewSnapshot>,
  boxRange: Readonly<PrintBoxRangeSnapshot> | undefined
): readonly [number, number] {
  if (spec.range.source.mode === 'extent') {
    const extent = spec.range.source.extent;
    return Object.freeze([(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]);
  }
  if (spec.range.source.mode === 'box' && boxRange !== undefined) return Object.freeze([boxRange.center[0], boxRange.center[1]]);
  return Object.freeze([view.center[0], view.center[1]]);
}

function printSourceFootprint(
  spec: Readonly<NormalizedPrintSpec>,
  view: Readonly<OpenLayersPrintViewSnapshot>,
  boxRange: Readonly<PrintBoxRangeSnapshot> | undefined
): readonly Coordinate[] {
  if (spec.range.source.mode === 'box' && boxRange !== undefined) return boxRange.footprint;
  if (spec.range.source.mode === 'extent') {
    const [minimumX, minimumY, maximumX, maximumY] = spec.range.source.extent;
    return [
      [minimumX, maximumY],
      [maximumX, maximumY],
      [maximumX, minimumY],
      [minimumX, minimumY]
    ];
  }
  return view.footprint;
}

function temporaryBoxRange(view: Readonly<OpenLayersPrintViewSnapshot>): Readonly<PrintBoxRangeSnapshot> {
  return Object.freeze({ center: view.center, footprint: view.footprint, rotation: view.rotation });
}

function artifact(format: 'png' | 'pdf', blob: Blob, preview: Readonly<PrintPreviewResult>, warnings: readonly PrintWarning[]): PrintArtifact {
  return Object.freeze({
    format,
    blob,
    widthPx: preview.widthPx,
    heightPx: preview.heightPx,
    plan: preview.plan,
    snapshotRevision: preview.revision,
    warnings: Object.freeze(warnings.map((warning) => Object.freeze({ ...warning })))
  });
}

async function canvasToPng(canvas: PrintCanvasLike, signal: AbortSignal, resourceDescriptors: readonly Readonly<PrintResourceDescriptor>[]): Promise<Blob> {
  if (signal.aborted) throw cancelledError();
  const target = canvas as PrintCanvasLike & {
    toBlob?: (callback: BlobCallback, type?: string) => void;
    convertToBlob?: (options?: ImageEncodeOptions) => Promise<Blob>;
  };
  if (typeof target.toBlob !== 'function' && typeof target.convertToBlob !== 'function') {
    throw new CapabilityError('当前环境不支持 Canvas PNG 编码。');
  }
  if (typeof target.toBlob !== 'function') {
    try {
      const blob = await abortAware(target.convertToBlob?.({ type: 'image/png' }) as Promise<Blob>, signal);
      if (signal.aborted) throw cancelledError();
      return requirePngBlob(blob);
    } catch (cause) {
      if (cause instanceof PrintError) throw cause;
      if (isCanvasSecurityError(cause)) throw createCorsTaintedCanvasError(cause, resourceDescriptors);
      throw new PrintError('png-encode-failed', 'Canvas PNG 编码失败。', { cause });
    }
  }
  return await new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(cancelledError()));
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      target.toBlob?.((blob) => {
        if (signal.aborted) return onAbort();
        if (blob === null) {
          settled = true;
          signal.removeEventListener('abort', onAbort);
          reject(new PrintError('png-encode-failed', 'Canvas 未能生成 PNG。'));
          return;
        }
        try {
          const png = requirePngBlob(blob);
          finish(() => resolve(png));
        } catch (error) {
          finish(() => reject(error));
        }
      }, 'image/png');
    } catch (cause) {
      settled = true;
      signal.removeEventListener('abort', onAbort);
      reject(
        isCanvasSecurityError(cause)
          ? createCorsTaintedCanvasError(cause, resourceDescriptors)
          : new PrintError('png-encode-failed', 'Canvas PNG 编码失败。', { cause })
      );
    }
    if (signal.aborted) onAbort();
  });
}

function isCanvasSecurityError(cause: unknown): boolean {
  if (cause === null || typeof cause !== 'object') return false;
  const record = cause as { readonly name?: unknown; readonly message?: unknown };
  if (record.name === 'SecurityError') return true;
  return typeof record.message === 'string' && /(?:taint|cross[- ]origin|\bcors\b)/iu.test(record.message);
}

function requirePngBlob(blob: unknown): Blob {
  if (!(blob instanceof Blob) || blob.size === 0 || blob.type.toLowerCase() !== 'image/png') {
    throw new PrintError('png-encode-failed', 'Canvas 必须返回非空的 image/png Blob。');
  }
  return blob;
}

function abortAware<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(cancelledError()));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
    if (signal.aborted) onAbort();
  });
}

function assertCreateOptions(options: PrintCreateOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new InvalidArgumentError('打印创建选项必须是普通对象。');
  if (options.sessionConflictPolicy !== undefined && options.sessionConflictPolicy !== 'replace' && options.sessionConflictPolicy !== 'reject') {
    throw new InvalidArgumentError('未知的打印会话冲突策略。');
  }
  if (options.interactionConflictPolicy !== undefined && options.interactionConflictPolicy !== 'replace' && options.interactionConflictPolicy !== 'reject') {
    throw new InvalidArgumentError('未知的打印交互冲突策略。');
  }
  if (options.printableLayerFactory !== undefined && typeof options.printableLayerFactory !== 'function') {
    throw new InvalidArgumentError('打印 printableLayerFactory 必须是函数。');
  }
}

function assertPreviewOptions(options: PrintPreviewOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new InvalidArgumentError('打印预览选项必须是普通对象。');
  if (options.quality !== undefined && options.quality !== 'draft' && options.quality !== 'final') throw new InvalidArgumentError('未知的打印预览质量。');
}

function assertExportOptions(options: PrintExportOptions): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new InvalidArgumentError('打印导出选项必须是普通对象。');
  if (options.format !== 'png' && options.format !== 'pdf' && options.format !== 'browser-print') throw new InvalidArgumentError('未知的打印导出格式。');
}

function isEventType(value: unknown): value is PrintSessionEventType {
  return (
    value === 'statuschange' ||
    value === 'specchange' ||
    value === 'rangechange' ||
    value === 'previewchange' ||
    value === 'validationchange' ||
    value === 'export' ||
    value === 'cancel' ||
    value === 'error'
  );
}

function cancelledError(): PrintError {
  return new PrintError('cancelled', '打印操作已取消。');
}
