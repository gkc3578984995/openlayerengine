/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Feature from 'ol/Feature.js';
import BaseObject from 'ol/Object.js';
import View from 'ol/View.js';
import LineString from 'ol/geom/LineString.js';
import Draw, { DrawEvent } from 'ol/interaction/Draw.js';
import VectorSource from 'ol/source/Vector.js';
import { Style } from 'ol/style';
import DynamicDraw from '../src/components/DynamicDraw';

class TestPointerEvent extends Event {
  readonly altKey = false;
  readonly button: number;
  readonly ctrlKey = false;
  readonly isPrimary = true;
  readonly metaKey = false;
  readonly pointerId = 1;
  readonly pointerType = 'mouse';
  readonly shiftKey: boolean;

  constructor(type: string, options: { button: number; shiftKey: boolean }) {
    super(type);
    this.button = options.button;
    this.shiftKey = options.shiftKey;
  }
}

function createPointerEvent(
  type: 'pointerdown' | 'pointerdrag' | 'pointerup',
  coordinate: number[],
  pixel: number[],
  options: { button: number; shiftKey: boolean }
) {
  const originalEvent = new TestPointerEvent(type, options);
  return {
    type,
    originalEvent,
    coordinate: coordinate.slice(),
    pixel: pixel.slice(),
    activePointers: type === 'pointerup' ? [] : [originalEvent],
    preventDefault: vi.fn()
  } as any;
}

function createDrawHarness(type: 'LineString' | 'Circle', wireDrawLifecycle = false) {
  const view = new View({ center: [0, 0], zoom: 2 });
  const map = Object.assign(new BaseObject(), {
    render: vi.fn(),
    getView: () => view,
    addInteraction(interaction: Draw) {
      interaction.setMap(map as any);
    },
    removeInteraction(interaction: Draw) {
      interaction.setMap(null);
    }
  });
  const dynamicDraw = Object.create(DynamicDraw.prototype) as any;
  dynamicDraw.map = map;
  dynamicDraw.tempSource = new VectorSource();
  dynamicDraw.drawProgressDisposers = [];
  dynamicDraw.overlay = { remove: vi.fn() };
  dynamicDraw.earth = {
    setMouseStyle: vi.fn(),
    useGlobalEvent: () => ({
      addMouseRightClickEventByGlobal: vi.fn(() => vi.fn()),
      addMouseMoveEventByGlobal: vi.fn(() => vi.fn()),
      addMouseLeftDownEventByGlobal: vi.fn(() => vi.fn())
    })
  };
  dynamicDraw.initHelpTooltip = vi.fn();
  dynamicDraw.buildDrawPreviewStyle = vi.fn(() => new Style());
  if (!wireDrawLifecycle) dynamicDraw.drawChange = vi.fn();

  dynamicDraw.initDraw(type);

  return { dynamicDraw, interaction: dynamicDraw.draw as Draw };
}

describe('DynamicDraw 监听生命周期', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('keeps the public pointer coordinate until finishDrawing emits drawend', () => {
    const order: string[] = [];
    const draw = Object.create(DynamicDraw.prototype) as any;
    draw.lastDrawPointerDown = { coordinate: [120, 30], pixel: [12, 3] };
    draw.lastDrawCompleted = true;
    draw.draw = {
      finishDrawing: vi.fn(() => {
        order.push('finish');
        expect(draw.lastDrawPointerDown.coordinate).toEqual([120, 30]);
      })
    };
    draw.map = {
      removeInteraction: vi.fn(() => order.push('remove'))
    };
    draw.clearDrawEventListeners = vi.fn(() => {
      order.push('clear');
      draw.lastDrawPointerDown = undefined;
    });
    draw.earth = { setMouseStyleToDefault: vi.fn() };

    draw.exitDraw({ position: [120, 30] });

    expect(order).toEqual(['finish', 'remove', 'clear']);
  });

  it.each(['LineString', 'Circle'] as const)('records the primary Shift freehand pointer coordinate for %s', (type) => {
    const { dynamicDraw, interaction } = createDrawHarness(type);

    interaction.handleEvent(createPointerEvent('pointerdown', [12000000, 3000000], [12, 3], { button: 0, shiftKey: true }));

    expect(dynamicDraw.lastDrawPointerDown).toEqual({ coordinate: [12000000, 3000000], pixel: [12, 3] });
    expect(interaction.getFreehand()).toBe(true);

    interaction.handleEvent(createPointerEvent('pointerdrag', [12000001, 3000001], [24, 15], { button: -1, shiftKey: true }));
    interaction.handleEvent(createPointerEvent('pointerup', [12000001, 3000001], [24, 15], { button: -1, shiftKey: true }));

    expect(interaction.getFreehand()).toBe(true);
    interaction.setMap(null);
  });

  it('replaces a rejected ordinary drag position with the next Shift freehand pointerdown', () => {
    const { dynamicDraw, interaction } = createDrawHarness('LineString');
    const drawStart = vi.fn();
    interaction.on('drawstart', drawStart);

    interaction.handleEvent(createPointerEvent('pointerdown', [120, 30], [12, 3], { button: 0, shiftKey: false }));
    interaction.handleEvent(createPointerEvent('pointerdrag', [140, 50], [40, 30], { button: -1, shiftKey: false }));
    interaction.handleEvent(createPointerEvent('pointerup', [140, 50], [40, 30], { button: -1, shiftKey: false }));

    expect(drawStart).not.toHaveBeenCalled();
    expect(dynamicDraw.lastDrawPointerDown).toEqual({ coordinate: [120, 30], pixel: [12, 3] });

    interaction.handleEvent(createPointerEvent('pointerdown', [150, 60], [50, 40], { button: 0, shiftKey: true }));

    expect(dynamicDraw.lastDrawPointerDown).toEqual({ coordinate: [150, 60], pixel: [50, 40] });

    const fallbackEvent = new DrawEvent(
      'drawstart',
      new Feature(
        new LineString([
          [150, 60],
          [160, 70]
        ])
      )
    );
    expect(dynamicDraw.resolveDrawEventCoordinate(fallbackEvent)).toEqual([150, 60]);
    interaction.setMap(null);
  });

  it('clears the public pointer position after drawend', () => {
    const { dynamicDraw, interaction } = createDrawHarness('LineString', true);
    dynamicDraw.getBaseLayer = vi.fn();
    dynamicDraw.lastDrawPointerDown = { coordinate: [120, 30], pixel: [12, 3] };

    try {
      interaction.dispatchEvent(
        new DrawEvent(
          'drawend',
          new Feature(
            new LineString([
              [120, 30],
              [130, 40]
            ])
          )
        )
      );
      expect(dynamicDraw.lastDrawPointerDown).toBeUndefined();
    } finally {
      interaction.setMap(null);
    }
  });

  it('clears the public pointer position after drawabort', () => {
    const { dynamicDraw, interaction } = createDrawHarness('LineString', true);
    dynamicDraw.lastDrawPointerDown = { coordinate: [120, 30], pixel: [12, 3] };

    try {
      interaction.dispatchEvent(
        new DrawEvent(
          'drawabort',
          new Feature(
            new LineString([
              [120, 30],
              [130, 40]
            ])
          )
        )
      );
      expect(dynamicDraw.lastDrawPointerDown).toBeUndefined();
    } finally {
      interaction.setMap(null);
    }
  });

  it('uses the same background stroke for polygon preview and saved parameters', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;
    const param = {
      strokeColor: '#ffcc33',
      strokeWidth: 2,
      backgroundStroke: { color: '#00ff36', width: 8, lineDash: [10, 6] }
    };
    const saved = draw.buildDrawPolygonStyle(param);
    const preview = draw.buildDrawPreviewStyle('Polygon', param);
    expect(saved.backgroundStroke).toEqual(param.backgroundStroke);
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
    const preview = draw.buildDrawPreviewStyle('Polygon', { backgroundStroke: { color: '#00ff36' }, strokeColor: '#f00' });
    const styles = Array.isArray(preview) ? preview : [preview];
    expect(styles[0].getStroke()?.getWidth()).toBe(2);
    expect(styles[1].getStroke()?.getWidth()).toBe(2);
  });
});
