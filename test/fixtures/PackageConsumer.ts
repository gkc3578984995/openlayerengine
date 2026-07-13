import { PointLayer, useEarth } from '@vrsim/earth-engine-ol';
import type { PointLayer as LayersPointLayer } from '@vrsim/earth-engine-ol/layers';
import type Feature from 'ol/Feature';
import type Point from 'ol/geom/Point';

const pointLayer: LayersPointLayer = new PointLayer(useEarth());
const point: Feature<Point> = pointLayer.add({ center: [0, 0] });

point.getGeometry()?.setCoordinates([1, 1]);
pointLayer.getLayer().getSource()?.getFeatures();
