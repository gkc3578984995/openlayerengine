import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
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
    return projectRenderGeometry(feature, rendered);
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

/** 把 RenderGeometry 投影到 Feature；规范绑定和动画替身共享同一实现。 */
export function projectRenderGeometry(feature: Feature<Geometry>, rendered: RenderGeometryState): Geometry {
  const current = feature.getGeometry();

  if (rendered.type === 'point') {
    const coordinates = asOpenLayersCoordinates(rendered.coordinates);
    if (current instanceof Point) {
      current.setCoordinates(coordinates);
      return current;
    }
    const geometry = new Point(coordinates);
    feature.setGeometry(geometry);
    return geometry;
  }
  if (rendered.type === 'polyline') {
    const coordinates = asOpenLayersCoordinates(rendered.coordinates);
    if (current instanceof LineString) {
      current.setCoordinates(coordinates);
      return current;
    }
    const geometry = new LineString(coordinates);
    feature.setGeometry(geometry);
    return geometry;
  }
  if (rendered.type === 'polygon') {
    const coordinates = asOpenLayersCoordinates(rendered.coordinates);
    if (current instanceof Polygon) {
      current.setCoordinates(coordinates);
      return current;
    }
    const geometry = new Polygon(coordinates);
    feature.setGeometry(geometry);
    return geometry;
  }

  const center = asOpenLayersCoordinates(rendered.center);
  if (current instanceof Circle) {
    current.setCenterAndRadius(center, rendered.radius);
    return current;
  }
  const geometry = new Circle(center, rendered.radius);
  feature.setGeometry(geometry);
  return geometry;
}

type MutableCoordinates<T> = T extends readonly (infer Value)[] ? MutableCoordinates<Value>[] : T;

/** OL 的公开 Geometry API 只读取并扁平化输入；此处仅消除 readonly 类型差异，不共享其内部存储。 */
function asOpenLayersCoordinates<T extends readonly unknown[]>(coordinates: T): MutableCoordinates<T> {
  return coordinates as unknown as MutableCoordinates<T>;
}
