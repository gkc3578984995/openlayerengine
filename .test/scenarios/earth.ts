import { Earth, useEarth, type EarthOptions, type UseEarthOptions } from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition } from '../harness/types.js';

export const earthScenario: ScenarioDefinition = {
  id: 'earth',
  group: '核心与实例',
  title: 'Earth 与 useEarth 实例管理',
  summary: '验证无参默认实例、无 id 配置默认实例、命名实例、带 id 配置实例与独立实例的创建、复用、销毁和重新创建。',
  steps: [
    '确认当前四个有效地图视口均能显示蓝色定位点，且无参、无 id 配置、命名和带 id 配置分支的检查均为通过。',
    '点击“销毁并重新创建默认实例”，确认旧实例进入 destroyed，新实例重新显示地图。',
    '点击“销毁并重新创建独立实例”，确认 new Earth() 不进入 useEarth 注册表且可以自行管理生命周期。',
    '检查当前状态中的 target、lifecycle、isDestroyed 以及全部服务入口。'
  ],
  mount(context) {
    const defaultTarget = context.createMapTarget('默认实例：useEarth()');
    defaultTarget.id = 'olContainer';
    const configuredDefaultTarget = context.createMapTarget('无 id 配置默认实例：useEarth({ target, view, controls })');
    const namedTarget = context.createMapTarget('命名实例：useEarth(id)');
    const namedId = 'acceptance-named-earth';
    namedTarget.id = namedId;
    const configuredTarget = context.createMapTarget('配置实例：useEarth(options)');
    const standaloneTarget = context.createMapTarget('独立实例：new Earth(options)');

    const configuredDefaultOptions: UseEarthOptions = {
      target: configuredDefaultTarget,
      view: { center: [1_000_000, -1_000_000], zoom: 4 },
      controls: { attribution: false, rotate: false, zoom: false }
    };
    const configuredOptions: UseEarthOptions = {
      id: 'acceptance-configured-earth',
      target: configuredTarget,
      view: { center: [2_000_000, 1_000_000], zoom: 3 },
      controls: { attribution: false, rotate: false, zoom: true }
    };
    const standaloneOptions: EarthOptions = {
      target: standaloneTarget,
      view: { center: [-2_000_000, -1_000_000], zoom: 3 },
      controls: { attribution: true, rotate: false, zoom: false }
    };

    const unconfiguredDefaultEarth = context.trackEarth(useEarth());
    addMarker(unconfiguredDefaultEarth, 'earth-default-no-arguments', [0, 0], '无参默认实例');
    context.render(unconfiguredDefaultEarth);
    context.check('useEarth() 无参首次调用创建默认实例', useEarth() === unconfiguredDefaultEarth && unconfiguredDefaultEarth.lifecycle === 'ready');
    unconfiguredDefaultEarth.destroy();
    context.check('无参默认实例销毁后释放默认注册项', unconfiguredDefaultEarth.isDestroyed);

    let defaultEarth = context.trackEarth(useEarth(configuredDefaultOptions));
    const namedEarth = context.trackEarth(useEarth(namedId));
    const configuredEarth = context.trackEarth(useEarth(configuredOptions));
    let standaloneEarth = context.trackEarth(new Earth(standaloneOptions));

    addMarker(defaultEarth, 'earth-default-configured', [1_000_000, -1_000_000], '无 id 配置默认实例');
    addMarker(namedEarth, 'earth-named', [0, 0], '命名实例');
    addMarker(configuredEarth, 'earth-options', [2_000_000, 1_000_000], '配置实例');
    addMarker(standaloneEarth, 'earth-standalone', [-2_000_000, -1_000_000], '独立实例');

    for (const earth of [defaultEarth, namedEarth, configuredEarth, standaloneEarth]) context.render(earth);

    context.check(
      'useEarth({ target, view, controls }) 不带 id 创建配置默认实例',
      !Object.prototype.hasOwnProperty.call(configuredDefaultOptions, 'id') &&
        defaultEarth.target === configuredDefaultTarget &&
        defaultEarth.view.getZoom() === 4 &&
        useEarth(configuredDefaultOptions) === defaultEarth &&
        useEarth() === defaultEarth
    );
    context.check('useEarth(id) 重复调用返回命名实例', useEarth(namedId) === namedEarth);
    context.check('useEarth(options) 重复调用返回配置实例', useEarth(configuredOptions) === configuredEarth);
    context.check('new Earth() 创建独立实例', standaloneEarth !== defaultEarth && standaloneEarth !== namedEarth && standaloneEarth !== configuredEarth);
    context.check('Earth.target 保留 HTMLElement', configuredEarth.target === configuredTarget && standaloneEarth.target === standaloneTarget);

    inspectEarth(context, '无 id 配置默认实例', defaultEarth);
    inspectEarth(context, '命名实例', namedEarth);
    inspectEarth(context, '配置实例', configuredEarth);
    inspectEarth(context, '独立实例', standaloneEarth);

    const lifecycleSection = context.section('生命周期操作', '所有销毁操作都是幂等的；useEarth 管理的实例销毁后，相同 key 会创建新实例。');
    const lifecycleActions = context.actions(lifecycleSection);
    context.button(
      lifecycleActions,
      '销毁并重新创建默认实例',
      () => {
        const previous = defaultEarth;
        previous.destroy();
        context.check('旧默认实例已销毁', previous.lifecycle === 'destroyed' && previous.isDestroyed);
        defaultEarth = context.trackEarth(useEarth());
        addMarker(defaultEarth, 'earth-default-recreated', [0, 0], '重新创建');
        context.render(defaultEarth);
        context.check('useEarth() 返回全新的默认实例', defaultEarth !== previous && useEarth() === defaultEarth);
        inspectEarth(context, '默认实例', defaultEarth);
      },
      '主要'
    );
    context.button(lifecycleActions, '重复调用默认实例 destroy()', () => {
      defaultEarth.destroy();
      defaultEarth.destroy();
      context.check('destroy() 重复调用保持 destroyed', defaultEarth.lifecycle === 'destroyed' && defaultEarth.isDestroyed);
    });
    context.button(
      lifecycleActions,
      '销毁并重新创建独立实例',
      () => {
        const previous = standaloneEarth;
        previous.destroy();
        standaloneEarth = context.trackEarth(new Earth(standaloneOptions));
        addMarker(standaloneEarth, 'earth-standalone-recreated', [-2_000_000, -1_000_000], '重新创建');
        context.render(standaloneEarth);
        context.check('new Earth() 可独立重新创建', previous.isDestroyed && standaloneEarth !== previous && standaloneEarth.lifecycle === 'ready');
        inspectEarth(context, '独立实例', standaloneEarth);
      },
      '主要'
    );

    const serviceSection = context.section('公开服务入口', '点击后逐一读取 Earth 的公开属性，验证外部用户可以从单一实例访问全部能力。');
    context.button(context.actions(serviceSection), '检查全部 Earth 属性', () => {
      inspectEarth(context, '配置实例', configuredEarth);
      context.log('已读取 Earth 的全部公开属性', '成功');
    });

    context.setCode(`
import { Earth, useEarth } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const defaultEarth = useEarth();
const sameDefault = useEarth();

defaultEarth.destroy();
const configuredDefault = useEarth({
  target: document.querySelector<HTMLElement>('#configured-default-map')!,
  view: { center: [0, 0], zoom: 4 },
  controls: { attribution: false, rotate: false }
});

const namedEarth = useEarth('planning-map');
const sameNamed = useEarth('planning-map');

const configuredEarth = useEarth({
  id: 'configured-map',
  target: document.querySelector<HTMLElement>('#configured-map')!,
  view: { center: [0, 0], zoom: 4 },
  controls: { rotate: false }
});

const standalone = new Earth({ target: 'preview-map' });
standalone.destroy();
`);
  }
};

function addMarker(earth: Earth, id: string, coordinate: readonly [number, number], label: string): void {
  earth.elements.add({
    id,
    geometry: { type: 'point', controlPoints: [coordinate] },
    style: {
      symbol: {
        type: 'circle',
        radius: 8,
        fill: { type: 'solid', color: '#1677ff' },
        stroke: { color: '#ffffff', width: 3 }
      },
      text: {
        text: label,
        fontSize: 14,
        fontWeight: 'bold',
        fill: { type: 'solid', color: '#16324f' },
        backgroundFill: { type: 'solid', color: [255, 255, 255, 0.9] },
        padding: [4, 7, 4, 7],
        offsetY: -22
      }
    }
  });
}

function inspectEarth(context: Parameters<ScenarioDefinition['mount']>[0], label: string, earth: Earth): void {
  const services = {
    map: earth.map,
    target: earth.target,
    elements: earth.elements,
    layers: earth.layers,
    styles: earth.styles,
    animations: earth.animations,
    draw: earth.draw,
    transform: earth.transform,
    measure: earth.measure,
    events: earth.events,
    contextMenu: earth.contextMenu,
    overlays: earth.overlays,
    view: earth.view,
    controls: earth.controls
  };
  context.status(`${label} lifecycle`, earth.lifecycle);
  context.status(`${label} isDestroyed`, earth.isDestroyed);
  context.status(`${label} target`, typeof earth.target === 'string' ? earth.target : `#${earth.target.id}`);
  context.status(`${label} 公开服务`, Object.keys(services));
  context.check(
    `${label}全部公开服务可访问`,
    Object.values(services).every((service) => service !== undefined)
  );
}
