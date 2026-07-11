import { describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import DynamicDraw from '../src/components/DynamicDraw';

const positions = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 0]
  ]
];

describe('DynamicDraw Polygon style selection', () => {
  it('prefers the new fill option over legacy fillColor', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;

    expect(draw.buildDrawPolygonStyle({ fillColor: '#fff', fill: { type: 'cross' } })).toEqual({
      stroke: { width: 2 },
      fill: { type: 'cross' }
    });
  });

  it('keeps legacy fillColor behavior and does not make a default stroke color explicit', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;

    expect(draw.buildDrawPolygonStyle({ fillColor: '#fff' })).toEqual({
      stroke: { width: 2 },
      fill: { color: '#fff' }
    });
    expect(draw.buildDrawPolygonStyle({ fill: { type: 'dot' } }).stroke.color).toBeUndefined();
  });

  it('uses a transparent edit preview only for a visible pattern underlay', () => {
    const draw = Object.create(DynamicDraw.prototype) as any;
    const patternFeature = new Feature({ geometry: new Polygon(positions) });
    patternFeature.set('param', { fill: { type: 'diagonal' } });
    const solidFeature = new Feature({ geometry: new Polygon(positions) });
    solidFeature.set('param', { fill: { color: '#fff' } });

    expect(draw.getPolygonEditPreviewFill(patternFeature, true)).toEqual({ color: 'rgba(0,0,0,0)' });
    expect(draw.getPolygonEditPreviewFill(patternFeature, false)).toEqual({ color: '#ffffff61' });
    expect(draw.getPolygonEditPreviewFill(solidFeature, true)).toEqual({ color: '#ffffff61' });
  });
});
