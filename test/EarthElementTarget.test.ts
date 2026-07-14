import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeHtmlElement, FakeMap } from './helpers/EarthMapHarness.js';

vi.mock('ol/interaction/defaults.js', async () => {
  const { default: DragPan } = await import('ol/interaction/DragPan.js');
  const { FakeCollection } = await import('./helpers/EarthMapHarness.js');
  return { defaults: () => new FakeCollection([new DragPan()]) };
});

vi.mock('ol/control/defaults.js', async () => {
  const { FakeCollection } = await import('./helpers/EarthMapHarness.js');
  return { defaults: () => new FakeCollection() };
});

vi.mock('ol/Map.js', async () => {
  const { FakeMap: BaseMap } = await import('./helpers/EarthMapHarness.js');
  return {
    default: class TargetAwareMap extends BaseMap {
      getTargetElement(): HTMLElement {
        return this.target as HTMLElement;
      }
    }
  };
});

import Earth from '../src/facade/Earth.js';
import { resetEarthRegistryForTests } from '../src/facade/earthRegistry.js';
import { useEarth, type UseEarthOptions } from '../src/facade/useEarth.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

const earths: Earth[] = [];

beforeEach(() => {
  earths.length = 0;
  vi.stubGlobal('HTMLElement', FakeHtmlElement);
  vi.stubGlobal('document', {
    createElement: () => new FakeHtmlElement(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
});

afterEach(() => {
  for (const earth of [...earths].reverse()) earth.destroy();
  resetEarthRegistryForTests();
  vi.unstubAllGlobals();
});

describe('HTMLElement Earth target', () => {
  coversCapabilities('earth-target-string-or-element', 'earth-browser-contextmenu-suppression', 'overlay-add-config', 'overlay-position-hide');

  it('从 useEarth 到 Earth 与 OpenLayers Map 始终保留同一 HTMLElement', () => {
    const target = new FakeHtmlElement() as unknown as HTMLElement;
    const earth = createEarth({ id: 'element-target', target });
    const map = earth.map as unknown as FakeMap;

    expect(earth.target).toBe(target);
    expect(map.target).toBe(target);
    expect(earth.map.getTargetElement()).toBe(target);
    expect(useEarth('element-target')).toBe(earth);
  });

  it('在 HTMLElement target 上通过 v2 OverlayService 管理元素', () => {
    const target = new FakeHtmlElement() as unknown as HTMLElement;
    const earth = createEarth({ id: 'element-target', target });
    const map = earth.map as unknown as FakeMap;
    const element = new FakeHtmlElement() as unknown as HTMLElement;

    const overlay = earth.overlays.add({ id: 'target-overlay', element, position: [1, 2] });

    expect(map.getOverlays().getArray()).toHaveLength(1);
    expect(overlay.position).toEqual([1, 2]);
    expect(overlay.visible).toBe(true);

    map.setTarget(undefined);
    expect(() => overlay.setPosition([3, 4])).not.toThrow();
    expect(overlay.position).toEqual([3, 4]);
    overlay.destroy();
    expect(map.getOverlays().getArray()).toEqual([]);
  });

  it('把浏览器右键抑制隔离到各自 Earth viewport，并在销毁后解除', () => {
    const first = createEarth({ id: 'context-first', target: new FakeHtmlElement() as unknown as HTMLElement });
    const second = createEarth({ id: 'context-second', target: new FakeHtmlElement() as unknown as HTMLElement });
    const firstViewport = (first.map as unknown as FakeMap).viewport;
    const secondViewport = (second.map as unknown as FakeMap).viewport;
    const firstEvent = new Event('contextmenu', { cancelable: true });
    const secondEvent = new Event('contextmenu', { cancelable: true });

    firstViewport.dispatchEvent(firstEvent);
    secondViewport.dispatchEvent(secondEvent);
    expect(firstEvent.defaultPrevented).toBe(true);
    expect(secondEvent.defaultPrevented).toBe(true);

    first.destroy();
    const destroyedEvent = new Event('contextmenu', { cancelable: true });
    const activeEvent = new Event('contextmenu', { cancelable: true });
    firstViewport.dispatchEvent(destroyedEvent);
    secondViewport.dispatchEvent(activeEvent);

    expect(destroyedEvent.defaultPrevented).toBe(false);
    expect(activeEvent.defaultPrevented).toBe(true);
  });
});

function createEarth(options: UseEarthOptions): Earth {
  const earth = useEarth(options);
  if (!earths.includes(earth)) earths.push(earth);
  return earth;
}
