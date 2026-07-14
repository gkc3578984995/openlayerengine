import type { InternalEditSession, InternalEditSessionEventMap } from '../services/draw/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { Element } from './Element.js';
import type { EditSession, EditSessionEventMap } from './drawTypes.js';
import type { ElementService } from './types.js';

/**
 * 将内部编辑状态映射到启动编辑时原始公开元素句柄的会话实现。
 *
 * @typeParam T 元素附加业务数据的类型。
 * @internal
 */
export class EditSessionFacade<T = unknown> implements EditSession<T> {
  readonly #session: InternalEditSession<T>;
  readonly #elements: ElementService;
  readonly element: Element<T>;
  readonly finished: Promise<Element<T> | undefined>;

  /**
   * @param session 内部编辑会话。
   * @param element 启动编辑时的公开元素句柄。
   * @param elements 当前 Earth 的公开元素服务。
   */
  constructor(session: InternalEditSession<T>, element: Element<T>, elements: ElementService) {
    this.#session = session;
    this.#elements = elements;
    this.element = element;
    this.finished = session.finished.then((state) => {
      if (state === undefined) return undefined;
      try {
        return this.#elements.get<T>(state.id) === this.element ? this.element : undefined;
      } catch {
        return undefined;
      }
    });
  }

  get status(): EditSession<T>['status'] {
    return this.#session.status;
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

  on<K extends keyof EditSessionEventMap<T>>(type: K, listener: (event: EditSessionEventMap<T>[K]) => void): () => void {
    if (typeof listener !== 'function') throw new InvalidArgumentError('Edit session listener must be a function');
    if (type === 'modifying') {
      return this.#session.on('modifying', (event) => {
        (listener as (event: EditSessionEventMap<T>['modifying']) => void)(
          Object.freeze({
            type: 'modifying',
            element: this.element,
            geometry: event.state,
            operation: event.operation,
            ...(event.coordinate === undefined ? {} : { coordinate: event.coordinate })
          })
        );
      });
    }
    if (type === 'complete') {
      return this.#session.on('complete', () => {
        (listener as (event: EditSessionEventMap<T>['complete']) => void)(Object.freeze({ type: 'complete', element: this.element }));
      });
    }
    return this.#session.on(type, listener as unknown as (event: InternalEditSessionEventMap<T>[K]) => void);
  }
}
