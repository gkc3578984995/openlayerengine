import { PrintError } from '../../core/errors.js';
import type {
  PrintIconLegendSymbol,
  PrintLegendGroup,
  PrintLegendItem,
  PrintLegendLayoutSpec,
  PrintLegendResult,
  PrintLegendSymbolSpec,
  PrintPlan,
  PrintResolvedRange,
  PrintSpec,
  PrintValidationIssue,
  PrintValidationReport,
  PrintWarning
} from '../../core/print/types.js';

type PrintDialogSessionStatus = 'draft' | 'selecting' | 'planning' | 'previewing' | 'ready' | 'exporting' | 'printing' | 'cancelled' | 'destroyed';

interface PrintDialogCapabilitiesPort {
  readonly pdf: boolean;
  readonly browserPrint: boolean;
  readonly limits: Readonly<{ minDpi: number; maxDpi: number }>;
}

interface PrintDialogPreviewResult {
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly revision: number;
  readonly plan: Readonly<PrintPlan>;
  readonly validation: Readonly<PrintValidationReport>;
}

interface PrintDialogPdfEncoder {
  encode(
    input: Readonly<{
      png: Blob;
      pageWidthMm: number;
      pageHeightMm: number;
      dpi: number;
      signal: AbortSignal;
    }>
  ): Promise<Blob>;
}

type PrintDialogExportOptions =
  | { readonly format: 'png' }
  | { readonly format: 'pdf'; readonly encoder?: PrintDialogPdfEncoder }
  | { readonly format: 'browser-print'; readonly documentTitle?: string };

interface PrintDialogArtifact {
  readonly format: 'png' | 'pdf';
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly plan: Readonly<PrintPlan>;
  readonly snapshotRevision: number;
  readonly warnings: readonly PrintWarning[];
}

type PrintDialogExportResult = PrintDialogArtifact | { readonly dialogOpened: boolean };

interface PrintDialogSessionEventMap {
  readonly statuschange: { readonly type: 'statuschange'; readonly status: PrintDialogSessionStatus; readonly revision: number };
  readonly specchange: { readonly type: 'specchange'; readonly spec: Readonly<PrintSpec>; readonly revision: number };
  readonly rangechange: { readonly type: 'rangechange'; readonly range: Readonly<PrintResolvedRange>; readonly revision: number };
  readonly previewchange: { readonly type: 'previewchange'; readonly result: Readonly<PrintDialogPreviewResult>; readonly revision: number };
  readonly validationchange: { readonly type: 'validationchange'; readonly validation: Readonly<PrintValidationReport>; readonly revision: number };
  readonly export: { readonly type: 'export'; readonly result: Readonly<PrintDialogExportResult>; readonly revision: number };
  readonly cancel: { readonly type: 'cancel'; readonly revision: number };
  readonly error: { readonly type: 'error'; readonly error: unknown; readonly revision: number };
}

type PrintDialogSessionEventType = keyof PrintDialogSessionEventMap;

/** DOM 工作台依赖的局部 UI port；由 Facade 传入兼容会话。 */
export interface PrintDialogSessionPort {
  readonly status: PrintDialogSessionStatus;
  readonly spec: Readonly<PrintSpec> | undefined;
  readonly plan: Readonly<PrintPlan> | undefined;
  readonly legendResult: Readonly<PrintLegendResult> | undefined;
  readonly previewResult: Readonly<PrintDialogPreviewResult> | undefined;
  /** Facade 实现提供的最近发布质量；兼容 port 省略时由输出尺寸推断。 */
  readonly previewQuality?: 'draft' | 'final';
  readonly validation: Readonly<PrintValidationReport>;
  update(spec: PrintSpec): void;
  selectArea(): Promise<Readonly<PrintResolvedRange>>;
  generateLegend(): Promise<PrintLegendResult>;
  preview(options?: Readonly<{ quality?: 'draft' | 'final' }>): Promise<PrintDialogPreviewResult>;
  export(options: PrintDialogExportOptions): Promise<PrintDialogExportResult>;
  cancel(): void;
  destroy(): void;
  on<T extends PrintDialogSessionEventType>(type: T, listener: (event: Readonly<PrintDialogSessionEventMap[T]>) => void): () => void;
}

interface PrintDialogAdapterOptions {
  readonly session: PrintDialogSessionPort;
  readonly target: HTMLElement;
  readonly capabilities: Readonly<PrintDialogCapabilitiesPort>;
  readonly embedded?: boolean;
  readonly onDestroy?: () => void;
}

interface MutablePrintDraft {
  classification: string;
  title: string;
  subtitle: string;
  date: string;
  issuer: string;
  paperSize: 'A4' | 'A3' | 'custom';
  paperWidthMm: number;
  paperHeightMm: number;
  orientation: 'portrait' | 'landscape';
  marginMode: 'uniform' | 'sides';
  marginMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  dpi: number;
  rangeMode: 'view' | 'box';
  scaleMode: 'fit' | 'fixed';
  denominator: number;
  content: NonNullable<PrintSpec['content']>;
  resources: PrintSpec['resources'];
}

type PrintManualLegendSpec = Extract<NonNullable<PrintSpec['legend']>, { readonly mode: 'manual' }>;

interface MutableIconLegendDraft {
  src: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  crossOrigin: '' | 'anonymous' | 'use-credentials';
}

type PrintPreviewDisplayMode = 'fit' | 'actual';
type PrintPreviewUiState = 'empty' | 'updating' | 'ready' | 'error';

interface LiveInputScheduler {
  schedule(commit: () => void): void;
  flush(commit: () => void): void;
  settle(): void;
  cancel(): void;
}

const steps = Object.freeze(['版式设置', '范围选择', '自动图例', '手动图例', '预览导出']);
const classificationSuggestions = Object.freeze(['公开', '内部', '秘密', '机密', '机密★30年', '绝密']);
const splitLayout = Object.freeze({ dividerWidth: 10, minInputPx: 420, minPreviewPx: 360, stackedMaxWidthPx: 800 });
let printDialogSequence = 0;

/** 内置五屏打印工作台；地图计算全部委托给同一个 PrintSession。 */
export class PrintDialogAdapter {
  readonly session: PrintDialogSessionPort;
  readonly #capabilities: Readonly<PrintDialogCapabilitiesPort>;
  readonly #onDestroy: (() => void) | undefined;
  readonly #embedded: boolean;
  readonly #previousActiveElement: HTMLElement | null;
  readonly #root: HTMLDivElement;
  readonly #workspace: HTMLElement;
  readonly #content: HTMLElement;
  readonly #splitter: HTMLElement;
  readonly #preview: HTMLElement;
  readonly #statusText: HTMLSpanElement;
  readonly #classificationSuggestionsId = `ol-print-classification-${++printDialogSequence}`;
  readonly #disposers: Array<() => void> = [];
  readonly #draft: MutablePrintDraft;
  #state: 'open' | 'closed' | 'destroyed' = 'open';
  #step = 0;
  #renderedStep: number | undefined;
  #previewUrl: string | undefined;
  #previewGeneration = 0;
  #previewTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  #liveInputTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  #pendingLiveInput: (() => void) | undefined;
  #liveSettlePending = false;
  #previewDisplayMode: PrintPreviewDisplayMode = 'fit';
  #previewUiState: PrintPreviewUiState = 'empty';
  #previewRevision: number | undefined;
  #previewTargetRevision: number | undefined;
  #previewQuality: 'draft' | 'final' | undefined;
  #previewError: string | undefined;
  #activePreviewQuality: 'draft' | 'final' | undefined;
  #splitRatio = 40;
  #splitPointerId: number | undefined;
  #acknowledgedValidationRevision: number | undefined;
  #draftError: string | undefined;
  readonly #invalidNumericFields = new Map<string, Readonly<{ value: string; message: string }>>();
  #applyingLiveDraft = false;
  #committingDraft = false;
  #tornDown = false;
  #lastValidationRevision: number;
  #manualIdCounter = 0;
  readonly #collapsedLegendGroups = new Set<string>();
  readonly #iconValidationGenerations = new Map<string, number>();
  readonly #iconValidationControllers = new Map<string, AbortController>();
  readonly #liveScheduler: LiveInputScheduler = {
    schedule: (commit) => {
      if (this.#liveInputTimer !== undefined) globalThis.clearTimeout(this.#liveInputTimer);
      this.#pendingLiveInput = commit;
      this.#liveInputTimer = globalThis.setTimeout(() => {
        this.#liveInputTimer = undefined;
        const pending = this.#pendingLiveInput;
        this.#pendingLiveInput = undefined;
        pending?.();
      }, 120);
    },
    flush: (commit) => {
      if (this.#liveInputTimer !== undefined) globalThis.clearTimeout(this.#liveInputTimer);
      this.#liveInputTimer = undefined;
      this.#pendingLiveInput = undefined;
      commit();
    },
    settle: () => {
      if (this.#liveSettlePending) return;
      this.#liveSettlePending = true;
      globalThis.queueMicrotask(() => {
        this.#liveSettlePending = false;
        if (this.#state !== 'open') return;
        const active = document.activeElement as HTMLElement | null;
        const editors = [...this.#content.querySelectorAll<HTMLElement>('input, select, textarea')];
        if (active !== null && editors.includes(active)) return;
        this.#render();
      });
    },
    cancel: () => {
      if (this.#liveInputTimer !== undefined) globalThis.clearTimeout(this.#liveInputTimer);
      this.#liveInputTimer = undefined;
      this.#pendingLiveInput = undefined;
    }
  };

  constructor(options: PrintDialogAdapterOptions) {
    this.session = options.session;
    this.#capabilities = options.capabilities;
    this.#onDestroy = options.onDestroy;
    this.#embedded = options.embedded === true;
    this.#previousActiveElement = (document.activeElement as HTMLElement | null) ?? null;
    const normalizeInitialExtent = options.session.spec?.range.source.mode === 'extent';
    this.#draft = draftFromSpec(options.session.spec);
    this.#lastValidationRevision = options.session.validation.revision;
    this.#root = element('div', 'ol-print-dialog');
    this.#root.classList.toggle('ol-print-dialog--embedded', this.#embedded);
    this.#root.tabIndex = -1;
    this.#root.setAttribute('role', 'dialog');
    this.#root.setAttribute('aria-modal', this.#embedded ? 'false' : 'true');
    this.#root.setAttribute('aria-label', '地图打印工作台');

    const header = element('header', 'ol-print-dialog__header');
    const heading = element('div', 'ol-print-dialog__heading');
    const title = element('strong', 'ol-print-dialog__title', '地图打印');
    this.#statusText = element('span', 'ol-print-dialog__status', '草稿');
    heading.append(title, this.#statusText);
    const close = button('关闭', 'ol-print-dialog__close', () => this.close());
    close.setAttribute('aria-label', '关闭地图打印');
    header.append(heading, close);

    const stepper = element('nav', 'ol-print-dialog__steps');
    stepper.setAttribute('aria-label', '打印步骤');
    for (const [index, label] of steps.entries()) {
      const item = button(`${index + 1} ${label}`, 'ol-print-dialog__step', () => this.#goTo(index));
      item.dataset.step = String(index);
      stepper.append(item);
    }

    const workspace = element('div', 'ol-print-dialog__workspace');
    this.#workspace = workspace;
    this.#content = element('section', 'ol-print-dialog__content');
    this.#splitter = element('div', 'ol-print-dialog__splitter');
    this.#splitter.tabIndex = 0;
    this.#splitter.setAttribute('role', 'separator');
    this.#splitter.setAttribute('aria-label', '调整设置区和预览区宽度');
    this.#splitter.setAttribute('aria-orientation', 'vertical');
    this.#splitter.setAttribute('aria-valuemin', '0');
    this.#splitter.setAttribute('aria-valuemax', '100');
    this.#splitter.setAttribute('aria-valuenow', String(this.#splitRatio));
    this.#splitter.addEventListener('pointerdown', this.#handleSplitterPointerDown);
    this.#splitter.addEventListener('pointermove', this.#handleSplitterPointerMove);
    this.#splitter.addEventListener('pointerup', this.#handleSplitterPointerEnd);
    this.#splitter.addEventListener('pointercancel', this.#handleSplitterPointerEnd);
    this.#splitter.addEventListener('keydown', this.#handleSplitterKeydown);
    this.#preview = element('aside', 'ol-print-dialog__preview');
    this.#preview.setAttribute('aria-label', '完整纸张实时预览');
    workspace.append(this.#content, this.#splitter, this.#preview);
    this.#root.append(header, stepper, workspace);
    if (!this.#embedded) this.#root.addEventListener('keydown', this.#handleModalKeydown);
    options.target.append(this.#root);

    const own = (dispose: () => void): void => {
      this.#disposers.push(dispose);
    };
    try {
      own(
        this.session.on('statuschange', ({ status }) => {
          this.#syncStatus();
          if (status === 'destroyed') this.#terminateFromSession('destroyed');
        })
      );
      own(
        this.session.on('specchange', ({ spec, revision }) => {
          const external = !this.#committingDraft;
          this.#syncDraftFromSpec(spec, external);
          if (external && spec.range.source.mode === 'extent') {
            const normalized = this.#applyDraft(spec.legend);
            this.#markPreviewUpdating(this.session.validation.revision);
            this.#render();
            if (normalized) {
              this.#showMessage('内置界面不编辑外部坐标范围，已切换为当前视图。', 'info');
              this.#queuePreview();
            }
            return;
          }
          this.#markPreviewUpdating(revision);
          if (external) this.#render();
          else this.#renderPaper();
        })
      );
      own(
        this.session.on('rangechange', ({ revision }) => {
          this.#markPreviewUpdating(revision);
          this.#renderPaper();
        })
      );
      own(
        this.session.on('validationchange', () => {
          const validation = this.session.validation;
          const revisionChanged = validation.revision !== this.#lastValidationRevision;
          this.#lastValidationRevision = validation.revision;
          if (revisionChanged) this.#markPreviewUpdating(validation.revision);
          if (this.#applyingLiveDraft || this.#committingDraft) this.#renderPaper();
          else this.#render();
          if (revisionChanged) this.#queuePreview();
        })
      );
      own(
        this.session.on('previewchange', ({ result }) => {
          const quality =
            this.session.previewQuality ??
            (result.widthPx === result.plan.outputSizePx[0] && result.heightPx === result.plan.outputSizePx[1] ? 'final' : 'draft');
          if (
            (this.#previewTargetRevision === undefined || result.revision === this.#previewTargetRevision) &&
            !(quality === 'draft' && this.#previewQuality === 'final' && this.#previewRevision !== undefined && result.revision <= this.#previewRevision)
          ) {
            if (this.#previewTimer !== undefined) globalThis.clearTimeout(this.#previewTimer);
            this.#previewTimer = undefined;
            this.#previewGeneration += 1;
            this.#activePreviewQuality = undefined;
            this.#showPreview(result.blob, result.revision, quality);
          }
        })
      );
      own(this.session.on('cancel', () => this.#terminateFromSession('closed')));
      own(
        this.session.on('error', ({ error }) => {
          if (error instanceof PrintError && error.code === 'cancelled') return;
          this.#showMessage(errorMessage(error), 'error');
        })
      );
      this.#setSplitRatio(this.#splitRatio);
      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => {
          this.#setSplitRatio(this.#splitRatio);
          this.#syncFitPaperSize();
        });
        resizeObserver.observe(this.#workspace);
        resizeObserver.observe(this.#preview);
        own(() => resizeObserver.disconnect());
      }
      if (this.session.spec === undefined || normalizeInitialExtent) this.#applyDraft();
      this.#render();
      if (normalizeInitialExtent) this.#showMessage('内置界面不编辑外部坐标范围，已切换为当前视图。', 'info');
      this.#queuePreview();
    } catch (error) {
      this.#teardown();
      throw error;
    }
  }

  get status(): 'open' | 'closed' | 'destroyed' {
    return this.#state;
  }

  focus(): void {
    if (this.#state !== 'open') return;
    (this.#root.querySelector<HTMLElement>('input, select, textarea, button:not([disabled])') ?? this.#root).focus();
  }

  close(): void {
    if (this.#state !== 'open') return;
    this.#state = 'closed';
    this.session.cancel();
    this.#teardown();
  }

  destroy(): void {
    if (this.#state === 'destroyed') return;
    this.#state = 'destroyed';
    this.session.destroy();
    this.#teardown();
  }

  #teardown(): void {
    if (this.#tornDown) return;
    this.#tornDown = true;
    if (this.#previewTimer !== undefined) globalThis.clearTimeout(this.#previewTimer);
    if (this.#liveInputTimer !== undefined) globalThis.clearTimeout(this.#liveInputTimer);
    this.#previewTimer = undefined;
    this.#liveInputTimer = undefined;
    this.#pendingLiveInput = undefined;
    this.#invalidNumericFields.clear();
    for (const controller of this.#iconValidationControllers.values()) controller.abort();
    this.#iconValidationControllers.clear();
    for (const dispose of this.#disposers.splice(0)) dispose();
    this.#iconValidationGenerations.clear();
    this.#revokePreviewUrl();
    this.#root.remove();
    if (!this.#embedded && this.#previousActiveElement !== null && this.#previousActiveElement.isConnected !== false) this.#previousActiveElement.focus();
    this.#onDestroy?.();
  }

  #terminateFromSession(state: 'closed' | 'destroyed'): void {
    if (this.#state !== 'open') return;
    this.#state = state;
    this.#teardown();
  }

  readonly #handleModalKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.session.status === 'selecting') return;
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...this.#root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ];
    if (focusable.length === 0) return;
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const target = event.shiftKey
      ? activeIndex <= 0
        ? focusable[focusable.length - 1]
        : focusable[activeIndex - 1]
      : activeIndex < 0 || activeIndex === focusable.length - 1
        ? focusable[0]
        : focusable[activeIndex + 1];
    event.preventDefault();
    target?.focus();
  };

  readonly #handleSplitterPointerDown = (event: PointerEvent): void => {
    this.#splitPointerId = event.pointerId;
    this.#splitter.setPointerCapture?.(event.pointerId);
    this.#splitter.classList.add('is-dragging');
    this.#resizeFromPointer(event.clientX);
    event.preventDefault();
  };

  readonly #handleSplitterPointerMove = (event: PointerEvent): void => {
    if (this.#splitPointerId !== event.pointerId) return;
    this.#resizeFromPointer(event.clientX);
  };

  readonly #handleSplitterPointerEnd = (event: PointerEvent): void => {
    if (this.#splitPointerId !== event.pointerId) return;
    this.#resizeFromPointer(event.clientX);
    this.#splitPointerId = undefined;
    this.#splitter.classList.remove('is-dragging');
    this.#splitter.releasePointerCapture?.(event.pointerId);
  };

  readonly #handleSplitterKeydown = (event: KeyboardEvent): void => {
    let ratio = this.#splitRatio;
    if (event.key === 'ArrowLeft') ratio -= 2;
    else if (event.key === 'ArrowRight') ratio += 2;
    else if (event.key === 'Home') ratio = 0;
    else if (event.key === 'End') ratio = 100;
    else return;
    this.#setSplitRatio(ratio);
    event.preventDefault();
  };

  #resizeFromPointer(clientX: number): void {
    const bounds = this.#workspace.getBoundingClientRect();
    if (!Number.isFinite(bounds.width) || bounds.width <= 0) return;
    this.#setSplitRatio(((clientX - bounds.left) / bounds.width) * 100);
  }

  #setSplitRatio(ratio: number): void {
    const width = this.#workspace.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) return;
    const stacked = width <= splitLayout.stackedMaxWidthPx;
    if (stacked) {
      this.#splitter.setAttribute('aria-valuemin', '50');
      this.#splitter.setAttribute('aria-valuemax', '50');
      this.#splitter.setAttribute('aria-valuenow', '50');
      return;
    }
    const minRatio = (splitLayout.minInputPx / width) * 100;
    const maxRatio = ((width - splitLayout.dividerWidth - splitLayout.minPreviewPx) / width) * 100;
    this.#splitRatio = Math.round(Math.min(maxRatio, Math.max(minRatio, ratio)) * 10) / 10;
    if (typeof this.#root.style.setProperty === 'function') this.#root.style.setProperty('--ol-print-input-ratio', `${this.#splitRatio}%`);
    else (this.#root.style as unknown as Record<string, string>)['--ol-print-input-ratio'] = `${this.#splitRatio}%`;
    this.#splitter.setAttribute('aria-valuemin', String(Math.round(minRatio * 10) / 10));
    this.#splitter.setAttribute('aria-valuemax', String(Math.round(maxRatio * 10) / 10));
    this.#splitter.setAttribute('aria-valuenow', String(this.#splitRatio));
  }

  #render(): void {
    if (this.#state !== 'open') return;
    const previousScroll = this.#renderedStep === this.#step ? this.#scrollContent() : undefined;
    const scrollPosition = previousScroll === undefined ? undefined : { top: previousScroll.scrollTop, left: previousScroll.scrollLeft };
    this.#root.classList.toggle('is-selecting', this.#step === 1 && this.#draft.rangeMode === 'box');
    for (const item of this.#root.querySelectorAll<HTMLButtonElement>('.ol-print-dialog__step')) {
      const active = Number(item.dataset.step) === this.#step;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-current', active ? 'step' : 'false');
      item.disabled = this.#draftError !== undefined && !active;
    }
    this.#content.replaceChildren();
    if (this.#step === 0) this.#renderLayoutStep();
    else if (this.#step === 1) this.#renderRangeStep();
    else if (this.#step === 2) this.#renderAutoLegendStep();
    else if (this.#step === 3) this.#renderManualLegendStep();
    else this.#renderExportStep();
    this.#fixActionArea();
    this.#renderPaper();
    this.#syncStatus();
    this.#syncDraftValidity();
    this.#renderedStep = this.#step;
    if (scrollPosition !== undefined) {
      const currentScroll = this.#scrollContent();
      currentScroll.scrollTop = scrollPosition.top;
      currentScroll.scrollLeft = scrollPosition.left;
    }
  }

  #fixActionArea(): void {
    const children = [...this.#content.children] as HTMLElement[];
    const actions = children.at(-1);
    if (actions === undefined || !actions.classList.contains('ol-print-actions')) return;
    actions.classList.add('ol-print-actions--footer');
    const scroll = element('div', 'ol-print-dialog__scroll');
    scroll.append(...children.slice(0, -1));
    this.#content.replaceChildren(scroll, actions);
  }

  #scrollContent(): HTMLElement {
    return this.#content.querySelector<HTMLElement>('.ol-print-dialog__scroll') ?? this.#content;
  }

  #renderPreservingEditorFocus(): void {
    const active = document.activeElement as HTMLElement | null;
    const currentEditors = [...this.#content.querySelectorAll<HTMLElement>('input, select, textarea')];
    const fieldKey = active !== null && currentEditors.includes(active) ? active.dataset.printField : undefined;
    this.#render();
    if (fieldKey === undefined) return;
    const replacement = [...this.#content.querySelectorAll<HTMLElement>('input, select, textarea')].find((editor) => editor.dataset.printField === fieldKey);
    replacement?.focus({ preventScroll: true });
  }

  #renderPreservingActionFocus(actionKey: string): void {
    this.#render();
    const replacement = [...this.#content.querySelectorAll<HTMLElement>('button')].find((control) => control.dataset.printAction === actionKey);
    replacement?.focus({ preventScroll: true });
  }

  #renderLayoutStep(): void {
    this.#content.append(sectionHeading('1. 版式设置', '设置纸张、比例尺和地图整饰文字。右侧始终显示完整纸张。'));
    const form = element('div', 'ol-print-form');
    form.append(
      textField(
        '密级',
        this.#draft.classification,
        (value, final) => this.#updateDraft('classification', value, final),
        '例如：机密★30年',
        this.#liveScheduler,
        { id: this.#classificationSuggestionsId, values: classificationSuggestions }
      ),
      textField('主标题', this.#draft.title, (value, final) => this.#updateDraft('title', value, final), undefined, this.#liveScheduler),
      textField('副标题', this.#draft.subtitle, (value, final) => this.#updateDraft('subtitle', value, final), undefined, this.#liveScheduler),
      textField('日期', this.#draft.date, (value, final) => this.#updateDraft('date', value, final), undefined, this.#liveScheduler),
      textField('签发人', this.#draft.issuer, (value, final) => this.#updateDraft('issuer', value, final), undefined, this.#liveScheduler),
      selectField(
        '纸张',
        this.#draft.paperSize,
        [
          ['A4', 'A4'],
          ['A3', 'A3'],
          ['custom', '自定义']
        ],
        (value) => this.#updateDraft('paperSize', value as MutablePrintDraft['paperSize'])
      ),
      selectField(
        '方向',
        this.#draft.orientation,
        [
          ['landscape', '横向'],
          ['portrait', '纵向']
        ],
        (value) => this.#updateDraft('orientation', value as MutablePrintDraft['orientation'])
      ),
      selectField(
        '边距模式',
        this.#draft.marginMode,
        [
          ['uniform', '统一边距'],
          ['sides', '四边独立']
        ],
        (value) => this.#updateMarginMode(value as MutablePrintDraft['marginMode'])
      ),
      this.#liveNumberField('DPI', 'dpi', this.#draft.dpi, this.#capabilities.limits.minDpi, this.#capabilities.limits.maxDpi, 1, (value, final) =>
        this.#updateDraft('dpi', value, final)
      ),
      selectField(
        '范围来源',
        this.#draft.rangeMode,
        [
          ['view', '当前视图'],
          ['box', '框选范围']
        ],
        (value) => this.#updateDraft('rangeMode', value as MutablePrintDraft['rangeMode'])
      ),
      selectField(
        '比例尺',
        this.#draft.scaleMode,
        [
          ['fit', '适配范围'],
          ['fixed', '固定比例尺']
        ],
        (value) => this.#updateDraft('scaleMode', value as MutablePrintDraft['scaleMode'])
      )
    );
    if (this.#draft.paperSize === 'custom') {
      form.append(
        this.#liveNumberField('纸宽（mm）', 'paperWidthMm', this.#draft.paperWidthMm, 50, 2000, 1, (value, final) =>
          this.#updateDraft('paperWidthMm', value, final)
        ),
        this.#liveNumberField('纸高（mm）', 'paperHeightMm', this.#draft.paperHeightMm, 50, 2000, 1, (value, final) =>
          this.#updateDraft('paperHeightMm', value, final)
        )
      );
    }
    if (this.#draft.marginMode === 'uniform') {
      form.append(
        this.#liveNumberField('统一边距（mm）', 'marginMm', this.#draft.marginMm, 0, 200, 1, (value, final) => this.#updateUniformMargin(value, final))
      );
    } else {
      form.append(
        this.#liveNumberField('上边距（mm）', 'marginTopMm', this.#draft.marginTopMm, 0, 200, 1, (value, final) =>
          this.#updateDraft('marginTopMm', value, final)
        ),
        this.#liveNumberField('右边距（mm）', 'marginRightMm', this.#draft.marginRightMm, 0, 200, 1, (value, final) =>
          this.#updateDraft('marginRightMm', value, final)
        ),
        this.#liveNumberField('下边距（mm）', 'marginBottomMm', this.#draft.marginBottomMm, 0, 200, 1, (value, final) =>
          this.#updateDraft('marginBottomMm', value, final)
        ),
        this.#liveNumberField('左边距（mm）', 'marginLeftMm', this.#draft.marginLeftMm, 0, 200, 1, (value, final) =>
          this.#updateDraft('marginLeftMm', value, final)
        )
      );
    }
    if (this.#draft.scaleMode === 'fixed') {
      form.append(
        this.#liveNumberField('比例尺 1∶', 'denominator', this.#draft.denominator, 1, 1_000_000_000, 100, (value, final) =>
          this.#updateDraft('denominator', value, final)
        )
      );
    }
    const metrics = element('dl', 'ol-print-summary ol-print-summary--metrics');
    const plan = this.session.plan;
    const pageSize = plan?.mapFrameMm;
    const outputSize = plan?.outputSizePx;
    description(metrics, '净地图框', pageSize === undefined ? '等待有效规划' : `${formatDecimal(pageSize.width)} × ${formatDecimal(pageSize.height)} mm`);
    description(metrics, '输出像素', outputSize === undefined ? '等待有效规划' : `${outputSize[0]} × ${outputSize[1]} px`);
    description(metrics, 'RGBA 内存', outputSize === undefined ? '等待有效规划' : rgbaMemoryLabel(outputSize));
    this.#content.append(form, metrics, validationPanel(this.session.validation.issues, this.session.validation.warnings));
    this.#appendDraftError();
    const next = button('下一步：选择范围', 'ol-print-button ol-print-button--primary ol-print-requires-valid-draft ol-print-requires-layout-ready', () =>
      this.#goTo(1)
    );
    next.disabled = this.#draftError !== undefined || this.session.validation.issues.some((issue) => isLayoutStepBlockingIssue(issue.code));
    this.#content.append(actionBar(next));
  }

  #renderRangeStep(): void {
    this.#content.append(
      sectionHeading(
        '2. 范围选择',
        this.#draft.rangeMode === 'box' ? '在左侧活动地图自由拖拽蓝色选框；打印适配范围会同步显示在地图与右侧预览中。' : '确认当前视图范围。'
      )
    );
    const summary = element('dl', 'ol-print-summary');
    description(summary, '范围来源', rangeLabel(this.#draft.rangeMode));
    description(summary, '比例尺规则', this.#draft.scaleMode === 'fit' ? '完整范围适配纸张' : `固定 1∶${formatInteger(this.#draft.denominator)}`);
    description(summary, '状态', this.session.plan === undefined ? '尚未解析范围' : '范围已解析');
    if (this.session.plan !== undefined) {
      description(summary, '来源范围', formatExtent(this.session.plan.range.sourceExtent));
      description(summary, '实际范围', formatExtent(this.session.plan.range.actualExtent));
    }
    this.#content.append(summary, validationPanel(this.session.validation.issues, this.session.validation.warnings));
    this.#appendDraftError();
    const select = button(
      this.#draft.rangeMode === 'box' ? '开始框选' : '确认范围',
      'ol-print-button ol-print-button--primary ol-print-requires-valid-draft',
      () => void this.#selectArea()
    );
    select.disabled = this.#draftError !== undefined;
    const previous = button('返回版式', 'ol-print-button', () => this.#goTo(0));
    const next = button('下一步：自动图例', 'ol-print-button ol-print-requires-valid-draft ol-print-requires-plan', () => this.#goTo(2));
    next.disabled =
      this.session.plan === undefined ||
      this.#draftError !== undefined ||
      this.session.validation.issues.some((issue) => !isRecoverableResourceIssue(issue.code));
    this.#content.append(actionBar(previous, select, next));
  }

  #renderAutoLegendStep(): void {
    this.#content.append(sectionHeading('3. 自动图例', '依据最终打印范围、比例尺和实际可见 Element 生成；动态样式会明确列为告警。'));
    const result = this.session.legendResult;
    if (result === undefined) this.#content.append(notice('尚未扫描图例。', 'info'));
    else {
      const summary = element('dl', 'ol-print-summary');
      const visibleGroups = new Set(result.groups.filter((group) => group.visible !== false).map((group) => group.id));
      const visibleItems = result.items.filter((item) => item.visible !== false && visibleGroups.has(item.groupId));
      const hits = visibleItems.reduce((sum, item) => sum + (item.count ?? 0), 0);
      description(summary, '合并条目', `${visibleItems.length} 项`);
      description(summary, '命中目标', `${hits} 个`);
      description(summary, '最终比例尺', `1∶${formatInteger(this.session.plan?.range.denominator ?? this.#draft.denominator)}`);
      description(summary, '可见性依据', '最终打印足迹、最终比例尺、图层/Element 可见状态与命中结果');
      this.#content.append(summary, legendList(result));
    }
    this.#content.append(validationPanel(this.session.validation.issues, result?.warnings ?? this.session.validation.warnings));
    this.#content.append(
      actionBar(
        button('返回范围', 'ol-print-button', () => this.#goTo(1)),
        button(result === undefined ? '生成自动图例' : '重新扫描', 'ol-print-button ol-print-button--primary', () => void this.#generateLegend()),
        button('下一步：手动图例', 'ol-print-button', () => this.#goTo(3))
      )
    );
  }

  #renderManualLegendStep(): void {
    this.#content.append(sectionHeading('4. 手动图例', '可编辑分组、条目、点线面/图标符号和图例版式；修改只属于打印配置，不会反向修改地图 Element。'));
    const result = this.session.legendResult ?? emptyLegendResult(this.session.validation.revision);
    const manual = this.#manualLegend(result);
    const list = element('div', 'ol-print-legend-editor');
    list.append(
      this.#legendLayoutEditor(result),
      actionBar(
        button('新增分组', 'ol-print-button', () => this.#addLegendGroup(result)),
        button('新增条目', 'ol-print-button ol-print-button--primary', () => this.#addLegendItem(result))
      )
    );
    if (manual.items.length === 0) list.append(notice('当前图例没有条目，可新增纯手动分组或条目。', 'info'));
    const groups = orderedGroups(manual.groups);
    for (const [groupIndex, group] of groups.entries()) {
      const section = element('section', 'ol-print-legend-editor__group');
      const collapsed = this.#collapsedLegendGroups.has(group.id);
      section.classList.toggle('is-collapsed', collapsed);
      section.append(this.#legendGroupEditor(group, groupIndex, groups, result));
      const items = orderedItems(manual.items.filter((item) => item.groupId === group.id));
      if (!collapsed) {
        for (const [itemIndex, item] of items.entries()) section.append(this.#legendEditorRow(item, itemIndex, items, result));
        if (items.length === 0) section.append(notice('此分组当前没有条目。', 'info'));
      }
      list.append(section);
    }
    if (groups.length === 0) {
      list.append(notice('尚无分组；新增条目时会同时创建默认分组。', 'info'));
    }
    this.#content.append(list);
    this.#content.append(validationPanel(this.session.validation.issues, this.session.validation.warnings));
    this.#content.append(
      actionBar(
        button('返回自动图例', 'ol-print-button', () => this.#goTo(2)),
        button('恢复自动图例', 'ol-print-button', () => void this.#restoreAutoLegend()),
        button('下一步：预览导出', 'ol-print-button ol-print-button--primary ol-print-requires-valid-draft', () => this.#goTo(4))
      )
    );
  }

  #renderExportStep(): void {
    this.#content.append(sectionHeading('5. 最终预览与导出', '所有输出复用当前冻结页面；浏览器打印时请选择“实际大小/100%”并关闭浏览器页眉页脚。'));
    this.#content.append(this.#finalChecklist(), validationPanel(this.session.validation.issues, this.session.validation.warnings));
    this.#appendDraftError();
    if (this.#capabilities.browserPrint) {
      this.#content.append(notice('浏览器打印提示：请选择“实际大小/100%”并关闭页眉页脚；自定义纸张是否生效取决于浏览器、打印机驱动和纸盒能力。', 'info'));
    }
    const validation = this.session.validation;
    if (this.#acknowledgedValidationRevision !== undefined && this.#acknowledgedValidationRevision !== validation.revision) {
      this.#acknowledgedValidationRevision = undefined;
    }
    const acknowledgementWarnings = validation.warnings.filter((warning) => warning.requiresAcknowledgement);
    if (acknowledgementWarnings.length > 0) {
      const acknowledgement = document.createElement('input');
      acknowledgement.type = 'checkbox';
      acknowledgement.checked = this.#acknowledgedValidationRevision === validation.revision;
      acknowledgement.setAttribute('aria-label', '确认当前版本的打印警告');
      acknowledgement.addEventListener('change', () => {
        this.#acknowledgedValidationRevision = acknowledgement.checked ? validation.revision : undefined;
        this.#render();
      });
      const label = element('label', 'ol-print-warning-ack');
      label.append(acknowledgement, document.createTextNode(`我已阅读并确认当前版本的 ${acknowledgementWarnings.length} 项打印警告`));
      this.#content.append(label);
    }
    const previewModes = element('div', 'ol-print-preview-modes');
    previewModes.setAttribute('role', 'group');
    previewModes.setAttribute('aria-label', '预览显示模式');
    for (const [mode, label] of [
      ['fit', '适合窗口'],
      ['actual', '100%']
    ] as const) {
      const option = button(label, 'ol-print-button ol-print-preview-modes__button', () => {
        this.#previewDisplayMode = mode;
        this.#render();
      });
      option.setAttribute('aria-pressed', String(this.#previewDisplayMode === mode));
      option.classList.toggle('is-active', this.#previewDisplayMode === mode);
      previewModes.append(option);
    }
    this.#content.append(previewModes);
    const pixelSize = this.session.plan?.outputSizePx;
    if (pixelSize !== undefined) this.#content.append(notice(`输出尺寸：${pixelSize[0]} × ${pixelSize[1]} px，${this.#draft.dpi} DPI`, 'info'));
    const png = button('导出 PNG', 'ol-print-button ol-print-button--primary', () => void this.#export({ format: 'png' }));
    const browserPrint = button('浏览器打印', 'ol-print-button', () => void this.#export({ format: 'browser-print', documentTitle: this.#draft.title }));
    browserPrint.disabled = !this.#capabilities.browserPrint;
    const recoverablePreviewFailure = validation.issues.some((issue) => isRecoverableResourceIssue(issue.code)) || this.#previewUiState === 'error';
    const finalPreview = button(recoverablePreviewFailure ? '重试资源并刷新' : '刷新最终预览', 'ol-print-button', () => void this.#previewPage('final'));
    const structuralPreviewIssue = validation.issues.some((issue) => !isRecoverableResourceIssue(issue.code));
    finalPreview.disabled =
      this.#draftError !== undefined ||
      this.session.plan === undefined ||
      structuralPreviewIssue ||
      (!validation.canPreview && !validation.issues.some((issue) => isRecoverableResourceIssue(issue.code)));
    const blocked =
      this.#draftError !== undefined ||
      validation.issues.length > 0 ||
      (acknowledgementWarnings.length > 0 && this.#acknowledgedValidationRevision !== validation.revision);
    png.disabled = blocked;
    if (blocked) browserPrint.disabled = true;
    this.#content.append(
      actionBar(
        button('返回图例', 'ol-print-button', () => this.#goTo(3)),
        finalPreview,
        png,
        browserPrint
      )
    );
  }

  #finalChecklist(): HTMLElement {
    const validation = this.session.validation;
    const codes = [...validation.issues, ...validation.warnings].map((entry) => entry.code.toLowerCase());
    const has = (...patterns: string[]): boolean => codes.some((code) => patterns.some((pattern) => code.includes(pattern)));
    const list = element('ul', 'ol-print-checklist');
    const item = (label: string, state: string, blocked = false): void => {
      const row = element('li', blocked ? 'is-blocked' : 'is-ready');
      row.append(element('strong', undefined, label), document.createTextNode(`：${state}`));
      list.append(row);
    };
    item('范围', this.session.plan === undefined ? '未解析，阻止输出' : `${rangeLabel(this.#draft.rangeMode)}已解析`, this.session.plan === undefined);
    item(
      '比例尺',
      this.session.plan === undefined ? '等待规划' : `最终 1∶${formatInteger(this.session.plan.range.denominator)}`,
      this.session.plan === undefined
    );
    item('页面与图例溢出', has('overflow') ? '检测到溢出，请修正' : '未检测到溢出', has('overflow'));
    item('来源警告', validation.warnings.length === 0 ? '无' : `${validation.warnings.length} 项，导出前逐项确认`);
    item('资源与 CORS', has('resource', 'cors', 'tile', 'font') ? '存在资源加载或跨域提示' : '当前无资源/CORS 阻断', has('resource', 'cors'));
    item('像素预算', has('pixel', 'canvas', 'dimension') ? '超出或接近平台限制' : '在当前平台限制内', has('pixel', 'canvas', 'dimension'));
    item('动画快照', animationChecklistLabel(this.#draft.content.animations));
    item('浏览器打印限制', this.#capabilities.browserPrint ? '须选择实际大小/100%，并关闭浏览器页眉页脚' : '当前环境不可用');
    const wrapper = element('section', 'ol-print-checklist-panel');
    wrapper.append(element('h3', undefined, '输出前检查清单'), list);
    return wrapper;
  }

  #legendLayoutEditor(result: Readonly<PrintLegendResult>): HTMLElement {
    const layout = this.#manualLegend(result).layout;
    const position = layout?.position ?? 'bottom-left';
    const wrapper = element('fieldset', 'ol-print-legend-layout');
    wrapper.append(element('legend', undefined, '图例版式'));
    const form = element('div', 'ol-print-form');
    form.append(
      numberField('列数', layout?.columns ?? 1, 1, 8, 1, (value) => this.#updateLegendLayout(result, { columns: value })),
      selectField(
        '排列方向',
        layout?.direction ?? 'row',
        [
          ['column', '按列填充'],
          ['row', '按行填充']
        ],
        (value) => this.#updateLegendLayout(result, { direction: value as 'row' | 'column' })
      ),
      selectField(
        '图例位置',
        position,
        [
          ['top-left', '左上'],
          ['top-right', '右上'],
          ['bottom-left', '左下'],
          ['bottom-right', '右下']
        ],
        (value) => this.#updateLegendLayout(result, { position: value as NonNullable<PrintLegendLayoutSpec['position']> })
      ),
      numberField('最大宽度（mm）', layout?.maxWidthMm ?? 80, 10, 1000, 1, (value) => this.#updateLegendLayout(result, { maxWidthMm: value })),
      numberField('内边距（mm）', uniformPadding(layout?.paddingMm, 2), 0, 100, 0.5, (value) => this.#updateLegendLayout(result, { paddingMm: value })),
      this.#symbolColorField('背景', 'legend-layout:background', layout?.background ?? '#ffffff', (value) =>
        this.#updateLegendLayout(result, { background: value })
      ),
      numberField('组间距（mm）', layout?.groupGapMm ?? 2, 0, 100, 0.5, (value) => this.#updateLegendLayout(result, { groupGapMm: value })),
      numberField('条目间距（mm）', layout?.itemGapMm ?? 1, 0, 100, 0.5, (value) => this.#updateLegendLayout(result, { itemGapMm: value }))
    );
    wrapper.append(form);
    return wrapper;
  }

  #legendGroupEditor(
    group: Readonly<PrintLegendGroup>,
    index: number,
    groups: readonly Readonly<PrintLegendGroup>[],
    result: Readonly<PrintLegendResult>
  ): HTMLElement {
    const row = element('div', 'ol-print-legend-editor__group-row');
    const collapsed = this.#collapsedLegendGroups.has(group.id);
    const actionKey = `legend-group-collapse:${group.id}`;
    const collapse = button(collapsed ? '展开' : '折叠', 'ol-print-icon-button ol-print-legend-editor__collapse', () => {
      if (collapsed) this.#collapsedLegendGroups.delete(group.id);
      else this.#collapsedLegendGroups.add(group.id);
      this.#renderPreservingActionFocus(actionKey);
    });
    collapse.dataset.printAction = actionKey;
    collapse.setAttribute('aria-label', `${collapsed ? '展开' : '折叠'}图例分组 ${group.title}`);
    collapse.setAttribute('aria-expanded', String(!collapsed));
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.checked = group.visible !== false;
    visible.setAttribute('aria-label', `显示图例分组 ${group.title}`);
    visible.addEventListener('change', () => this.#updateLegendGroup(group.id, result, { visible: visible.checked }));
    const title = document.createElement('input');
    title.type = 'text';
    title.value = group.title;
    title.setAttribute('aria-label', `分组标题 ${group.title}`);
    title.addEventListener('change', () => this.#updateLegendGroup(group.id, result, { title: title.value }));
    const up = button('↑', 'ol-print-icon-button', () => this.#moveLegendGroup(group.id, -1, result));
    up.setAttribute('aria-label', `上移分组 ${group.title}`);
    up.disabled = index === 0;
    const down = button('↓', 'ol-print-icon-button', () => this.#moveLegendGroup(group.id, 1, result));
    down.setAttribute('aria-label', `下移分组 ${group.title}`);
    down.disabled = index === groups.length - 1;
    const automatic = this.#manualLegend(result).items.some((item) => item.groupId === group.id && item.sourceKey !== undefined);
    const remove = button(automatic ? '从输出隐藏分组' : '删除分组', 'ol-print-button ol-print-button--danger', () =>
      this.#removeLegendGroup(group.id, result)
    );
    remove.setAttribute('aria-label', automatic ? `从输出隐藏分组 ${group.title}` : `删除分组 ${group.title} 及其条目`);
    row.append(collapse, visible, title, up, down, remove);
    return row;
  }

  #legendEditorRow(
    item: Readonly<PrintLegendItem>,
    index: number,
    groupItems: readonly Readonly<PrintLegendItem>[],
    result: Readonly<PrintLegendResult>
  ): HTMLElement {
    const row = element('div', 'ol-print-legend-editor__row');
    const primary = element('div', 'ol-print-legend-editor__primary');
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.checked = item.visible !== false;
    visible.setAttribute('aria-label', `显示图例项 ${item.label}`);
    visible.addEventListener('change', () => this.#updateLegendItem(item.id, result, { visible: visible.checked }));
    const label = document.createElement('input');
    label.type = 'text';
    label.value = item.label;
    label.setAttribute('aria-label', '图例名称');
    label.addEventListener('change', () => this.#updateLegendItem(item.id, result, { label: label.value }));
    const group = document.createElement('select');
    group.setAttribute('aria-label', `设置 ${item.label} 的所属分组`);
    const manual = this.#manualLegend(result);
    for (const candidate of orderedGroups(manual.groups)) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.title;
      option.selected = candidate.id === item.groupId;
      group.append(option);
    }
    group.addEventListener('change', () =>
      this.#updateLegendItem(item.id, result, { groupId: group.value, order: lastItemOrder(manual.items, group.value) + 1 })
    );
    const up = button('↑', 'ol-print-icon-button', () => this.#moveLegendItem(item.id, -1, result));
    up.setAttribute('aria-label', `上移 ${item.label}`);
    up.disabled = index === 0;
    const down = button('↓', 'ol-print-icon-button', () => this.#moveLegendItem(item.id, 1, result));
    down.setAttribute('aria-label', `下移 ${item.label}`);
    down.disabled = index === groupItems.length - 1;
    const remove = button(item.sourceKey === undefined ? '删除条目' : '从输出隐藏', 'ol-print-button ol-print-button--danger', () =>
      this.#removeLegendItem(item.id, result)
    );
    remove.setAttribute('aria-label', item.sourceKey === undefined ? `删除图例项 ${item.label}` : `从输出隐藏图例项 ${item.label}`);
    primary.append(visible, label, group, up, down, remove);
    row.append(primary, this.#legendSymbolEditor(item, result));
    return row;
  }

  #legendSymbolEditor(item: Readonly<PrintLegendItem>, result: Readonly<PrintLegendResult>): HTMLElement {
    const wrapper = element('fieldset', 'ol-print-symbol-editor');
    wrapper.append(element('legend', undefined, `${item.label} 的符号`));
    const kind = document.createElement('select');
    kind.setAttribute('aria-label', `设置 ${item.label} 的符号类型`);
    for (const [value, label] of [
      ['point', '点'],
      ['line', '线'],
      ['polygon', '面'],
      ['icon', '图标']
    ] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = item.symbol.kind === value;
      kind.append(option);
    }
    const details = element('div', 'ol-print-symbol-editor__details');
    const renderDetails = (symbolKind: PrintLegendSymbolSpec['kind'], symbol = item.symbol): void => {
      details.replaceChildren();
      if (symbolKind === 'icon') {
        const icon = symbol.kind === 'icon' ? symbol : undefined;
        details.append(this.#iconSymbolEditor(item, result, icon));
        return;
      }
      if (symbolKind === 'point') {
        const point = symbolForKind('point', symbol);
        const stroke = point.stroke ?? { color: '#1f2937', widthMm: 0.25 };
        details.append(
          this.#symbolColorField('点填充颜色', `${item.id}:point-fill`, point.fill?.color ?? 'transparent', (color) =>
            this.#updateLegendSymbol(item.id, result, (current) => ({ ...symbolForKind('point', current), fill: { color } }))
          ),
          this.#symbolColorField('点描边颜色', `${item.id}:point-stroke`, stroke.color, (color) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('point', current);
              return { ...live, stroke: { ...(live.stroke ?? stroke), color } };
            })
          ),
          this.#symbolNumberField('点半径（mm）', `${item.id}:point-radius`, point.radiusMm, 0.1, 1.8, 0.1, (value) =>
            this.#updateLegendSymbol(item.id, result, (current) => ({ ...symbolForKind('point', current), radiusMm: value }))
          ),
          this.#symbolNumberField('点描边宽度（mm）', `${item.id}:point-stroke-width`, stroke.widthMm, 0.05, 4, 0.05, (value) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('point', current);
              return { ...live, stroke: { ...(live.stroke ?? stroke), widthMm: value } };
            })
          )
        );
      } else if (symbolKind === 'line') {
        const line = symbolForKind('line', symbol);
        details.append(
          this.#symbolColorField('线颜色', `${item.id}:line-color`, line.stroke.color, (color) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('line', current);
              return { ...live, stroke: { ...live.stroke, color } };
            })
          ),
          this.#symbolNumberField('线宽（mm）', `${item.id}:line-width`, line.stroke.widthMm, 0.05, 4, 0.05, (value) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('line', current);
              return { ...live, stroke: { ...live.stroke, widthMm: value } };
            })
          ),
          this.#symbolDashField('线虚线（mm）', `${item.id}:line-dash`, line.stroke.dashMm, (dashMm) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('line', current);
              return { ...live, stroke: strokeWithDash(live.stroke, dashMm) };
            })
          )
        );
      } else {
        const polygon = symbolForKind('polygon', symbol);
        const stroke = polygon.stroke ?? { color: '#1f2937', widthMm: 0.25 };
        details.append(
          this.#symbolColorField('面填充颜色', `${item.id}:polygon-fill`, polygon.fill?.color ?? 'transparent', (color) =>
            this.#updateLegendSymbol(item.id, result, (current) => ({ ...symbolForKind('polygon', current), fill: { color } }))
          ),
          this.#symbolColorField('轮廓颜色', `${item.id}:polygon-stroke`, stroke.color, (color) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('polygon', current);
              return { ...live, stroke: { ...(live.stroke ?? stroke), color } };
            })
          ),
          this.#symbolNumberField('轮廓线宽（mm）', `${item.id}:polygon-stroke-width`, stroke.widthMm, 0.05, 4, 0.05, (value) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('polygon', current);
              return { ...live, stroke: { ...(live.stroke ?? stroke), widthMm: value } };
            })
          ),
          this.#symbolDashField('轮廓虚线（mm）', `${item.id}:polygon-dash`, stroke.dashMm, (dashMm) =>
            this.#updateLegendSymbol(item.id, result, (current) => {
              const live = symbolForKind('polygon', current);
              return { ...live, stroke: strokeWithDash(live.stroke ?? stroke, dashMm) };
            })
          )
        );
      }
    };
    renderDetails(item.symbol.kind);
    kind.addEventListener('change', () => {
      const symbolKind = kind.value as PrintLegendSymbolSpec['kind'];
      if (symbolKind === 'icon') {
        this.#clearLegendFieldErrors(item.id);
        this.#syncDraftValidity();
        renderDetails(symbolKind);
        return;
      }
      this.#clearLegendFieldErrors(item.id);
      this.#abortIconValidation(item.id);
      this.#updateLegendItem(item.id, result, { symbol: symbolForKind(symbolKind, item.symbol) });
    });
    wrapper.append(field('符号类型', kind), details);
    return wrapper;
  }

  #symbolColorField(label: string, fieldId: string, value: string, update: (color: string) => void): HTMLElement {
    const invalid = this.#invalidNumericFields.get(fieldId);
    return editableColorField(
      label,
      value,
      update,
      (rawValue) => this.#invalidateNumericField(fieldId, rawValue, `${label}必须是浏览器可识别的颜色`),
      () => {
        this.#invalidNumericFields.delete(fieldId);
      },
      invalid?.value
    );
  }

  #symbolDashField(label: string, fieldId: string, value: readonly number[] | undefined, update: (dashMm: readonly number[] | undefined) => void): HTMLElement {
    return validatedTextField(
      label,
      value?.join(', ') ?? '',
      parseDash,
      (dashMm) => update(dashMm.length === 0 ? undefined : dashMm),
      (rawValue) => this.#invalidateNumericField(fieldId, rawValue, `${label}必须是非负有限数值序列，且至少有一段大于 0`),
      () => {
        this.#invalidNumericFields.delete(fieldId);
      }
    );
  }

  #symbolNumberField(label: string, fieldId: string, value: number, min: number, max: number, step: number, update: (value: number) => void): HTMLElement {
    const invalid = this.#invalidNumericFields.get(fieldId);
    return numberField(
      label,
      value,
      min,
      max,
      step,
      (next) => {
        this.#invalidNumericFields.delete(fieldId);
        update(next);
      },
      {
        ...(invalid === undefined ? {} : { invalidValue: invalid.value }),
        invalid: (message, rawValue) => this.#invalidateNumericField(fieldId, rawValue, message)
      }
    );
  }

  #iconSymbolEditor(item: Readonly<PrintLegendItem>, result: Readonly<PrintLegendResult>, symbol: Readonly<PrintIconLegendSymbol> | undefined): HTMLElement {
    const draft: MutableIconLegendDraft = {
      src: symbol?.src ?? '',
      width: symbol?.size[0] ?? 24,
      height: symbol?.size[1] ?? 24,
      anchorX: symbol?.anchor[0] ?? 0.5,
      anchorY: symbol?.anchor[1] ?? 0.5,
      crossOrigin: symbol?.crossOrigin ?? ''
    };
    const editor = element('div', 'ol-print-symbol-editor__icon');
    const status = element('div', 'ol-print-symbol-editor__status');
    status.setAttribute('aria-live', 'polite');
    const validate = (): void => void this.#validateIconAndUpdate(item.id, result, draft, status);
    editor.append(
      textField(
        '图标地址',
        draft.src,
        (value) => {
          draft.src = value;
          validate();
        },
        'https://example.com/icon.png'
      ),
      numberField('图标宽度', draft.width, 0.1, 100000, 0.1, (value) => {
        draft.width = value;
        validate();
      }),
      numberField('图标高度', draft.height, 0.1, 100000, 0.1, (value) => {
        draft.height = value;
        validate();
      }),
      numberField('锚点 X', draft.anchorX, -100000, 100000, 0.1, (value) => {
        draft.anchorX = value;
        validate();
      }),
      numberField('锚点 Y', draft.anchorY, -100000, 100000, 0.1, (value) => {
        draft.anchorY = value;
        validate();
      }),
      selectField(
        '跨域模式',
        draft.crossOrigin,
        [
          ['', '不设置'],
          ['anonymous', '匿名请求'],
          ['use-credentials', '携带凭据']
        ],
        (value) => {
          draft.crossOrigin = value as MutableIconLegendDraft['crossOrigin'];
          validate();
        }
      ),
      button('验证并应用图标', 'ol-print-button', validate),
      status
    );
    return editor;
  }

  #renderPaper(): void {
    this.#preview.replaceChildren();
    const actual = this.#step === 4 && this.#previewDisplayMode === 'actual';
    this.#preview.classList.toggle('ol-print-dialog__preview--actual', actual);
    const label = element('div', 'ol-print-dialog__preview-label', this.#previewLabel(actual));
    label.setAttribute('aria-live', 'polite');
    const shell = element('div', `ol-print-paper ol-print-paper--${this.#draft.orientation} ol-print-paper--${actual ? 'actual' : 'fit'}`);
    const pixelSize = this.session.plan?.outputSizePx;
    const pageSize = this.session.plan?.pageSizeMm ?? draftPageSize(this.#draft);
    shell.style.aspectRatio = `${pageSize[0]} / ${pageSize[1]}`;
    if (actual && pixelSize !== undefined) {
      shell.style.width = `${pixelSize[0]}px`;
      shell.style.height = `${pixelSize[1]}px`;
    }
    if (this.#previewUrl !== undefined) {
      const image = document.createElement('img');
      image.src = this.#previewUrl;
      image.alt = '完整地图打印页面预览';
      if (actual && pixelSize !== undefined) {
        image.style.width = `${pixelSize[0]}px`;
        image.style.height = `${pixelSize[1]}px`;
      }
      shell.append(image);
    } else {
      const header = element('div', 'ol-print-paper__header');
      const metadata = element('span', 'ol-print-paper__header-metadata');
      metadata.append(
        element('span', 'ol-print-paper__header-date', this.#draft.date.length === 0 ? '' : `日期：${this.#draft.date}`),
        element('span', 'ol-print-paper__header-issuer', this.#draft.issuer.length === 0 ? '' : `签发人：${this.#draft.issuer}`)
      );
      header.append(element('span', undefined, this.#draft.classification), metadata);
      const titles = element('div', 'ol-print-paper__titles');
      titles.append(element('strong', undefined, this.#draft.title || '主标题'), element('span', undefined, this.#draft.subtitle || '副标题'));
      const map = element('div', 'ol-print-paper__map');
      const mapInner = element('div', 'ol-print-paper__map-inner');
      mapInner.append(this.#paperLegend());
      map.append(mapInner);
      const footer = element('div', 'ol-print-paper__footer');
      const scale = element('div', 'ol-print-paper__scale');
      scale.append(element('i'), element('span', undefined, `比例尺 1∶${formatInteger(this.session.plan?.range.denominator ?? this.#draft.denominator)}`));
      const north = element('div', 'ol-print-paper__north');
      north.append(element('span', undefined, 'N'), element('i'));
      footer.append(scale, north);
      shell.append(header, titles, map, footer);
    }
    if (actual) this.#preview.append(label, shell);
    else {
      const stage = element('div', 'ol-print-dialog__preview-stage');
      stage.append(shell);
      this.#preview.append(label, stage);
      this.#syncFitPaperSize();
    }
  }

  #syncFitPaperSize(): void {
    const stage = this.#preview.querySelector<HTMLElement>('.ol-print-dialog__preview-stage');
    const paper = stage?.querySelector<HTMLElement>('.ol-print-paper--fit');
    if (stage === null || stage === undefined || paper === null || paper === undefined) return;
    const availableWidth = stage.clientWidth;
    const availableHeight = stage.clientHeight;
    if (!Number.isFinite(availableWidth) || !Number.isFinite(availableHeight) || availableWidth <= 0 || availableHeight <= 0) return;
    const pageSize = this.session.plan?.pageSizeMm ?? draftPageSize(this.#draft);
    const ratio = pageSize[0] / pageSize[1];
    const width = Math.min(availableWidth, availableHeight * ratio);
    paper.style.width = `${width}px`;
    paper.style.height = `${width / ratio}px`;
  }

  #previewLabel(actual: boolean): string {
    const mode = this.#step === 4 ? `最终预览 · ${actual ? '100%' : '适合窗口'}` : '实时预览';
    const displayed =
      this.#previewRevision === undefined ? '尚无已完成预览' : `当前显示 r${this.#previewRevision} ${this.#previewQuality === 'final' ? '最终' : '草稿'}预览`;
    if (this.#previewUiState === 'updating') {
      return `${mode} · 正在更新至 r${this.#previewTargetRevision ?? '—'} · ${displayed}${this.#previewRevision === undefined ? '' : '（旧版本）'}`;
    }
    if (this.#previewUiState === 'error')
      return `${mode} · 更新失败：${this.#previewError ?? '未知错误'} · ${displayed}${this.#previewRevision === undefined ? '' : '（继续显示旧版本）'}`;
    if (this.#previewUiState === 'ready') return `${mode} · ${displayed}`;
    return `${mode} · ${displayed}`;
  }

  #paperLegend(): HTMLElement {
    const legend = element('div', 'ol-print-paper__legend');
    legend.append(element('strong', undefined, '图例'));
    const result = this.session.legendResult;
    const visibleGroups = new Set(result?.groups.filter((group) => group.visible !== false).map((group) => group.id));
    const items = result?.items.filter((item) => visibleGroups.has(item.groupId) && item.visible !== false) ?? [];
    const manual = this.session.spec?.legend;
    if (manual?.mode === 'manual') {
      const position = manual.layout?.position ?? 'bottom-left';
      legend.classList.add(`ol-print-paper__legend--${position}`);
      legend.style.background = manual.layout?.background ?? '';
      legend.style.gridTemplateColumns = `repeat(${manual.layout?.columns ?? 1}, minmax(0, 1fr))`;
      legend.style.padding = `${uniformPadding(manual.layout?.paddingMm, 2)}%`;
      legend.style.gap = `${manual.layout?.itemGapMm ?? 1}px`;
    }
    if (items.length === 0) legend.append(element('span', undefined, '自动图例将在此显示'));
    for (const item of items) {
      const row = element('span');
      const swatch = element('i');
      applySymbolSwatch(swatch, item.symbol);
      row.append(swatch, document.createTextNode(`${item.label}${item.count === undefined ? '' : ` (${item.count})`}`));
      legend.append(row);
    }
    if (items.length > 0) legend.append(element('small', 'ol-print-paper__legend-count', `共 ${items.length} 项`));
    return legend;
  }

  #liveNumberField(
    label: string,
    fieldId: string,
    value: number,
    min: number,
    max: number,
    step: number,
    update: (value: number, final: boolean) => void
  ): HTMLElement {
    const invalid = this.#invalidNumericFields.get(fieldId);
    return numberField(
      label,
      value,
      min,
      max,
      step,
      (next, final) => {
        this.#invalidNumericFields.delete(fieldId);
        update(next, final);
      },
      {
        live: this.#liveScheduler,
        ...(invalid === undefined ? {} : { invalidValue: invalid.value }),
        invalid: (message, rawValue) => this.#invalidateNumericField(fieldId, rawValue, message)
      }
    );
  }

  #invalidateNumericField(fieldId: string, value: string, message: string): void {
    this.#invalidNumericFields.set(fieldId, { value, message });
    this.#draftError = message;
    if (this.#previewTimer !== undefined) globalThis.clearTimeout(this.#previewTimer);
    this.#previewTimer = undefined;
    this.#previewUiState = 'error';
    this.#previewError = `表单无效：${message}`;
    this.#syncDraftValidity();
    this.#renderPaper();
  }

  #updateDraft<K extends keyof MutablePrintDraft>(key: K, value: MutablePrintDraft[K], final = true): void {
    this.#draft[key] = value;
    if (key === 'paperSize' && value !== 'custom') {
      this.#invalidNumericFields.delete('paperWidthMm');
      this.#invalidNumericFields.delete('paperHeightMm');
    } else if (key === 'marginMode') {
      const active = value as MutablePrintDraft['marginMode'];
      if (active === 'uniform') {
        for (const field of ['marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm']) this.#invalidNumericFields.delete(field);
      } else this.#invalidNumericFields.delete('marginMm');
    } else if (key === 'scaleMode' && value !== 'fixed') this.#invalidNumericFields.delete('denominator');
    this.#applyingLiveDraft = !final;
    const applied = this.#applyDraft();
    this.#applyingLiveDraft = false;
    if (final && draftChangeRequiresFormRender(key)) this.#renderPreservingEditorFocus();
    else {
      if (applied) this.#markPreviewUpdating(this.session.validation.revision);
      this.#syncDraftValidity();
      this.#renderPaper();
    }
    if (applied) this.#queuePreview();
  }

  #updateMarginMode(mode: MutablePrintDraft['marginMode']): void {
    if (mode === 'sides' && this.#draft.marginMode === 'uniform') {
      this.#draft.marginTopMm = this.#draft.marginMm;
      this.#draft.marginRightMm = this.#draft.marginMm;
      this.#draft.marginBottomMm = this.#draft.marginMm;
      this.#draft.marginLeftMm = this.#draft.marginMm;
    }
    this.#updateDraft('marginMode', mode);
  }

  #updateUniformMargin(value: number, final = true): void {
    this.#draft.marginTopMm = value;
    this.#draft.marginRightMm = value;
    this.#draft.marginBottomMm = value;
    this.#draft.marginLeftMm = value;
    this.#updateDraft('marginMm', value, final);
  }

  #applyDraft(legend = this.session.spec?.legend): boolean {
    const numericError = this.#invalidNumericFields.values().next().value as Readonly<{ value: string; message: string }> | undefined;
    if (numericError !== undefined) {
      this.#draftError = numericError.message;
      return false;
    }
    try {
      this.#committingDraft = true;
      this.session.update(specFromDraft(this.#draft, legend));
      this.#draftError = undefined;
      return true;
    } catch (error) {
      this.#draftError = errorMessage(error);
      return false;
    } finally {
      this.#committingDraft = false;
    }
  }

  #syncDraftFromSpec(spec: Readonly<PrintSpec>, external: boolean): void {
    Object.assign(this.#draft, draftFromSpec(spec));
    if (!external) return;
    this.#liveScheduler.cancel();
    this.#invalidNumericFields.clear();
    this.#draftError = undefined;
    for (const controller of this.#iconValidationControllers.values()) controller.abort();
    this.#iconValidationControllers.clear();
    this.#iconValidationGenerations.clear();
  }

  async #selectArea(): Promise<void> {
    if (this.#draftError !== undefined) return;
    try {
      await this.session.selectArea();
      this.#showMessage('打印范围已更新。', 'success');
      this.#queuePreview();
      this.#render();
    } catch (error) {
      if (error instanceof PrintError && error.code === 'cancelled') this.#showMessage('已取消范围选择。', 'info');
      else this.#showMessage(errorMessage(error), 'error');
    }
  }

  async #generateLegend(): Promise<void> {
    if (this.#draftError !== undefined) return;
    try {
      await this.session.generateLegend();
      this.#showMessage('自动图例已生成。', 'success');
      this.#queuePreview();
      this.#render();
    } catch (error) {
      this.#showMessage(errorMessage(error), 'error');
    }
  }

  async #restoreAutoLegend(): Promise<void> {
    for (const fieldId of [...this.#invalidNumericFields.keys()]) if (fieldId.includes(':')) this.#invalidNumericFields.delete(fieldId);
    if (this.#applyDraft({ mode: 'auto', showCounts: true })) await this.#generateLegend();
  }

  #manualLegend(result: Readonly<PrintLegendResult>): PrintManualLegendSpec {
    const current = this.session.spec?.legend;
    if (current?.mode !== 'manual') return { mode: 'manual', groups: result.groups, items: result.items };

    const resultGroups = new Map(result.groups.map((group) => [group.id, group]));
    const groups = current.groups.map((group) => ({ ...resultGroups.get(group.id), ...group }));
    for (const group of result.groups) if (!groups.some((candidate) => candidate.id === group.id)) groups.push({ ...group });

    const resultItems = new Map(result.items.map((item) => [legendItemIdentity(item), item]));
    const items = current.items.map((item) => {
      const active = resultItems.get(legendItemIdentity(item));
      if (active === undefined) return { ...item };
      return {
        ...active,
        ...item,
        symbol: active.symbol,
        ...(active.sourceKey === undefined ? {} : { sourceKey: active.sourceKey }),
        ...(active.count === undefined ? {} : { count: active.count })
      };
    });
    for (const item of result.items) if (!items.some((candidate) => legendItemIdentity(candidate) === legendItemIdentity(item))) items.push({ ...item });
    return { mode: 'manual', groups, items, ...(current.layout === undefined ? {} : { layout: current.layout }) };
  }

  #updateLegendGroup(id: string, result: Readonly<PrintLegendResult>, patch: Partial<PrintLegendGroup>): void {
    const manual = this.#manualLegend(result);
    this.#commitManualLegend({ ...manual, groups: manual.groups.map((group) => (group.id === id ? { ...group, ...patch } : group)) });
  }

  #addLegendGroup(result: Readonly<PrintLegendResult>): void {
    const manual = this.#manualLegend(result);
    const id = this.#nextManualId('group', [...manual.groups.map((group) => group.id), ...manual.items.map((item) => item.id)]);
    this.#commitManualLegend({
      ...manual,
      groups: [...manual.groups, { id, title: `新分组 ${manual.groups.length + 1}`, visible: true, order: manual.groups.length }]
    });
  }

  #removeLegendGroup(id: string, result: Readonly<PrintLegendResult>): void {
    const manual = this.#manualLegend(result);
    this.#collapsedLegendGroups.delete(id);
    for (const item of manual.items) {
      if (item.groupId !== id) continue;
      this.#abortIconValidation(item.id);
      this.#clearLegendFieldErrors(item.id);
    }
    if (manual.items.some((item) => item.groupId === id && item.sourceKey !== undefined)) {
      this.#commitManualLegend({ ...manual, groups: manual.groups.map((group) => (group.id === id ? { ...group, visible: false } : group)) });
      return;
    }
    this.#commitManualLegend({
      ...manual,
      groups: manual.groups.filter((group) => group.id !== id),
      items: manual.items.filter((item) => item.groupId !== id)
    });
  }

  #addLegendItem(result: Readonly<PrintLegendResult>): void {
    const manual = this.#manualLegend(result);
    const existingIds = [...manual.groups.map((group) => group.id), ...manual.items.map((item) => item.id)];
    const groups =
      manual.groups.length === 0 ? [{ id: this.#nextManualId('group', existingIds), title: '手动图例', visible: true, order: 0 }] : [...manual.groups];
    const groupId = orderedGroups(groups)[0]?.id;
    if (groupId === undefined) return;
    const id = this.#nextManualId('item', [...existingIds, ...groups.map((group) => group.id)]);
    this.#commitManualLegend({
      ...manual,
      groups,
      items: [
        ...manual.items,
        {
          id,
          groupId,
          label: `新条目 ${manual.items.length + 1}`,
          visible: true,
          order: lastItemOrder(manual.items, groupId) + 1,
          symbol: { kind: 'point', radiusMm: 1.5, fill: { color: '#1677ff' }, stroke: { color: '#1f2937', widthMm: 0.25 } }
        }
      ]
    });
  }

  #removeLegendItem(id: string, result: Readonly<PrintLegendResult>): void {
    const manual = this.#manualLegend(result);
    this.#abortIconValidation(id);
    this.#clearLegendFieldErrors(id);
    if (manual.items.some((item) => item.id === id && item.sourceKey !== undefined)) {
      this.#commitManualLegend({ ...manual, items: manual.items.map((item) => (item.id === id ? { ...item, visible: false } : item)) });
      return;
    }
    this.#commitManualLegend({ ...manual, items: normalizeItemOrders(manual.items.filter((item) => item.id !== id)) });
  }

  #nextManualId(kind: 'group' | 'item', existing: readonly string[]): string {
    const occupied = new Set(existing);
    let id: string;
    do {
      this.#manualIdCounter += 1;
      id = `manual-${kind}-${this.#manualIdCounter}`;
    } while (occupied.has(id));
    return id;
  }

  #moveLegendGroup(id: string, offset: -1 | 1, result: Readonly<PrintLegendResult>): void {
    const manual = this.#manualLegend(result);
    const groups = [...orderedGroups(manual.groups)];
    const index = groups.findIndex((group) => group.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= groups.length) return;
    const [moved] = groups.splice(index, 1);
    groups.splice(target, 0, moved);
    this.#commitManualLegend({ ...manual, groups: groups.map((group, order) => ({ ...group, order })) });
  }

  #updateLegendItem(id: string, result: Readonly<PrintLegendResult>, patch: Partial<PrintLegendItem>): void {
    const manual = this.#manualLegend(result);
    const items = manual.items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    this.#commitManualLegend({ ...manual, items: normalizeItemOrders(items) });
  }

  #updateLegendSymbol(id: string, result: Readonly<PrintLegendResult>, update: (symbol: Readonly<PrintLegendSymbolSpec>) => PrintLegendSymbolSpec): void {
    const current = this.session.spec?.legend;
    const manual = current?.mode === 'manual' ? current : this.#manualLegend(this.session.legendResult ?? result);
    const items = manual.items.map((item) => (item.id === id ? { ...item, symbol: update(item.symbol) } : item));
    this.#commitManualLegend({ ...manual, items: normalizeItemOrders(items) });
  }

  #moveLegendItem(id: string, offset: -1 | 1, result: Readonly<PrintLegendResult>): void {
    const manual = this.#manualLegend(result);
    const moved = manual.items.find((item) => item.id === id);
    if (moved === undefined) return;
    const groupItems = [...orderedItems(manual.items.filter((item) => item.groupId === moved.groupId))];
    const index = groupItems.findIndex((item) => item.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= groupItems.length) return;
    const [item] = groupItems.splice(index, 1);
    groupItems.splice(target, 0, item);
    const orders = new Map(groupItems.map((candidate, order) => [candidate.id, order]));
    this.#commitManualLegend({ ...manual, items: manual.items.map((candidate) => ({ ...candidate, order: orders.get(candidate.id) ?? candidate.order })) });
  }

  #updateLegendLayout(result: Readonly<PrintLegendResult>, patch: Partial<PrintLegendLayoutSpec>): void {
    const manual = this.#manualLegend(result);
    this.#commitManualLegend({ ...manual, layout: { ...manual.layout, ...patch } });
  }

  #commitManualLegend(manual: PrintManualLegendSpec): void {
    if (!this.#applyDraft(manual)) {
      this.#render();
      return;
    }
    this.#render();
    void this.#refreshManualLegend();
  }

  async #refreshManualLegend(): Promise<void> {
    try {
      await this.session.generateLegend();
      this.#queuePreview();
      this.#render();
    } catch (error) {
      this.#showMessage(errorMessage(error), 'error');
    }
  }

  async #validateIconAndUpdate(
    itemId: string,
    result: Readonly<PrintLegendResult>,
    draft: Readonly<MutableIconLegendDraft>,
    status: HTMLElement
  ): Promise<void> {
    const generation = (this.#iconValidationGenerations.get(itemId) ?? 0) + 1;
    this.#iconValidationGenerations.set(itemId, generation);
    this.#abortIconValidation(itemId, false);
    if (
      draft.src.trim().length === 0 ||
      !isPositiveFinite(draft.width) ||
      !isPositiveFinite(draft.height) ||
      !Number.isFinite(draft.anchorX) ||
      !Number.isFinite(draft.anchorY)
    ) {
      setIconStatus(status, '请输入可加载的图标地址、正数尺寸和有限锚点。', 'error');
      return;
    }
    const controller = new AbortController();
    this.#iconValidationControllers.set(itemId, controller);
    setIconStatus(status, '正在验证图标…', 'pending');
    try {
      await validateLegendImage(draft.src.trim(), draft.crossOrigin === '' ? undefined : draft.crossOrigin, {
        signal: controller.signal,
        timeoutMs: this.#draft.resources?.timeoutMs ?? 10_000
      });
      if (this.#iconValidationGenerations.get(itemId) !== generation || this.#state !== 'open') return;
      const symbol: PrintIconLegendSymbol = {
        kind: 'icon',
        src: draft.src.trim(),
        size: [draft.width, draft.height],
        anchor: [draft.anchorX, draft.anchorY],
        ...(draft.crossOrigin === '' ? {} : { crossOrigin: draft.crossOrigin })
      };
      setIconStatus(status, '图标加载成功，已应用。', 'success');
      this.#updateLegendItem(itemId, result, { symbol });
    } catch (error) {
      if (this.#iconValidationGenerations.get(itemId) !== generation || this.#state !== 'open') return;
      if (error instanceof PrintError && error.code === 'cancelled') return;
      setIconStatus(
        status,
        error instanceof PrintError && error.code === 'resource-timeout'
          ? '图标验证超时，请检查资源响应或调整资源超时时间；当前符号未提交。'
          : '图标加载失败，请检查图标地址、跨域模式或资源可用性；当前符号未提交。',
        'error'
      );
    } finally {
      if (this.#iconValidationControllers.get(itemId) === controller) this.#iconValidationControllers.delete(itemId);
    }
  }

  #abortIconValidation(itemId: string, advanceGeneration = true): void {
    this.#iconValidationControllers.get(itemId)?.abort();
    this.#iconValidationControllers.delete(itemId);
    if (advanceGeneration) this.#iconValidationGenerations.set(itemId, (this.#iconValidationGenerations.get(itemId) ?? 0) + 1);
  }

  #clearLegendFieldErrors(itemId: string): void {
    for (const fieldId of [...this.#invalidNumericFields.keys()]) if (fieldId.startsWith(`${itemId}:`)) this.#invalidNumericFields.delete(fieldId);
    if (this.#invalidNumericFields.size === 0) this.#draftError = undefined;
  }

  #queuePreview(): void {
    if (this.#draftError !== undefined) return;
    if (!this.session.validation.canPreview && !this.session.validation.issues.some((issue) => isRecoverableResourceIssue(issue.code))) return;
    if (this.#previewTimer !== undefined) globalThis.clearTimeout(this.#previewTimer);
    this.#markPreviewUpdating(this.session.validation.revision);
    this.#renderPaper();
    this.#previewTimer = globalThis.setTimeout(() => {
      this.#previewTimer = undefined;
      void this.#previewPage(this.#step === 4 ? 'final' : 'draft');
    }, 160);
  }

  async #previewPage(quality: 'draft' | 'final'): Promise<void> {
    if (this.session.plan === undefined || this.#draftError !== undefined) return;
    if (this.session.validation.issues.some((issue) => !isRecoverableResourceIssue(issue.code))) return;
    if (quality === 'final' && this.#previewTimer !== undefined) {
      globalThis.clearTimeout(this.#previewTimer);
      this.#previewTimer = undefined;
    }
    const generation = ++this.#previewGeneration;
    this.#activePreviewQuality = quality;
    this.#markPreviewUpdating(this.session.validation.revision);
    this.#renderPaper();
    try {
      const result = await this.session.preview({ quality });
      if (generation !== this.#previewGeneration || this.#state !== 'open') return;
      if (this.#previewTargetRevision !== undefined && result.revision !== this.#previewTargetRevision) return;
      this.#showPreview(result.blob, result.revision, quality);
    } catch (error) {
      if (generation !== this.#previewGeneration || this.#state !== 'open') return;
      if (!(error instanceof PrintError && error.code === 'cancelled')) {
        this.#previewUiState = 'error';
        this.#previewError = errorMessage(error);
        if (this.#step === 4) this.#render();
        else this.#renderPaper();
        this.#showMessage(this.#previewError, 'error');
      }
    } finally {
      if (generation === this.#previewGeneration) this.#activePreviewQuality = undefined;
    }
  }

  async #export(options: Parameters<PrintDialogSessionPort['export']>[0]): Promise<void> {
    if (this.#draftError !== undefined) return;
    const validation = this.session.validation;
    if (
      validation.issues.length > 0 ||
      (validation.warnings.some((warning) => warning.requiresAcknowledgement) && this.#acknowledgedValidationRevision !== validation.revision)
    ) {
      return;
    }
    try {
      const result = await this.session.export(options);
      if ('format' in result) download(result, this.#draft.title);
      else this.#showMessage('浏览器打印对话框已打开，请选择实际大小/100%。', 'success');
    } catch (error) {
      this.#showMessage(errorMessage(error), 'error');
    }
  }

  #showPreview(blob: Blob, revision: number, quality: 'draft' | 'final'): void {
    this.#revokePreviewUrl();
    this.#previewUrl = URL.createObjectURL(blob);
    this.#previewRevision = revision;
    this.#previewTargetRevision = revision;
    this.#previewQuality = quality;
    this.#previewUiState = 'ready';
    this.#previewError = undefined;
    this.#renderPaper();
  }

  #markPreviewUpdating(revision: number): void {
    this.#previewTargetRevision = revision;
    this.#previewUiState = 'updating';
    this.#previewError = undefined;
  }

  #revokePreviewUrl(): void {
    if (this.#previewUrl === undefined) return;
    URL.revokeObjectURL(this.#previewUrl);
    this.#previewUrl = undefined;
  }

  #goTo(step: number): void {
    const nextStep = Math.max(0, Math.min(steps.length - 1, step));
    if (this.#draftError !== undefined && nextStep !== this.#step) {
      this.#syncDraftValidity();
      return;
    }
    this.#step = nextStep;
    if (this.#step === 2 && this.session.legendResult === undefined && this.session.plan !== undefined) void this.#generateLegend();
    if (this.#step === 4) void this.#previewPage('final');
    this.#render();
  }

  #syncStatus(): void {
    this.#statusText.textContent = statusLabel(this.session.status);
  }

  #appendDraftError(): void {
    if (this.#draftError !== undefined) {
      const error = notice(`当前表单尚未提交：${this.#draftError}`, 'error');
      error.classList.add('ol-print-draft-error');
      this.#content.append(error);
    }
  }

  #syncDraftValidity(): void {
    const invalid = this.#draftError !== undefined;
    for (const step of this.#root.querySelectorAll<HTMLButtonElement>('.ol-print-dialog__step')) {
      step.disabled = invalid && Number(step.dataset.step) !== this.#step;
    }
    for (const action of this.#root.querySelectorAll<HTMLButtonElement>('.ol-print-requires-valid-draft')) {
      action.disabled =
        invalid ||
        (action.classList.contains('ol-print-requires-layout-ready') &&
          this.session.validation.issues.some((issue) => isLayoutStepBlockingIssue(issue.code))) ||
        (action.classList.contains('ol-print-requires-plan') &&
          (this.session.plan === undefined || this.session.validation.issues.some((issue) => !isRecoverableResourceIssue(issue.code))));
    }
    const existing = this.#content.querySelector<HTMLElement>('.ol-print-draft-error');
    if (!invalid) {
      existing?.remove();
      return;
    }
    const message = `当前表单尚未提交：${this.#draftError}`;
    if (existing !== null) {
      existing.textContent = message;
      return;
    }
    const error = notice(message, 'error');
    error.classList.add('ol-print-draft-error');
    this.#scrollContent().append(error);
  }

  #showMessage(message: string, kind: 'info' | 'success' | 'error'): void {
    const current = this.#content.querySelector('.ol-print-notice--transient');
    current?.remove();
    const messageElement = notice(message, kind);
    messageElement.classList.add('ol-print-notice--transient');
    this.#scrollContent().prepend(messageElement);
  }
}

function draftFromSpec(spec: Readonly<PrintSpec> | undefined): MutablePrintDraft {
  const size = spec?.paper.size;
  const custom = typeof size === 'object' ? size : undefined;
  const source = spec?.range.source;
  const margin = spec?.paper.marginMm;
  const marginInsets = typeof margin === 'object' ? margin : undefined;
  const uniformMargin = typeof margin === 'number' ? margin : 10;
  return {
    classification: spec?.layout.classification ?? '内部',
    title: spec?.layout.title ?? '地图打印成果图',
    subtitle: spec?.layout.subtitle ?? '专题地图',
    date: spec?.layout.date ?? new Date().toLocaleDateString('zh-CN'),
    issuer: spec?.layout.issuer ?? '',
    paperSize: custom === undefined ? (size === 'A3' ? 'A3' : 'A4') : 'custom',
    paperWidthMm: custom?.widthMm ?? 320,
    paperHeightMm: custom?.heightMm ?? 220,
    orientation: spec?.paper.orientation ?? 'landscape',
    marginMode: marginInsets === undefined ? 'uniform' : 'sides',
    marginMm: uniformMargin,
    marginTopMm: marginInsets?.top ?? uniformMargin,
    marginRightMm: marginInsets?.right ?? uniformMargin,
    marginBottomMm: marginInsets?.bottom ?? uniformMargin,
    marginLeftMm: marginInsets?.left ?? uniformMargin,
    dpi: spec?.paper.dpi ?? 150,
    rangeMode: source?.mode === 'box' ? 'box' : 'view',
    scaleMode: spec?.range.scale.mode ?? 'fit',
    denominator: spec?.range.scale.mode === 'fixed' ? spec.range.scale.denominator : 10_000,
    content: spec?.content === undefined ? { animations: 'current-frame', domOverlays: 'exclude', controls: 'exclude' } : { ...spec.content },
    resources: spec?.resources === undefined ? undefined : { ...spec.resources }
  };
}

function draftChangeRequiresFormRender(key: keyof MutablePrintDraft): boolean {
  return key === 'paperSize' || key === 'marginMode' || key === 'rangeMode' || key === 'scaleMode';
}

function specFromDraft(draft: MutablePrintDraft, legend: PrintSpec['legend']): PrintSpec {
  const source: PrintSpec['range']['source'] = draft.rangeMode === 'box' ? { mode: 'box' } : { mode: 'view' };
  return {
    range: { source, scale: draft.scaleMode === 'fixed' ? { mode: 'fixed', denominator: draft.denominator } : { mode: 'fit' } },
    paper: {
      size: draft.paperSize === 'custom' ? { widthMm: draft.paperWidthMm, heightMm: draft.paperHeightMm } : draft.paperSize,
      orientation: draft.orientation,
      marginMm:
        draft.marginMode === 'uniform'
          ? draft.marginMm
          : { top: draft.marginTopMm, right: draft.marginRightMm, bottom: draft.marginBottomMm, left: draft.marginLeftMm },
      dpi: draft.dpi
    },
    layout: {
      classification: draft.classification,
      title: draft.title,
      subtitle: draft.subtitle,
      date: draft.date,
      issuer: draft.issuer
    },
    legend: legend ?? { mode: 'auto', showCounts: true },
    content: { ...draft.content },
    ...(draft.resources === undefined ? {} : { resources: { ...draft.resources } })
  };
}

function sectionHeading(title: string, description: string): HTMLElement {
  const wrapper = element('div', 'ol-print-section-heading');
  wrapper.append(element('h2', undefined, title), element('p', undefined, description));
  return wrapper;
}

function textField(
  label: string,
  value: string,
  update: (value: string, final: boolean) => void,
  placeholder?: string,
  live?: LiveInputScheduler,
  suggestions?: Readonly<{ readonly id: string; readonly values: readonly string[] }>
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  if (placeholder !== undefined) input.placeholder = placeholder;
  let list: HTMLDataListElement | undefined;
  if (suggestions !== undefined) {
    input.setAttribute('list', suggestions.id);
    list = document.createElement('datalist');
    list.id = suggestions.id;
    for (const value of suggestions.values) {
      const option = document.createElement('option');
      option.value = value;
      list.append(option);
    }
  }
  if (live === undefined) {
    input.addEventListener('change', () => update(input.value, true));
    const wrapper = field(label, input);
    if (list !== undefined) wrapper.append(list);
    return wrapper;
  }
  let composing = false;
  let lastFinalValue = value;
  const schedule = (): void => {
    if (!composing) live.schedule(() => update(input.value, false));
  };
  const flush = (): void => {
    if (composing || input.value === lastFinalValue) return;
    lastFinalValue = input.value;
    live.flush(() => update(input.value, true));
  };
  input.addEventListener('compositionstart', () => {
    composing = true;
    live.cancel();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    schedule();
  });
  input.addEventListener('input', schedule);
  input.addEventListener('change', flush);
  input.addEventListener('blur', () => {
    flush();
    live.settle();
  });
  const wrapper = field(label, input);
  if (list !== undefined) wrapper.append(list);
  return wrapper;
}

function validatedTextField<T>(
  label: string,
  value: string,
  parse: (value: string) => T | undefined,
  update: (value: T) => void,
  invalid: (rawValue: string) => void,
  valid: () => void
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => {
    const parsed = parse(input.value);
    if (parsed === undefined) {
      input.setAttribute('aria-invalid', 'true');
      invalid(input.value);
      return;
    }
    input.setAttribute('aria-invalid', 'false');
    valid();
    update(parsed);
  });
  return field(label, input);
}

function editableColorField(
  label: string,
  value: string,
  update: (value: string) => void,
  invalid: (rawValue: string) => void,
  valid: () => void,
  invalidValue?: string
): HTMLElement {
  const text = document.createElement('input');
  text.type = 'text';
  text.value = invalidValue ?? value;
  if (invalidValue !== undefined) text.setAttribute('aria-invalid', 'true');
  text.dataset.printField = label;
  text.setAttribute('aria-label', `${label}文本值`);
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = pickerColor(value);
  picker.dataset.printField = `${label}颜色选择器`;
  picker.setAttribute('aria-label', `选择${label}`);
  const commitText = (): void => {
    const color = text.value.trim();
    if (!isCssColor(color)) {
      text.setAttribute('aria-invalid', 'true');
      invalid(text.value);
      return;
    }
    text.setAttribute('aria-invalid', 'false');
    valid();
    picker.value = pickerColor(color);
    update(color);
  };
  text.addEventListener('change', commitText);
  picker.addEventListener('change', () => {
    text.value = picker.value;
    text.setAttribute('aria-invalid', 'false');
    valid();
    update(picker.value);
  });
  const wrapper = element('div', 'ol-print-field ol-print-color-field');
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', `${label}颜色编辑`);
  wrapper.append(element('span', undefined, label), text, picker);
  return wrapper;
}

function pickerColor(value: string): string {
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(normalized)) return normalized.slice(0, 7);
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])(?:[0-9a-f])?$/i.exec(normalized);
  if (short !== null) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const rgb = rgbColor(normalized);
  if (rgb !== undefined) return rgb;
  const basic = basicNamedColors[normalized.toLowerCase()];
  if (basic !== undefined) return basic;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    if (typeof canvas.getContext === 'function') {
      const context = canvas.getContext('2d');
      if (context !== null) {
        context.fillStyle = '#010203';
        context.fillStyle = normalized;
        const resolved = String(context.fillStyle);
        if (resolved !== '#010203' || normalized.toLowerCase() === '#010203') return pickerColor(resolved);
      }
    }
  }
  return '#ffffff';
}

function rgbColor(value: string): string | undefined {
  const match = /^rgba?\((.*)\)$/i.exec(value);
  if (match === null) return undefined;
  const channels = (match[1] ?? '')
    .split('/')[0]
    ?.trim()
    .split(/\s*,\s*|\s+/u)
    .filter(Boolean)
    .slice(0, 3);
  if (channels === undefined || channels.length !== 3) return undefined;
  const parsed = channels.map((channel) => {
    const percentage = channel.endsWith('%');
    const numeric = Number(percentage ? channel.slice(0, -1) : channel);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.round(Math.max(0, Math.min(255, percentage ? (numeric / 100) * 255 : numeric)));
  });
  if (parsed.some((channel) => channel === undefined)) return undefined;
  return `#${parsed.map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`;
}

const basicNamedColors: Readonly<Record<string, string>> = Object.freeze({
  transparent: '#000000',
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff'
});

function numberField(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  update: (value: number, final: boolean) => void,
  options: Readonly<{ live?: LiveInputScheduler; invalid?: (message: string, rawValue: string) => void; invalidValue?: string }> = {}
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = options.invalidValue ?? String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  let composing = false;
  if (options.invalidValue !== undefined) input.setAttribute('aria-invalid', 'true');
  let lastFinalValue = input.value;
  const read = (): number | undefined => {
    const value = input.valueAsNumber;
    if (input.value.trim().length === 0 || !Number.isFinite(value) || value < min || value > max) {
      input.setAttribute('aria-invalid', 'true');
      options.live?.cancel();
      options.invalid?.(`${label}必须是 ${min} 至 ${max} 之间的有限数值`, input.value);
      return undefined;
    }
    input.setAttribute('aria-invalid', 'false');
    return value;
  };
  const commit = (final: boolean): void => {
    const value = read();
    if (value !== undefined) update(value, final);
  };
  if (options.live === undefined) {
    input.addEventListener('change', () => commit(true));
    return field(label, input);
  }
  const schedule = (): void => {
    if (composing) return;
    const value = read();
    if (value !== undefined) options.live?.schedule(() => update(value, false));
  };
  const flush = (): void => {
    if (composing || input.value === lastFinalValue) return;
    lastFinalValue = input.value;
    options.live?.flush(() => commit(true));
  };
  input.addEventListener('compositionstart', () => {
    composing = true;
    options.live?.cancel();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    schedule();
  });
  input.addEventListener('input', schedule);
  input.addEventListener('change', flush);
  input.addEventListener('blur', () => {
    flush();
    options.live?.settle();
  });
  return field(label, input);
}

function selectField(label: string, value: string, options: readonly (readonly [string, string])[], update: (value: string) => void): HTMLElement {
  const select = document.createElement('select');
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.append(option);
  }
  select.addEventListener('change', () => update(select.value));
  return field(label, select);
}

function field(labelText: string, control: HTMLElement): HTMLElement {
  const label = element('label', 'ol-print-field');
  control.dataset.printField = labelText;
  label.append(element('span', undefined, labelText), control);
  return label;
}

function validationPanel(issues: readonly PrintValidationIssue[], warnings: readonly PrintWarning[]): HTMLElement {
  const panel = element('div', 'ol-print-validation');
  if (issues.length === 0 && warnings.length === 0) panel.append(notice('当前检查通过。', 'success'));
  for (const issue of issues) {
    const item = notice(localizedValidationMessage(issue.code, issue.message), 'error');
    item.dataset.printValidationCode = issue.code;
    panel.append(item);
  }
  for (const warning of warnings) {
    const item = notice(localizedValidationMessage(warning.code, warning.message), 'info');
    item.dataset.printValidationCode = warning.code;
    panel.append(item);
  }
  return panel;
}

function legendList(result: Readonly<PrintLegendResult>): HTMLElement {
  const wrapper = element('div', 'ol-print-legend-list');
  for (const group of result.groups.filter((item) => item.visible !== false)) {
    const section = element('section');
    section.append(element('h3', undefined, group.title));
    for (const item of result.items.filter((candidate) => candidate.groupId === group.id && candidate.visible !== false)) {
      const row = element('p');
      const swatch = element('i');
      applySymbolSwatch(swatch, item.symbol);
      row.append(swatch, document.createTextNode(`${item.label}${item.count === undefined ? '' : ` · ${item.count}`}`));
      section.append(row);
    }
    wrapper.append(section);
  }
  return wrapper;
}

function emptyLegendResult(sourceRevision: number): PrintLegendResult {
  return { groups: [], items: [], sourceRevision, warnings: [] };
}

function actionBar(...actions: HTMLButtonElement[]): HTMLElement {
  const bar = element('div', 'ol-print-actions');
  bar.append(...actions);
  return bar;
}

function button(label: string, className: string, action: () => void): HTMLButtonElement {
  const value = element('button', className, label) as HTMLButtonElement;
  value.type = 'button';
  value.addEventListener('click', action);
  return value;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className !== undefined) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function notice(message: string, kind: 'info' | 'success' | 'error'): HTMLElement {
  return element('div', `ol-print-notice ol-print-notice--${kind}`, message);
}

function description(list: HTMLElement, term: string, value: string): void {
  list.append(element('dt', undefined, term), element('dd', undefined, value));
}

function rangeLabel(mode: MutablePrintDraft['rangeMode']): string {
  return mode === 'box' ? '地图框选' : '当前视图';
}

function statusLabel(status: PrintDialogSessionPort['status']): string {
  const labels: Record<PrintDialogSessionPort['status'], string> = {
    draft: '草稿',
    selecting: '正在选择范围',
    planning: '正在规划',
    previewing: '正在预览',
    ready: '已就绪',
    exporting: '正在导出',
    printing: '正在打印',
    cancelled: '已取消',
    destroyed: '已销毁'
  };
  return labels[status];
}

function errorMessage(error: unknown): string {
  if (error instanceof PrintError) return localizedValidationMessage(error.code, error.message);
  const message = error instanceof Error ? error.message : String(error);
  return containsChinese(message) ? message : '操作未完成，请检查当前配置后重试。';
}

const validationCopy: Readonly<Record<string, Readonly<{ title: string; message: string }>>> = Object.freeze({
  'range-unresolved': { title: '打印范围未就绪', message: '请先确认或框选打印范围。' },
  'north-direction-unavailable': { title: '指北方向不可用', message: '当前打印中心无法确定真北方向。' },
  'fixed-scale-crops-source': { title: '固定比例尺范围不足', message: '当前固定比例尺的地图框无法完整包含来源范围。' },
  'scale-valid-at-center': { title: '比例尺适用范围提示', message: '受投影影响，固定比例尺仅在打印中心准确。' },
  'animations-excluded': { title: '动画快照提示', message: '打印快照已排除动画，仅使用 Element 基础状态。' },
  'pixel-budget-exceeded': { title: '输出像素超限', message: '当前纸张与 DPI 组合超出平台输出限制，请降低 DPI 或纸张尺寸。' },
  'printer-scaling-not-guaranteed': { title: '打印比例提示', message: '实际输出比例取决于浏览器与打印机是否采用实际大小（100%）。' },
  'unknown-dynamic-style': { title: '动态样式需确认', message: '图层存在无法自动解析的动态样式，请在手动图例中确认。' },
  'legend-overflow': { title: '图例超出页面', message: '图例内容超出可用区域，请调整版式或精简条目。' },
  'layout-overflow': { title: '页面内容溢出', message: '页面内容超出可用区域，请调整纸张、边距或版式。' },
  'layer-not-printable': { title: '图层无法打印', message: '部分图层当前无法生成稳定的打印快照。' },
  'animation-snapshot-unavailable': { title: '动画快照不可用', message: '目标存在活动的交互预览，暂时无法冻结当前动画帧。' },
  'resource-load-failed': { title: '资源加载失败', message: '打印所需资源加载失败，请检查网络或资源地址后重试。' },
  'resource-not-ready': { title: '资源尚未就绪', message: '打印所需资源尚未加载完成，请稍后重试。' },
  'resource-timeout': { title: '资源加载超时', message: '打印所需资源加载超时，请检查网络后重试。' },
  'cors-tainted-canvas': { title: '跨域资源限制', message: '跨域资源未提供打印所需授权，当前页面无法安全导出。' },
  'png-encode-failed': { title: 'PNG 生成失败', message: '无法生成 PNG 文件，请重试。' },
  'pdf-encode-failed': { title: 'PDF 生成失败', message: '无法生成 PDF 文件，请检查编码器配置。' }
});

function localizedValidationMessage(code: string, message: string): string {
  const copy = validationCopy[code.toLowerCase()];
  const title = copy?.title ?? '打印检查提示';
  const body =
    containsChinese(message) && !/[A-Za-z]+(?:\s+[A-Za-z]+){2}/u.test(message)
      ? message
      : (copy?.message ?? '系统返回了一条未本地化的检查信息，请检查打印配置。');
  return `${title}：${body}`;
}

function containsChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function formatInteger(value: number): string {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)).toLocaleString('zh-CN') : '—';
}

function formatDecimal(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(2)).toLocaleString('zh-CN') : '—';
}

function formatExtent(extent: readonly number[]): string {
  return extent.map(formatDecimal).join(', ');
}

function rgbaMemoryLabel(size: readonly [number, number]): string {
  const bytes = size[0] * size[1] * 4;
  const mebibytes = bytes / (1024 * 1024);
  const level = mebibytes < 32 ? '低' : mebibytes < 128 ? '中' : '高';
  return `${mebibytes.toFixed(1)} MiB（${level}）`;
}

function animationChecklistLabel(mode: NonNullable<PrintSpec['content']>['animations']): string {
  if (mode === 'base') return '使用无动画基础态';
  return '冻结当前动画帧';
}

function isRecoverableResourceIssue(code: string): boolean {
  const normalized = code.toLowerCase();
  return ['resource', 'font', 'icon', 'tile', 'cors', 'timeout', 'not-ready'].some((part) => normalized.includes(part));
}

function isLayoutStepBlockingIssue(code: string): boolean {
  return code.toLowerCase() !== 'range-unresolved' && !isRecoverableResourceIssue(code);
}

function draftPageSize(draft: Readonly<MutablePrintDraft>): readonly [number, number] {
  const base =
    draft.paperSize === 'A4' ? ([210, 297] as const) : draft.paperSize === 'A3' ? ([297, 420] as const) : ([draft.paperWidthMm, draft.paperHeightMm] as const);
  const short = Math.min(base[0], base[1]);
  const long = Math.max(base[0], base[1]);
  return draft.orientation === 'landscape' ? [long, short] : [short, long];
}

function symbolColor(symbol: PrintLegendItem['symbol']): string {
  const value = symbol as unknown as Record<string, unknown>;
  const fill = value.fill as { readonly color?: unknown } | undefined;
  const stroke = value.stroke as { readonly color?: unknown } | undefined;
  const color = fill?.color ?? stroke?.color;
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#1677ff';
}

function applySymbolSwatch(element: HTMLElement, symbol: Readonly<PrintLegendSymbolSpec>): void {
  element.classList.add('ol-print-symbol-swatch', `ol-print-symbol-swatch--${symbol.kind}`);
  if (symbol.kind === 'point') {
    element.style.background = symbol.fill?.color ?? 'transparent';
    element.style.borderColor = symbol.stroke?.color ?? 'transparent';
    element.style.borderWidth = symbol.stroke === undefined ? '0' : `${Math.max(1, symbol.stroke.widthMm)}px`;
    return;
  }
  if (symbol.kind === 'line') {
    element.style.background = 'transparent';
    element.style.borderColor = symbol.stroke.color;
    element.style.borderWidth = `${Math.max(1, symbol.stroke.widthMm)}px 0 0`;
    element.style.borderStyle = symbol.stroke.dashMm === undefined ? 'solid' : 'dashed';
    return;
  }
  if (symbol.kind === 'polygon') {
    element.style.background = symbol.fill?.color ?? 'transparent';
    element.style.borderColor = symbol.stroke?.color ?? 'transparent';
    element.style.borderWidth = symbol.stroke === undefined ? '0' : `${Math.max(1, symbol.stroke.widthMm)}px`;
    element.style.borderStyle = symbol.stroke?.dashMm === undefined ? 'solid' : 'dashed';
    return;
  }
  element.style.backgroundImage = `url("${symbol.src.replace(/["\\]/g, '\\$&')}")`;
}

function isCssColor(value: string): boolean {
  if (value.length === 0 || /[;{}]/.test(value)) return false;
  const css = (globalThis as typeof globalThis & { CSS?: { supports(property: string, value: string): boolean } }).CSS;
  if (css?.supports !== undefined) return css.supports('color', value);
  if (fallbackNamedColors.has(value.toLowerCase())) return true;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return true;
  return isFallbackFunctionalColor(value);
}

const fallbackNamedColors = new Set([
  'transparent',
  'black',
  'silver',
  'gray',
  'white',
  'maroon',
  'red',
  'purple',
  'fuchsia',
  'green',
  'lime',
  'olive',
  'yellow',
  'navy',
  'blue',
  'teal',
  'aqua',
  'orange',
  'rebeccapurple'
]);

function isFallbackFunctionalColor(value: string): boolean {
  const match = /^(rgba?|hsla?)\((.*)\)$/i.exec(value);
  if (match === null) return false;
  const functionName = match[1]?.toLowerCase();
  const parts = match[2]?.split(',').map((part) => part.trim()) ?? [];
  const withAlpha = functionName === 'rgba' || functionName === 'hsla';
  if (parts.length !== (withAlpha ? 4 : 3)) return false;
  const alpha = withAlpha ? parts[3] : undefined;
  if (alpha !== undefined && !numberOrPercentInRange(alpha, 0, 1, 100)) return false;
  if (functionName === 'rgb' || functionName === 'rgba') return parts.slice(0, 3).every((part) => numberOrPercentInRange(part, 0, 255, 100));
  const hue = Number(parts[0]);
  return Number.isFinite(hue) && parts.slice(1, 3).every((part) => /^[-+]?\d*\.?\d+%$/.test(part) && numberOrPercentInRange(part, 0, 100, 100));
}

function numberOrPercentInRange(value: string, minimum: number, maximum: number, percentMaximum: number): boolean {
  const percent = value.endsWith('%');
  const numeric = Number(percent ? value.slice(0, -1) : value);
  return Number.isFinite(numeric) && numeric >= minimum && numeric <= (percent ? percentMaximum : maximum);
}

function parseDash(value: string): readonly number[] | undefined {
  const normalized = value.trim();
  if (normalized.length === 0) return [];
  if (/,,|,\s*,/.test(normalized)) return undefined;
  const values = normalized.split(/[\s,]+/).map(Number);
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry) || entry < 0) || values.every((entry) => entry === 0)) return undefined;
  return values;
}

function strokeWithDash<T extends Readonly<{ color: string; widthMm: number; dashMm?: readonly number[] }>>(stroke: T, dashMm: readonly number[] | undefined) {
  const base = { color: stroke.color, widthMm: stroke.widthMm };
  return dashMm === undefined || dashMm.length === 0 ? base : { ...base, dashMm };
}

function symbolForKind(kind: 'point', source: Readonly<PrintLegendSymbolSpec>): Extract<PrintLegendSymbolSpec, { readonly kind: 'point' }>;
function symbolForKind(kind: 'line', source: Readonly<PrintLegendSymbolSpec>): Extract<PrintLegendSymbolSpec, { readonly kind: 'line' }>;
function symbolForKind(kind: 'polygon', source: Readonly<PrintLegendSymbolSpec>): Extract<PrintLegendSymbolSpec, { readonly kind: 'polygon' }>;
function symbolForKind(
  kind: Exclude<PrintLegendSymbolSpec['kind'], 'icon'>,
  source: Readonly<PrintLegendSymbolSpec>
): Exclude<PrintLegendSymbolSpec, { readonly kind: 'icon' }>;
function symbolForKind(kind: Exclude<PrintLegendSymbolSpec['kind'], 'icon'>, source: Readonly<PrintLegendSymbolSpec>): PrintLegendSymbolSpec {
  const color = symbolColor(source);
  if (kind === 'point') {
    return source.kind === 'point'
      ? { ...source }
      : { kind: 'point', radiusMm: 1.5, fill: { color }, stroke: { color: '#1f2937', widthMm: source.kind === 'line' ? source.stroke.widthMm : 0.25 } };
  }
  if (kind === 'line') {
    if (source.kind === 'line') return { ...source, stroke: { ...source.stroke } };
    const widthMm = source.kind === 'polygon' ? (source.stroke?.widthMm ?? 0.5) : 0.5;
    return { kind: 'line', stroke: { color, widthMm } };
  }
  if (source.kind === 'polygon') {
    return {
      ...source,
      ...(source.fill === undefined ? {} : { fill: { ...source.fill } }),
      ...(source.stroke === undefined ? {} : { stroke: { ...source.stroke } })
    };
  }
  const widthMm = source.kind === 'line' ? source.stroke.widthMm : 0.25;
  return { kind: 'polygon', fill: { color }, stroke: { color: '#1f2937', widthMm } };
}

function orderedGroups(groups: readonly Readonly<PrintLegendGroup>[]): readonly Readonly<PrintLegendGroup>[] {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((left, right) => (left.group.order ?? left.index) - (right.group.order ?? right.index))
    .map(({ group }) => group);
}

function orderedItems(items: readonly Readonly<PrintLegendItem>[]): readonly Readonly<PrintLegendItem>[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (left.item.order ?? left.index) - (right.item.order ?? right.index))
    .map(({ item }) => item);
}

function normalizeItemOrders(items: readonly Readonly<PrintLegendItem>[]): readonly PrintLegendItem[] {
  const orders = new Map<string, number>();
  const groupIds = [...new Set(items.map((item) => item.groupId))];
  for (const groupId of groupIds) {
    for (const [order, item] of orderedItems(items.filter((candidate) => candidate.groupId === groupId)).entries()) orders.set(item.id, order);
  }
  return items.map((item) => ({ ...item, order: orders.get(item.id) ?? item.order }));
}

function lastItemOrder(items: readonly Readonly<PrintLegendItem>[], groupId: string): number {
  return Math.max(-1, ...items.filter((item) => item.groupId === groupId).map((item, index) => item.order ?? index));
}

function legendItemIdentity(item: Readonly<PrintLegendItem>): string {
  if (item.sourceKey === undefined) return `id:${item.id}`;
  const styleMarker = item.sourceKey.lastIndexOf('|style:');
  return `source:${styleMarker < 0 ? item.sourceKey : item.sourceKey.slice(0, styleMarker)}`;
}

function uniformPadding(value: PrintLegendLayoutSpec['paddingMm'], fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === 'number') return value;
  return value.top;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function setIconStatus(element: HTMLElement, message: string, kind: 'pending' | 'success' | 'error'): void {
  element.className = `ol-print-symbol-editor__status ol-print-symbol-editor__status--${kind}`;
  element.textContent = message;
}

function validateLegendImage(
  source: string,
  crossOrigin: PrintIconLegendSymbol['crossOrigin'],
  options: Readonly<{ signal: AbortSignal; timeoutMs: number }>
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.Image !== 'function') {
      reject(new Error('Image loading is unavailable'));
      return;
    }
    if (options.signal.aborted) {
      reject(new PrintError('cancelled', 'Legend icon validation was cancelled'));
      return;
    }
    const image = new globalThis.Image();
    let settled = false;
    const release = (): void => {
      image.onload = null;
      image.onerror = null;
      options.signal.removeEventListener('abort', abort);
      globalThis.clearTimeout(timer);
      if (typeof image.removeAttribute === 'function') image.removeAttribute('src');
      else image.src = '';
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      release();
      if (error === undefined) resolve();
      else reject(error);
    };
    const abort = (): void => finish(new PrintError('cancelled', 'Legend icon validation was cancelled'));
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 10_000;
    const timer = globalThis.setTimeout(() => finish(new PrintError('resource-timeout', 'Legend icon validation timed out')), timeoutMs);
    if (crossOrigin !== undefined) image.crossOrigin = crossOrigin;
    options.signal.addEventListener('abort', abort, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(new PrintError('resource-load-failed', 'Legend icon failed to load'));
    image.src = source;
  });
}

function download(result: Extract<PrintDialogExportResult, { readonly format: 'png' | 'pdf' }>, title: string): void {
  const url = URL.createObjectURL(result.blob);
  let releaseQueued = false;
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFilename(title)}.${result.format}`;
    anchor.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    releaseQueued = true;
  } finally {
    if (!releaseQueued) URL.revokeObjectURL(url);
  }
}

function safeFilename(value: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return normalized.length === 0 ? '地图打印' : normalized;
}
