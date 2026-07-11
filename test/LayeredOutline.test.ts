import { describe, expect, it, vi } from 'vitest';
import { Style } from 'ol/style';
import PolygonLayer from '../src/base/PolygonLayer';
import PolylineLayer from '../src/base/PolylineLayer';

const earth = () => ({ map: { addLayer: vi.fn() }, _autoRegisterLayer: vi.fn(), removeLayer: vi.fn(), removeRegisteredLayer: vi.fn() }) as any;
const polygon = [[[0, 0], [10, 0], [10, 10], [0, 0]]];

const asStyles = (style: Style | Style[] | undefined) => (Array.isArray(style) ? style : [style!]);

describe('layered outlines', () => {
  it('keeps a legacy polygon stroke as one style', () => {
    const feature = new PolygonLayer(earth()).add({ positions: polygon, stroke: { color: '#111', width: 3 } });
    expect(feature.getStyle()).toBeInstanceOf(Style);
  });

  it('renders polygon outerStroke before innerStroke and preserves its fill', () => {
    const feature = new PolygonLayer(earth()).add({
      positions: polygon,
      fill: { color: '#ffffff33' },
      outerStroke: { color: '#00ff36', width: 10, lineDash: [10, 6] },
      innerStroke: { color: '#ff0000', width: 4 }
    });
    const styles = asStyles(feature.getStyle() as Style[]);
    expect(styles).toHaveLength(2);
    expect(styles[0].getStroke()?.getColor()).toBe('#00ff36');
    expect(styles[0].getFill()).toBeNull();
    expect(styles[1].getStroke()?.getColor()).toBe('#ff0000');
    expect(styles[1].getFill()?.getColor()).toBe('#ffffff33');
  });

  it('uses legacy stroke as the foreground when only an outer polyline stroke is supplied', () => {
    const feature = new PolylineLayer(earth()).add({
      positions: [[0, 0], [10, 0]],
      stroke: { color: '#000', width: 5 },
      outerStroke: { color: '#f00', width: 11 }
    });
    expect(asStyles(feature.getStyle() as Style[]).map((style) => style.getStroke()?.getColor())).toEqual(['#f00', '#000']);
  });
});
