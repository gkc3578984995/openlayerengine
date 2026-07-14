import { useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const earth = useEarth({ target: 'map', view: { center: [0, 0], zoom: 4 } });
let rendered = false;

const consumer = Object.freeze({
  get rendered() {
    return rendered;
  },
  get lifecycle() {
    return earth.lifecycle;
  },
  destroy() {
    earth.destroy();
    return earth.lifecycle;
  }
});

Object.defineProperty(window, '__OL_ENGINE_PACKAGE_CONSUMER__', {
  configurable: false,
  enumerable: false,
  value: consumer,
  writable: false
});

earth.map.updateSize();
earth.map.renderSync();
requestAnimationFrame(() => {
  earth.map.renderSync();
  rendered = true;
});

declare global {
  interface Window {
    readonly __OL_ENGINE_PACKAGE_CONSUMER__?: {
      readonly rendered: boolean;
      readonly lifecycle: string;
      destroy(): string;
    };
  }
}
