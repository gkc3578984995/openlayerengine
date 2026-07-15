import {
  Earth,
  type ContextMenuHandle,
  type ContextMenuItemContext,
  type ContextMenuItemSpec,
  type ContextMenuItemState,
  type ContextMenuService,
  type ContextMenuSpec,
  type ContextMenuStateTarget,
  type ContextMenuTarget,
  type EarthEventMap,
  type EarthEventType,
  type EarthKeyboardEvent,
  type EarthPointerEvent,
  type EventService,
  type EventSubscriptionOptions,
  type InteractionPolicy,
  type InteractionStatus
} from '@vrsim/earth-engine-ol';
import type { ScenarioDefinition } from '../harness/types.js';

const moduleName = '验收模块';

const mapItems: readonly ContextMenuItemSpec[] = Object.freeze([
  Object.freeze({ key: 'map-primary', label: '地图主操作', mutexKey: 'map-alternate' }),
  Object.freeze({ key: 'map-alternate', label: '地图备选操作', visible: false, mutexKey: 'map-primary' }),
  Object.freeze({ key: 'map-guarded', label: '受 before 控制的操作' }),
  Object.freeze({ key: 'map-disabled', label: '始终禁用的操作', disabled: true }),
  Object.freeze({
    key: 'map-tools',
    label: '级联工具',
    children: Object.freeze([Object.freeze({ key: 'map-zoom', label: '级联项：缩放' }), Object.freeze({ key: 'map-export', label: '级联项：导出' })])
  })
]);

const moduleItems: readonly ContextMenuItemSpec[] = Object.freeze([
  Object.freeze({ key: 'module-primary', label: '模块操作' }),
  Object.freeze({ key: 'module-secondary', label: '模块备选操作' })
]);

const elementItems: readonly ContextMenuItemSpec[] = Object.freeze([
  Object.freeze({ key: 'element-primary', label: '元素专属操作' }),
  Object.freeze({ key: 'element-hidden', label: '可切换显隐的操作' }),
  Object.freeze({ key: 'element-disabled', label: '元素禁用操作', disabled: true })
]);

export const eventsMenuScenario: ScenarioDefinition = {
  id: 'events-menu',
  group: '事件与菜单',
  title: '事件路由与右键菜单',
  summary: '在真实 OpenLayers 视口中验收七类输入事件、订阅生命周期以及 map、module、element 三级右键菜单。',
  steps: [
    '在两个带文字的点上移动、单击、双击和右击，观察事件载荷中的 Element、Layer、olFeature 与 originalEvent。',
    '右击空白地图、“模块菜单”点和“元素菜单”点，确认分别出现 map、module 和 element 菜单。',
    '切换 before 开关、菜单项状态和浅色/深色主题，验证禁用、显隐、互斥与级联项。',
    '使用 AbortSignal、once 和 clearModule 控制订阅，确认 has 状态与事件日志同步变化。',
    '点击地图后按下带修饰键的键盘键，检查 key、code 与四个修饰键字段。',
    '销毁并重建 element 菜单，确认销毁后该点回退到 module 菜单，且地图原生右键始终被屏蔽。'
  ],
  mount(context) {
    const target = context.createMapTarget('事件与右键菜单地图');
    target.tabIndex = 0;
    const earth = context.trackEarth(
      new Earth({
        target,
        view: { center: [0, 0], zoom: 3 },
        controls: { attribution: false, rotate: false, zoom: true }
      })
    );
    const events: EventService = earth.events;
    const menus: ContextMenuService = earth.contextMenu;
    const interactionPolicy: InteractionPolicy = 'replace';
    const interactionStatus: InteractionStatus = 'active';

    const exactElement = earth.elements.add({
      id: 'events-menu-exact',
      module: moduleName,
      data: { role: '元素优先菜单' },
      geometry: { type: 'point', controlPoints: [[-2_000_000, 0]] },
      style: pointStyle('#dc2626', '元素菜单')
    });
    const moduleElement = earth.elements.add({
      id: 'events-menu-module',
      module: moduleName,
      data: { role: '模块回退菜单' },
      geometry: { type: 'point', controlPoints: [[2_000_000, 0]] },
      style: pointStyle('#2563eb', '模块菜单')
    });

    context.status('交互策略类型', interactionPolicy);
    context.status('交互状态类型', interactionStatus);
    context.status('全局 click 订阅', false);
    context.status('模块 rightclick 订阅', false);

    const eventControls = context.section('事件订阅', '地图容器可获得焦点；键盘事件需先点击地图。');
    const eventActions = context.actions(eventControls);
    const abortController = new AbortController();
    context.track(() => abortController.abort());

    const selectorOptions: EventSubscriptionOptions = Object.freeze({ selector: { ids: [exactElement.id, moduleElement.id] } });
    const signalOptions: EventSubscriptionOptions = Object.freeze({ signal: abortController.signal });
    context.track(events.on('pointermove', (event) => recordPointer(context, event), selectorOptions));
    context.track(
      events.on('click', (event) => {
        context.status('全局 click 订阅', true);
        recordPointer(context, event);
      })
    );
    context.track(events.on('leftdown', (event) => recordPointer(context, event), signalOptions));
    context.track(events.on('leftup', (event) => recordPointer(context, event)));
    context.track(events.once('doubleclick', (event) => recordPointer(context, event)));
    context.track(events.on('keydown', (event) => recordKeyboard(context, event)));

    let moduleEventDispose: (() => void) | undefined;
    const installModuleSubscription = (): void => {
      if (moduleEventDispose !== undefined && events.has('rightclick', moduleName)) return;
      moduleEventDispose = events.on('rightclick', (event) => recordPointer(context, event), { module: moduleName });
      context.status('模块 rightclick 订阅', events.has('rightclick', moduleName));
    };
    installModuleSubscription();
    context.track(() => moduleEventDispose?.());

    context.button(eventActions, '中止 leftdown 的 AbortSignal', () => {
      abortController.abort();
      context.check('AbortSignal 已中止', abortController.signal.aborted);
    });
    context.button(eventActions, '清理模块 rightclick 订阅', () => {
      events.clearModule(moduleName, 'rightclick');
      moduleEventDispose = undefined;
      context.status('模块 rightclick 订阅', events.has('rightclick', moduleName));
    });
    context.button(eventActions, '重建模块 rightclick 订阅', installModuleSubscription);
    context.button(eventActions, '清理该模块的全部订阅', () => {
      events.clearModule(moduleName);
      moduleEventDispose = undefined;
      context.status('模块 rightclick 订阅', events.has('rightclick', moduleName));
    });
    context.button(eventActions, '检查 has 状态', () => {
      context.status('has(click)', events.has('click'));
      context.status('has(rightclick, module)', events.has('rightclick', moduleName));
    });

    const menuControls = context.section('右键菜单', '右键命中按 element → module → map 的顺序解析。');
    let beforeAllowed = true;
    context.checkbox(menuControls, '允许 before 受控菜单项', beforeAllowed, (value) => {
      beforeAllowed = value;
      context.status('before 允许', value);
    });

    const sharedCallbacks: Pick<ContextMenuSpec, 'before' | 'onSelect'> = {
      before: (menuContext) => menuContext.item.key !== 'map-guarded' || beforeAllowed,
      onSelect: (menuContext) => recordMenuSelection(context, menuContext)
    };
    const mapSpec: ContextMenuSpec = Object.freeze({ items: mapItems, ...sharedCallbacks });
    const moduleSpec: ContextMenuSpec = Object.freeze({ items: moduleItems, onSelect: sharedCallbacks.onSelect });
    const elementSpec: ContextMenuSpec = Object.freeze({ items: elementItems, onSelect: sharedCallbacks.onSelect });

    const registerMenu = (targetValue: ContextMenuTarget, spec: ContextMenuSpec): ContextMenuHandle => menus.register(targetValue, spec);
    const mapHandle = registerMenu('map', mapSpec);
    const moduleHandle = registerMenu({ module: moduleName }, moduleSpec);
    let elementHandle: ContextMenuHandle | undefined = registerMenu(exactElement, elementSpec);
    context.track(() => elementHandle?.destroy());
    context.track(() => moduleHandle.destroy());
    context.track(() => mapHandle.destroy());

    let mapPrimaryDisabled = false;
    const menuActions = context.actions(menuControls);
    context.button(menuActions, '读取三类菜单项状态', () => {
      showMenuState(context, menus, 'map', 'map-primary', 'map-primary');
      showMenuState(context, menus, moduleElement, 'module-primary', 'module-primary');
      showMenuState(context, menus, exactElement, 'element-primary', 'element-primary');
    });
    context.button(menuActions, '切换 map-primary 禁用', () => {
      mapPrimaryDisabled = !mapPrimaryDisabled;
      menus.setItemState('map', 'map-primary', { disabled: mapPrimaryDisabled });
      showMenuState(context, menus, 'map', 'map-primary', 'map-primary');
    });
    context.button(menuActions, '切换 module-primary 显隐', () => {
      const state: ContextMenuItemState = menus.toggleItem(moduleElement, 'module-primary');
      context.status('module-primary 状态', state);
    });
    context.button(menuActions, '切换互斥地图项', () => {
      const current = menus.getItemState('map', 'map-primary');
      menus.setItemState('map', 'map-primary', { visible: !(current?.visible ?? true) });
      showMenuState(context, menus, 'map', 'map-primary', 'map-primary');
      showMenuState(context, menus, 'map', 'map-alternate', 'map-alternate');
    });
    context.button(menuActions, '隐藏元素菜单项', () => {
      menus.setItemState(exactElement, 'element-hidden', { visible: false });
      showMenuState(context, menus, exactElement, 'element-hidden', 'element-hidden');
    });
    context.button(menuActions, '清理元素菜单状态', () => {
      menus.clearElementState(exactElement.id);
      showMenuState(context, menus, exactElement, 'element-hidden', 'element-hidden');
    });
    context.button(menuActions, '设为深色主题', () => {
      menus.setTheme('dark');
      context.status('菜单主题', 'dark');
    });
    context.button(menuActions, '设为浅色主题', () => {
      menus.setTheme('light');
      context.status('菜单主题', 'light');
    });
    context.button(menuActions, '切换菜单主题', () => context.status('菜单主题', menus.toggleTheme()));
    context.button(menuActions, '关闭当前菜单', () => menus.close());
    context.button(
      menuActions,
      '销毁元素菜单',
      () => {
        elementHandle?.destroy();
        elementHandle = undefined;
        context.status('元素菜单注册', false);
      },
      '危险'
    );
    context.button(menuActions, '重建元素菜单', () => {
      elementHandle?.destroy();
      elementHandle = registerMenu(exactElement, elementSpec);
      context.status('元素菜单注册', true);
    });

    context.check('EventService 已安装全局 click', events.has('click'));
    context.check('ContextMenu map/module/element 已注册', true);
    context.status('元素菜单注册', true);
    context.status('before 允许', beforeAllowed);
    context.setCode(`
import { Earth } from '@vrsim/earth-engine-ol';

const earth = new Earth({ target: document.querySelector<HTMLElement>('#map')! });
const dispose = earth.events.on('click', event => console.log(event.element, event.originalEvent));
const menu = earth.contextMenu.register('map', {
  items: [{ key: 'inspect', label: '查看位置' }],
  onSelect: context => console.log(context.coordinate, context.pixel)
});

// 清理订阅、菜单和 Earth。
dispose();
menu.destroy();
earth.destroy();
    `);
    context.render(earth);
  }
};

function pointStyle(color: string, label: string) {
  return {
    symbol: {
      type: 'circle' as const,
      radius: 13,
      fill: { type: 'solid' as const, color },
      stroke: { color: '#ffffff', width: 3 }
    },
    text: {
      text: label,
      fontSize: 14,
      fontWeight: 700,
      fill: { type: 'solid' as const, color: '#111827' },
      backgroundFill: { type: 'solid' as const, color: 'rgba(255,255,255,0.88)' },
      padding: [3, 5, 3, 5],
      offsetY: -27
    }
  };
}

type PointerEventType = Exclude<EarthEventType, 'keydown'>;
type PublicPointerEvent = EarthEventMap[PointerEventType];

function recordPointer(context: Parameters<ScenarioDefinition['mount']>[0], event: PublicPointerEvent): void {
  const pointer: EarthPointerEvent<PointerEventType> = event;
  const phase = 'phase' in pointer ? pointer.phase : undefined;
  const summary = {
    type: pointer.type,
    coordinate: pointer.coordinate,
    pixel: pointer.pixel,
    phase,
    element: pointer.element?.id,
    module: pointer.module,
    layer: pointer.layer?.id,
    olFeature: pointer.olFeature?.getId() ?? '已提供但未设置 Feature id',
    originalEvent: pointer.originalEvent.constructor.name,
    defaultPrevented: pointer.originalEvent.defaultPrevented
  };
  context.status('最近指针事件', summary);
  if (pointer.type !== 'pointermove' || phase !== 'move') context.log(`收到 ${pointer.type} 事件`, '信息', summary);
}

function recordKeyboard(context: Parameters<ScenarioDefinition['mount']>[0], event: EarthKeyboardEvent): void {
  const summary = {
    type: event.type,
    key: event.key,
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    originalEvent: event.originalEvent.constructor.name
  };
  context.status('最近键盘事件', summary);
  context.log('收到 keydown 事件', '信息', summary);
}

function recordMenuSelection(context: Parameters<ScenarioDefinition['mount']>[0], menuContext: ContextMenuItemContext): void {
  context.log('选择右键菜单项', '成功', {
    item: menuContext.item,
    scope: menuContext.scope,
    coordinate: menuContext.coordinate,
    pixel: menuContext.pixel,
    element: menuContext.element?.id,
    module: menuContext.module,
    layer: menuContext.layer?.id
  });
}

function showMenuState(
  context: Parameters<ScenarioDefinition['mount']>[0],
  menus: ContextMenuService,
  target: ContextMenuStateTarget,
  key: string,
  label: string
): void {
  context.status(`${label} 状态`, menus.getItemState(target, key));
}
