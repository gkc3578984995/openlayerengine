import type { StyleLike } from 'ol/style/Style.js';
import type { Coordinate } from '../../src/core/common/types.js';
import type { ElementSelector } from '../../src/core/element/types.js';
import type { ShapeState, ShapeType } from '../../src/core/shape/types.js';
import type { InteractionPolicy, InteractionStatus } from '../../src/services/events/types.js';
import type { Element } from '../../src/facade/Element.js';
import type { DrawOptions, DrawService, DrawSession, DrawSessionEventMap, EditOptions, EditSession, EditSessionEventMap } from '../../src/facade/drawTypes.js';
import type { StyleInput } from '../../src/facade/styleTypes.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type Expect<Value extends true> = Value;

interface Payload {
  readonly name: string;
}

type ExpectedDrawOptions = {
  type: ShapeType;
  layerId: string;
  module?: string;
  style?: StyleInput;
  data?: Payload;
  limit?: number;
  keepGraphics?: boolean;
  policy?: InteractionPolicy;
};

type ExpectedEditOptions = {
  underlay?: boolean;
  policy?: InteractionPolicy;
};

type ExpectedDrawSessionEventMap = {
  readonly start: Readonly<{ type: 'start'; coordinate: Coordinate }>;
  readonly change: Readonly<{ type: 'change'; geometry: ShapeState; coordinate?: Coordinate }>;
  readonly click: Readonly<{ type: 'click'; coordinate: Coordinate; controlPointCount: number }>;
  readonly complete: Readonly<{ type: 'complete'; element: Element<Payload> }>;
  readonly cancel: Readonly<{
    type: 'cancel';
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'incomplete' | 'native' | 'error';
  }>;
};

type ExpectedEditSessionEventMap = {
  readonly modifying: Readonly<{
    type: 'modifying';
    element: Element<Payload>;
    geometry: ShapeState;
    operation: 'move' | 'insert' | 'remove' | 'undo' | 'redo';
    coordinate?: Coordinate;
  }>;
  readonly complete: Readonly<{ type: 'complete'; element: Element<Payload> }>;
  readonly cancel: Readonly<{
    type: 'cancel';
    reason: 'replaced' | 'destroyed' | 'cancelled' | 'external-change' | 'external-remove' | 'error';
  }>;
};

type ExpectedDrawSession = {
  readonly status: InteractionStatus;
  readonly results: readonly Element<Payload>[];
  readonly finished: Promise<readonly Element<Payload>[]>;
  finish(): void;
  cancel(): void;
  destroy(): void;
  undo(): boolean;
  redo(): boolean;
  on<K extends keyof DrawSessionEventMap<Payload>>(type: K, listener: (event: DrawSessionEventMap<Payload>[K]) => void): () => void;
};

type ExpectedEditSession = {
  readonly element: Element<Payload>;
  readonly status: InteractionStatus;
  readonly finished: Promise<Element<Payload> | undefined>;
  finish(): void;
  cancel(): void;
  destroy(): void;
  undo(): boolean;
  redo(): boolean;
  on<K extends keyof EditSessionEventMap<Payload>>(type: K, listener: (event: EditSessionEventMap<Payload>[K]) => void): () => void;
};

type ExpectedDrawService = {
  start<T>(options: DrawOptions<T>): DrawSession<T>;
  edit<T>(element: Element<T>, options?: EditOptions): EditSession<T>;
  query<T>(selector?: ElementSelector<T>): readonly Element<T>[];
  clear(selector?: ElementSelector): number;
};

type DrawOptionsAreExact = Expect<Equal<DrawOptions<Payload>, ExpectedDrawOptions>>;
type EditOptionsAreExact = Expect<Equal<EditOptions, ExpectedEditOptions>>;
type DrawEventsAreExact = Expect<Equal<DrawSessionEventMap<Payload>, ExpectedDrawSessionEventMap>>;
type EditEventsAreExact = Expect<Equal<EditSessionEventMap<Payload>, ExpectedEditSessionEventMap>>;
type DrawSessionIsExact = Expect<Equal<DrawSession<Payload>, ExpectedDrawSession>>;
type EditSessionIsExact = Expect<Equal<EditSession<Payload>, ExpectedEditSession>>;
type DrawServiceIsExact = Expect<Equal<DrawService, ExpectedDrawService>>;
type DrawLayerIdIsRequired = Expect<Equal<{} extends Pick<DrawOptions, 'layerId'> ? true : false, false>>;
type DrawStyleUsesPublicInput = Expect<Equal<DrawOptions['style'], StyleInput | undefined>>;

declare const service: DrawService;
declare const element: Element<Payload>;
declare const nativeStyle: StyleLike;

const structuredOptions: DrawOptions<Payload> = {
  type: 'point',
  layerId: 'draw-layer',
  style: { symbol: { type: 'circle', radius: 6 } },
  data: { name: 'structured' }
};
const nativeOptions: DrawOptions = { type: 'point', layerId: 'draw-layer', style: { nativeStyle } };

const drawSession = service.start(structuredOptions);
const editSession = service.edit(element, { underlay: true, policy: 'replace' });
service.query<Payload>({ module: 'module' });
service.clear({ layerId: 'draw-layer' });
drawSession.destroy();
editSession.destroy();

// @ts-expect-error 每次绘制都必须提供 layerId。
const missingLayerId: DrawOptions = { type: 'point' };
// @ts-expect-error OpenLayers 样式值必须通过 nativeStyle 包装器传入。
const unwrappedNativeStyle: DrawOptions = { type: 'point', layerId: 'draw-layer', style: nativeStyle };

void [
  nativeOptions,
  missingLayerId,
  unwrappedNativeStyle,
  null as unknown as DrawOptionsAreExact,
  null as unknown as EditOptionsAreExact,
  null as unknown as DrawEventsAreExact,
  null as unknown as EditEventsAreExact,
  null as unknown as DrawSessionIsExact,
  null as unknown as EditSessionIsExact,
  null as unknown as DrawServiceIsExact,
  null as unknown as DrawLayerIdIsRequired,
  null as unknown as DrawStyleUsesPublicInput
];
