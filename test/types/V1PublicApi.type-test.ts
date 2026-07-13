import type { Geometry } from 'ol/geom';
import type VectorLayer from 'ol/layer/Vector';
import type Map from 'ol/Map';
import type VectorSource from 'ol/source/Vector';
import type View from 'ol/View';
import type { Base, Earth } from '../../src/index';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

type EarthMapContract = Assert<Equal<Earth['map'], Map>>;
type EarthViewContract = Assert<Equal<Earth['view'], View>>;
type BaseLayerContract = Assert<Equal<Base['layer'], VectorLayer<VectorSource<Geometry>>>>;
type BaseGetLayerContract = Assert<Equal<ReturnType<Base['getLayer']>, VectorLayer<VectorSource<Geometry>>>>;

export type V1PublicApiTypeContracts = EarthMapContract | EarthViewContract | BaseLayerContract | BaseGetLayerContract;
