import { useEarth, WindLayer } from '../../src';
import gfs from '../data/gfs.json';

export const testWindLayer = () => {
  const wind = new WindLayer(useEarth());
  wind.add({
    data: gfs,
    paths: 20000,
    colorScale: '#ff0000ff',
    velocityScale: 1 / 300,
    lineWidth: 3,
    globalAlpha: 0.9
  });
  return () => wind.remove();
};
