import { InteractionConflictError, InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ContextMenuDecision, ExclusiveInteractionSession, InteractionCancelReason, InteractionPolicy, RoutedPointerEvent } from './types.js';

export class InteractionCoordinator {
  readonly #errorReporter: ErrorReporter;
  #active: ExclusiveInteractionSession | undefined;
  #transitioning = false;
  #disposed = false;

  constructor(errorReporter: ErrorReporter = defaultErrorReporter) {
    if (typeof errorReporter !== 'function') throw new InvalidArgumentError('Error reporter must be a function');
    this.#errorReporter = errorReporter;
  }

  get active(): ExclusiveInteractionSession | undefined {
    return this.#active;
  }

  activate(session: ExclusiveInteractionSession, policy: InteractionPolicy = 'replace'): void {
    this.#assertActive();
    this.#assertNotTransitioning();
    assertSession(session);
    if (policy !== 'replace' && policy !== 'reject') throw new InvalidArgumentError('Unknown interaction policy');
    if (this.#active === session) return;

    const previous = this.#active;
    if (previous !== undefined && policy === 'reject') throw new InteractionConflictError();
    if (previous !== undefined) {
      this.#active = undefined;
      this.#transitioning = true;
      try {
        previous.cancel('replaced');
      } finally {
        this.#transitioning = false;
      }
      this.#assertActive();
    }
    this.#active = session;
  }

  release(session: ExclusiveInteractionSession): void {
    if (this.#active === session) this.#active = undefined;
  }

  cancelActive(reason: InteractionCancelReason): void {
    this.#assertActive();
    this.#assertNotTransitioning();
    assertCancelReason(reason);
    this.#cancelCurrent(reason);
  }

  handleContextMenu(event: RoutedPointerEvent<'rightclick'>): ContextMenuDecision {
    const active = this.#active;
    if (active === undefined || this.#disposed) return 'pass';
    try {
      const decision = active.handleContextMenu(event);
      return decision === 'consume' || decision === 'pass' ? decision : 'consume';
    } catch (error) {
      this.#report(error, 'handleContextMenu');
      return 'consume';
    }
  }

  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelCurrent('destroyed');
  }

  #cancelCurrent(reason: InteractionCancelReason): void {
    const active = this.#active;
    if (active === undefined) return;
    this.#active = undefined;
    this.#transitioning = true;
    try {
      active.cancel(reason);
    } finally {
      this.#transitioning = false;
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('InteractionCoordinator has been destroyed');
  }

  #assertNotTransitioning(): void {
    if (this.#transitioning) throw new InvalidArgumentError('Reentrant interaction transitions are not supported');
  }

  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'InteractionCoordinator',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // Error reporting must not affect input routing.
    }
  }
}

function assertSession(value: unknown): asserts value is ExclusiveInteractionSession {
  if (value === null || typeof value !== 'object') throw new InvalidArgumentError('Interaction session must be an object');
  const session = value as Partial<ExclusiveInteractionSession>;
  if (typeof session.cancel !== 'function' || typeof session.handleContextMenu !== 'function') {
    throw new InvalidArgumentError('Interaction session must implement cancel and handleContextMenu');
  }
}

function assertCancelReason(value: unknown): asserts value is InteractionCancelReason {
  if (value !== 'replaced' && value !== 'destroyed' && value !== 'cancelled') throw new InvalidArgumentError('Unknown interaction cancellation reason');
}
