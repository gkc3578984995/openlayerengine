import Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import type Style from 'ol/style/Style.js';
import { NativeRefRegistry } from '../../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../../src/adapters/openlayers/style/StyleCompiler.js';
import type { PatternCanvasContext } from '../../src/adapters/openlayers/style/pattern.js';
import type { StyleSpec } from '../../src/core/style/types.js';

export function compileStyles(spec: StyleSpec, geometry: Geometry): Style[] {
  const compiler = new StyleCompiler(new NativeRefRegistry(), { createCanvasContext: () => patternContext() });
  const styleLike = compiler.compile(spec);
  if (typeof styleLike !== 'function') return Array.isArray(styleLike) ? styleLike : [styleLike];
  const result = styleLike(new Feature(geometry), 1);
  return Array.isArray(result) ? result : [result];
}

function patternContext(): PatternCanvasContext {
  return {
    canvas: {},
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    fillRect: () => undefined,
    createPattern: () => ({}) as CanvasPattern
  };
}
