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

  it('reapplies polygon layered styles after set without losing its label or fill', () => {
    const layer = new PolygonLayer(earth());
    const feature = layer.add({ id: 'area', positions: polygon, fill: { color: '#abcdef' }, label: { text: 'area' }, stroke: { color: '#000', width: 2 } });
    layer.set({ id: 'area', outerStroke: { color: '#f00', width: 8 }, innerStroke: { color: '#111', width: 3 } });
    const styles = asStyles(feature.getStyle() as Style[]);
    expect(styles).toHaveLength(2);
    expect(styles[1].getFill()?.getColor()).toBe('#abcdef');
    expect(styles[1].getText()?.getText()).toBe('area');
  });

  it('prefers innerStroke over legacy stroke when both are provided', () => {
    const feature = new PolylineLayer(earth()).add({
      positions: [
        [0, 0],
        [10, 0]
      ],
      stroke: { color: '#f00', width: 9 },
      outerStroke: { color: '#00ff36', width: 13 },
      innerStroke: { color: '#000', width: 3 }
    });
    expect(asStyles(feature.getStyle() as Style[]).map((style) => style.getStroke()?.getColor())).toEqual(['#00ff36', '#000']);
  });
});
