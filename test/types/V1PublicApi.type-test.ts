import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import type VectorLayer from 'ol/layer/Vector.js';
import type Map from 'ol/Map.js';
import type VectorSource from 'ol/source/Vector.js';
import type View from 'ol/View.js';
import type { Base, Earth } from '../../src/index.js';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

type EarthMapContract = Assert<Equal<Earth['map'], Map>>;
type EarthViewContract = Assert<Equal<Earth['view'], View>>;
type BaseLayerContract = Assert<Equal<Base['layer'], VectorLayer<VectorSource<Feature<Geometry>>>>>;
type BaseGetLayerContract = Assert<Equal<ReturnType<Base['getLayer']>, VectorLayer<VectorSource<Feature<Geometry>>>>>;

export type V1PublicApiTypeContracts = EarthMapContract | EarthViewContract | BaseLayerContract | BaseGetLayerContract;
