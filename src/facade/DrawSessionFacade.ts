import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { InternalDrawSession, InternalDrawSessionEventMap } from '../services/draw/types.js';
import type { Element } from './Element.js';
import type { ElementService } from './types.js';
import type { DrawSession, DrawSessionEventMap } from './drawTypes.js';

/**
 * 将内部绘制状态快照映射为公开元素句柄的会话实现。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export class DrawSessionFacade<T = unknown> implements DrawSession<T> {
  readonly #session: InternalDrawSession<T>;
  readonly #elements: ElementService;
  readonly #completedElements = new Map<string, Element<T>>();
  readonly finished: Promise<readonly Element<T>[]>;

  /**
   * @param session 内部绘制会话。
   * @param elements 当前 Earth 的公开元素服务。
   */
  constructor(session: InternalDrawSession<T>, elements: ElementService) {
    this.#session = session;
    this.#elements = elements;
    this.#session.on('complete', ({ state }) => {
      const element = this.#elements.get<T>(state.id);
      if (element === undefined) throw new ObjectDisposedError(`Completed draw Element is unavailable: ${state.id}`);
      this.#completedElements.set(state.id, element);
    });
    this.finished = session.finished.then((states) => this.#elementsFor(states.map(({ id }) => id)));
  }

  get status(): DrawSession<T>['status'] {
    return this.#session.status;
  }

  get results(): DrawSession<T>['results'] {
    return this.#elementsFor(this.#session.results.map(({ id }) => id));
  }

  finish(): void {
    this.#session.finish();
  }

  cancel(): void {
    this.#session.cancel();
  }

  destroy(): void {
    this.#session.destroy();
  }

  undo(): boolean {
    return this.#session.undo();
  }

  redo(): boolean {
    return this.#session.redo();
  }

  on<K extends keyof DrawSessionEventMap<T>>(type: K, listener: (event: DrawSessionEventMap<T>[K]) => void): () => void {
    if (typeof listener !== 'function') throw new InvalidArgumentError('Draw session listener must be a function');
    if (type === 'complete') {
      return this.#session.on('complete', (event) => {
        const element = this.#completedElements.get(event.state.id);
        if (element === undefined) throw new ObjectDisposedError(`Completed draw Element is unavailable: ${event.state.id}`);
        (listener as (event: DrawSessionEventMap<T>['complete']) => void)(Object.freeze({ type: 'complete', element }));
      });
    }
    return this.#session.on(type, listener as unknown as (event: InternalDrawSessionEventMap<T>[K]) => void);
  }

  #elementsFor(ids: readonly string[]): DrawSession<T>['results'] {
    return Object.freeze(
      ids.flatMap((id) => {
        const element = this.#completedElements.get(id);
        if (element === undefined) return [];
        let current: Element<T> | undefined;
        try {
          current = this.#elements.get<T>(id);
        } catch {
          current = undefined;
        }
        return current === element ? [element] : [];
      })
    );
  }
}
