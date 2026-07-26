import type { StyleLike } from 'ol/style/Style.js';
import { lineStyles } from '../../src/builtins/styles/lineStyles.js';
import type { ElementSelector } from '../../src/core/element/types.js';
import type { CalloutSizeMode, CalloutStyleSpec, StylePatch, StyleSpec } from '../../src/core/style/types.js';
import type { StyleInput, StyleService } from '../../src/facade/styleTypes.js';

const complete: StyleSpec = {
  symbol: {
    type: 'icon',
    src: 'data:image/svg+xml,icon',
    size: [32, 24],
    color: [1, 2, 3, 0.5],
    offset: [1, 2],
    displacement: [3, 4],
    scale: [1, 2],
    rotation: 30,
    rotateWithView: true,
    anchor: [0.5, 1],
    anchorOrigin: 'bottom-right',
    anchorXUnits: 'fraction',
    anchorYUnits: 'pixels',
    origin: 'top-right',
    opacity: 0.8,
    crossOrigin: null
  },
  strokes: [
    {
      color: '#111',
      width: 5,
      lineDash: [3, 2],
      lineDashOffset: 1,
      lineCap: 'round',
      lineJoin: 'miter',
      miterLimit: 10,
      fitPatternOnce: true
    }
  ],
  fill: {
    type: 'pattern',
    pattern: 'diagonal',
    color: '#f00',
    size: 16,
    lineWidth: 2,
    dotRadius: 1.5,
    backgroundColor: '#fff'
  },
  text: {
    text: 'label',
    font: '12px sans-serif',
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: 600,
    fontStyle: 'italic',
    fill: { type: 'solid', color: '#111' },
    stroke: { color: '#fff', width: 2 },
    backgroundFill: { type: 'solid', color: '#eee' },
    backgroundStroke: { color: '#000', width: 1 },
    padding: [1, 2, 3, 4],
    offsetX: 4,
    offsetY: 5,
    scale: [1, 2],
    textAlign: 'center',
    textBaseline: 'middle',
    rotation: 30,
    rotateWithView: true,
    overflow: true,
    placement: 'line',
    maxAngle: 45,
    repeat: 80,
    justify: 'right',
    keepUpright: false
  },
  decorations: [{ type: 'arrow', placement: 'repeat', offset: 4, spacing: 20 }],
  callout: { sizeMode: 'screen' },
  zIndex: 2
};

complete.strokes?.push({ color: '#fff' });
complete.strokes?.[0].lineDash?.push(1);
complete.text?.padding?.push(5);

const deepPatch: StylePatch = {
  symbol: {
    radius: 8,
    fill: { color: '#0f0' },
    stroke: { width: 3 }
  },
  fill: { dotRadius: 2 },
  text: {
    fontSize: 18,
    fill: { color: '#222' },
    backgroundFill: undefined,
    backgroundStroke: { lineDash: [2, 1] },
    padding: [2, 3, 4, 5]
  },
  strokes: [{ color: '#f00' }],
  decorations: [],
  callout: { sizeMode: 'map' },
  zIndex: undefined
};

const deletingBranches: StylePatch = {
  symbol: undefined,
  strokes: undefined,
  fill: undefined,
  text: undefined,
  decorations: undefined,
  linework: undefined,
  callout: undefined,
  zIndex: undefined
};

const deletingOptionalFields: StylePatch = {
  symbol: { scale: undefined, opacity: undefined },
  fill: { color: undefined, size: undefined, backgroundColor: undefined },
  text: {
    fontSize: undefined,
    fill: undefined,
    backgroundStroke: undefined,
    padding: undefined
  },
  callout: { sizeMode: undefined }
};

const replaceDiscriminators: StylePatch = {
  symbol: { type: 'icon', src: 'data:image/svg+xml,icon', scale: 2 },
  fill: { type: 'pattern', pattern: 'dot', dotRadius: 2 }
};

const lineworkStyle = lineStyles.polyline({
  color: '#1677ff',
  tracks: { mode: 'double', patterns: ['dashed', 'solid'], width: 3 },
  casing: { color: '#ffffff', type: 'center', width: 2 },
  decoration: 'tick'
});
const polygonLineworkStyle = lineStyles.polygon({
  decoration: {
    type: 'inline-text',
    text: '边界',
    style: { fontSize: 14, color: '#111827' },
    repeatSpacingPx: 80
  }
});
const repeatedCenterGlyphStyle = lineStyles.polyline({ decoration: { type: 'center-dot-pair', repeatSpacingPx: 40 } });
const replaceLinework: StylePatch = { linework: polygonLineworkStyle.linework };
const calloutMode: CalloutSizeMode = 'map';
const calloutStyle: CalloutStyleSpec = { sizeMode: 'screen' };

declare const nativeStyle: StyleLike;
const inputs: StyleInput[] = [complete, { nativeStyle }];
declare const service: StyleService;
declare const selector: ElementSelector;
service.set(selector, inputs[0]);
service.patch(selector, deepPatch);
service.patch(selector, deletingBranches);
service.patch(selector, deletingOptionalFields);
service.patch(selector, replaceDiscriminators);
service.patch(selector, replaceLinework);

// @ts-expect-error icon styles require a source
const missingIconSource: StyleSpec = { symbol: { type: 'icon' } };
// @ts-expect-error unsupported pattern discriminator
const invalidPattern: StyleSpec = { fill: { type: 'pattern', pattern: 'checker' } };
// @ts-expect-error a discriminator-changing icon patch is a complete icon branch
const invalidIconReplacement: StylePatch = { symbol: { type: 'icon', opacity: 0.5 } };
// @ts-expect-error a discriminator-changing pattern patch requires its pattern variant
const invalidPatternReplacement: StylePatch = { fill: { type: 'pattern', dotRadius: 2 } };
// @ts-expect-error native OL values must be wrapped by the facade escape hatch
const invalidInput: StyleInput = nativeStyle;
// @ts-expect-error a circle patch cannot mix icon-only fields
const invalidMixedSymbolPatch: StylePatch = { symbol: { radius: 6, scale: 2 } };
// @ts-expect-error Callout only supports map-relative or screen-relative sizing
const invalidCalloutSizeMode: StylePatch = { callout: { sizeMode: 'viewport' } };
// @ts-expect-error native input cannot also contain structured style fields
const invalidMixedNativeInput: StyleInput = { nativeStyle, zIndex: 2 };
// @ts-expect-error native input cannot also contain a structured symbol
const invalidNativeSymbolInput: StyleInput = { nativeStyle, symbol: { type: 'circle', radius: 4 } };
// 跨维度组合由运行时严格校验，避免在顶层重新形成类型笛卡尔积。
const runtimeRejectedDoubleTrackCaps = lineStyles.polyline({ tracks: { mode: 'double' }, caps: { end: 'arrow' } });
const runtimeRejectedDecorationOnly = lineStyles.polyline({ tracks: { mode: 'none' }, decoration: 'circle' });
const runtimeRejectedTrackedSlash = lineStyles.polyline({ tracks: { mode: 'single' }, decoration: 'slash' });
// @ts-expect-error Polygon line styles cannot contain caps
const invalidPolygonCaps = lineStyles.polygon({ caps: { start: 'bar' } });
// @ts-expect-error double tracks cannot contain the single-track pattern field
const invalidDoublePattern = lineStyles.polyline({ tracks: { mode: 'double', pattern: 'solid' } });
// @ts-expect-error decoration-only tracks cannot contain width
const invalidNoneWidth = lineStyles.polyline({ tracks: { mode: 'none', width: 2 }, decoration: 'slash' });
// @ts-expect-error casing requires color
const invalidCasing = lineStyles.polyline({ casing: { type: 'center' } });
// @ts-expect-error inline-text requires text
const invalidMissingInlineText = lineStyles.polyline({ decoration: { type: 'inline-text' } });
// @ts-expect-error ordinary repeated decorations use their built-in spacing
const invalidOrdinaryRepeatSpacing = lineStyles.polyline({ decoration: { type: 'tick', repeatSpacingPx: 24 } });
// @ts-expect-error old top-level repeatSpacingPx was removed
const invalidDefaultRepeatSpacing = lineStyles.polyline({ repeatSpacingPx: 24 });
// @ts-expect-error old lines input was removed
const invalidLegacyLines = lineStyles.polygon({ lines: 'none', decoration: 'slash' });

void [
  missingIconSource,
  invalidPattern,
  invalidIconReplacement,
  invalidPatternReplacement,
  invalidInput,
  invalidMixedSymbolPatch,
  invalidCalloutSizeMode,
  invalidMixedNativeInput,
  invalidNativeSymbolInput,
  lineworkStyle,
  polygonLineworkStyle,
  repeatedCenterGlyphStyle,
  calloutMode,
  calloutStyle,
  replaceLinework,
  runtimeRejectedDoubleTrackCaps,
  runtimeRejectedDecorationOnly,
  runtimeRejectedTrackedSlash,
  invalidPolygonCaps,
  invalidDoublePattern,
  invalidNoneWidth,
  invalidCasing,
  invalidMissingInlineText,
  invalidOrdinaryRepeatSpacing,
  invalidDefaultRepeatSpacing,
  invalidLegacyLines
];
