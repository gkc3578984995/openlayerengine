import { describe, expect, it, vi } from 'vitest';
import { InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { AnimationClockPort } from '../src/core/ports/AnimationClockPort.js';
import type { AnimationWakeHandle, AnimationWakePort } from '../src/core/ports/AnimationWakePort.js';
import { AnimationDeadlineScheduler } from '../src/services/animation/AnimationDeadlineScheduler.js';

class FakeClock implements AnimationClockPort {
  nowValue = 0;

  now(): number {
    return this.nowValue;
  }
}

interface FakeWakeRequest {
  readonly timestamp: number;
  readonly callback: () => void;
  cancelled: boolean;
  fired: boolean;
  cancelCount: number;
}

class FakeWake implements AnimationWakePort {
  readonly requests: FakeWakeRequest[] = [];
  readonly log: string[] = [];

  scheduleAt(timestamp: number, callback: () => void): AnimationWakeHandle {
    const request: FakeWakeRequest = { timestamp, callback, cancelled: false, fired: false, cancelCount: 0 };
    this.requests.push(request);
    this.log.push(`schedule:${timestamp}`);
    return {
      cancel: () => {
        if (request.cancelled || request.fired) return;
        request.cancelled = true;
        request.cancelCount += 1;
        this.log.push(`cancel:${timestamp}`);
      }
    };
  }

  fire(request: FakeWakeRequest): void {
    if (request.cancelled || request.fired) return;
    request.fired = true;
    request.callback();
  }

  invokeStale(request: FakeWakeRequest): void {
    request.callback();
  }

  active(): readonly FakeWakeRequest[] {
    return this.requests.filter(({ cancelled, fired }) => !cancelled && !fired);
  }
}

function createScheduler(onWake = vi.fn()): {
  readonly clock: FakeClock;
  readonly wake: FakeWake;
  readonly onWake: ReturnType<typeof vi.fn>;
  readonly scheduler: AnimationDeadlineScheduler;
} {
  const clock = new FakeClock();
  const wake = new FakeWake();
  return {
    clock,
    wake,
    onWake,
    scheduler: new AnimationDeadlineScheduler({ clock, wake, onWake })
  };
}

describe('AnimationDeadlineScheduler', () => {
  it('始终只调度最小截止时间，并在重排时先取消旧句柄', () => {
    const { scheduler, wake } = createScheduler();

    scheduler.upsert('second', 200);
    scheduler.upsert('last', 300);
    scheduler.upsert('first', 100);

    expect(scheduler.size).toBe(3);
    expect(scheduler.nextTimestamp).toBe(100);
    expect(wake.log).toEqual(['schedule:200', 'cancel:200', 'schedule:100']);
    expect(wake.active()).toHaveLength(1);
    expect(wake.active()[0]?.timestamp).toBe(100);

    scheduler.upsert('first', 100);
    expect(wake.log).toHaveLength(3);

    expect(scheduler.remove('first')).toBe(true);
    expect(wake.log.slice(-2)).toEqual(['cancel:100', 'schedule:200']);
    expect(scheduler.nextTimestamp).toBe(200);
    expect(scheduler.remove('missing')).toBe(false);

    scheduler.clear();
    expect(scheduler.size).toBe(0);
    expect(scheduler.nextTimestamp).toBeUndefined();
    expect(wake.log.at(-1)).toBe('cancel:200');
    expect(wake.active()).toHaveLength(0);
  });

  it('一次唤醒合并同一时刻的全部到期记录，并继续调度下一个截止时间', () => {
    const { scheduler, clock, wake, onWake } = createScheduler();
    scheduler.upsert('first', 100);
    scheduler.upsert('also-first', 100);
    scheduler.upsert('next', 250);

    clock.nowValue = 100;
    const firstWake = wake.active()[0];
    if (firstWake === undefined) throw new Error('Missing first wake');
    wake.fire(firstWake);

    expect(onWake).toHaveBeenCalledOnce();
    expect(scheduler.size).toBe(1);
    expect(scheduler.nextTimestamp).toBe(250);
    expect(wake.active()).toHaveLength(1);
    expect(wake.active()[0]?.timestamp).toBe(250);

    clock.nowValue = 300;
    const secondWake = wake.active()[0];
    if (secondWake === undefined) throw new Error('Missing second wake');
    wake.fire(secondWake);

    expect(onWake).toHaveBeenCalledTimes(2);
    expect(scheduler.size).toBe(0);
    expect(wake.active()).toHaveLength(0);
  });

  it('平台提前回调时不唤醒动画 tick，而是重新等待原截止时间', () => {
    const { scheduler, clock, wake, onWake } = createScheduler();
    scheduler.upsert('blink', 100);
    const early = wake.active()[0];
    if (early === undefined) throw new Error('Missing wake');

    clock.nowValue = 99;
    wake.fire(early);

    expect(onWake).not.toHaveBeenCalled();
    expect(scheduler.size).toBe(1);
    expect(scheduler.nextTimestamp).toBe(100);
    expect(wake.active()).toHaveLength(1);
    expect(wake.active()[0]?.timestamp).toBe(100);
  });

  it('通过调度代次屏蔽已取消句柄的迟到回调', () => {
    const { scheduler, clock, wake, onWake } = createScheduler();
    scheduler.upsert('later', 200);
    const stale = wake.active()[0];
    if (stale === undefined) throw new Error('Missing stale wake');

    scheduler.upsert('earlier', 100);
    clock.nowValue = 250;
    wake.invokeStale(stale);

    expect(onWake).not.toHaveBeenCalled();
    expect(scheduler.size).toBe(2);
    expect(scheduler.nextTimestamp).toBe(100);
    expect(wake.active()).toHaveLength(1);
    expect(wake.active()[0]?.timestamp).toBe(100);
  });

  it('允许统一 tick 在回调中登记下一次截止时间', () => {
    const clock = new FakeClock();
    const wake = new FakeWake();
    const onWake = vi.fn(() => scheduler.upsert('blink', 180));
    const scheduler = new AnimationDeadlineScheduler({ clock, wake, onWake });
    scheduler.upsert('blink', 100);

    clock.nowValue = 100;
    const request = wake.active()[0];
    if (request === undefined) throw new Error('Missing wake');
    wake.fire(request);

    expect(onWake).toHaveBeenCalledOnce();
    expect(scheduler.size).toBe(1);
    expect(scheduler.nextTimestamp).toBe(180);
    expect(wake.active()).toHaveLength(1);
    expect(wake.active()[0]?.timestamp).toBe(180);
  });

  it('即使统一 tick 抛错也完成下一截止时间重排', () => {
    const onWake = vi.fn(() => {
      throw new Error('tick failed');
    });
    const { scheduler, clock, wake } = createScheduler(onWake);
    scheduler.upsert('first', 100);
    scheduler.upsert('next', 200);
    clock.nowValue = 100;
    const request = wake.active()[0];
    if (request === undefined) throw new Error('Missing wake');

    expect(() => wake.fire(request)).toThrow('tick failed');
    expect(scheduler.nextTimestamp).toBe(200);
    expect(wake.active()).toHaveLength(1);
    expect(wake.active()[0]?.timestamp).toBe(200);
  });

  it('幂等销毁会取消唯一句柄，并让所有迟到回调失效', () => {
    const { scheduler, clock, wake, onWake } = createScheduler();
    scheduler.upsert('blink', 100);
    const stale = wake.active()[0];
    if (stale === undefined) throw new Error('Missing wake');

    scheduler.destroy();
    scheduler.destroy();
    clock.nowValue = 100;
    wake.invokeStale(stale);

    expect(stale.cancelCount).toBe(1);
    expect(onWake).not.toHaveBeenCalled();
    expect(scheduler.size).toBe(0);
    expect(scheduler.nextTimestamp).toBeUndefined();
    expect(() => scheduler.upsert('next', 200)).toThrow(ObjectDisposedError);
    expect(() => scheduler.remove('next')).toThrow(ObjectDisposedError);
    expect(() => scheduler.clear()).toThrow(ObjectDisposedError);
  });

  it('拒绝无效键、时间戳、端口和非有限时钟结果', () => {
    const { scheduler, clock, wake } = createScheduler();
    expect(() => scheduler.upsert('', 1)).toThrow(InvalidArgumentError);
    expect(() => scheduler.upsert('record', Number.NaN)).toThrow(InvalidArgumentError);
    expect(() => new AnimationDeadlineScheduler({ clock: null as never, wake, onWake: () => undefined })).toThrow(InvalidArgumentError);
    expect(() => new AnimationDeadlineScheduler({ clock, wake: null as never, onWake: () => undefined })).toThrow(InvalidArgumentError);
    expect(() => new AnimationDeadlineScheduler({ clock, wake, onWake: null as never })).toThrow(InvalidArgumentError);

    scheduler.upsert('record', 100);
    clock.nowValue = Number.POSITIVE_INFINITY;
    const request = wake.active()[0];
    if (request === undefined) throw new Error('Missing wake');
    expect(() => wake.fire(request)).toThrow(InvalidArgumentError);
  });
});
