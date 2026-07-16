import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { RenderGeometryState, ShapeInput, ShapeState } from '../../core/shape/types.js';

/** OpenLayers 接收的渲染几何类型。 */
export type RenderGeometryKind = RenderGeometryState['type'];

/** 在 Core 图形状态与 OpenLayers Geometry 之间建立单向投影。 */
export class GeometryCodec {
  readonly #shapes: ShapeRegistry;
  readonly #projection: ShapeProjectionPort;

  constructor(shapes: ShapeRegistry, projection: ShapeProjectionPort) {
    this.#shapes = shapes;
    this.#projection = projection;
  }

  /** 把规范状态投影到 Feature；几何类型未变时复用原对象。 */
  project(feature: Feature<Geometry>, state: ShapeState): Geometry {
    const rendered = this.#render(state);
    const current = feature.getGeometry();

    if (rendered.type === 'point') {
      const geometry = current instanceof Point ? current : new Point(copyCoordinate(rendered.coordinates));
      geometry.setCoordinates(copyCoordinate(rendered.coordinates));
      if (geometry !== current) feature.setGeometry(geometry);
      return geometry;
    }
    if (rendered.type === 'polyline') {
      const coordinates = copyCoordinates(rendered.coordinates);
      const geometry = current instanceof LineString ? current : new LineString(coordinates);
      geometry.setCoordinates(copyCoordinates(rendered.coordinates));
      if (geometry !== current) feature.setGeometry(geometry);
      return geometry;
    }
    if (rendered.type === 'polygon') {
      const coordinates = rendered.coordinates.map(copyCoordinates);
      const geometry = current instanceof Polygon ? current : new Polygon(coordinates);
      geometry.setCoordinates(rendered.coordinates.map(copyCoordinates));
      if (geometry !== current) feature.setGeometry(geometry);
      return geometry;
    }

    const center = copyCoordinate(rendered.center);
    const geometry = current instanceof Circle ? current : new Circle(center, rendered.radius);
    geometry.setCenterAndRadius(copyCoordinate(rendered.center), rendered.radius);
    if (geometry !== current) feature.setGeometry(geometry);
    return geometry;
  }

  /** 规范化输入后返回其实际渲染类型。 */
  renderKind(input: ShapeInput): RenderGeometryKind {
    const definition = this.#shapes.get(input.type);
    const state = definition.normalize(input);
    return definition.toRenderGeometry(this.#projection.toViewState(state) as never).type;
  }

  #render(state: ShapeState): RenderGeometryState {
    const definition = this.#shapes.get(state.type);
    return definition.toRenderGeometry(this.#projection.toViewState(state) as never);
  }
}

function copyCoordinate(coordinate: Coordinate): number[] {
  return [...coordinate];
}

function copyCoordinates(coordinates: readonly Coordinate[]): number[][] {
  return coordinates.map(copyCoordinate);
}
