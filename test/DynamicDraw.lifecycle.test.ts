/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { Style } from 'ol/style';
import DynamicDraw from '../src/components/DynamicDraw';

describe('DynamicDraw 监听生命周期', () => {
  it('退出绘制时只注销自身的全局监听', () => {
    const progressDisposer = vi.fn();
    const exitDisposer = vi.fn();
    const disableGlobalMouseRightClickEvent = vi.fn();
    const disableGlobalMouseMoveEvent = vi.fn();
    const disableGlobalMouseLeftDownEvent = vi.fn();
    const draw = Object.create(DynamicDraw.prototype) as any;
    draw.drawProgressDisposers = [progressDisposer];
    draw.drawExitDisposer = exitDisposer;
    draw.lastDrawCompleted = true;
    draw.earth = {
      useGlobalEvent: () => ({
        hasGlobalMouseRightClickEvent: () => true,
        hasGlobalMouseMoveEvent: () => true,
        hasGlobalMouseLeftDownEvent: () => true,
        disableGlobalMouseRightClickEvent,
        disableGlobalMouseMoveEvent,
        disableGlobalMouseLeftDownEvent
      }),
      setMouseStyleToDefault: vi.fn()
    };

    draw.exitDraw({ position: [120, 30] });

    expect(progressDisposer).toHaveBeenCalledTimes(1);
    expect(exitDisposer).toHaveBeenCalledTimes(1);
    expect(disableGlobalMouseRightClickEvent).not.toHaveBeenCalled();
    expect(disableGlobalMouseMoveEvent).not.toHaveBeenCalled();
    expect(disableGlobalMouseLeftDownEvent).not.toHaveBeenCalled();
  });

  it('uses the same outer and inner strokes for polygon preview and saved parameters', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;
    const param = {
      strokeColor: '#ffcc33',
      strokeWidth: 2,
      outerStroke: { color: '#00ff36', width: 8, lineDash: [10, 6] },
      innerStroke: { color: '#f00', width: 4 }
    };
    const saved = draw.buildDrawPolygonStyle(param);
    const preview = draw.buildDrawPreviewStyle('Polygon', param);
    expect(saved.outerStroke).toEqual(param.outerStroke);
    expect(saved.innerStroke).toEqual(param.innerStroke);
    expect(Array.isArray(preview) ? preview : [preview]).toHaveLength(2);
    expect((Array.isArray(preview) ? preview[0] : preview).getStroke()?.getColor()).toBe('#00ff36');
  });

  it('uses the saved legacy stroke for line preview when no inner stroke is provided', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;
    const saved = draw.buildDrawLineStyle({ strokeWidth: 2 });
    const preview = draw.buildDrawPreviewStyle('LineString', { strokeWidth: 2 });
    const foreground = Array.isArray(preview) ? preview.at(-1) : preview;
    expect(foreground.getStroke()?.getColor()).toBe(saved.stroke.color);
    expect(foreground.getStroke()?.getWidth()).toBe(saved.stroke.width);
    expect(foreground.getStroke()?.getLineDash()).toBeNull();
  });

  it('applies saved stroke defaults to partial layered preview strokes', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;
    const preview = draw.buildDrawPreviewStyle('Polygon', { outerStroke: { color: '#00ff36' }, innerStroke: { color: '#f00' } });
    const styles = Array.isArray(preview) ? preview : [preview];
    expect(styles[0].getStroke()?.getWidth()).toBe(2);
    expect(styles[1].getStroke()?.getWidth()).toBe(2);
  });
});
