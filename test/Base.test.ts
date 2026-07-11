import { describe, it, expect } from 'vitest';
import Base from '../src/base/Base';
import { Feature } from 'ol';
import { Point, Polygon, Circle as GeomCircle, Geometry } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Text } from 'ol/style';
import CircleStyle from 'ol/style/Circle';

/** 构造满足 Base 构造器依赖的最小 mock Earth */
function makeMockEarth() {
  return {
    map: { addLayer: () => {} },
    _autoRegisterLayer: () => {},
    removeLayer: () => undefined,
    removeRegisteredLayer: () => false
  } as any;
}

function makeBase(type = 'Point') {
  const layer = new VectorLayer({ source: new VectorSource() });
  return { base: new Base(makeMockEarth(), layer, type), layer };
}

describe('Base.getUpdatedParam — Point', () => {
  it('从几何与样式同步 center / size / stroke / fill / label', () => {
    const { base } = makeBase('Point');
    const feature = new Feature<Point>({ geometry: new Point([10, 20]) });
    feature.set('layerType', 'Point');
    feature.set('param', { center: [0, 0], size: 4 });
    feature.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: 'blue' }),
          stroke: new Stroke({ color: 'red', width: 2 })
        }),
        text: new Text({ text: 'hello', fill: new Fill({ color: 'black' }) })
      })
    );
    const updated = base.getUpdatedParam(feature as Feature<Geometry>)!;
    expect(updated.center).toEqual([10, 20]);
    expect(updated.size).toBe(6);
    expect(updated.stroke.color).toBe('red');
    expect(updated.stroke.width).toBe(2);
    expect(updated.fill.color).toBe('blue');
    expect(updated.label.text).toBe('hello');
  });

  it('不修改 feature 上绑定的原 param（深拷贝）', () => {
    const { base } = makeBase('Point');
    const feature = new Feature<Point>({ geometry: new Point([10, 20]) });
    feature.set('layerType', 'Point');
    const original = { center: [0, 0], size: 4 };
    feature.set('param', original);
    feature.setStyle(new Style({ image: new CircleStyle({ radius: 8 }) }));
    base.getUpdatedParam(feature as Feature<Geometry>);
    // 原对象未被写回
    expect(original.center).toEqual([0, 0]);
    expect(original.size).toBe(4);
    expect(feature.get('param')).toBe(original);
  });

  it('无 param 时返回 undefined', () => {
    const { base } = makeBase('Point');
    const feature = new Feature<Point>({ geometry: new Point([0, 0]) });
    expect(base.getUpdatedParam(feature as Feature<Geometry>)).toBeUndefined();
  });
});

describe('Base.getUpdatedParam — Polygon / Circle 几何同步', () => {
  it('Polygon 同步 positions', () => {
    const { base } = makeBase('Polygon');
    const coords = [[[0, 0], [10, 0], [10, 10], [0, 0]]];
    const feature = new Feature({ geometry: new Polygon(coords) });
    feature.set('layerType', 'Polygon');
    feature.set('param', { positions: [] });
    feature.setStyle(new Style({}));
    const updated = base.getUpdatedParam(feature as Feature<Geometry>)!;
    expect(updated.positions).toEqual(coords);
  });

  it('Circle 同步 center 与 radius', () => {
    const { base } = makeBase('Circle');
    const feature = new Feature({ geometry: new GeomCircle([5, 5], 42) });
    feature.set('layerType', 'Circle');
    feature.set('param', { center: [0, 0], radius: 0 });
    feature.setStyle(new Style({}));
    const updated = base.getUpdatedParam(feature as Feature<Geometry>)!;
    expect(updated.center).toEqual([5, 5]);
    expect(updated.radius).toBe(42);
  });
});
