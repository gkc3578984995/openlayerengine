import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import type { Coordinate } from '../../core/common/types.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import type { RenderGeometryState, ShapeState } from '../../core/shape/types.js';

/** OpenLayers 最终需要渲染的几何类型。 */
export type RenderGeometryKind = RenderGeometryState['type'];

/** 在核心图形状态和 OpenLayers Geometry 之间做转换。 */
export class GeometryCodec {
  /** 提供各图形的渲染规则。 */
  readonly #shapes: ShapeRegistry;

  /** 保存图形定义注册表。 */
  constructor(shapes: ShapeRegistry) {
    this.#shapes = shapes;
  }

  /** 把图形状态投影到要素现有或新建的 Geometry。 */
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

  /** 返回图形最终使用的渲染类型。 */
  renderKind(state: ShapeState): RenderGeometryKind {
    return this.#render(state).type;
  }

  /** 调用图形定义生成渲染状态。 */
  #render(state: ShapeState): RenderGeometryState {
    const definition = this.#shapes.get(state.type);
    return definition.toRenderGeometry(state as never);
  }
}

/** 复制一个坐标供 OpenLayers 使用。 */
function copyCoordinate(coordinate: Coordinate): number[] {
  return [...coordinate];
}

/** 复制一组坐标供 OpenLayers 使用。 */
function copyCoordinates(coordinates: readonly Coordinate[]): number[][] {
  return coordinates.map(copyCoordinate);
}
