import type { StyleSpec } from '../../core/style/types.js';

/** `icon-default` 使用的内置图片。 */
const builtInIcon =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="8" fill="%231677ff" stroke="white" stroke-width="2"/%3E%3C/svg%3E';

/** 通过 getter 返回独立 StyleSpec，避免调用方共享可变样式。 */
const presetFactories = {
  /** 显示蓝色圆点和白色边框。 */
  'point-default': (): StyleSpec => ({
    symbol: {
      type: 'circle',
      radius: 6,
      fill: { type: 'solid', color: '#1677ff' },
      stroke: { color: '#ffffff', width: 2 }
    }
  }),
  /** 显示内置蓝色定位图标。 */
  'icon-default': (): StyleSpec => ({
    symbol: {
      type: 'icon',
      src: builtInIcon,
      size: [24, 24],
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction'
    }
  }),
  /** 显示蓝色圆角实线。 */
  'line-default': (): StyleSpec => ({
    strokes: [{ color: '#1677ff', width: 3, lineCap: 'round', lineJoin: 'round' }]
  }),
  /** 在线条末端显示箭头。 */
  'arrow-default': (): StyleSpec => ({
    strokes: [{ color: '#1677ff', width: 3, lineCap: 'round', lineJoin: 'round' }],
    decorations: [{ type: 'arrow', placement: 'end' }]
  }),
  /** 显示蓝色边框和半透明填充。 */
  'polygon-default': (): StyleSpec => ({
    strokes: [{ color: '#1677ff', width: 2 }],
    fill: { type: 'solid', color: [22, 119, 255, 0.2] }
  }),
  /** 显示虚线、控制点和测量文字。 */
  'measure-default': (): StyleSpec => ({
    strokes: [
      { color: '#ffffff', width: 5 },
      { color: '#1677ff', width: 3, lineDash: [8, 6] }
    ],
    symbol: {
      type: 'circle',
      radius: 5,
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#1677ff', width: 2 }
    },
    text: {
      text: '',
      fontSize: 13,
      fontWeight: 600,
      fill: { type: 'solid', color: '#ffffff' },
      backgroundFill: { type: 'solid', color: [22, 119, 255, 0.85] },
      padding: [4, 6, 4, 6],
      offsetY: 12
    }
  }),
  /** 突出显示正在绘制的图形。 */
  'draw-preview': (): StyleSpec => ({
    strokes: [
      { color: [255, 255, 255, 0.7], width: 6 },
      { color: '#1677ff', width: 3, lineDash: [8, 6] }
    ],
    fill: { type: 'solid', color: [22, 119, 255, 0.15] },
    symbol: {
      type: 'circle',
      radius: 5,
      fill: { type: 'solid', color: '#1677ff' },
      stroke: { color: '#ffffff', width: 2 }
    }
  }),
  /** 显示橙色边框的白色圆点。 */
  'transform-handle': (): StyleSpec => ({
    symbol: {
      type: 'circle',
      radius: 6,
      fill: { type: 'solid', color: '#ffffff' },
      stroke: { color: '#f38200', width: 2 }
    },
    zIndex: 1000
  })
} satisfies Record<string, () => StyleSpec>;

/** 点、图标、线、箭头、面、测量、绘制和变换的内置样式预设。 */
export const stylePresets = Object.freeze(
  Object.defineProperties(
    {} as { readonly [K in keyof typeof presetFactories]: StyleSpec },
    Object.fromEntries(
      (Object.keys(presetFactories) as Array<keyof typeof presetFactories>).map((name) => [
        name,
        {
          enumerable: true,
          configurable: false,
          get: presetFactories[name]
        }
      ])
    )
  )
);

/** 内置样式预设名称。 */
export type StylePresetName = keyof typeof stylePresets;
