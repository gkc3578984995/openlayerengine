import Feature from 'ol/Feature.js';
import Circle from 'ol/geom/Circle.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import { CapabilityError } from '../../core/errors.js';
import type { ShapePresentationFrame, ShapePresentationPort } from '../../core/ports/ShapePresentationPort.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { ShapeRegistry } from '../../core/shape/ShapeRegistry.js';
import { renderTrustedShapeState } from '../../core/shape/trustedRender.js';
import type { RenderGeometryState, ShapeInput, ShapeState } from '../../core/shape/types.js';
import type { ElementStyleState } from '../../core/style/types.js';
import { createPresentedPolygonGeometry, PresentedPolygonGeometry, updatePresentationLabel } from './PresentedPolygonGeometry.js';

/** OpenLayers 接收的渲染几何类型。 */
export type RenderGeometryKind = RenderGeometryState['type'];

/** 在 Core 图形状态与 OpenLayers Geometry 之间建立单向投影。 */
export class GeometryCodec {
  readonly #shapes: ShapeRegistry;
  readonly #projection: ShapeProjectionPort;
  readonly #presentation: ShapePresentationPort | undefined;

  constructor(shapes: ShapeRegistry, projection: ShapeProjectionPort, presentation?: ShapePresentationPort) {
    this.#shapes = shapes;
    this.#projection = projection;
    this.#presentation = presentation;
  }

  /** 在 Store 写入前解析依赖当前 View 的 Shape 输入。 */
  materialize(input: ShapeInput | ShapeState, referenceState?: ShapeState): ShapeState {
    const definition = this.#shapes.get(input.type);
    if (definition.presentation?.materialize === undefined) return definition.normalize(input);
    if (this.#presentation === undefined) throw new CapabilityError(`Shape presentation adapter is unavailable: ${input.type}`);
    return this.#presentation.materialize(definition, input, referenceState);
  }

  /** 把规范状态投影到 Feature；几何类型未变时复用原对象。 */
  project(feature: Feature<Geometry>, state: ShapeState, style?: ElementStyleState): Geometry {
    const rendered = this.present(state, style);
    return projectRenderGeometry(feature, rendered);
  }

  /** 解析依赖当前 View 与 Style 的最终展示几何。 */
  present(state: ShapeState, style?: ElementStyleState): RenderGeometryState {
    const definition = this.#shapes.get(state.type);
    if (definition.presentation === undefined) {
      return renderTrustedShapeState(definition, this.#projection.toViewState(state) as never);
    }
    if (this.#presentation === undefined) throw new CapabilityError(`Shape presentation adapter is unavailable: ${state.type}`);
    if (style === undefined) throw new CapabilityError(`Shape presentation requires an Element style: ${state.type}`);
    return this.#presentation.present(definition, this.#projection.toViewState(state), style).geometry;
  }

  /** 在冻结 View 帧中解析最终展示几何，不借用活动 Map 的 presentation。 */
  presentAt(state: ShapeState, style: ElementStyleState, frame: Readonly<ShapePresentationFrame>): RenderGeometryState {
    const definition = this.#shapes.get(state.type);
    const viewState = this.#projection.toViewState(state);
    if (definition.presentation === undefined) return renderTrustedShapeState(definition, viewState as never);
    if (this.#presentation === undefined) throw new CapabilityError(`Shape presentation adapter is unavailable: ${state.type}`);
    return this.#presentation.presentAt(definition, viewState, style, frame).geometry;
  }

  /** 判断 Shape 是否需要在 View presentation revision 变化时重新投影。 */
  isViewDependent(state: ShapeState): boolean {
    return this.#shapes.get(state.type).presentation?.viewDependent === true;
  }

  /** 把规范 Shape 状态解析为当前 View 投影中的完整静态渲染几何。 */
  render(state: ShapeState): RenderGeometryState {
    const definition = this.#shapes.get(state.type);
    return renderTrustedShapeState(definition, this.#projection.toViewState(state) as never);
  }

  /** 规范化输入后返回其实际渲染类型。 */
  renderKind(input: ShapeInput): RenderGeometryKind {
    const definition = this.#shapes.get(input.type);
    const state = definition.normalize(input);
    return renderTrustedShapeState(definition, this.#projection.toViewState(state) as never).type;
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
      if (rendered.label !== undefined && !(current instanceof PresentedPolygonGeometry)) {
        const geometry = createPresentedPolygonGeometry(rendered);
        feature.setGeometry(geometry);
        return geometry;
      }
      current.setCoordinates(coordinates);
      updatePresentationLabel(current, rendered.label);
      return current;
    }
    const geometry = createPresentedPolygonGeometry(rendered);
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
