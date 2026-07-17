import { InvalidArgumentError, ObjectDisposedError } from '../../core/errors.js';
import type { AnimationClockPort } from '../../core/ports/AnimationClockPort.js';
import type { AnimationWakeHandle, AnimationWakePort } from '../../core/ports/AnimationWakePort.js';

/** 构造 Earth 级动画截止时间调度器所需的依赖。 */
export interface AnimationDeadlineSchedulerDependencies {
  /** 与动画帧时间处于同一时间域的时钟。 */
  readonly clock: AnimationClockPort;
  /** 平台提供的单次唤醒能力。 */
  readonly wake: AnimationWakePort;
  /** 任一截止时间到达时唤醒统一动画 tick。 */
  readonly onWake: () => void;
}

interface DeadlineState {
  readonly timestamp: number;
  readonly revision: number;
}

interface DeadlineNode extends DeadlineState {
  readonly key: string;
}

interface ScheduledWake {
  readonly timestamp: number;
  readonly generation: number;
  handle: AnimationWakeHandle;
}

const pendingWakeHandle: AnimationWakeHandle = Object.freeze({ cancel: () => undefined });

/**
 * 把全部动画记录的阶跃边界收敛为一个最小截止时间唤醒。
 *
 * Runtime 记录只向本调度器登记绝对截止时间；实际唤醒始终回到统一动画 tick，
 * 不在定时回调中为单条记录采样或绘制。
 */
export class AnimationDeadlineScheduler {
  readonly #clock: AnimationClockPort;
  readonly #wake: AnimationWakePort;
  readonly #onWake: () => void;
  readonly #deadlines = new Map<string, DeadlineState>();
  readonly #heap: DeadlineNode[] = [];
  #nextRevision = 0;
  #nextWakeGeneration = 0;
  #scheduled: ScheduledWake | undefined;
  #disposed = false;

  /** 创建一个 Earth 独占的最小截止时间调度器。 */
  constructor(dependencies: AnimationDeadlineSchedulerDependencies) {
    if (dependencies === null || typeof dependencies !== 'object') {
      throw new InvalidArgumentError('Animation deadline scheduler dependencies must be an object');
    }
    if (dependencies.clock === null || typeof dependencies.clock !== 'object' || typeof dependencies.clock.now !== 'function') {
      throw new InvalidArgumentError('Animation deadline scheduler clock must provide now()');
    }
    if (dependencies.wake === null || typeof dependencies.wake !== 'object' || typeof dependencies.wake.scheduleAt !== 'function') {
      throw new InvalidArgumentError('Animation deadline scheduler wake must provide scheduleAt()');
    }
    if (typeof dependencies.onWake !== 'function') {
      throw new InvalidArgumentError('Animation deadline scheduler onWake must be a function');
    }
    this.#clock = dependencies.clock;
    this.#wake = dependencies.wake;
    this.#onWake = dependencies.onWake;
  }

  /** 返回当前登记的截止时间数量。 */
  get size(): number {
    return this.#deadlines.size;
  }

  /** 返回当前最早的绝对截止时间。 */
  get nextTimestamp(): number | undefined {
    return this.#peek()?.timestamp;
  }

  /** 新增或替换一个动画记录的绝对截止时间。 */
  upsert(key: string, timestamp: number): void {
    this.#assertActive();
    const safeKey = normalizeKey(key);
    const safeTimestamp = normalizeTimestamp(timestamp);
    const current = this.#deadlines.get(safeKey);
    if (current?.timestamp === safeTimestamp) return;
    const state = Object.freeze({ timestamp: safeTimestamp, revision: ++this.#nextRevision });
    this.#deadlines.set(safeKey, state);
    this.#push(Object.freeze({ key: safeKey, ...state }));
    this.#reconcileWake();
  }

  /** 删除一个动画记录的截止时间。 */
  remove(key: string): boolean {
    this.#assertActive();
    const removed = this.#deadlines.delete(normalizeKey(key));
    if (removed) this.#reconcileWake();
    return removed;
  }

  /** 清空全部截止时间并取消当前唤醒。 */
  clear(): void {
    this.#assertActive();
    this.#deadlines.clear();
    this.#heap.length = 0;
    this.#cancelScheduled();
  }

  /** 幂等销毁调度器，屏蔽所有已经在途的回调。 */
  destroy(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#deadlines.clear();
    this.#heap.length = 0;
    this.#cancelScheduled();
  }

  /** 让平台只保留当前最小截止时间对应的一次唤醒。 */
  #reconcileWake(): void {
    const next = this.#peek();
    if (next === undefined) {
      this.#cancelScheduled();
      return;
    }
    if (this.#scheduled?.timestamp === next.timestamp) return;
    this.#cancelScheduled();
    this.#schedule(next.timestamp);
  }

  /** 安装一个带调度代次的单次唤醒。 */
  #schedule(timestamp: number): void {
    const generation = ++this.#nextWakeGeneration;
    const scheduled: ScheduledWake = { timestamp, generation, handle: pendingWakeHandle };
    this.#scheduled = scheduled;
    let handle: AnimationWakeHandle;
    try {
      handle = this.#wake.scheduleAt(timestamp, () => this.#handleWake(generation));
      if (handle === null || typeof handle !== 'object' || typeof handle.cancel !== 'function') {
        throw new InvalidArgumentError('Animation wake port must return a cancellable handle');
      }
    } catch (error) {
      if (this.#scheduled === scheduled) this.#scheduled = undefined;
      this.#nextWakeGeneration += 1;
      throw error;
    }
    scheduled.handle = handle;
    if (this.#scheduled !== scheduled) handle.cancel();
  }

  /** 处理当前代次的到期唤醒，并一次性丢弃同一时刻已经到期的记录。 */
  #handleWake(generation: number): void {
    const scheduled = this.#scheduled;
    if (this.#disposed || scheduled === undefined || scheduled.generation !== generation) return;
    this.#scheduled = undefined;
    const now = this.#now();
    let expired = false;
    while (true) {
      const next = this.#peek();
      if (next === undefined || next.timestamp > now) break;
      this.#pop();
      const current = this.#deadlines.get(next.key);
      if (current?.revision !== next.revision) continue;
      this.#deadlines.delete(next.key);
      expired = true;
    }
    try {
      if (expired) this.#onWake();
    } finally {
      if (!this.#disposed) this.#reconcileWake();
    }
  }

  /** 取消当前唤醒；先递增代次，确保同步触发的迟到回调也失效。 */
  #cancelScheduled(): void {
    const scheduled = this.#scheduled;
    if (scheduled === undefined) return;
    this.#scheduled = undefined;
    this.#nextWakeGeneration += 1;
    scheduled.handle.cancel();
  }

  /** 返回并清理堆顶的当前有效记录。 */
  #peek(): DeadlineNode | undefined {
    while (this.#heap.length > 0) {
      const node = this.#heap[0];
      const current = this.#deadlines.get(node.key);
      if (current?.revision === node.revision) return node;
      this.#pop();
    }
    return undefined;
  }

  /** 向最小堆加入一个截止时间版本。 */
  #push(node: DeadlineNode): void {
    this.#heap.push(node);
    let index = this.#heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareDeadlineNodes(this.#heap[parent], node) <= 0) break;
      this.#heap[index] = this.#heap[parent];
      index = parent;
    }
    this.#heap[index] = node;
  }

  /** 弹出最小堆顶。 */
  #pop(): DeadlineNode | undefined {
    const root = this.#heap[0];
    const tail = this.#heap.pop();
    if (root === undefined || tail === undefined || this.#heap.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.#heap.length) break;
      const right = left + 1;
      let child = left;
      if (right < this.#heap.length && compareDeadlineNodes(this.#heap[right], this.#heap[left]) < 0) child = right;
      if (compareDeadlineNodes(tail, this.#heap[child]) <= 0) break;
      this.#heap[index] = this.#heap[child];
      index = child;
    }
    this.#heap[index] = tail;
    return root;
  }

  /** 读取并校验统一时钟。 */
  #now(): number {
    const value = this.#clock.now();
    if (!Number.isFinite(value)) throw new InvalidArgumentError('Animation clock must return a finite timestamp');
    return value;
  }

  /** 确保调度器仍可登记或移除截止时间。 */
  #assertActive(): void {
    if (this.#disposed) throw new ObjectDisposedError('Animation deadline scheduler has been destroyed');
  }
}

function normalizeKey(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new InvalidArgumentError('Animation deadline key must be a non-empty string');
  return value;
}

function normalizeTimestamp(value: number): number {
  if (!Number.isFinite(value)) throw new InvalidArgumentError('Animation deadline timestamp must be finite');
  return value;
}

function compareDeadlineNodes(first: DeadlineNode, second: DeadlineNode): number {
  if (first.timestamp !== second.timestamp) return first.timestamp - second.timestamp;
  if (first.revision !== second.revision) return first.revision - second.revision;
  return first.key < second.key ? -1 : first.key > second.key ? 1 : 0;
}
