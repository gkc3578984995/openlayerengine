/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import Transform from '../src/components/Transform';
import { Toolbar } from '../src/extends/toolbar/Toolbar';
import TransformInteraction from '../src/extends/transform-interaction/TransformInteraction';

class DetailEvent<T> extends Event {
  constructor(
    type: string,
    readonly detail: T
  ) {
    super(type);
  }
}

describe('TransformInteraction 多 Earth 隔离', () => {
  it('只检查当前地图的动态绘制交互', () => {
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

  it('暴露每个 Toolbar 实例自己的根元素', () => {
    const firstRoot = new EventTarget();
    const secondRoot = new EventTarget();
    const firstToolbar = Object.create(Toolbar.prototype) as any;
    const secondToolbar = Object.create(Toolbar.prototype) as any;
    firstToolbar.rootEl = firstRoot;
    secondToolbar.rootEl = secondRoot;

    expect(firstToolbar.getRootElement()).toBe(firstRoot);
    expect(secondToolbar.getRootElement()).toBe(secondRoot);
  });

  it('只响应当前 Transform 所属 Toolbar 根元素的事件', () => {
    const firstRoot = new EventTarget();
    const secondRoot = new EventTarget();
    const firstToolbar = { getRootElement: () => firstRoot } as any;
    const secondToolbar = { getRootElement: () => secondRoot } as any;
    const firstTransform = Object.create(Transform.prototype) as any;
    const secondTransform = Object.create(Transform.prototype) as any;
    firstTransform.baseTransformTipFlag = 'first';
    secondTransform.baseTransformTipFlag = 'second';
    firstTransform.updateHelpTooltip = vi.fn();
    secondTransform.updateHelpTooltip = vi.fn();
    firstTransform.handleToolbarClick = vi.fn();
    secondTransform.handleToolbarClick = vi.fn();

    firstTransform.bindToolbarEvents(firstToolbar);
    secondTransform.bindToolbarEvents(secondToolbar);

    const enterDetail = { key: 'remove', item: { title: '鍒犻櫎' } };
    const detail = { key: 'remove', item: enterDetail.item, pixel: [12, 34] };
    firstRoot.dispatchEvent(new DetailEvent('toolbar:itementer', enterDetail));
    firstRoot.dispatchEvent(new DetailEvent('toolbar:itemleave', enterDetail));
    firstRoot.dispatchEvent(new DetailEvent('toolbar:itemclick', detail));

    expect(firstTransform.updateHelpTooltip).toHaveBeenCalledWith('鍒犻櫎');
    expect(firstTransform.updateHelpTooltip).toHaveBeenCalledWith('first');
    expect(firstTransform.handleToolbarClick).toHaveBeenCalledWith(detail, detail.pixel);
    expect(secondTransform.updateHelpTooltip).not.toHaveBeenCalled();
    expect(secondTransform.handleToolbarClick).not.toHaveBeenCalled();
  });

  it('通过当前 Toolbar 实例绑定事件且不再查询全局根元素', async () => {
    const source = await readFile('src/components/Transform.ts', 'utf8');

    expect(source).not.toContain("document.querySelector('.ol-toolbar')");
    expect(source).toContain('this.bindToolbarEvents(this.toolbar)');
  });
});
