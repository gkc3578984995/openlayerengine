import { Earth, Element, Layer, animationTypes, lineStyles, measureTypes, shapeTypes, stylePresets, throttle, useEarth } from '@vrsim/earth-engine-ol';
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
  StyleService,
  TransformService,
  ViewService
} from '@vrsim/earth-engine-ol';

const options: EarthOptions = { target: 'map', view: { center: [0, 0], zoom: 4 } };
const getOrCreate: typeof useEarth = useEarth;
const throttled = throttle((coordinate: Coordinate) => coordinate, 16);
const lineStyle = lineStyles.polygon({ lines: ['solid', 'dashed'] as const, decoration: 'circle' });

declare const earth: Earth;
declare const element: Element;
declare const layer: Layer;

const elements: ElementService = earth.elements;
const geometryDetails: ElementGeometryDetails = element.geometryDetails;
const renderGeometry: ElementRenderGeometry = geometryDetails.renderGeometry;
const mapExtent: MapExtent = geometryDetails.extent;
const extentPoints: readonly Coordinate[] = geometryDetails.extentPoints;
const rangePoints: readonly (readonly Coordinate[])[] = geometryDetails.rangePoints;
const controlPoints: readonly Coordinate[] | null = geometryDetails.controlPoints;
const center: Coordinate | null = geometryDetails.center;
const radius: Readonly<{ readonly meters: number; readonly projected: number }> | null = geometryDetails.radius;
const layers: LayerService = earth.layers;
const styles: StyleService = earth.styles;
const animations: AnimationManager = earth.animations;
const draw: DrawService = earth.draw;
const measure: MeasureService = earth.measure;
const transform: TransformService = earth.transform;
const overlays: OverlayService = earth.overlays;
const view: ViewService = earth.view;

void [
  options,
  getOrCreate,
  throttled,
  lineStyle,
  elements,
  geometryDetails,
  renderGeometry,
  mapExtent,
  extentPoints,
  rangePoints,
  controlPoints,
  center,
  radius,
  layers,
  styles,
  animations,
  draw,
  measure,
  transform,
  overlays,
  view,
  element,
  layer,
  animationTypes,
  measureTypes,
  shapeTypes,
  stylePresets
];
