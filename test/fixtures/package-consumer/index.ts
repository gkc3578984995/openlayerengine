import { Earth, Element, Layer, animationTypes, lineStyles, measureTypes, shapeTypes, stylePresets, throttle, useEarth } from '@vrsim/earth-engine-ol';
import type {
  AnimationManager,
  Coordinate,
  DrawService,
  EarthOptions,
  ElementService,
  LayerService,
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
