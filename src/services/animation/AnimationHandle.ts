import type { AnimationStatus } from '../../core/animation/types.js';
import type { AnimationHandle } from './types.js';

/** 定义动画句柄委托给管理器的控制操作。 */
export interface AnimationHandleController {
  /** 暂停指定动画。 */
  pause(id: string): void;
  /** 恢复指定动画。 */
  resume(id: string): void;
  /** 停止指定动画。 */
  stop(id: string): void;
}

/** 保存动画状态并把控制命令转交给动画管理器。 */
export class AnimationHandleImpl implements AnimationHandle {
  /** 动画句柄 ID。 */
  readonly id: string;
  /** 动画进入终态时完成的 Promise。 */
  readonly finished: Promise<void>;
  /** 接收 pause、resume、stop 命令的管理器控制接口。 */
  readonly #controller: AnimationHandleController;
  /** `finished` Promise 的兑现函数。 */
  readonly #resolveFinished: () => void;
  /** 当前动画状态。 */
  #status: AnimationStatus;

  /** 创建动画句柄并初始化完成信号。 */
  constructor(id: string, controller: AnimationHandleController, status: AnimationStatus = 'running') {
    this.id = id;
    this.#controller = controller;
    this.#status = status;
    let resolveFinished!: () => void;
    this.finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    this.#resolveFinished = resolveFinished;
    if (status === 'stopped' || status === 'finished') this.#resolveFinished();
  }

  /** 返回当前动画状态。 */
  get status(): AnimationStatus {
    return this.#status;
  }

  /** 请求暂停当前动画。 */
  pause(): void {
    if (!isTerminal(this.#status)) this.#controller.pause(this.id);
  }

  /** 请求恢复当前动画。 */
  resume(): void {
    if (!isTerminal(this.#status)) this.#controller.resume(this.id);
  }

  /** 请求停止当前动画。 */
  stop(): void {
    if (this.#status !== 'stopped') this.#controller.stop(this.id);
  }

  /** 同步运行状态；首次进入终态时兑现 `finished`。 */
  setStatus(status: AnimationStatus): void {
    if (isTerminal(this.#status)) return;
    this.#status = status;
    if (isTerminal(status)) this.#resolveFinished();
  }
}

/** 判断动画状态是否已经结束。 */
function isTerminal(status: AnimationStatus): boolean {
  return status === 'stopped' || status === 'finished';
}
