import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import { describe, expect, it, vi } from 'vitest';
import { GeometryCodec, projectRenderGeometry } from '../src/adapters/openlayers/GeometryCodec.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { shapeTypes, type RenderGeometryState, type ShapeState, type ShapeType } from '../src/core/shape/types.js';
import { createElementGeometryDetails } from '../src/facade/resolveElementGeometryDetails.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { identityShapeProjection } from './helpers/shapeProjection.js';

const inputs: Record<ShapeType, ShapeState> = {
  point: { type: 'point', controlPoints: [[1, 2]] },
  polyline: {
    type: 'polyline',
    controlPoints: [
      [0, 0],
      [2, 1]
    ]
  },
  polygon: {
    type: 'polygon',
    controlPoints: [
      [0, 0],
      [3, 0],
      [1, 2]
    ]
  },
  circle: { type: 'circle', center: [0, 0], radius: 2 },
  ellipse: {
    type: 'ellipse',
    controlPoints: [
      [0, 0],
      [3, 2]
    ]
  },
  'attack-arrow': {
    type: 'attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'tailed-attack-arrow': {
    type: 'tailed-attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'fine-arrow': {
    type: 'fine-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'tailed-squad-combat-arrow': {
    type: 'tailed-squad-combat-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'assault-direction-arrow': {
    type: 'assault-direction-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'double-arrow': {
    type: 'double-arrow',
    controlPoints: [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ]
  },
  rectangle: {
    type: 'rectangle',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  triangle: {
    type: 'triangle',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'equilateral-triangle': {
    type: 'equilateral-triangle',
    controlPoints: [
      [0, 0],
      [4, 0]
    ]
  },
  'assemble-polygon': {
    type: 'assemble-polygon',
    controlPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  },
  'closed-curve-polygon': {
    type: 'closed-curve-polygon',
    controlPoints: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3]
    ]
  },
  sector: {
    type: 'sector',
    controlPoints: [
      [0, 0],
      [4, 0],
      [0, 4]
    ]
  },
  'lune-polygon': {
    type: 'lune-polygon',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'lune-polyline': {
    type: 'lune-polyline',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'curve-polyline': {
    type: 'curve-polyline',
    controlPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  }
};

function createCodec(): GeometryCodec {
  return new GeometryCodec(new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]), identityShapeProjection);
}

describe('GeometryCodec', () => {
  coversCapabilities('element-point', 'element-polyline', 'element-polygon', 'element-circle');

  it('projects all 20 registered shapes into the exact four render classes', () => {
    const codec = createCodec();
    const counts = { Point: 0, LineString: 0, Polygon: 0, Circle: 0 };

    for (const type of shapeTypes) {
      const feature = new Feature<Geometry>();
      codec.project(feature, inputs[type]);
      const geometry = feature.getGeometry();
      codec.project(feature, inputs[type]);
      expect(feature.getGeometry(), `${type} replaced a compatible geometry`).toBe(geometry);
      if (geometry instanceof Point) counts.Point += 1;
      else if (geometry instanceof LineString) counts.LineString += 1;
      else if (geometry instanceof Polygon) counts.Polygon += 1;
      else if (geometry instanceof Circle) counts.Circle += 1;
      else throw new Error(`Unexpected render geometry for ${type}`);
    }

    expect(counts).toEqual({ Point: 1, LineString: 3, Polygon: 15, Circle: 1 });
  });

  it('derives complete frozen geometry details for all 20 registered shapes', () => {
    const codec = createCodec();

    for (const type of shapeTypes) {
      const state = inputs[type];
      const rendered = codec.render(state);
      const details = createElementGeometryDetails(state, rendered);

      expect(details.renderGeometry, type).toEqual(rendered);
      expect(details.extent.every(Number.isFinite), type).toBe(true);
      expect(details.extentPoints).toHaveLength(4);
      expect(details.extentPoints.flat().every(Number.isFinite), type).toBe(true);
      expect(Object.isFrozen(details), type).toBe(true);
      expect(Object.isFrozen(details.renderGeometry), type).toBe(true);
      expect(Object.isFrozen(details.extent), type).toBe(true);
      expect(Object.isFrozen(details.extentPoints), type).toBe(true);
      expect(details.extentPoints.every(Object.isFrozen), type).toBe(true);
      expect(Object.isFrozen(details.rangePoints), type).toBe(true);
      if (details.renderGeometry.type === 'point') {
        expect(Object.isFrozen(details.renderGeometry.coordinates), type).toBe(true);
        expect(details.rangePoints).toEqual([[details.renderGeometry.coordinates]]);
      } else if (details.renderGeometry.type === 'polyline') {
        expect(details.renderGeometry.coordinates.every(Object.isFrozen), type).toBe(true);
        expect(details.rangePoints).toEqual([details.renderGeometry.coordinates]);
      } else if (details.renderGeometry.type === 'polygon') {
        expect(details.renderGeometry.coordinates.every(Object.isFrozen), type).toBe(true);
        expect(details.renderGeometry.coordinates.flat().every(Object.isFrozen), type).toBe(true);
        expect(details.rangePoints).toEqual(details.renderGeometry.coordinates);
      } else {
        if (state.type !== 'circle') throw new Error(`${type} should use Circle state when it renders as Circle`);
        expect(Object.isFrozen(details.renderGeometry.center), type).toBe(true);
        expect(details.rangePoints).toEqual([]);
        expect(details.controlPoints).toBeNull();
        expect(details.center).toEqual(details.renderGeometry.center);
        expect(details.radius).toEqual({ meters: state.radius, projected: details.renderGeometry.radius });
        expect(Object.isFrozen(details.radius), type).toBe(true);
      }
      if (state.type !== 'circle') {
        expect(details.controlPoints).toEqual(state.controlPoints);
        expect(details.controlPoints).not.toBe(state.controlPoints);
        expect(Object.isFrozen(details.controlPoints), type).toBe(true);
        expect(details.controlPoints?.every(Object.isFrozen), type).toBe(true);
        expect(details.center).toBeNull();
        expect(details.radius).toBeNull();
      }
    }
  });

  it.each([
    ['point', new Point([9, 9])],
    [
      'polyline',
      new LineString([
        [9, 9],
        [10, 10]
      ])
    ],
    [
      'polygon',
      new Polygon([
        [
          [9, 9],
          [10, 9],
          [9, 10],
          [9, 9]
        ]
      ])
    ],
    ['circle', new Circle([9, 9], 4)]
  ] as const)('reuses a compatible %s geometry and never reverse reads it', (type, geometry) => {
    const codec = createCodec();
    const feature = new Feature<Geometry>(geometry);
    const getter = 'getCoordinates' in geometry ? vi.spyOn(geometry as Point | LineString | Polygon, 'getCoordinates') : undefined;
    getter?.mockImplementation(() => {
      throw new Error('reverse read');
    });

    expect(() => codec.project(feature, inputs[type])).not.toThrow();
    expect(feature.getGeometry()).toBe(geometry);
    expect(getter).not.toHaveBeenCalled();
  });

  it('repairs null and incompatible externally replaced geometry', () => {
    const codec = createCodec();
    const feature = new Feature<Geometry>();
    codec.project(feature, inputs.point);
    const first = feature.getGeometry();
    feature.setGeometry(undefined);
    codec.project(feature, inputs.polyline);
    expect(feature.getGeometry()).toBeInstanceOf(LineString);
    expect(feature.getGeometry()).not.toBe(first);
    feature.setGeometry(new Circle([0, 0], 1));
    codec.project(feature, inputs.polygon);
    expect(feature.getGeometry()).toBeInstanceOf(Polygon);
  });

  it('updates a compatible Circle without reading its external center or radius', () => {
    const codec = createCodec();
    const circle = new Circle([9, 9], 9);
    const feature = new Feature<Geometry>(circle);
    const getCenter = vi.spyOn(circle, 'getCenter').mockImplementation(() => {
      throw new Error('reverse center read');
    });
    const getRadius = vi.spyOn(circle, 'getRadius').mockImplementation(() => {
      throw new Error('reverse radius read');
    });

    expect(() => codec.project(feature, inputs.circle)).not.toThrow();
    expect(feature.getGeometry()).toBe(circle);
    expect(getCenter).not.toHaveBeenCalled();
    expect(getRadius).not.toHaveBeenCalled();
  });

  it('does not retain a writable reference to coordinates after OpenLayers flattens the input', () => {
    const codec = createCodec();
    const coordinates: [number, number][] = [
      [0, 0],
      [2, 2]
    ];
    const state: ShapeState<'polyline'> = { type: 'polyline', controlPoints: coordinates };
    const feature = new Feature<Geometry>();
    codec.project(feature, state);
    coordinates[0][0] = 99;

    expect((feature.getGeometry() as LineString).getCoordinates()).toEqual([
      [0, 0],
      [2, 2]
    ]);
  });

  it('projects deeply frozen 3D positions without mutation or layout loss', () => {
    const codec = createCodec();
    const state = Object.freeze({
      type: 'point' as const,
      controlPoints: Object.freeze([Object.freeze([1, 2, 3] as const)])
    });
    const feature = new Feature<Geometry>();

    expect(() => codec.project(feature, state)).not.toThrow();
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual([1, 2, 3]);
    expect(state).toEqual({ type: 'point', controlPoints: [[1, 2, 3]] });
    expect(Object.isFrozen(state.controlPoints[0])).toBe(true);
  });

  it('forwards readonly coordinates directly while constructing or updating each Geometry exactly once', () => {
    const point = {
      type: 'point',
      coordinates: Object.freeze([1, 2] as const)
    } satisfies RenderGeometryState;
    const pointSetter = vi.spyOn(Point.prototype, 'setCoordinates');
    const pointFeature = new Feature<Geometry>();
    const firstPoint = projectRenderGeometry(pointFeature, point);
    expect(pointSetter).toHaveBeenCalledTimes(1);
    expect(pointSetter.mock.calls[0]?.[0]).toBe(point.coordinates);
    expect(projectRenderGeometry(pointFeature, point)).toBe(firstPoint);
    expect(pointSetter).toHaveBeenCalledTimes(2);
    expect(pointSetter.mock.calls[1]?.[0]).toBe(point.coordinates);
    pointSetter.mockRestore();

    const polyline = {
      type: 'polyline',
      coordinates: Object.freeze([Object.freeze([0, 0] as const), Object.freeze([2, 2] as const)])
    } satisfies RenderGeometryState;
    const lineSetter = vi.spyOn(LineString.prototype, 'setCoordinates');
    const lineFeature = new Feature<Geometry>();
    const firstLine = projectRenderGeometry(lineFeature, polyline);
    expect(lineSetter).toHaveBeenCalledTimes(1);
    expect(lineSetter.mock.calls[0]?.[0]).toBe(polyline.coordinates);
    expect(projectRenderGeometry(lineFeature, polyline)).toBe(firstLine);
    expect(lineSetter).toHaveBeenCalledTimes(2);
    expect(lineSetter.mock.calls[1]?.[0]).toBe(polyline.coordinates);
    lineSetter.mockRestore();

    const polygon = {
      type: 'polygon',
      coordinates: Object.freeze([
        Object.freeze([Object.freeze([0, 0] as const), Object.freeze([2, 0] as const), Object.freeze([0, 2] as const), Object.freeze([0, 0] as const)])
      ])
    } satisfies RenderGeometryState;
    const polygonSetter = vi.spyOn(Polygon.prototype, 'setCoordinates');
    const polygonFeature = new Feature<Geometry>();
    const firstPolygon = projectRenderGeometry(polygonFeature, polygon);
    expect(polygonSetter).toHaveBeenCalledTimes(1);
    expect(polygonSetter.mock.calls[0]?.[0]).toBe(polygon.coordinates);
    expect(projectRenderGeometry(polygonFeature, polygon)).toBe(firstPolygon);
    expect(polygonSetter).toHaveBeenCalledTimes(2);
    expect(polygonSetter.mock.calls[1]?.[0]).toBe(polygon.coordinates);
    polygonSetter.mockRestore();

    const circle = {
      type: 'circle',
      center: Object.freeze([3, 4] as const),
      radius: 5
    } satisfies RenderGeometryState;
    const circleSetter = vi.spyOn(Circle.prototype, 'setCenterAndRadius');
    const circleFeature = new Feature<Geometry>();
    const firstCircle = projectRenderGeometry(circleFeature, circle);
    expect(circleSetter).toHaveBeenCalledTimes(1);
    expect(circleSetter.mock.calls[0]?.[0]).toBe(circle.center);
    expect(projectRenderGeometry(circleFeature, circle)).toBe(firstCircle);
    expect(circleSetter).toHaveBeenCalledTimes(2);
    expect(circleSetter.mock.calls[1]?.[0]).toBe(circle.center);
    circleSetter.mockRestore();
  });
});
