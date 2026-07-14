import type { ElementService } from './types.js';
import type { InternalTransformEventMap, InternalTransformSession } from '../services/transform/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { Element } from './Element.js';
import type { TransformEventMap, TransformReplaceOptions, TransformSession, TransformToolbarHandle } from './transformTypes.js';
import { TransformToolbarHandleImpl } from './TransformToolbarHandle.js';
import type { ElementCopyOptions } from '../core/element/types.js';

export class TransformSessionFacade<T = unknown> implements TransformSession<T> {
  readonly #session: InternalTransformSession<T>;
  readonly #elements: ElementService;
  readonly #knownElements = new Map<string, Element<T>>();
  #selected: Element<T> | undefined;
  #toolbarSource: InternalTransformSession<T>['toolbar'];
  #toolbarFacade: TransformToolbarHandle | undefined;

  constructor(session: InternalTransformSession<T>, elements: ElementService) {
    this.#session = session;
    this.#elements = elements;
    this.#selected = session.selectedId === undefined ? undefined : elements.get<T>(session.selectedId);
    if (this.#selected !== undefined) this.#knownElements.set(this.#selected.id, this.#selected);
    session.on('select', (event) => {
      this.#selected = this.#elements.get<T>(event.state.id);
      if (this.#selected !== undefined) this.#knownElements.set(event.state.id, this.#selected);
    });
  }

  get selected(): Element<T> | undefined {
    const id = this.#session.selectedId;
    if (id === undefined) return undefined;
    const selected = this.#elements.get<T>(id);
    if (selected !== undefined) {
      this.#selected = selected;
      this.#knownElements.set(id, selected);
    }
    return selected;
  }

  get status(): TransformSession<T>['status'] {
    return this.#session.status;
  }

  get toolbar(): TransformToolbarHandle | undefined {
    const source = this.#session.toolbar;
    if (source === undefined) {
      this.#toolbarSource = undefined;
      this.#toolbarFacade = undefined;
      return undefined;
    }
    if (source !== this.#toolbarSource) {
      this.#toolbarSource = source;
      this.#toolbarFacade = new TransformToolbarHandleImpl(source);
    }
    return this.#toolbarFacade;
  }

  select(element: Element<T>): void {
    this.#assertOwned(element);
    this.#selected = element;
    this.#knownElements.set(element.id, element);
    this.#session.select(element.id);
  }

  finish(): void {
    this.#session.finish();
  }

  cancel(): void {
    this.#session.cancel();
  }

  undo(): boolean {
    return this.#session.undo();
  }

  redo(): boolean {
    return this.#session.redo();
  }

  copy(options?: ElementCopyOptions<T>): Element<T> {
    const state = this.#session.copy(options);
    const element = this.#elements.get<T>(state.id);
    if (element === undefined) throw new ObjectDisposedError(`Copied Element is unavailable: ${state.id}`);
    return element;
  }

  replaceSelected(element: Element<T>, options?: TransformReplaceOptions): void {
    this.#assertOwned(element);
    this.#session.replaceSelected(element.id, options);
  }

  remove(): void {
    this.#session.remove();
  }

  on<K extends keyof TransformEventMap<T>>(type: K, listener: (event: TransformEventMap<T>[K]) => void): () => void {
    if (typeof listener !== 'function') throw new InvalidArgumentError('Transform listener must be a function');
    return this.#session.on(type, (event) => listener(this.#mapEvent(type, event) as TransformEventMap<T>[K]));
  }

  #mapEvent<K extends keyof TransformEventMap<T>>(type: K, event: InternalTransformEventMap<T>[K]): TransformEventMap<T>[K] {
    if (type === 'copyPreviewCancel') return Object.freeze({ type: 'copyPreviewCancel' }) as TransformEventMap<T>[K];
    if (type === 'error') return Object.freeze({ type: 'error', error: (event as InternalTransformEventMap<T>['error']).error }) as TransformEventMap<T>[K];
    const state = (event as Exclude<InternalTransformEventMap<T>[keyof InternalTransformEventMap<T>], { type: 'copyPreviewCancel' | 'error' }>).state;
    const element = this.#elements.get<T>(state.id);
    const cached = this.#knownElements.get(state.id);
    const resolved = element ?? cached;
    if (resolved === undefined) throw new ObjectDisposedError(`Transform Element is unavailable: ${state.id}`);
    if (type === 'remove') {
      this.#knownElements.delete(state.id);
      if (this.#selected?.id === state.id) this.#selected = undefined;
      return Object.freeze({ type: 'remove', element: resolved }) as TransformEventMap<T>[K];
    }
    if (element !== undefined) this.#knownElements.set(state.id, element);
    if (type !== 'selectEnd') this.#selected = resolved;
    const payload: Record<string, unknown> = { type, element: resolved };
    if (type === 'enterHandle' || type === 'leaveHandle') {
      const handleEvent = event as InternalTransformEventMap<T>['enterHandle'];
      payload.key = handleEvent.key;
      if (handleEvent.cursor !== undefined) payload.cursor = handleEvent.cursor;
    }
    return Object.freeze(payload) as TransformEventMap<T>[K];
  }

  #assertOwned(element: Element<T>): void {
    const current = this.#elements.get<T>(element.id);
    if (current !== element) throw new InvalidArgumentError('Element belongs to another Earth or generation');
  }
}
