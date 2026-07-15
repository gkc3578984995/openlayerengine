import { describe, expect, it, vi } from 'vitest';
import type { ElementState } from '../src/core/element/types.js';
import { UnsupportedOperationError } from '../src/core/errors.js';
import type { ShapeType } from '../src/core/shape/types.js';
import { createNativeStyleRef, type CircleSymbolSpec, type IconSymbolSpec, type StyleSpec } from '../src/core/style/types.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { addElement, createTransformHarness, representativePoints } from './helpers/transformHarness.js';

describe('Transform style capabilities', () => {
  coversCapabilities('transform-style-snapshot');

  const nonPointCases = [
    ['rectangle', representativePoints.rectangle],
    ['polyline', representativePoints.polyline],
    ['circle', representativePoints.circle],
    ['attack-arrow', representativePoints['attack-arrow']]
  ] as const satisfies readonly (readonly [ShapeType, readonly (readonly number[])[]])[];

  it.each(nonPointCases)('%s 缩放只改变 geometry，并保持完整的屏幕像素样式不变', (type, points) => {
    const harness = createTransformHarness();
    const style = screenStableStyle();
    addElement(harness, `styled-${type}`, type, points, style);
    const before = requireState(harness.store.get(`styled-${type}`));
    const session = harness.service.select(`styled-${type}`);

    scale(harness, 2, 3);

    const preview = harness.interaction.handle?.target;
    expect(preview?.geometry).not.toEqual(harness.shapes.get(type).toRenderGeometry(before.geometry as never));
    expect(preview?.style).toEqual(style);
    expect(harness.store.get(`styled-${type}`)?.style).toEqual(style);

    session.finish();

    const after = requireState(harness.store.get(`styled-${type}`));
    expect(after.geometry).not.toEqual(before.geometry);
    expect(after.style).toEqual(style);
  });

  it('点圆符号缩放时只改变 radius，文本、描边、纹理和装饰保持不变', () => {
    const harness = createTransformHarness();
    const symbol: CircleSymbolSpec = {
      type: 'circle',
      radius: 6,
      fill: { type: 'pattern', pattern: 'dot', color: '#1677ff', size: 8, dotRadius: 2, backgroundColor: '#ffffff' },
      stroke: { color: '#102a43', width: 3, lineDash: [2, 3], lineDashOffset: 1 }
    };
    const style: StyleSpec = {
      ...screenStableStyle(),
      symbol
    };
    addElement(harness, 'circle-symbol', 'point', [[1, 1]], style);
    const session = harness.service.select('circle-symbol');

    scale(harness, 2, 2, [1, 1]);

    const expected: StyleSpec = {
      ...style,
      symbol: { ...symbol, radius: 12 }
    };
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [1, 1] });
    expect(harness.interaction.handle?.target?.style).toEqual(expected);
    session.finish();
    expect(harness.store.get('circle-symbol')?.style).toEqual(expected);
  });

  it('点图标缩放时只改变 symbol.scale，图标尺寸定位参数与其余样式保持不变', () => {
    const harness = createTransformHarness();
    const symbol: IconSymbolSpec = {
      type: 'icon',
      src: '/marker.png',
      size: [32, 24],
      offset: [4, 6],
      displacement: [7, 9],
      scale: [2, 1],
      rotation: 0.25,
      anchor: [0.25, 0.75],
      anchorOrigin: 'bottom-left',
      anchorXUnits: 'fraction',
      anchorYUnits: 'pixels',
      origin: 'top-right',
      opacity: 0.8,
      crossOrigin: 'anonymous'
    };
    const style: StyleSpec = {
      ...screenStableStyle(),
      symbol
    };
    addElement(harness, 'icon-symbol', 'point', [[1, 1]], style);
    const session = harness.service.select('icon-symbol');

    scale(harness, 2, 3, [1, 1]);

    const expected: StyleSpec = {
      ...style,
      symbol: { ...symbol, scale: [4, 3] }
    };
    expect(harness.interaction.handle?.target?.geometry).toEqual({ type: 'point', coordinates: [1, 1] });
    expect(harness.interaction.handle?.target?.style).toEqual(expected);
    session.finish();
    expect(harness.store.get('icon-symbol')?.style).toEqual(expected);
  });

  it('允许原生 OL 样式的非点 geometry 缩放，而不尝试结构化转换样式', () => {
    const harness = createTransformHarness();
    const nativeStyle = createNativeStyleRef();
    addElement(harness, 'native-rectangle', 'rectangle', representativePoints.rectangle, nativeStyle);
    const before = requireState(harness.store.get('native-rectangle'));
    const session = harness.service.select('native-rectangle');
    const errors = vi.fn();
    session.on('error', errors);

    scale(harness, 2, 3);

    expect(session.status).toBe('active');
    expect(errors).not.toHaveBeenCalled();
    expect(harness.interaction.handle?.target?.geometry).not.toEqual(harness.shapes.get('rectangle').toRenderGeometry(before.geometry as never));
    expect(harness.interaction.handle?.target?.style).toBe(nativeStyle);
    session.finish();
    expect(session.status).toBe('finished');
    expect(harness.store.get('native-rectangle')?.geometry).not.toEqual(before.geometry);
    expect(harness.store.get('native-rectangle')?.style).toBe(nativeStyle);
  });

  it('明确拒绝原生 OL 样式点元素的视觉缩放，并保持已提交状态不变', () => {
    const harness = createTransformHarness();
    const nativeStyle = createNativeStyleRef();
    addElement(harness, 'native-point', 'point', [[0, 0]], nativeStyle);
    const session = harness.service.select('native-point');
    const errors = vi.fn();
    session.on('error', errors);

    scale(harness, 2, 2);

    expect(session.status).toBe('cancelled');
    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0].error).toBeInstanceOf(UnsupportedOperationError);
    expect(harness.store.get('native-point')).toMatchObject({
      geometry: { type: 'point', controlPoints: [[0, 0]] },
      style: nativeStyle
    });
  });

  it('在缩放预览、撤销、重做和提交期间保持 data、module、layerId 与 visible 不变', () => {
    const harness = createTransformHarness();
    const style = screenStableStyle();
    const id = 'metadata-rectangle';
    addElement(harness, id, 'rectangle', representativePoints.rectangle, style, { label: '任务区域', nested: { priority: 3 } });
    harness.store.update(
      { id },
      {
        module: 'mission-planning',
        layerId: 'mission-layer',
        visible: false
      }
    );
    const before = requireState(harness.store.get(id));
    const expectedMetadata = metadataOf(before);
    const session = harness.service.select(id);
    let preview: Readonly<ElementState> | undefined;
    const historyStates: Readonly<ElementState>[] = [];
    session.on('scaleEnd', (event) => {
      preview = event.state;
    });
    session.on('edit', (event) => historyStates.push(event.state));

    scale(harness, 2, 3);

    expect(metadataOf(preview)).toEqual(expectedMetadata);
    expect(metadataOf(harness.store.get(id))).toEqual(expectedMetadata);
    expect(session.undo()).toBe(true);
    expect(metadataOf(historyStates.at(-1))).toEqual(expectedMetadata);
    expect(session.redo()).toBe(true);
    expect(metadataOf(historyStates.at(-1))).toEqual(expectedMetadata);

    session.finish();
    expect(metadataOf(harness.store.get(id))).toEqual(expectedMetadata);
    expect(harness.store.get(id)?.style).toEqual(style);
  });
});

function screenStableStyle(): StyleSpec {
  return {
    strokes: [
      { color: '#f43f5e', width: 8, lineDash: [2, 4], lineDashOffset: 1, lineCap: 'round', lineJoin: 'bevel', miterLimit: 6 },
      { color: '#111827', width: 3 }
    ],
    fill: {
      type: 'pattern',
      pattern: 'cross',
      color: '#22c55e',
      size: 6,
      lineWidth: 2,
      dotRadius: 1,
      backgroundColor: 'rgba(255,255,255,0.4)'
    },
    text: {
      text: '固定像素标签',
      fontSize: '12px',
      scale: [1.25, 0.75],
      offsetX: 5,
      offsetY: 6,
      padding: [2, 4, 6, 8],
      fill: { type: 'pattern', pattern: 'horizontal', color: '#ffffff', size: 5, lineWidth: 1 },
      stroke: { color: '#000000', width: 2, lineDash: [1, 2] },
      backgroundFill: { type: 'pattern', pattern: 'dot', color: '#1d4ed8', size: 7, dotRadius: 2 },
      backgroundStroke: { color: '#0f172a', width: 3, lineDashOffset: 2 },
      textAlign: 'center',
      textBaseline: 'middle'
    },
    decorations: [
      {
        type: 'arrow',
        placement: 'repeat',
        symbol: {
          type: 'icon',
          src: '/arrow.png',
          size: [16, 12],
          offset: [2, 3],
          displacement: [4, 5],
          scale: [1.1, 0.9],
          anchor: [0.5, 0.5]
        },
        offset: 7,
        spacing: 24
      }
    ],
    zIndex: 12
  };
}

function scale(harness: ReturnType<typeof createTransformHarness>, scaleX: number, scaleY: number, center: readonly number[] = [0, 0]): void {
  const coordinate = [...center] as [number, number];
  harness.interaction.emit({ type: 'operation-start', operation: 'scale', delta: { type: 'scale', scaleX: 1, scaleY: 1, center: coordinate } });
  harness.interaction.emit({ type: 'operation-end', operation: 'scale', delta: { type: 'scale', scaleX, scaleY, center: coordinate } });
}

function requireState<T>(state: Readonly<ElementState<T>> | undefined): Readonly<ElementState<T>> {
  if (state === undefined) throw new Error('缺少测试元素状态');
  return state;
}

function metadataOf(state: Readonly<ElementState> | undefined): object {
  const current = requireState(state);
  return {
    data: current.data,
    module: current.module,
    layerId: current.layerId,
    visible: current.visible
  };
}
