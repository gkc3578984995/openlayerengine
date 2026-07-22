import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { ElementProtectedError, InvalidArgumentError, ObjectDisposedError } from '../src/core/errors.js';
import type { ElementProtectionViewPort } from '../src/core/ports/ElementProtectionPort.js';
import type { ElementProtectionState } from '../src/core/protection/types.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { ElementProtectionService, type ElementProtectionWake, type ElementProtectionWakeHandle } from '../src/services/protection/ElementProtectionService.js';

class FakeProtectionView implements ElementProtectionViewPort {
  readonly upsert = vi.fn<(element: Readonly<ElementState>, protection: ElementProtectionState) => void>();
  readonly remove = vi.fn<(elementId: string) => void>();
  readonly destroy = vi.fn<() => void>();
}

class FakeWake implements ElementProtectionWake {
  readonly scheduled: Array<{ timestamp: number; callback: () => void; active: boolean }> = [];

  scheduleAt(timestamp: number, callback: () => void): ElementProtectionWakeHandle {
    const record = { timestamp, callback, active: true };
    this.scheduled.push(record);
    return {
      cancel: () => {
        record.active = false;
      }
    };
  }

  fire(index: number, includeCancelled = false): void {
    const record = this.scheduled[index];
    if (record === undefined || (!record.active && !includeCancelled)) return;
    record.active = false;
    record.callback();
  }
}

function pointElement(id = 'point-1'): ElementState {
  return {
    id,
    type: 'point',
    geometry: { type: 'point', controlPoints: [[10, 20]] },
    style: { symbol: { type: 'circle', radius: 6, fill: { type: 'solid', color: '#f00' } } },
    layerId: 'business',
    visible: true
  };
}

function setup() {
  const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
  const view = new FakeProtectionView();
  const wake = new FakeWake();
  let now = 1_000;
  const service = new ElementProtectionService(store, view, { now: () => now, wake });
  return { service, store, view, wake, setNow: (value: number) => (now = value) };
}

describe('ElementProtectionService', () => {
  it('保留 Element ID 的首尾空格，同时规范化操作者字段', () => {
    const { service, store, view } = setup();
    const elementId = '  point-with-spaces  ';
    store.add(pointElement(elementId));

    expect(service.set(elementId, { protected: true, operatorId: ' user-42 ', operatorName: ' 张三 ' })).toBe(true);
    expect(service.get(elementId)).toEqual({
      elementId,
      protected: true,
      operatorId: 'user-42',
      operatorName: '张三'
    });
    expect(service.get(elementId.trim())).toBeUndefined();
    expect(view.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: elementId }), expect.objectContaining({ elementId }));

    expect(service.set(elementId, { protected: false })).toBe(true);
    expect(view.remove).toHaveBeenCalledWith(elementId);
  });

  it('建立、查询和解除冻结的保护状态，并用稳定错误拒绝编辑', () => {
    const { service, store, view } = setup();
    store.add(pointElement());
    const changes: unknown[] = [];
    service.subscribe((change) => changes.push(change));

    expect(
      service.set('point-1', {
        protected: true,
        operatorId: 'user-42',
        operatorName: ' 张三 ',
        revision: 18,
        expiresAt: 2_000
      })
    ).toBe(true);
    const protection = service.get('point-1');
    expect(protection).toEqual({
      elementId: 'point-1',
      protected: true,
      operatorId: 'user-42',
      operatorName: '张三',
      revision: 18,
      expiresAt: 2_000
    });
    expect(Object.isFrozen(protection)).toBe(true);
    expect(view.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'point-1' }), protection);
    expect(() => service.assertEditable('point-1')).toThrow(ElementProtectedError);
    try {
      service.assertEditable('point-1');
    } catch (error) {
      expect(error).toMatchObject({ elementId: 'point-1', operatorId: 'user-42', operatorName: '张三' });
    }

    expect(service.set('point-1', { protected: false, revision: 19 })).toBe(true);
    expect(service.get('point-1')).toBeUndefined();
    expect(view.remove).toHaveBeenCalledWith('point-1');
    expect(changes).toHaveLength(2);
    expect(Object.isFrozen(changes[0])).toBe(true);
  });

  it('按代次维护 revision tombstone，并屏蔽过期和迟到回调', () => {
    const { service, store, wake, setNow } = setup();
    store.add(pointElement());

    expect(service.set('point-1', { protected: true, operatorName: '甲', revision: 18, expiresAt: 1_100 })).toBe(true);
    expect(service.set('point-1', { protected: false, revision: 18 })).toBe(false);
    expect(service.set('point-1', { protected: false, revision: 17 })).toBe(false);
    expect(service.set('point-1', { protected: true, operatorName: '乙', revision: 19, expiresAt: 1_200 })).toBe(true);

    setNow(1_100);
    wake.fire(0, true);
    expect(service.get('point-1')?.operatorName).toBe('乙');

    setNow(1_200);
    wake.fire(1);
    expect(service.get('point-1')).toBeUndefined();
    expect(service.set('point-1', { protected: true, operatorName: '迟到', revision: 18 })).toBe(false);
    expect(service.set('point-1', { protected: false, revision: 20 })).toBe(false);

    store.remove({ id: 'point-1' });
    store.add(pointElement());
    expect(service.set('point-1', { protected: true, operatorName: '新代次', revision: 1 })).toBe(true);
  });

  it('删除通知中重建同 ID 时保留新代次的 revision 水位', () => {
    const { service, store } = setup();
    store.add(pointElement());
    service.set('point-1', { protected: true, operatorName: '旧代次', revision: 8 });
    service.subscribe((change) => {
      if (change.current !== undefined || change.previous?.operatorName !== '旧代次') return;
      store.add(pointElement());
      service.set('point-1', { protected: true, operatorName: '新代次', revision: 1 });
    });

    store.remove({ id: 'point-1' });

    expect(service.get('point-1')).toMatchObject({ operatorName: '新代次', revision: 1 });
    expect(service.set('point-1', { protected: true, operatorName: '重复消息', revision: 1 })).toBe(false);
    expect(service.set('point-1', { protected: true, operatorName: '迟到消息', revision: 0 })).toBe(false);
    expect(service.get('point-1')?.operatorName).toBe('新代次');
  });

  it('批量删除通知重入重建后忽略同批次中旧代次的后续 remove', () => {
    const { service, store } = setup();
    store.add(pointElement('first'));
    store.add(pointElement('second'));
    service.set('first', { protected: true, operatorName: '旧一', revision: 5 });
    service.set('second', { protected: true, operatorName: '旧二', revision: 6 });
    service.subscribe((change) => {
      if (change.elementId !== 'first' || change.current !== undefined) return;
      store.add(pointElement('second'));
      service.set('second', { protected: true, operatorName: '新二', revision: 1 });
    });

    store.clear();

    expect(service.get('second')).toMatchObject({ operatorName: '新二', revision: 1 });
    expect(service.set('second', { protected: true, operatorName: '重复', revision: 1 })).toBe(false);
  });

  it('Element 内容更新保留保护，删除和清空会清理保护及视图', () => {
    const { service, store, view } = setup();
    store.add(pointElement('a'));
    store.add(pointElement('b'));
    service.set('a', { protected: true, operatorName: '甲' });
    service.set('b', { protected: true });

    store.update({ id: 'a' }, { visible: false });
    expect(service.get('a')).toBeDefined();
    expect(view.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a', visible: false }), expect.objectContaining({ elementId: 'a' }));

    store.remove({ id: 'a' });
    expect(service.get('a')).toBeUndefined();
    expect(view.remove).toHaveBeenCalledWith('a');
    store.clear();
    expect(service.get('b')).toBeUndefined();
    expect(view.remove).toHaveBeenCalledWith('b');
  });

  it('监听器重入更新时仍按状态提交顺序向所有监听器通知', () => {
    const { service, store } = setup();
    store.add(pointElement());
    const calls: string[] = [];
    service.subscribe((change) => {
      calls.push(`a:${change.current === undefined ? 'release' : 'protect'}`);
      if (change.current?.revision === 1) service.set('point-1', { protected: false, revision: 2 });
    });
    service.subscribe((change) => calls.push(`b:${change.current === undefined ? 'release' : 'protect'}`));

    service.set('point-1', { protected: true, revision: 1 });

    expect(calls).toEqual(['a:protect', 'b:protect', 'a:release', 'b:release']);
    expect(service.get('point-1')).toBeUndefined();
  });

  it('拒绝不安全输入、隔离监听器异常，并在销毁后失效', () => {
    const reported = vi.fn();
    const store = new ElementStore(new ShapeRegistry(basicShapeDefinitions));
    const view = new FakeProtectionView();
    const service = new ElementProtectionService(store, view, { errorReporter: reported });
    store.add(pointElement());

    expect(service.set('missing', { protected: true })).toBe(false);
    expect(() => service.set('', { protected: true })).toThrow(InvalidArgumentError);
    expect(() => service.set('point-1', { protected: true, operatorName: ' ' })).toThrow(InvalidArgumentError);
    expect(() => service.set('point-1', { protected: true, revision: -1 })).toThrow(InvalidArgumentError);
    expect(() => service.set('point-1', { protected: true, expiresAt: Number.NaN })).toThrow(InvalidArgumentError);
    expect(() => service.set('point-1', { protected: true, unknown: true } as never)).toThrow(InvalidArgumentError);
    expect(() => service.set('point-1', { protected: false, operatorName: '甲' } as never)).toThrow(InvalidArgumentError);

    const accessor = {} as { protected: true };
    Object.defineProperty(accessor, 'protected', { enumerable: true, get: () => true });
    expect(() => service.set('point-1', accessor)).toThrow(InvalidArgumentError);

    service.subscribe(() => {
      throw new Error('listener failed');
    });
    expect(service.set('point-1', { protected: true })).toBe(true);
    expect(reported).toHaveBeenCalled();

    service.destroy();
    service.destroy();
    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(() => service.get('point-1')).toThrow(ObjectDisposedError);
    expect(() => service.set('point-1', { protected: false })).toThrow(ObjectDisposedError);
  });
});
