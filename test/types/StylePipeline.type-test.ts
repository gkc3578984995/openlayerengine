import type { StyleLike } from 'ol/style/Style.js';
import { lineStyles } from '../../src/builtins/styles/lineStyles.js';
import type { ElementSelector } from '../../src/core/element/types.js';
import type { StylePatch, StyleSpec } from '../../src/core/style/types.js';
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
  zIndex: undefined
};

const deletingBranches: StylePatch = {
  symbol: undefined,
  strokes: undefined,
  fill: undefined,
  text: undefined,
  decorations: undefined,
  linework: undefined,
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
  }
};

const replaceDiscriminators: StylePatch = {
  symbol: { type: 'icon', src: 'data:image/svg+xml,icon', scale: 2 },
  fill: { type: 'pattern', pattern: 'dot', dotRadius: 2 }
};

const lineworkStyle = lineStyles.polyline({
  color: '#1677ff',
  lines: ['dashed', 'solid'] as const,
  decoration: 'tick'
});
const polygonLineworkStyle = lineStyles.polygon({
  decoration: 'inline-text',
  text: '边界',
  textStyle: { fontSize: 14, color: '#111827' }
});
const replaceLinework: StylePatch = { linework: polygonLineworkStyle.linework };

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
// @ts-expect-error native input cannot also contain structured style fields
const invalidMixedNativeInput: StyleInput = { nativeStyle, zIndex: 2 };
// @ts-expect-error native input cannot also contain a structured symbol
const invalidNativeSymbolInput: StyleInput = { nativeStyle, symbol: { type: 'circle', radius: 4 } };
// @ts-expect-error double-track polyline styles cannot contain caps
const invalidDoubleTrackCaps = lineStyles.polyline({ lines: ['solid', 'dashed'] as const, caps: { end: 'arrow' } });
// @ts-expect-error Polygon line styles cannot contain caps
const invalidPolygonCaps = lineStyles.polygon({ caps: { start: 'bar' } });
// @ts-expect-error decoration-only styles require slash
const invalidDecorationOnly = lineStyles.polyline({ lines: 'none', decoration: 'circle' });
// @ts-expect-error tracked styles cannot use slash
const invalidTrackedSlash = lineStyles.polyline({ lines: 'solid', decoration: 'slash' });
// @ts-expect-error non-text decorations cannot contain text
const invalidOrdinaryText = lineStyles.polyline({ decoration: 'circle', text: '非法' });
// @ts-expect-error inline-text requires text
const invalidMissingInlineText = lineStyles.polyline({ decoration: 'inline-text' });

void [
  missingIconSource,
  invalidPattern,
  invalidIconReplacement,
  invalidPatternReplacement,
  invalidInput,
  invalidMixedSymbolPatch,
  invalidMixedNativeInput,
  invalidNativeSymbolInput,
  lineworkStyle,
  polygonLineworkStyle,
  replaceLinework,
  invalidDoubleTrackCaps,
  invalidPolygonCaps,
  invalidDecorationOnly,
  invalidTrackedSlash,
  invalidOrdinaryText,
  invalidMissingInlineText
];
