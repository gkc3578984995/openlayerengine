import type { PrintFontSample, PrintPlan, PrintValidationIssue } from '../print/types.js';

/** Services 可持有但不能解读的打印地图快照生命周期。 */
export interface PrintMapSnapshotHandle {
  readonly revision: number;
  readonly animationRevision?: number;
  readonly capturedAt?: number;
  readonly expectedRenderableLeafCount: number;
  readonly fontSamples: readonly Readonly<PrintFontSample>[];
  readonly destroyed: boolean;
  destroy(): void;
}

export interface PrintMapSnapshotCaptureOptions {
  readonly animations: 'current-frame' | 'base';
}

/** 隔离 Services 与具体地图渲染实现的快照端口。 */
export interface PrintMapSnapshotPort<TSnapshot extends PrintMapSnapshotHandle = PrintMapSnapshotHandle, TFactory = unknown> {
  subscribe(listener: () => void): () => void;
  validationIssues(plan?: Readonly<PrintPlan>, factory?: TFactory): readonly Readonly<PrintValidationIssue>[];
  capture(plan: Readonly<PrintPlan>, options: Readonly<PrintMapSnapshotCaptureOptions>, factory?: TFactory): Readonly<TSnapshot>;
}
