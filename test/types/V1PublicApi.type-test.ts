import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import type BaseLayer from 'ol/layer/Base.js';
import type Map from 'ol/Map.js';
import { useEarth } from '../../src/index.js';
import type { Earth, Element, ElementService, Layer, LayerService, TransformSession, ViewService } from '../../src/index.js';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

type EarthMapContract = Assert<Equal<Earth['map'], Map>>;
type EarthViewContract = Assert<Equal<Earth['view'], ViewService>>;
type EarthElementServiceContract = Assert<Equal<Earth['elements'], ElementService>>;
type EarthLayerServiceContract = Assert<Equal<Earth['layers'], LayerService>>;
type UseEarthContract = Assert<Equal<ReturnType<typeof useEarth>, Earth>>;
type ElementFeatureContract = Assert<Equal<Element['olFeature'], Feature<Geometry>>>;
type LayerNativeContract = Assert<Equal<Layer['olLayer'], BaseLayer>>;
type TransformModeContract = Assert<Equal<TransformSession['mode'], 'transform' | 'edit'>>;
type TransformSetModeContract = Assert<Equal<Parameters<TransformSession['setMode']>[0], 'transform' | 'edit'>>;

declare const transformSession: TransformSession;
declare const view: ViewService;
transformSession.setMode('transform');
transformSession.setMode('edit');
// @ts-expect-error Transform 仅支持变换和顶点编辑两种会话模式。
transformSession.setMode('copy-preview');

const projectedPoint: readonly [number, number] = view.toProjectedCoordinates([120, 0]);
const geographicPoint: readonly [number, number] = view.toGeographicCoordinates(projectedPoint);
void geographicPoint;

export type V2PublicApiTypeContracts =
  | EarthMapContract
  | EarthViewContract
  | EarthElementServiceContract
  | EarthLayerServiceContract
  | UseEarthContract
  | ElementFeatureContract
  | LayerNativeContract
  | TransformModeContract
  | TransformSetModeContract;
