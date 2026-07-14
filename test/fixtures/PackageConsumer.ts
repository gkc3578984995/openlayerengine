import { Earth, Element, Layer, animationTypes, measureTypes, shapeTypes, stylePresets, throttle, useEarth } from '@vrsim/earth-engine-ol';
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

const options: EarthOptions = { target: 'map', view: { zoom: 4 } };
const getOrCreate: typeof useEarth = useEarth;
const throttled = throttle((coordinate: Coordinate) => coordinate, 16);

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
declare const layer: Layer;

void [
  options,
  getOrCreate,
  throttled,
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
  layer,
  animationTypes,
  measureTypes,
  shapeTypes,
  stylePresets
];
