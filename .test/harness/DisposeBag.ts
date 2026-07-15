import type { Earth } from '@vrsim/earth-engine-ol';

export type Cleanup = () => void;

export class DisposeBag {
  readonly #cleanups: Cleanup[] = [];
  #disposed = false;

  get isDisposed(): boolean {
    return this.#disposed;
  }

  add<T extends Cleanup>(cleanup: T): T {
    if (this.#disposed) {
      cleanup();
      return cleanup;
    }
    this.#cleanups.push(cleanup);
    return cleanup;
  }

  trackEarth<T extends Earth>(earth: T): T {
    this.add(() => earth.destroy());
    return earth;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    let firstError: unknown;
    for (const cleanup of this.#cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        firstError ??= error;
      }
    }
    this.#cleanups.length = 0;
    if (firstError !== undefined) throw firstError;
  }
}
