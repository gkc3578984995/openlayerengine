import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import { runFinalizers } from '../../core/common/dispose.js';
import type { InputEventMap, InputPort, InputType } from '../../core/ports/InputPort.js';

/** 决定右键事件由活动交互消费还是继续分发。 */
export type ContextMenuArbiter = (event: InputEventMap['rightclick']) => 'consume' | 'pass';

/** 保存一个输入事件监听器及其内部 ID。 */
interface ListenerRecord {
  /** 监听器 ID。 */
  readonly id: number;
  /** 输入事件监听函数。 */
  readonly listener: (event: InputEventMap[InputType]) => void;
}

/** 复用底层输入订阅并统一分发地图输入事件。 */
export class InputRouter {
  /** 底层输入端口。 */
  readonly #port: InputPort;
  /** 按事件类型保存的监听器。 */
  readonly #listeners = new Map<InputType, Map<number, ListenerRecord>>();
  /** 各底层事件订阅的释放函数。 */
  readonly #portDisposers = new Map<InputType, () => void>();
  /** 下一个监听器 ID。 */
  #nextListenerId = 0;
  /** 当前右键事件仲裁器。 */
  #contextMenuArbiter: ContextMenuArbiter | undefined;
  /** 路由器是否已销毁。 */
  #disposed = false;

  /** 创建路由器并预先监听右键事件。 */
  constructor(port: InputPort) {
    this.#port = port;
    this.#install('rightclick');
  }

  /** 订阅指定类型的输入事件。 */
  on<T extends InputType>(type: T, listener: (event: InputEventMap[T]) => void): () => void {
    this.#assertActive();
    assertInputType(type);
    if (typeof listener !== 'function') throw new InvalidArgumentError('Input listener must be a function');
    let records = this.#listeners.get(type);
    if (records === undefined) {
      records = new Map();
      this.#listeners.set(type, records);
    }
    const id = ++this.#nextListenerId;
    records.set(id, { id, listener: listener as (event: InputEventMap[InputType]) => void });
    try {
      this.#install(type);
    } catch (error) {
      records.delete(id);
      if (records.size === 0) this.#listeners.delete(type);
      throw error;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#listeners.get(type);
      current?.delete(id);
      if (current?.size === 0) {
        this.#listeners.delete(type);
        if (type !== 'rightclick') this.#uninstall(type);
      }
    };
  }

  /** 注册唯一的右键事件仲裁器。 */
  setContextMenuArbiter(arbiter: ContextMenuArbiter): () => void {
    this.#assertActive();
    if (typeof arbiter !== 'function') throw new InvalidArgumentError('Context-menu arbiter must be a function');
    if (this.#contextMenuArbiter !== undefined) throw new InvalidArgumentError('A context-menu arbiter is already registered');
    this.#contextMenuArbiter = arbiter;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.#contextMenuArbiter === arbiter) this.#contextMenuArbiter = undefined;
    };
  }

  /** 释放全部监听器和底层订阅。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
    this.#contextMenuArbiter = undefined;
    const disposers = [...this.#portDisposers.values()];
    this.#portDisposers.clear();
    runFinalizers(disposers);
  }

  /** 确保指定底层事件已安装订阅。 */
  #install(type: InputType): void {
    if (this.#portDisposers.has(type)) return;
    const dispose = this.#port.listen(type, (event) => this.#dispatch(type, event));
    if (typeof dispose !== 'function') throw new InvalidArgumentError('Input port must return a disposer');
    this.#portDisposers.set(type, once(dispose));
  }

  /** 移除指定底层事件订阅。 */
  #uninstall(type: InputType): void {
    const dispose = this.#portDisposers.get(type);
    if (dispose === undefined) return;
    this.#portDisposers.delete(type);
    dispose();
  }

  /** 将底层事件分发给当前监听器。 */
  #dispatch<T extends InputType>(type: T, event: InputEventMap[T]): void {
    if (this.#disposed) return;
    const ids = [...(this.#listeners.get(type)?.keys() ?? [])];
    if (type === 'rightclick' && this.#contextMenuArbiter?.(event as InputEventMap['rightclick']) === 'consume') return;
    for (const id of ids) {
      const current = this.#listeners.get(type)?.get(id);
      if (current !== undefined) current.listener(event);
    }
  }

  /** 确保路由器仍可使用。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('InputRouter has been destroyed');
  }
}

/** 校验输入事件类型。 */
function assertInputType(value: unknown): asserts value is InputType {
  if (!['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick', 'keydown'].includes(value as string)) {
    throw new InvalidArgumentError('Unknown input type');
  }
}

/** 将释放函数包装为只执行一次的函数。 */
function once(dispose: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    dispose();
  };
}
