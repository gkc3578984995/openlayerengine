import { WindLayer, useEarth, type WindLayerInstance as RootWindLayerInstance } from '@vrsim/earth-engine-ol';
import type { WindLayerInstance } from '@vrsim/earth-engine-ol/layers';

const wind = new WindLayer(useEarth());
const layer: WindLayerInstance | undefined = wind.get('wind');
const rootLayer: RootWindLayerInstance | undefined = layer;

layer?.setVisible(true);
rootLayer?.getData();
