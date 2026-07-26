import type BaseLayer from 'ol/layer/Base.js';

const transientLayerRole = Symbol('ol-engine:transient-layer');

/** 标记 Engine 临时视觉层；打印、图例和业务 Layer 清单必须显式排除。 */
export function markInternalTransientLayer<T extends BaseLayer>(layer: T): T {
  layer.set(transientLayerRole as unknown as string, true, true);
  return layer;
}

export function isInternalTransientLayer(layer: BaseLayer): boolean {
  return layer.get(transientLayerRole as unknown as string) === true;
}
