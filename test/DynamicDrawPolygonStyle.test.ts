import { describe, expect, it } from 'vitest';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createDrawLifecycleHarness, finishActiveSession } from './helpers/drawMeasureLifecycleHarness.js';

function createPolygonStyle(): StyleSpec {
  return {
    strokes: [
      { color: '#00ff36', width: 8, lineDash: [10, 6] },
      { color: '#ff3300', width: 2 }
    ],
    fill: { type: 'pattern', pattern: 'diagonal', color: '#1677ff', backgroundColor: '#ffffff' }
  };
}

function polygonElement(id: string, style: StyleSpec): ElementState {
  return {
    id,
    type: 'polygon',
    geometry: {
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [10, 0],
        [10, 10]
      ]
    },
    style,
    layerId: 'draw-layer',
    visible: true
  };
}

describe('v2 多边形绘制与编辑样式', () => {
  it('同一结构化样式快照贯穿预览与最终结果', async () => {
    coversCapabilities('draw-style-preview-result-parity');
    const harness = createDrawLifecycleHarness();
    const style = createPolygonStyle();
    const expected = createPolygonStyle();
    const session = harness.draw.start({ type: 'polygon', layerId: 'draw-layer', style, limit: 1 });
    style.strokes?.splice(0, 1, { color: '#000000', width: 1 });
    harness.drawPort.emit({ type: 'click', coordinate: [0, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [10, 0] });
    harness.drawPort.emit({ type: 'click', coordinate: [10, 10] });
    const preview = harness.drawPort.active?.renders.filter((state) => state !== undefined).at(-1);
    if (preview === undefined) throw new Error('缺少多边形预览');

    expect(finishActiveSession(harness.coordinator, [10, 10])).toBe('consume');
    const [result] = await session.finished;
    expect(preview.style).toEqual(expected);
    expect(result.style).toEqual(preview.style);
    expect(harness.store.get(result.id)?.style).toEqual(preview.style);
    harness.destroy();
  });

  it('编辑 underlay 只影响端口投影并完整保留元素图案样式', () => {
    coversCapabilities('edit-session-underlay');
    const harness = createDrawLifecycleHarness();
    const style = createPolygonStyle();
    harness.store.add(polygonElement('pattern-polygon', style));
    const session = harness.draw.edit('pattern-polygon', { underlay: true });
    const record = harness.editPort.active;

    expect(record?.spec.underlay).toBe(true);
    expect(record?.renders[0].style).toEqual(style);
    expect(harness.store.get('pattern-polygon')?.style).toEqual(style);
    session.cancel();
    harness.destroy();
  });

  it('拒绝旧 fillColor 歧义字段并要求显式 StyleSpec', () => {
    const harness = createDrawLifecycleHarness();
    expect(() =>
      harness.draw.start({
        type: 'polygon',
        layerId: 'draw-layer',
        style: { strokes: [{ width: 2 }], fillColor: '#ffffff' } as never
      })
    ).toThrow(InvalidArgumentError);
    harness.destroy();
  });
});
