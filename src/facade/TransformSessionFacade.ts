import type { ElementService } from './types.js';
import type { InternalTransformEventMap, InternalTransformSession } from '../services/transform/types.js';
import { InvalidArgumentError, ObjectDisposedError } from '../core/errors.js';
import type { Element } from './Element.js';
import type { TransformEventMap, TransformMode, TransformReplaceOptions, TransformSession, TransformToolbarHandle } from './transformTypes.js';
import { TransformToolbarHandleImpl } from './TransformToolbarHandle.js';
import type { ElementCopyOptions } from '../core/element/types.js';

/** 将内部 Transform Session 映射为使用公共 Element 句柄的 Session。 */
export class TransformSessionFacade<T = unknown> implements TransformSession<T> {
  /** 执行实际变换工作的内部 Session。 */
  readonly #session: InternalTransformSession<T>;
  /** 查询和校验公共 Element 句柄。 */
  readonly #elements: ElementService;
  /** 缓存事件中可能已经移除的 Element 句柄。 */
  readonly #knownElements = new Map<string, Element<T>>();
  /** 当前选中的公共 Element 句柄。 */
  #selected: Element<T> | undefined;
  /** 最近包装的内部工具栏句柄，用来识别句柄换代。 */
  #toolbarSource: InternalTransformSession<T>['toolbar'];
  /** 与内部工具栏同代的公共控制句柄。 */
  #toolbarFacade: TransformToolbarHandle | undefined;

  /** 绑定内部 Session，并同步初始选择和后续选择事件。 */
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

  /** 当前选中且仍有效的 Element。 */
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

  /** 当前 Transform Session 状态。 */
  get status(): TransformSession<T>['status'] {
    return this.#session.status;
  }

  /** 当前操作模式。 */
  get mode(): TransformMode {
    return this.#session.mode;
  }

  /** 当前工具栏句柄；内部句柄换代时同步重新包装。 */
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

  /** 校验归属后选中指定 Element。 */
  select(element: Element<T>): void {
    this.#assertOwned(element);
    this.#selected = element;
    this.#knownElements.set(element.id, element);
    this.#session.select(element.id);
  }

  /** 切换变换或编辑模式。 */
  setMode(mode: TransformMode): void {
    this.#session.setMode(mode);
  }

  /** 完成本次 Transform Session。 */
  finish(): void {
    this.#session.finish();
  }

  /** 取消本次 Transform Session。 */
  cancel(): void {
    this.#session.cancel();
  }

  /** 撤销上一步变换操作。 */
  undo(): boolean {
    return this.#session.undo();
  }

  /** 恢复上一步被撤销的变换操作。 */
  redo(): boolean {
    return this.#session.redo();
  }

  /** 复制当前 Element 并返回副本句柄。 */
  copy(options?: ElementCopyOptions<T>): Element<T> {
    const state = this.#session.copy(options);
    const element = this.#elements.get<T>(state.id);
    if (element === undefined) throw new ObjectDisposedError(`Copied Element is unavailable: ${state.id}`);
    return element;
  }

  /** 用另一个有效 Element 替换当前选择。 */
  replaceSelected(element: Element<T>, options?: TransformReplaceOptions): void {
    this.#assertOwned(element);
    this.#session.replaceSelected(element.id, options);
  }

  /** 删除当前选中的 Element。 */
  remove(): void {
    this.#session.remove();
  }

  /** 监听变换事件，并把内部状态转换为公共 Element 事件。 */
  on<K extends keyof TransformEventMap<T>>(type: K, listener: (event: TransformEventMap<T>[K]) => void): () => void {
    if (typeof listener !== 'function') throw new InvalidArgumentError('Transform listener must be a function');
    return this.#session.on(type, (event) => listener(this.#mapEvent(type, event) as TransformEventMap<T>[K]));
  }

  /** 将单个内部事件转换为公共事件载荷。 */
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

  /** 确认 Element 属于当前 Earth，且句柄仍是当前代次。 */
  #assertOwned(element: Element<T>): void {
    const current = this.#elements.get<T>(element.id);
    if (current !== element) throw new InvalidArgumentError('Element belongs to another Earth or generation');
  }
}
