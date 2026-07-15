/** 内部接口。约定 ErrorReportContext 使用的数据和操作。 */
export interface ErrorReportContext {
  /** 来源。标识错误来自哪个模块。 */
  readonly source: string;
  /** 操作。保存当前内部操作。 */
  readonly operation?: string;
  /** 拥有者 ID。标识资源所属会话。 */
  readonly ownerId?: string;
  /** 详情。保存便于排查的附加数据。 */
  readonly details?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

/** 内部类型。描述 ErrorReporter 的可用数据。 */
export type ErrorReporter = (error: unknown, context: ErrorReportContext) => void;

/** 内部函数。处理 createAsyncErrorReporter 相关数据。 */
export function createAsyncErrorReporter(reporter: ErrorReporter): ErrorReporter {
  return (error, context) => {
    /** 内部方法。处理 queueMicrotask 相关操作。 */
    queueMicrotask(() => {
      try {
        void Promise.resolve(reporter(error, context)).catch(() => undefined);
      } catch {
        // 上报失败不能影响已经完成的原操作。
      }
    });
  };
}

/** 内部常量。保存 defaultErrorReporter 使用的默认值。 */
export const defaultErrorReporter: ErrorReporter = createAsyncErrorReporter((error, context) => {
  console.error('[ol-engine]', context, error);
});
