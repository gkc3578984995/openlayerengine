import type { AnimationStatus } from '../../core/animation/types.js';
import type { AnimationHandle } from './types.js';

export interface AnimationHandleController {
  pause(id: string): void;
  resume(id: string): void;
  stop(id: string): void;
}

export class AnimationHandleImpl implements AnimationHandle {
  readonly id: string;
  readonly finished: Promise<void>;
  readonly #controller: AnimationHandleController;
  readonly #resolveFinished: () => void;
  #status: AnimationStatus;

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

  get status(): AnimationStatus {
    return this.#status;
  }

  pause(): void {
    if (!isTerminal(this.#status)) this.#controller.pause(this.id);
  }

  resume(): void {
    if (!isTerminal(this.#status)) this.#controller.resume(this.id);
  }

  stop(): void {
    if (this.#status !== 'stopped') this.#controller.stop(this.id);
  }

  setStatus(status: AnimationStatus): void {
    if (isTerminal(this.#status)) return;
    this.#status = status;
    if (isTerminal(status)) this.#resolveFinished();
  }
}

function isTerminal(status: AnimationStatus): boolean {
  return status === 'stopped' || status === 'finished';
}
