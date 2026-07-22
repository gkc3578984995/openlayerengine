export interface ApiModuleDefinition {
  id: string;
  label: string;
  group: string;
  typeNames: readonly string[];
  runtimeNames: readonly string[];
}

/**
 * API 查询页使用的唯一模块归属表。
 *
 * 这里只维护公开符号名称与文档模块的关系；签名、成员和说明仍由 TypeDoc 生成数据提供。
 */
export const apiModules: readonly ApiModuleDefinition[] = [
  {
    id: 'quick-create',
    label: '创建第一张地图',
    group: '快速上手',
    typeNames: ['UseEarthOptions'],
    runtimeNames: ['useEarth']
  },
  {
    id: 'core-earth',
    label: 'Earth 与生命周期',
    group: '核心',
    typeNames: ['Earth', 'EarthOptions', 'EarthLifecycleState'],
    runtimeNames: []
  },
  {
    id: 'core-view',
    label: '视图（View）',
    group: '核心',
    typeNames: ['ViewService', 'FlyToOptions', 'ViewAnimationOptions', 'Coordinate', 'Pixel'],
    runtimeNames: []
  },
  {
    id: 'core-layers',
    label: '图层（Layers）',
    group: '核心',
    typeNames: [
      'Layer',
      'LayerService',
      'LayerState',
      'LayerPatch',
      'LayerKind',
      'LayerOwnership',
      'PublicLayerSpec',
      'VectorLayerSpec',
      'TileLayerCommonSpec',
      'TileLayerSpec',
      'NativeLayerSpec',
      'TileUrlFunction'
    ],
    runtimeNames: []
  },
  {
    id: 'core-controls',
    label: '地图控件（Controls）',
    group: '核心',
    typeNames: ['ControlService', 'GraticuleOptions', 'ScaleLineOptions'],
    runtimeNames: []
  },
  {
    id: 'elements-overview',
    label: 'Element 概览',
    group: '地图元素',
    typeNames: ['Element', 'ElementService', 'ElementState', 'ElementGeometryDetails', 'ElementRenderGeometry', 'MapExtent'],
    runtimeNames: []
  },
  {
    id: 'elements-create',
    label: '创建',
    group: '地图元素',
    typeNames: ['ElementCreateInput'],
    runtimeNames: []
  },
  {
    id: 'elements-query',
    label: '查询与选择器',
    group: '地图元素',
    typeNames: ['ElementSelector', 'ElementHit', 'ScreenExtent'],
    runtimeNames: []
  },
  {
    id: 'elements-update',
    label: '更新、复制与显隐',
    group: '地图元素',
    typeNames: ['ElementPatch', 'ElementCopyOptions'],
    runtimeNames: []
  },
  {
    id: 'elements-protection',
    label: '协同保护模式',
    group: '地图元素',
    typeNames: ['ElementProtectionUpdate', 'ElementProtectionState'],
    runtimeNames: []
  },
  {
    id: 'elements-cleanup',
    label: '删除与清理',
    group: '地图元素',
    typeNames: [],
    runtimeNames: []
  },
  {
    id: 'elements-shapes',
    label: '图形类型（Shapes）',
    group: '地图元素',
    typeNames: ['ShapeType', 'ShapeInput', 'ShapeState'],
    runtimeNames: ['shapeTypes']
  },
  {
    id: 'elements-styles',
    label: '样式（Styles）',
    group: '地图元素',
    typeNames: [
      'StyleService',
      'StyleInput',
      'StyleSpec',
      'StylePatch',
      'ElementStyleState',
      'NativeStyleRef',
      'SolidFillSpec',
      'PatternFillSpec',
      'StrokeSpec',
      'CircleSymbolSpec',
      'IconSymbolSpec',
      'TextSpec',
      'ArrowDecorationSpec',
      'Color',
      'StylePresetName'
    ],
    runtimeNames: ['stylePresets']
  },
  {
    id: 'elements-linework',
    label: '路径线饰（Linework）',
    group: '地图元素',
    typeNames: [
      'LineStyleFactories',
      'PolylineLineStyleOptions',
      'PolygonLineStyleOptions',
      'LinePattern',
      'LineCapType',
      'LineCapsOptions',
      'TrackedLineDecorationType',
      'DecorationOnlyLineType',
      'InlineTextLineDecorationType',
      'InlineLineTextStyleOptions',
      'LineworkSpec',
      'PathTrackSpec',
      'PathTrackStrokeSpec',
      'PathCapSpec',
      'PathGlyphSpec',
      'PathGlyphPrimitiveSpec',
      'PathGlyphStrokeSpec',
      'PathDecorationSpec',
      'InlinePathTextPlacementSpec',
      'InlinePathTextSpec',
      'PathContourPolicySpec'
    ],
    runtimeNames: ['lineStyles']
  },
  {
    id: 'interactions-draw',
    label: '绘制（Draw）',
    group: '地图交互',
    typeNames: ['DrawService', 'DrawOptions', 'DrawSession', 'DrawSessionEventMap', 'InteractionPolicy', 'InteractionStatus'],
    runtimeNames: []
  },
  {
    id: 'interactions-edit',
    label: '编辑（Edit）',
    group: '地图交互',
    typeNames: ['EditOptions', 'EditSession', 'EditSessionEventMap'],
    runtimeNames: []
  },
  {
    id: 'interactions-measure',
    label: '测量（Measure）',
    group: '地图交互',
    typeNames: ['MeasureService', 'MeasureOptions', 'MeasureSession', 'MeasureSessionEventMap', 'MeasureResult', 'MeasureType'],
    runtimeNames: ['measureTypes']
  },
  {
    id: 'interactions-transform',
    label: '变换（Transform）',
    group: '地图交互',
    typeNames: [
      'TransformService',
      'TransformOptions',
      'TransformSession',
      'TransformEventMap',
      'TransformMode',
      'TransformTranslateMode',
      'TransformReplaceOptions',
      'TransformToolbarHandle',
      'TransformToolbarOptions',
      'TransformToolbarOptionsPatch',
      'TransformToolbarItemSpec',
      'TransformToolbarItemPatch'
    ],
    runtimeNames: []
  },
  {
    id: 'presentation-animations',
    label: '动画（Animations）',
    group: '地图表现',
    typeNames: [
      'AnimationManager',
      'AnimationHandle',
      'AnimationType',
      'AnimationSpec',
      'AnimationChannel',
      'AnimationStatus',
      'AnimationEasing',
      'PulseAnimationSpec',
      'DashFlowAnimationSpec',
      'PathTravelAnimationSpec',
      'BlinkAnimationSpec',
      'HighlightAnimationSpec',
      'AlertAnimationSpec',
      'GrowAnimationSpec',
      'RadarScanAnimationSpec',
      'CenterSpreadAnimationSpec',
      'FadeAnimationSpec'
    ],
    runtimeNames: ['animationTypes']
  },
  {
    id: 'services-context-menu',
    label: '右键菜单（ContextMenu）',
    group: '地图服务',
    typeNames: [
      'ContextMenuService',
      'ContextMenuHandle',
      'ContextMenuTarget',
      'ContextMenuStateTarget',
      'ContextMenuSpec',
      'ContextMenuItemSpec',
      'ContextMenuItemContext',
      'ContextMenuItemState'
    ],
    runtimeNames: []
  },
  {
    id: 'services-events',
    label: '事件（Events）',
    group: '地图服务',
    typeNames: ['EventService', 'EarthEventType', 'EarthEventMap', 'EarthPointerEvent', 'EarthKeyboardEvent', 'EventSubscriptionOptions'],
    runtimeNames: []
  },
  {
    id: 'services-overlays',
    label: '覆盖物（Overlays）',
    group: '地图服务',
    typeNames: [
      'OverlayService',
      'OverlayHandle',
      'OverlaySpec',
      'OverlayPatch',
      'OverlaySelector',
      'OverlayOwnership',
      'OverlayPositioning',
      'PanIntoViewSpec'
    ],
    runtimeNames: []
  },
  {
    id: 'services-descriptor',
    label: 'Descriptor',
    group: '地图服务',
    typeNames: ['DescriptorHandle', 'DescriptorSpec', 'DescriptorPatch', 'DescriptorContent', 'DescriptorListItem', 'DescriptorEvent'],
    runtimeNames: []
  },
  {
    id: 'reference-utils',
    label: 'Utils',
    group: '工具与参考',
    typeNames: ['ThrottleOptions', 'ThrottledFunction'],
    runtimeNames: [
      'add2',
      'closeRing',
      'createId',
      'degToRad',
      'lerp2',
      'quadraticBezier2',
      'radToDeg',
      'scale2',
      'throttle',
      'toFlatCoordinates',
      'trimClosingCoordinate'
    ]
  },
  {
    id: 'reference-errors',
    label: '错误类型',
    group: '工具与参考',
    typeNames: [
      'InvalidArgumentError',
      'DuplicateElementIdError',
      'InvalidSelectorError',
      'ObjectDisposedError',
      'CapabilityError',
      'InteractionConflictError',
      'ElementProtectedError',
      'UnsupportedOperationError'
    ],
    runtimeNames: []
  }
] as const;

const typeModuleLookup = new Map(apiModules.flatMap((module) => module.typeNames.map((name) => [name, module] as const)));
const runtimeModuleLookup = new Map(apiModules.flatMap((module) => module.runtimeNames.map((name) => [name, module] as const)));
const moduleIdLookup = new Map(apiModules.map((module) => [module.id, module] as const));

const apiMemberModuleIds: Readonly<Record<string, string>> = {
  'ElementService.add': 'elements-create',
  'ElementService.get': 'elements-query',
  'ElementService.query': 'elements-query',
  'ElementService.atPixel': 'elements-query',
  'ElementService.getScreenExtent': 'elements-query',
  'ElementService.update': 'elements-update',
  'ElementService.copy': 'elements-update',
  'ElementService.hide': 'elements-update',
  'ElementService.show': 'elements-update',
  'ElementService.setProtection': 'elements-protection',
  'ElementService.getProtection': 'elements-protection',
  'ElementService.remove': 'elements-cleanup',
  'ElementService.clear': 'elements-cleanup',
  'Element.update': 'elements-update',
  'Element.remove': 'elements-cleanup',
  'DrawService.edit': 'interactions-edit',
  'OverlayService.createDescriptor': 'services-descriptor'
};

export const findApiModuleByType = (name: string): ApiModuleDefinition | undefined => typeModuleLookup.get(name);

export const findApiModuleByRuntimeExport = (name: string): ApiModuleDefinition | undefined => runtimeModuleLookup.get(name);

export const findApiModuleByMember = (typeName: string, memberName: string): ApiModuleDefinition | undefined => {
  const override = apiMemberModuleIds[`${typeName}.${memberName}`];
  return override === undefined ? findApiModuleByType(typeName) : moduleIdLookup.get(override);
};
