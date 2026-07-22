import {
  Earth,
  Element,
  Layer,
  animationTypes,
  lineStyles,
  measureTypes,
  shapeTypes,
  stylePresets,
  throttle,
  toFlatCoordinates,
  useEarth
} from '@vrsim/earth-engine-ol';
import type {
  AnimationManager,
  Coordinate,
  DrawService,
  EarthOptions,
  ElementGeometryDetails,
  ElementRenderGeometry,
  ElementService,
  LayerService,
  MapExtent,
  MeasureService,
  OverlayService,
  ShapeInput,
  StyleService,
  TransformService,
  ViewService
} from '@vrsim/earth-engine-ol';

const options: EarthOptions = { target: 'map', view: { zoom: 4 } };
const getOrCreate: typeof useEarth = useEarth;
const throttled = throttle((coordinate: Coordinate) => coordinate, 16);
const flatCoordinates = toFlatCoordinates([
  [120, 0],
  [110, 0]
]);
const shapeInput: ShapeInput<'polyline'> = { type: 'polyline', controlPoints: flatCoordinates };
const lineStyle = lineStyles.polyline({ lines: ['dashed', 'solid'] as const, decoration: 'tick' });

declare const earth: Earth;
const elementService: ElementService = earth.elements;
const layerService: LayerService = earth.layers;
const styleService: StyleService = earth.styles;
const animations: AnimationManager = earth.animations;
const draw: DrawService = earth.draw;
const measure: MeasureService = earth.measure;
const transform: TransformService = earth.transform;
const overlays: OverlayService = earth.overlays;
const view: ViewService = earth.view;
declare const element: Element;
const geometryDetails: ElementGeometryDetails = element.geometryDetails;
const renderGeometry: ElementRenderGeometry = geometryDetails.renderGeometry;
const mapExtent: MapExtent = geometryDetails.extent;
const extentPoints: readonly Coordinate[] = geometryDetails.extentPoints;
const rangePoints: readonly (readonly Coordinate[])[] = geometryDetails.rangePoints;
const controlPoints: readonly Coordinate[] | null = geometryDetails.controlPoints;
const center: Coordinate | null = geometryDetails.center;
const radius: Readonly<{ readonly meters: number; readonly projected: number }> | null = geometryDetails.radius;
declare const layer: Layer;

void [
  options,
  getOrCreate,
  throttled,
  flatCoordinates,
  shapeInput,
  lineStyle,
  elementService,
  layerService,
  styleService,
  animations,
  draw,
  measure,
  transform,
  overlays,
  view,
  element,
  geometryDetails,
  renderGeometry,
  mapExtent,
  extentPoints,
  rangePoints,
  controlPoints,
  center,
  radius,
  layer,
  animationTypes,
  measureTypes,
  shapeTypes,
  stylePresets
];
