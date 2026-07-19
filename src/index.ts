/**
 * 面向 OpenLayers 的 TypeScript 地图能力库。
 *
 * 通常从 `useEarth` 获取地图实例，再通过 Earth 暴露的服务管理图层、Element 和交互。
 *
 * @packageDocumentation
 */
export { default as Earth } from './Earth.js';
export { Element } from './facade/Element.js';
export { Layer } from './facade/Layer.js';
export {
  CapabilityError,
  DuplicateElementIdError,
  InteractionConflictError,
  InvalidArgumentError,
  InvalidSelectorError,
  ObjectDisposedError,
  UnsupportedOperationError
} from './core/errors.js';
export { add2, closeRing, degToRad, lerp2, quadraticBezier2, radToDeg, scale2, toFlatCoordinates, trimClosingCoordinate } from './utils/math.js';
export { createId } from './utils/id.js';
export { throttle } from './utils/throttle.js';
export { animationTypes } from './builtins/animations/index.js';
export { measureTypes } from './facade/measureTypes.js';
export { shapeTypes } from './core/shape/types.js';
export { lineStyles } from './builtins/styles/lineStyles.js';
export { stylePresets } from './builtins/styles/presets.js';
export { useEarth } from './useEarth.js';

export type {
  AlertAnimationSpec,
  AnimationChannel,
  AnimationEasing,
  AnimationSpec,
  AnimationStatus,
  BlinkAnimationSpec,
  CenterSpreadAnimationSpec,
  DashFlowAnimationSpec,
  FadeAnimationSpec,
  GrowAnimationSpec,
  HighlightAnimationSpec,
  PathTravelAnimationSpec,
  PulseAnimationSpec,
  RadarScanAnimationSpec
} from './core/animation/types.js';
export type { AnimationType } from './builtins/animations/index.js';
export type { AnimationHandle, AnimationManager } from './services/animation/types.js';
export type { Color, Coordinate, Pixel } from './core/common/types.js';
export type { ElementCopyOptions, ElementPatch, ElementSelector, ElementState } from './core/element/types.js';
export type { LayerKind, LayerOwnership, LayerPatch } from './core/layer/types.js';
export type { ShapeInput, ShapeState, ShapeType } from './core/shape/types.js';
export type {
  ArrowDecorationSpec,
  CircleSymbolSpec,
  ElementStyleState,
  IconSymbolSpec,
  InlinePathTextSpec,
  LineworkSpec,
  NativeStyleRef,
  PathCapSpec,
  PathContourPolicySpec,
  PathDecorationSpec,
  PathGlyphPrimitiveSpec,
  PathGlyphSpec,
  PathGlyphStrokeSpec,
  PathTrackSpec,
  PathTrackStrokeSpec,
  PatternFillSpec,
  SolidFillSpec,
  StrokeSpec,
  StylePatch,
  StyleSpec,
  TextSpec
} from './core/style/types.js';
export type {
  ContextMenuHandle,
  ContextMenuItemContext,
  ContextMenuItemSpec,
  ContextMenuItemState,
  ContextMenuService,
  ContextMenuSpec,
  ContextMenuStateTarget,
  ContextMenuTarget
} from './facade/ContextMenuFacade.js';
export type { ControlService, GraticuleOptions, ScaleLineOptions } from './facade/ControlService.js';
export type { DrawOptions, DrawService, DrawSession, DrawSessionEventMap, EditOptions, EditSession, EditSessionEventMap } from './facade/drawTypes.js';
export type { EarthLifecycleState, EarthOptions } from './Earth.js';
export type { EarthEventMap, EarthEventType, EarthKeyboardEvent, EarthPointerEvent, EventService, EventSubscriptionOptions } from './facade/EventFacade.js';
export type { MeasureOptions, MeasureResult, MeasureService, MeasureSession, MeasureSessionEventMap, MeasureType } from './facade/measureTypes.js';
export type {
  DescriptorContent,
  DescriptorEvent,
  DescriptorHandle,
  DescriptorListItem,
  DescriptorPatch,
  DescriptorSpec,
  OverlayHandle,
  OverlayOwnership,
  OverlayPatch,
  OverlayPositioning,
  OverlaySelector,
  OverlayService,
  OverlaySpec,
  PanIntoViewSpec
} from './facade/overlayTypes.js';
export type { StyleInput, StyleService } from './facade/styleTypes.js';
export type {
  TransformEventMap,
  TransformMode,
  TransformOptions,
  TransformReplaceOptions,
  TransformService,
  TransformSession,
  TransformToolbarHandle,
  TransformToolbarItemPatch,
  TransformToolbarItemSpec,
  TransformToolbarOptions,
  TransformToolbarOptionsPatch,
  TransformTranslateMode
} from './facade/transformTypes.js';
export type {
  ElementCreateInput,
  ElementHit,
  ElementService,
  LayerService,
  LayerState,
  NativeLayerSpec,
  PublicLayerSpec,
  ScreenExtent,
  TileLayerCommonSpec,
  TileLayerSpec,
  TileUrlFunction,
  VectorLayerSpec
} from './facade/types.js';
export type { FlyToOptions, ViewAnimationOptions, ViewService } from './facade/ViewService.js';
export type { UseEarthOptions } from './useEarth.js';
export type { InteractionPolicy, InteractionStatus } from './services/events/types.js';
export type { StylePresetName } from './builtins/styles/presets.js';
export type {
  DecorationOnlyLineType,
  InlineLineTextStyleOptions,
  InlineTextLineDecorationType,
  LineCapsOptions,
  LineCapType,
  LinePattern,
  LineStyleFactories,
  PolygonLineStyleOptions,
  PolylineLineStyleOptions,
  TrackedLineDecorationType
} from './builtins/styles/lineStyles.js';
export type { ThrottleOptions, ThrottledFunction } from './utils/throttle.js';
