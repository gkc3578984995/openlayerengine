import { Element } from '../../src/facade/Element.js';
import { Layer } from '../../src/facade/Layer.js';
import type { Coordinate } from '../../src/core/common/types.js';
import type { ShapeInput, ShapeState } from '../../src/core/shape/types.js';
import type { ElementGeometryDetails, ElementRenderGeometry, MapExtent } from '../../src/facade/elementGeometryTypes.js';
import type { ElementCreateInput, ElementHit } from '../../src/facade/types.js';
import { fromLonLat } from 'ol/proj.js';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;

const elementConstructorIsExactlyEmpty: Equal<ConstructorParameters<typeof Element>, []> = true;
const layerConstructorIsExactlyEmpty: Equal<ConstructorParameters<typeof Layer>, []> = true;

const validPoint: ElementCreateInput<{ label: string }> = {
  geometry: { type: 'point', controlPoints: [[1, 2]] },
  data: { label: 'point' },
  style: { symbol: { type: 'circle', radius: 4 } }
};
const validCircle: ElementCreateInput = { geometry: { type: 'circle', center: [0, 0], radius: 2 }, visible: false };
const flatPoint: ElementCreateInput = { geometry: { type: 'point', controlPoints: [120, 0] } };
const flatPolyline: ShapeInput<'polyline'> = { type: 'polyline', controlPoints: [120, 0, 110, 0] };
const projectedCenter: number[] = fromLonLat([120, 0]);
const circleFromOpenLayers: ElementCreateInput = { geometry: { type: 'circle', center: projectedCenter, radius: 1_000 } };
const canonicalState: ShapeState<'point'> = { type: 'point', controlPoints: [[120, 0]] };
// @ts-expect-error 读取状态只接受规范的嵌套坐标
const invalidFlatState: ShapeState<'point'> = { type: 'point', controlPoints: [120, 0] };

// @ts-expect-error type is derived from geometry and cannot be repeated
const repeatedType: ElementCreateInput = { type: 'point', geometry: { type: 'point', controlPoints: [[0, 0]] } };
// @ts-expect-error geometry is required
const missingGeometry: ElementCreateInput = { id: 'missing' };
// @ts-expect-error unknown top-level keys are rejected by contextual typing
const unknownKey: ElementCreateInput = { geometry: { type: 'point', controlPoints: [[0, 0]] }, extra: true };
// @ts-expect-error exact optional properties reject explicit undefined
const undefinedVisible: ElementCreateInput = { geometry: { type: 'point', controlPoints: [[0, 0]] }, visible: undefined };
// @ts-expect-error circle uses center/radius instead of controlPoints
const invalidCircle: ElementCreateInput = { geometry: { type: 'circle', controlPoints: [[0, 0]] } };

declare const element: Element<{ label: string }>;
element.update({ geometry: { type: 'point', controlPoints: [1, 2] } });
const geometryDetails: ElementGeometryDetails = element.geometryDetails;
const renderGeometry: ElementRenderGeometry = geometryDetails.renderGeometry;
const mapExtent: MapExtent = geometryDetails.extent;
const extentPoints: readonly Coordinate[] = geometryDetails.extentPoints;
const rangePoints: readonly (readonly Coordinate[])[] = geometryDetails.rangePoints;
const controlPoints: readonly Coordinate[] | null = geometryDetails.controlPoints;
const center: Coordinate | null = geometryDetails.center;
const radius: Readonly<{ readonly meters: number; readonly projected: number }> | null = geometryDetails.radius;
declare const layer: ElementHit<{ label: string }>['layer'];
const hit: ElementHit<{ label: string }> = { element, layer };

void [
  elementConstructorIsExactlyEmpty,
  layerConstructorIsExactlyEmpty,
  validPoint,
  validCircle,
  flatPoint,
  flatPolyline,
  circleFromOpenLayers,
  canonicalState,
  invalidFlatState,
  repeatedType,
  missingGeometry,
  unknownKey,
  undefinedVisible,
  invalidCircle,
  geometryDetails,
  renderGeometry,
  mapExtent,
  extentPoints,
  rangePoints,
  controlPoints,
  center,
  radius,
  hit
];
