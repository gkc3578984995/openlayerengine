export interface ErrorReportContext {
  /** 报错模块。 */
  readonly source: string;
  /** 报错时正在执行的操作。 */
  readonly operation?: string;
  /** 相关 Session 的 ID。 */
  readonly ownerId?: string;
  /** 便于定位问题的结构化上下文。 */
  readonly details?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

export type ErrorReporter = (error: unknown, context: ErrorReportContext) => void;

export function createAsyncErrorReporter(reporter: ErrorReporter): ErrorReporter {
  return (error, context) => {
    queueMicrotask(() => {
      try {
        void Promise.resolve(reporter(error, context)).catch(() => undefined);
      } catch {
        // 上报失败不能影响已经完成的原操作。
      }
    });
  };
}

export const defaultErrorReporter: ErrorReporter = createAsyncErrorReporter((error, context) => {
  console.error('[ol-engine]', context, error);
});
