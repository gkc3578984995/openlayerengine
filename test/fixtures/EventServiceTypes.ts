import type {
  EarthEventMap,
  EarthEventType,
  EarthKeyboardEvent,
  EarthPointerEvent,
  EventDisposer,
  EventService,
  EventSubscriptionOptions
} from '../../src/facade/EventFacade.js';

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type _EventTypes = Expect<Equal<EarthEventType, 'pointermove' | 'click' | 'leftdown' | 'leftup' | 'doubleclick' | 'rightclick' | 'keydown'>>;

declare const events: EventService;

const globalOptions = {} satisfies EventSubscriptionOptions;
const signalOptions = { signal: new AbortController().signal } satisfies EventSubscriptionOptions;
const selectorOptions = { selector: { id: 'element' } } satisfies EventSubscriptionOptions;
const moduleOptions = { module: 'draw' } satisfies EventSubscriptionOptions;
void [globalOptions, signalOptions, selectorOptions, moduleOptions];

// @ts-expect-error exact optional properties reject explicit undefined
const explicitUndefined: EventSubscriptionOptions = { signal: undefined };
// @ts-expect-error selector and module are mutually exclusive
const mixedOptions: EventSubscriptionOptions = { selector: { id: 'element' }, module: 'draw' };
void [explicitUndefined, mixedOptions];

const clickDisposer: EventDisposer = events.on('click', (event) => {
  type _Type = Expect<Equal<typeof event.type, 'click'>>;
  type _Event = Expect<Equal<typeof event.originalEvent, Event>>;
  type _Coordinate = Expect<Equal<typeof event.coordinate, readonly [number, number] | readonly [number, number, number]>>;
  type _NoInternalRef = Expect<Equal<Extract<keyof typeof event, 'nativeEventRef'>, never>>;
  void (0 as unknown as _Type | _Event | _Coordinate | _NoInternalRef);
  event.element?.olFeature;
  event.layer?.olLayer;
  // @ts-expect-error phase exists only for pointermove
  event.phase;
});

const moveDisposer: EventDisposer = events.on('pointermove', (event) => {
  type _Move = Expect<Equal<typeof event, EarthPointerEvent<'pointermove'>>>;
  const phase: 'enter' | 'move' | 'leave' | undefined = event.phase;
  void (0 as unknown as _Move);
  void phase;
});

const keyDisposer: EventDisposer = events.once('keydown', (event) => {
  type _Key = Expect<Equal<typeof event, EarthKeyboardEvent>>;
  type _Native = Expect<Equal<typeof event.originalEvent, KeyboardEvent>>;
  type _NoInternalRef = Expect<Equal<Extract<keyof typeof event, 'nativeEventRef'>, never>>;
  void (0 as unknown as _Key | _Native | _NoInternalRef);
});

// @ts-expect-error keydown is Earth-global only
events.on('keydown', () => undefined, { module: 'draw' });
// @ts-expect-error keydown selectors are forbidden
events.once('keydown', () => undefined, { selector: { id: 'element' } });

const click: EarthEventMap['click'] = null as unknown as EarthPointerEvent<'click'>;
const key: EarthEventMap['keydown'] = null as unknown as EarthKeyboardEvent;
const type: EarthEventType = 'rightclick';
void [clickDisposer, moveDisposer, keyDisposer, click, key, type];

declare const dynamicType: EarthEventType;
events.on(dynamicType, () => undefined, { signal: new AbortController().signal });
// @ts-expect-error a dynamic union may be keydown, so scoped options are forbidden
events.on(dynamicType, () => undefined, { module: 'draw' });
const dynamicModuleOptions = { signal: new AbortController().signal, module: 'draw' } as const;
const dynamicSelectorOptions = { signal: new AbortController().signal, selector: { id: 'element' } } as const;
// @ts-expect-error scoped variables cannot bypass the dynamic keydown restriction
events.on(dynamicType, () => undefined, dynamicModuleOptions);
// @ts-expect-error selector variables cannot bypass the dynamic keydown restriction
events.once(dynamicType, () => undefined, dynamicSelectorOptions);
void (0 as unknown as _EventTypes);

const globalState: boolean = events.has('click');
const moduleState: boolean = events.has('click', 'draw');
const cleared: void = events.clearModule('draw');
const clearedType: void = events.clearModule('draw', 'click');
void [globalState, moduleState, cleared, clearedType];

// @ts-expect-error EventService deliberately has no manual enable
events.enable('click');
// @ts-expect-error EventService deliberately has no manual disable
events.disable('click');
