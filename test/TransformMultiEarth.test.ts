/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { setDefaultEarthProvider } from '../src/earthContext';
import TransformInteraction from '../src/extends/transform-interaction/TransformInteraction';

describe('TransformInteraction 多 Earth 隔离', () => {
  it('只检查当前地图的动态绘制交互', () => {
    setDefaultEarthProvider(
      () =>
        ({
          map: { getInteractions: () => ({ forEach: (callback: (interaction: { get: () => boolean }) => void) => callback({ get: () => true }) }) }
        }) as any
    );
    const interaction = Object.create(TransformInteraction.prototype) as any;
    interaction.getFeatureAtPixel_ = () => ({});
    const currentMap = { getInteractions: () => ({ forEach: () => undefined }) };

    expect(interaction.checkDynmicDraw_({ map: currentMap, pixel: [0, 0] })).toBe(false);
  });

  it('通过稳定方法暴露控制框并刷新手柄', () => {
    const interaction = Object.create(TransformInteraction.prototype) as any;
    const bbox = {};
    interaction.bbox_ = bbox;
    interaction.drawSketch_ = vi.fn();

    interaction.refreshSketch(true);

    expect(interaction.getBoundingBoxFeature()).toBe(bbox);
    expect(interaction.drawSketch_).toHaveBeenCalledWith(true);
  });
});
