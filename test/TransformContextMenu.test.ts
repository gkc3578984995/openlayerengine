/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import Transform from '../src/components/Transform';
import TransformInteraction from '../src/extends/transform-interaction/TransformInteraction';

describe('Transform 右键菜单协调', () => {
  it('在原生右键菜单事件处理前保留交互选择状态', () => {
    const interaction = Object.create(TransformInteraction.prototype) as any;
    interaction.checkDynmicDraw_ = () => false;
    interaction.selection_ = { getLength: () => 1 };
    interaction.exitEdit = vi.fn();
    const previousMouseEvent = globalThis.MouseEvent;
    class TestMouseEvent extends Event {
      public readonly button: number;

      constructor(type: string, options: MouseEventInit = {}) {
        super(type);
        this.button = options.button ?? 0;
      }
    }
    Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: TestMouseEvent });
    const originalEvent = new MouseEvent('pointerdown', { button: 2 });

    try {
      const result = interaction.handleDownEvent_({ originalEvent, pixel: [12, 24] });

      expect(result).toBe(false);
      expect(interaction.exitEdit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: previousMouseEvent });
    }
  });

  it('退出编辑并阻止右键菜单继续打开', () => {
    const transform = Object.create(Transform.prototype) as any;
    const exitEdit = vi.fn();
    transform.checkSelect = { getGeometry: () => undefined };
    transform.transforms = { exitEdit };
    transform.earth = { map: { getEventPixel: () => [12, 24] } };
    const event = { preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };

    transform.handleContextMenu(event);

    expect(exitEdit).toHaveBeenCalledWith([12, 24]);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });
});
