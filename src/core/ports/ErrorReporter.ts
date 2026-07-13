export interface ErrorReportContext {
  readonly source: string;
  readonly operation?: string;
  readonly ownerId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

export type ErrorReporter = (error: unknown, context: ErrorReportContext) => void;

export function createAsyncErrorReporter(reporter: ErrorReporter): ErrorReporter {
  return (error, context) => {
    queueMicrotask(() => {
      try {
        reporter(error, context);
      } catch {
        // Reporting failures are isolated from the operation that already completed.
      }
    });
  };
}

export const defaultErrorReporter: ErrorReporter = createAsyncErrorReporter((error, context) => {
  console.error('[ol-engine]', context, error);
});
