/** 依次执行全部清理函数，并在最后统一抛出错误。 */
export function runFinalizers(finalizers: Iterable<() => void>): void {
  let failed = false;
  let firstError: unknown;

  for (const finalize of finalizers) {
    try {
      finalize();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  }

  if (failed) throw firstError;
}
