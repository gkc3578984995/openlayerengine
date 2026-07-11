import Earth from './Earth';
import { ViewOptions } from 'ol/View';
import { IEarthConstructorOptions } from './interface';
import { setDefaultEarthProvider } from './earthContext';

let earth: Earth | undefined;
/**
 * 创建地图实例
 * @param viewOptions 地图视图参数
 * @param options 地图自定义参数
 * @returns `Earth`实例，详见{@link Earth}
 */
const useEarth = (viewOptions?: ViewOptions, options?: IEarthConstructorOptions): Earth => {
  if (!earth || earth.isDestroyed) {
    earth = new Earth(viewOptions, options);
    const current = earth;
    const rawDestroy = current.destroy.bind(current);
    current.destroy = () => {
      rawDestroy();
      if (earth === current) {
        earth = undefined;
      }
    };
  }
  return earth;
};

/**
 * 销毁并清空当前地图单例
 */
const destroyEarth = (): void => {
  if (earth && !earth.isDestroyed) {
    earth.destroy();
  }
  earth = undefined;
};

setDefaultEarthProvider(() => useEarth());

export { useEarth, destroyEarth };
