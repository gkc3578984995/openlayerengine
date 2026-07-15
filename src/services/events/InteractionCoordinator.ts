import { InteractionConflictError, InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { defaultErrorReporter, type ErrorReporter } from '../../core/ports/ErrorReporter.js';
import type { ContextMenuDecision, ExclusiveInteractionSession, InteractionCancelReason, InteractionPolicy, RoutedPointerEvent } from './types.js';

/** 协调绘制、编辑和变换等互斥交互会话。 */
export class InteractionCoordinator {
  /** 用于隔离上报失败的错误报告器。 */
  readonly #errorReporter: ErrorReporter;
  /** 当前占用地图输入的会话。 */
  #active: ExclusiveInteractionSession | undefined;
  /** 是否正在切换会话。 */
  #transitioning = false;
  /** 协调器是否已销毁。 */
  #disposed = false;

  /** 创建交互协调器。 */
  constructor(errorReporter: ErrorReporter = defaultErrorReporter) {
    if (typeof errorReporter !== 'function') throw new InvalidArgumentError('Error reporter must be a function');
    this.#errorReporter = errorReporter;
  }

  /** 返回当前活动会话。 */
  get active(): ExclusiveInteractionSession | undefined {
    return this.#active;
  }

  /** 按冲突策略激活交互会话。 */
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

  /** 在会话结束时释放其活动状态。 */
  release(session: ExclusiveInteractionSession): void {
    if (this.#active === session) this.#active = undefined;
  }

  /** 取消当前活动会话。 */
  cancelActive(reason: InteractionCancelReason): void {
    this.#assertActive();
    this.#assertNotTransitioning();
    assertCancelReason(reason);
    this.#cancelCurrent(reason);
  }

  /** 让活动会话优先处理右键事件。 */
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

  /** 销毁协调器并取消活动会话。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelCurrent('destroyed');
  }

  /** 执行当前会话的取消流程。 */
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

  /** 确保协调器仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('InteractionCoordinator has been destroyed');
  }

  /** 阻止交互切换过程中的重入调用。 */
  #assertNotTransitioning(): void {
    if (this.#transitioning) throw new InvalidArgumentError('Reentrant interaction transitions are not supported');
  }

  /** 隔离并上报交互处理错误。 */
  #report(error: unknown, operation: string): void {
    try {
      const result = (this.#errorReporter as (reportedError: unknown, context: object) => unknown)(error, {
        source: 'InteractionCoordinator',
        operation
      });
      void Promise.resolve(result).catch(() => undefined);
    } catch {
      // 错误上报不能影响输入路由。
    }
  }
}

/** 校验互斥交互会话接口。 */
function assertSession(value: unknown): asserts value is ExclusiveInteractionSession {
  if (value === null || typeof value !== 'object') throw new InvalidArgumentError('Interaction session must be an object');
  const session = value as Partial<ExclusiveInteractionSession>;
  if (typeof session.cancel !== 'function' || typeof session.handleContextMenu !== 'function') {
    throw new InvalidArgumentError('Interaction session must implement cancel and handleContextMenu');
  }
}

/** 校验交互取消原因。 */
function assertCancelReason(value: unknown): asserts value is InteractionCancelReason {
  if (value !== 'replaced' && value !== 'destroyed' && value !== 'cancelled') throw new InvalidArgumentError('Unknown interaction cancellation reason');
}
