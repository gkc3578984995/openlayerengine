import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { InternalDrawSession, InternalDrawSessionEventMap } from '../services/draw/types.js';
import type { Element } from './Element.js';
import type { ElementService } from './types.js';
import type { DrawSession, DrawSessionEventMap } from './drawTypes.js';

/**
 * 把内部绘制状态快照映射为公共 Element 句柄。
 *
 * @typeParam T Element 携带的业务数据类型。
 * @internal
 */
export class DrawSessionFacade<T = unknown> implements DrawSession<T> {
  /** 执行实际绘制工作的内部 Session。 */
  readonly #session: InternalDrawSession<T>;
  /** 当前 Earth 的 Element 服务。 */
  readonly #elements: ElementService;
  /** 已完成绘制且尚未失效的 Element 句柄。 */
  readonly #completedElements = new Map<string, Element<T>>();
  /** Session 结束时仍然有效的绘制结果。 */
  readonly finished: Promise<readonly Element<T>[]>;

  /**
   * @param session 待包装的内部绘制 Session。
   * @param elements 当前 Earth 的公共 Element 服务。
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

  /** 当前 Session 状态。 */
  get status(): DrawSession<T>['status'] {
    return this.#session.status;
  }

  /** 本次 Session 已完成且仍存在的 Element。 */
  get results(): DrawSession<T>['results'] {
    return this.#elementsFor(this.#session.results.map(({ id }) => id));
  }

  /** 完成本次 Draw Session。 */
  finish(): void {
    this.#session.finish();
  }

  /** 取消本次 Draw Session。 */
  cancel(): void {
    this.#session.cancel();
  }

  /** 销毁 Session 并释放交互资源。 */
  destroy(): void {
    this.#session.destroy();
  }

  /** 撤销上一步绘制操作。 */
  undo(): boolean {
    return this.#session.undo();
  }

  /** 恢复上一步被撤销的绘制操作。 */
  redo(): boolean {
    return this.#session.redo();
  }

  /** 监听绘制事件，并把内部状态转换为公共 Element 句柄。 */
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

  /** 只保留仍属于本次 Session 的有效 Element。 */
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
