import type { Coordinate } from '../../src/core/common/types.js';
import type { HorizontalWorld, PreparedWorldEdit } from '../../src/core/common/worldWrap.js';
import type {
  DrawInteractionEvent,
  DrawInteractionHandle,
  DrawInteractionPort,
  DrawInteractionRenderState,
  DrawInteractionSpec
} from '../../src/core/ports/DrawInteractionPort.js';
import type {
  EditControlAnchor,
  EditInsertionAnchor,
  EditInteractionEvent,
  EditInteractionHandle,
  EditInteractionPort,
  EditInteractionRenderState,
  EditInteractionSpec
} from '../../src/core/ports/EditInteractionPort.js';
import type { RenderGeometryState } from '../../src/core/shape/types.js';
import type { ElementStyleState } from '../../src/core/style/types.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type Expect<Value extends true> = Value;

type ExpectedDrawSpec = {
  readonly layerId: string;
  readonly mode: 'point' | 'vertices';
  readonly freehand: boolean;
};
type ExpectedDrawRenderState = {
  readonly geometry: RenderGeometryState;
  readonly style: ElementStyleState;
};
type ExpectedDrawEvent =
  | { readonly type: 'move'; readonly coordinate: Coordinate }
  | { readonly type: 'click'; readonly coordinate: Coordinate }
  | { readonly type: 'freehand-start'; readonly coordinate: Coordinate }
  | { readonly type: 'freehand-sample'; readonly coordinate: Coordinate }
  | { readonly type: 'freehand-complete'; readonly coordinate: Coordinate }
  | { readonly type: 'freehand-cancel' };
type ExpectedDrawHandle = {
  readonly world?: HorizontalWorld;
  render(state: Readonly<DrawInteractionRenderState> | undefined): void;
  destroy(): void;
};
type ExpectedDrawPort = {
  open(spec: Readonly<DrawInteractionSpec>, listener: (event: DrawInteractionEvent) => void): DrawInteractionHandle;
};

type DrawSpecIsExact = Expect<Equal<DrawInteractionSpec, ExpectedDrawSpec>>;
type DrawRenderStateIsExact = Expect<Equal<DrawInteractionRenderState, ExpectedDrawRenderState>>;
type DrawEventIsExact = Expect<Equal<DrawInteractionEvent, ExpectedDrawEvent>>;
type DrawHandleIsExact = Expect<Equal<DrawInteractionHandle, ExpectedDrawHandle>>;
type DrawPortIsExact = Expect<Equal<DrawInteractionPort, ExpectedDrawPort>>;

type ExpectedControlAnchor = {
  readonly kind: 'control';
  readonly index: number;
  readonly coordinate: Coordinate;
  readonly role?: string;
  readonly removable: boolean;
};
type ExpectedInsertionAnchor = {
  readonly kind: 'insertion';
  readonly index: number;
  readonly coordinate: Coordinate;
};
type ExpectedEditSpec = {
  readonly elementId: string;
  readonly controlPoints: readonly Coordinate[];
  readonly underlay: boolean;
};
type ExpectedEditRenderState = {
  readonly geometry: RenderGeometryState;
  readonly style: ElementStyleState;
  readonly anchors: readonly (EditControlAnchor | EditInsertionAnchor)[];
};
type ExpectedEditEvent =
  | { readonly type: 'move-start'; readonly anchor: EditControlAnchor; readonly coordinate: Coordinate }
  | { readonly type: 'move'; readonly anchor: EditControlAnchor; readonly coordinate: Coordinate }
  | { readonly type: 'move-end'; readonly anchor: EditControlAnchor; readonly coordinate: Coordinate }
  | { readonly type: 'move-cancel'; readonly anchor: EditControlAnchor }
  | { readonly type: 'insert'; readonly anchor: EditInsertionAnchor }
  | { readonly type: 'remove'; readonly anchor: EditControlAnchor };
type ExpectedEditHandle = {
  readonly placement: PreparedWorldEdit;
  render(state: Readonly<EditInteractionRenderState>): void;
  destroy(): void;
};
type ExpectedEditPort = {
  open(spec: Readonly<EditInteractionSpec>, listener: (event: EditInteractionEvent) => void): EditInteractionHandle;
};

type ControlAnchorIsExact = Expect<Equal<EditControlAnchor, ExpectedControlAnchor>>;
type InsertionAnchorIsExact = Expect<Equal<EditInsertionAnchor, ExpectedInsertionAnchor>>;
type EditSpecIsExact = Expect<Equal<EditInteractionSpec, ExpectedEditSpec>>;
type EditRenderStateIsExact = Expect<Equal<EditInteractionRenderState, ExpectedEditRenderState>>;
type EditEventIsExact = Expect<Equal<EditInteractionEvent, ExpectedEditEvent>>;
type EditHandleIsExact = Expect<Equal<EditInteractionHandle, ExpectedEditHandle>>;
type EditPortIsExact = Expect<Equal<EditInteractionPort, ExpectedEditPort>>;

declare const draw: DrawInteractionPort;
declare const edit: EditInteractionPort;
declare const geometry: RenderGeometryState;
declare const style: ElementStyleState;
declare const control: EditControlAnchor;

const drawHandle = draw.open({ layerId: 'draw', mode: 'vertices', freehand: true }, () => undefined);
drawHandle.render({ geometry, style });
drawHandle.render(undefined);
drawHandle.destroy();

const editHandle = edit.open({ elementId: 'target', controlPoints: [[0, 0]], underlay: false }, () => undefined);
editHandle.render({ geometry, style, anchors: [control] });
editHandle.destroy();

// @ts-expect-error 绘制模式是语义模式，不能使用 OpenLayers 几何名称。
draw.open({ layerId: 'draw', mode: 'LineString', freehand: true }, () => undefined);
// @ts-expect-error 自由绘制是显式能力标志，不是第三种互斥模式。
draw.open({ layerId: 'draw', mode: 'freehand', freehand: true }, () => undefined);
// @ts-expect-error 持久元素状态不能跨越纯预览渲染边界。
drawHandle.render({ geometry, style, elementId: 'preview' });
// @ts-expect-error 编辑放置结果由 open 生成，调用方不能自行传入。
edit.open({ elementId: 'target', controlPoints: [[0, 0]], underlay: false, placement: editHandle.placement }, () => undefined);
// @ts-expect-error 纯 Core 端口边界禁止传递原生 Feature。
edit.open({ elementId: 'target', controlPoints: [[0, 0]], underlay: false, feature: {} }, () => undefined);

void [
  null as unknown as DrawSpecIsExact,
  null as unknown as DrawRenderStateIsExact,
  null as unknown as DrawEventIsExact,
  null as unknown as DrawHandleIsExact,
  null as unknown as DrawPortIsExact,
  null as unknown as ControlAnchorIsExact,
  null as unknown as InsertionAnchorIsExact,
  null as unknown as EditSpecIsExact,
  null as unknown as EditRenderStateIsExact,
  null as unknown as EditEventIsExact,
  null as unknown as EditHandleIsExact,
  null as unknown as EditPortIsExact
];
