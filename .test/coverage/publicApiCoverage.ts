export type ScenarioId =
  | 'earth'
  | 'view-controls'
  | 'layers'
  | 'elements'
  | 'styles-shapes'
  | 'draw-edit'
  | 'measure'
  | 'transform'
  | 'animations'
  | 'events-menu'
  | 'overlays'
  | 'utilities';

export type CoverageMode = '交互' | '可视' | '事件' | '编译' | '透传' | '错误';

export interface CoverageItem {
  readonly id: string;
  readonly scenario: ScenarioId;
  readonly mode: CoverageMode;
}

const valueGroups = {
  earth: ['Earth', 'useEarth'],
  layers: ['Layer'],
  elements: ['Element'],
  'styles-shapes': ['shapeTypes', 'stylePresets'],
  animations: ['animationTypes'],
  measure: ['measureTypes'],
  utilities: [
    'CapabilityError',
    'DuplicateElementIdError',
    'InteractionConflictError',
    'InvalidArgumentError',
    'InvalidSelectorError',
    'ObjectDisposedError',
    'UnsupportedOperationError',
    'add2',
    'closeRing',
    'createId',
    'degToRad',
    'lerp2',
    'quadraticBezier2',
    'radToDeg',
    'scale2',
    'throttle',
    'trimClosingCoordinate'
  ]
} satisfies Partial<Record<ScenarioId, readonly string[]>>;

const typeGroups = {
  earth: ['EarthLifecycleState', 'EarthOptions', 'UseEarthOptions'],
  'view-controls': ['ControlService', 'FlyToOptions', 'GraticuleOptions', 'ScaleLineOptions', 'ViewAnimationOptions', 'ViewService'],
  layers: [
    'LayerKind',
    'LayerOwnership',
    'LayerPatch',
    'LayerService',
    'LayerState',
    'NativeLayerSpec',
    'PublicLayerSpec',
    'TileLayerCommonSpec',
    'TileLayerSpec',
    'TileUrlFunction',
    'VectorLayerSpec'
  ],
  elements: ['ElementCopyOptions', 'ElementCreateInput', 'ElementHit', 'ElementPatch', 'ElementSelector', 'ElementService', 'ElementState', 'ScreenExtent'],
  'styles-shapes': [
    'ArrowDecorationSpec',
    'CircleSymbolSpec',
    'Color',
    'ElementStyleState',
    'IconSymbolSpec',
    'NativeStyleRef',
    'PatternFillSpec',
    'ShapeState',
    'ShapeType',
    'SolidFillSpec',
    'StrokeSpec',
    'StyleInput',
    'StylePatch',
    'StylePresetName',
    'StyleService',
    'StyleSpec',
    'TextSpec'
  ],
  animations: [
    'AnimationChannel',
    'AnimationHandle',
    'AnimationManager',
    'AnimationSpec',
    'AnimationStatus',
    'AnimationType',
    'DashFlowAnimationSpec',
    'PathTravelAnimationSpec',
    'PulseAnimationSpec'
  ],
  'draw-edit': ['DrawOptions', 'DrawService', 'DrawSession', 'DrawSessionEventMap', 'EditOptions', 'EditSession', 'EditSessionEventMap'],
  measure: ['MeasureOptions', 'MeasureResult', 'MeasureService', 'MeasureSession', 'MeasureSessionEventMap', 'MeasureType'],
  transform: [
    'TransformEventMap',
    'TransformMode',
    'TransformOptions',
    'TransformReplaceOptions',
    'TransformService',
    'TransformSession',
    'TransformToolbarHandle',
    'TransformToolbarItemPatch',
    'TransformToolbarItemSpec',
    'TransformToolbarOptions',
    'TransformToolbarOptionsPatch',
    'TransformTranslateMode'
  ],
  'events-menu': [
    'ContextMenuHandle',
    'ContextMenuItemContext',
    'ContextMenuItemSpec',
    'ContextMenuItemState',
    'ContextMenuService',
    'ContextMenuSpec',
    'ContextMenuStateTarget',
    'ContextMenuTarget',
    'EarthEventMap',
    'EarthEventType',
    'EarthKeyboardEvent',
    'EarthPointerEvent',
    'EventService',
    'EventSubscriptionOptions',
    'InteractionPolicy',
    'InteractionStatus'
  ],
  overlays: [
    'DescriptorContent',
    'DescriptorEvent',
    'DescriptorHandle',
    'DescriptorListItem',
    'DescriptorPatch',
    'DescriptorSpec',
    'OverlayHandle',
    'OverlayOwnership',
    'OverlayPatch',
    'OverlayPositioning',
    'OverlaySelector',
    'OverlayService',
    'OverlaySpec',
    'PanIntoViewSpec'
  ],
  utilities: ['Coordinate', 'Pixel', 'ThrottleOptions', 'ThrottledFunction']
} satisfies Record<ScenarioId, readonly string[]>;

function exportsOf(groups: Partial<Record<ScenarioId, readonly string[]>>, prefix: 'export' | 'type', mode: CoverageMode): CoverageItem[] {
  return Object.entries(groups).flatMap(([scenario, names]) =>
    (names ?? []).map((name) => ({ id: `${prefix}:${name}`, scenario: scenario as ScenarioId, mode }))
  );
}

function members(scenario: ScenarioId, owner: string, names: readonly string[], mode: CoverageMode = '交互'): CoverageItem[] {
  return names.map((name) => ({ id: `${owner}.${name}`, scenario, mode }));
}

const memberCoverage: CoverageItem[] = [
  ...members('earth', 'useEarth', ['()', '(id)', '(options without id)', '(options with id)']),
  ...members('earth', 'Earth', [
    'constructor',
    'map',
    'target',
    'elements',
    'layers',
    'styles',
    'animations',
    'draw',
    'transform',
    'measure',
    'events',
    'contextMenu',
    'overlays',
    'view',
    'controls',
    'lifecycle',
    'isDestroyed',
    'destroy'
  ]),
  ...members('earth', 'EarthOptions', ['target', 'view', 'controls']),
  ...members('earth', 'UseEarthOptions', ['id', 'target', 'view', 'controls']),

  ...members('view-controls', 'ViewService', [
    'olView',
    'getCenter',
    'setCenter',
    'getZoom',
    'setZoom',
    'flyHome',
    'animateFlyTo',
    'flyTo',
    'setCursor',
    'useDefaultCursor',
    'useCrosshairCursor',
    'setDragEnabled',
    'worldWidth',
    'worldIndex',
    'normalizeToViewWorld',
    'restoreToWorld',
    'coordinateAtPixel',
    'translateCoordinatesToPixel'
  ]),
  ...members('view-controls', 'ViewAnimationOptions', ['duration', 'easing', 'callback']),
  ...members('view-controls', 'FlyToOptions', ['duration', 'easing', 'callback', 'zoom']),
  ...members('view-controls', 'ControlService', ['graticule', 'scaleLine', 'enableGraticule', 'disableGraticule', 'enableScaleLine', 'disableScaleLine']),
  ...members(
    'view-controls',
    'GraticuleOptions',
    [
      'className',
      'opacity',
      'visible',
      'extent',
      'zIndex',
      'minResolution',
      'maxResolution',
      'minZoom',
      'maxZoom',
      'maxLines',
      'strokeStyle',
      'targetSize',
      'showLabels',
      'lonLabelFormatter',
      'latLabelFormatter',
      'lonLabelPosition',
      'latLabelPosition',
      'lonLabelStyle',
      'latLabelStyle',
      'intervals',
      'wrapX',
      'properties'
    ],
    '透传'
  ),
  ...members('view-controls', 'ScaleLineOptions', ['className', 'minWidth', 'maxWidth', 'render', 'target', 'units', 'bar', 'steps', 'text', 'dpi'], '透传'),

  ...members('layers', 'LayerService', ['add', 'get', 'query', 'remove', 'clear']),
  ...members('layers', 'Layer', ['id', 'state', 'kind', 'visible', 'opacity', 'zIndex', 'olLayer', 'update', 'show', 'hide', 'remove']),
  ...members('layers', 'VectorLayerSpec', ['kind', 'id', 'visible', 'opacity', 'zIndex', 'wrapX', 'declutter']),
  ...members('layers', 'TileLayerSpec', [
    'kind',
    'id',
    'visible',
    'opacity',
    'zIndex',
    'preset=osm',
    'preset=xyz+url',
    'preset=xyz+tileUrlFunction',
    'preset=compact-xyz',
    'url',
    'tileUrlFunction',
    'baseUrl',
    'source',
    'ownership',
    'attributions'
  ]),
  ...members('layers', 'NativeLayerSpec', ['kind', 'id', 'layer', 'ownership']),
  ...members('layers', 'LayerPatch', ['visible', 'opacity', 'zIndex']),

  ...members('elements', 'ElementService', ['add', 'get', 'query', 'update', 'remove', 'hide', 'show', 'copy', 'clear', 'atPixel', 'getScreenExtent']),
  ...members('elements', 'Element', ['id', 'state', 'olFeature', 'update', 'remove']),
  ...members('elements', 'ElementCreateInput', ['geometry', 'id', 'style', 'data', 'module', 'layerId', 'visible']),
  ...members('elements', 'ElementSelector', ['id', 'ids', 'module', 'layerId', 'type', 'visible', 'predicate']),
  ...members('elements', 'ElementPatch', ['geometry', 'style', 'data', 'module', 'layerId', 'visible']),
  ...members('elements', 'ElementCopyOptions', ['geometry', 'style', 'data', 'module', 'layerId', 'visible']),
  ...members('elements', 'ElementState', ['id', 'type', 'geometry', 'style', 'data', 'module', 'layerId', 'visible']),

  ...members(
    'styles-shapes',
    'ShapeType',
    [
      'point',
      'polyline',
      'polygon',
      'circle',
      'ellipse',
      'attack-arrow',
      'tailed-attack-arrow',
      'fine-arrow',
      'tailed-squad-combat-arrow',
      'assault-direction-arrow',
      'double-arrow',
      'rectangle',
      'triangle',
      'equilateral-triangle',
      'assemble-polygon',
      'closed-curve-polygon',
      'sector',
      'lune-polygon',
      'lune-polyline',
      'curve-polyline'
    ],
    '可视'
  ),
  ...members('styles-shapes', 'ShapeState', ['type', 'controlPoints', 'center', 'radius']),
  ...members('styles-shapes', 'StyleService', ['set', 'patch']),
  ...members('styles-shapes', 'StyleSpec', ['symbol', 'strokes', 'fill', 'text', 'decorations', 'zIndex']),
  ...members('styles-shapes', 'StrokeSpec', ['color', 'width', 'lineDash', 'lineDashOffset', 'lineCap', 'lineJoin', 'miterLimit', 'fitPatternOnce']),
  ...members('styles-shapes', 'PatternFillSpec', [
    'type',
    'pattern=diagonal',
    'pattern=cross',
    'pattern=dot',
    'pattern=horizontal',
    'pattern=vertical',
    'color',
    'size',
    'lineWidth',
    'dotRadius',
    'backgroundColor'
  ]),
  ...members('styles-shapes', 'SolidFillSpec', ['type', 'color']),
  ...members('styles-shapes', 'CircleSymbolSpec', ['type', 'radius', 'fill', 'stroke']),
  ...members('styles-shapes', 'IconSymbolSpec', [
    'type',
    'src',
    'size',
    'color',
    'offset',
    'displacement',
    'scale',
    'rotation',
    'rotateWithView',
    'anchor',
    'anchorOrigin',
    'anchorXUnits',
    'anchorYUnits',
    'origin',
    'opacity',
    'crossOrigin'
  ]),
  ...members('styles-shapes', 'TextSpec', [
    'text',
    'font',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'fill',
    'stroke',
    'backgroundFill',
    'backgroundStroke',
    'padding',
    'offsetX',
    'offsetY',
    'scale',
    'textAlign',
    'textBaseline',
    'rotation',
    'rotateWithView',
    'overflow',
    'placement',
    'maxAngle',
    'repeat',
    'justify',
    'keepUpright'
  ]),
  ...members('styles-shapes', 'ArrowDecorationSpec', [
    'type',
    'placement=start',
    'placement=end',
    'placement=each-segment',
    'placement=repeat',
    'symbol',
    'offset',
    'spacing'
  ]),
  ...members('styles-shapes', 'StylePatch', ['symbol', 'strokes', 'fill', 'text', 'decorations', 'zIndex']),
  ...members('styles-shapes', 'StyleInput', ['structured', 'nativeStyle=Style', 'nativeStyle=Style[]', 'nativeStyle=StyleFunction'], '透传'),
  ...members(
    'styles-shapes',
    'stylePresets',
    ['point-default', 'icon-default', 'line-default', 'arrow-default', 'polygon-default', 'measure-default', 'draw-preview', 'transform-handle'],
    '可视'
  ),

  ...members('draw-edit', 'DrawService', ['start', 'edit', 'query', 'clear']),
  ...members('draw-edit', 'DrawOptions', ['type', 'layerId', 'module', 'style', 'data', 'limit', 'keepGraphics', 'policy=replace', 'policy=reject']),
  ...members('draw-edit', 'DrawSession', ['status', 'results', 'finished', 'finish', 'cancel', 'destroy', 'undo', 'redo', 'on']),
  ...members('draw-edit', 'DrawSessionEventMap', ['start', 'change', 'click', 'complete', 'cancel'], '事件'),
  ...members('draw-edit', 'EditOptions', ['underlay', 'policy=replace', 'policy=reject']),
  ...members('draw-edit', 'EditSession', ['element', 'status', 'finished', 'finish', 'cancel', 'destroy', 'undo', 'redo', 'on']),
  ...members('draw-edit', 'EditSessionEventMap', ['modifying', 'complete', 'cancel'], '事件'),

  ...members('measure', 'MeasureService', ['start', 'clear']),
  ...members('measure', 'MeasureOptions', [
    'type=distance-segments',
    'type=distance-total',
    'type=distance-radial',
    'type=area',
    'layerId',
    'unit',
    'precision',
    'formatter',
    'line',
    'point',
    'text',
    'showTotal',
    'policy=replace',
    'policy=reject'
  ]),
  ...members('measure', 'MeasureSession', ['status', 'finished', 'finish', 'cancel', 'on']),
  ...members('measure', 'MeasureSessionEventMap', ['change', 'complete', 'cancel'], '事件'),
  ...members('measure', 'MeasureResult', ['type', 'value', 'unit', 'formatted', 'geometry', 'coordinates', 'geographicCoordinates', 'segments']),

  ...members('transform', 'TransformService', ['start', 'select']),
  ...members('transform', 'TransformOptions', [
    'selector',
    'predicate',
    'layerIds',
    'hitTolerance',
    'translate=none',
    'translate=center',
    'translate=feature',
    'scale',
    'stretch',
    'rotate',
    'translateBBox',
    'noFlip',
    'keepRectangle',
    'buffer',
    'pointRadius',
    'handleStyle',
    'handleCenter',
    'historyLimit',
    'toolbar',
    'policy=replace',
    'policy=reject'
  ]),
  ...members('transform', 'TransformSession', [
    'selected',
    'status',
    'mode',
    'toolbar',
    'select',
    'setMode',
    'finish',
    'cancel',
    'undo',
    'redo',
    'copy',
    'replaceSelected',
    'remove',
    'on'
  ]),
  ...members('transform', 'TransformReplaceOptions', ['retainHistory']),
  ...members('transform', 'TransformToolbarHandle', ['setActive', 'updateItem', 'updateOptions', 'show', 'hide', 'destroy']),
  ...members('transform', 'TransformToolbarItemSpec', ['key', 'title', 'icon', 'iconClass', 'visible', 'disabled', 'active']),
  ...members('transform', 'TransformToolbarItemPatch', ['title', 'icon', 'iconClass', 'visible', 'disabled', 'active']),
  ...members('transform', 'TransformToolbarOptions', ['items', 'offset', 'className', 'visible']),
  ...members('transform', 'TransformToolbarOptionsPatch', ['position', 'offset', 'className', 'visible']),
  ...members(
    'transform',
    'TransformEventMap',
    [
      'select',
      'selectEnd',
      'enterHandle',
      'leaveHandle',
      'translateStart',
      'translating',
      'translateEnd',
      'rotateStart',
      'rotating',
      'rotateEnd',
      'scaleStart',
      'scaling',
      'scaleEnd',
      'edit',
      'copyPreviewConfirm',
      'copyPreviewCancel',
      'remove',
      'error'
    ],
    '事件'
  ),

  ...members('animations', 'AnimationManager', ['play', 'pause', 'resume', 'stop', 'stopAll']),
  ...members('animations', 'AnimationHandle', ['id', 'status', 'finished', 'pause', 'resume', 'stop']),
  ...members('animations', 'PulseAnimationSpec', ['type', 'channel', 'periodMs', 'color', 'repeat', 'radius']),
  ...members('animations', 'DashFlowAnimationSpec', ['type', 'channel', 'speed', 'lineDash', 'color']),
  ...members('animations', 'PathTravelAnimationSpec', [
    'type',
    'channel',
    'speed',
    'durationMs',
    'repeat',
    'trailLength',
    'color',
    'gradient',
    'width',
    'curvature',
    'smoothness',
    'arrow',
    'arrowColor',
    'showStart',
    'showEnd',
    'endLineColor',
    'finishBehavior=remove',
    'finishBehavior=retain'
  ]),

  ...members('events-menu', 'EventService', ['on', 'once', 'has', 'clearModule']),
  ...members('events-menu', 'EventSubscriptionOptions', ['signal', 'selector', 'module']),
  ...members('events-menu', 'EarthEventMap', ['pointermove', 'click', 'leftdown', 'leftup', 'doubleclick', 'rightclick', 'keydown'], '事件'),
  ...members('events-menu', 'EarthPointerEvent', ['type', 'coordinate', 'pixel', 'phase', 'element', 'module', 'layer', 'olFeature', 'originalEvent'], '事件'),
  ...members('events-menu', 'EarthKeyboardEvent', ['type', 'key', 'code', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'originalEvent'], '事件'),
  ...members('events-menu', 'ContextMenuService', [
    'register',
    'getItemState',
    'setItemState',
    'toggleItem',
    'setTheme',
    'toggleTheme',
    'clearElementState',
    'close'
  ]),
  ...members('events-menu', 'ContextMenuTarget', ['map', 'module', 'element']),
  ...members('events-menu', 'ContextMenuSpec', ['items', 'before', 'onSelect']),
  ...members('events-menu', 'ContextMenuItemSpec', ['key', 'label', 'visible', 'disabled', 'mutexKey', 'children']),
  ...members('events-menu', 'ContextMenuItemContext', ['item', 'scope', 'coordinate', 'pixel', 'element', 'module', 'layer']),
  ...members('events-menu', 'ContextMenuItemState', ['visible', 'disabled']),
  ...members('events-menu', 'ContextMenuHandle', ['destroy']),

  ...members('overlays', 'OverlayService', ['add', 'get', 'query', 'remove', 'clear', 'createDescriptor']),
  ...members('overlays', 'OverlaySpec', [
    'id',
    'element',
    'position',
    'offset',
    'positioning',
    'stopEvent',
    'insertFirst',
    'autoPan=false',
    'autoPan=true',
    'autoPan=options',
    'className',
    'module',
    'data',
    'ownership'
  ]),
  ...members('overlays', 'OverlayPatch', ['element', 'position', 'offset', 'positioning', 'visible', 'data', 'ownership']),
  ...members('overlays', 'OverlaySelector', ['id', 'ids', 'module', 'visible', 'predicate']),
  ...members('overlays', 'OverlayHandle', ['id', 'position', 'visible', 'update', 'setPosition', 'show', 'hide', 'panIntoView', 'destroy']),
  ...members('overlays', 'PanIntoViewSpec', ['margin', 'duration', 'easing']),
  ...members('overlays', 'OverlayOwnership', ['earth', 'external']),
  ...members('overlays', 'OverlayPositioning', ['全部联合值'], '可视'),
  ...members('overlays', 'DescriptorSpec', [
    'id',
    'position',
    'offset',
    'header',
    'footer',
    'close',
    'closeAction=hide',
    'closeAction=destroy',
    'onClose',
    'onItemClick',
    'draggable',
    'fixedLine',
    'fixedLineColor',
    'fixedMode=position',
    'fixedMode=pixel',
    'data',
    'type=list',
    'type=custom',
    'content=list',
    'content=string',
    'content=HTMLElement'
  ]),
  ...members('overlays', 'DescriptorPatch', [
    'content',
    'position',
    'offset',
    'header',
    'footer',
    'close',
    'closeAction',
    'onClose',
    'onItemClick',
    'draggable',
    'fixedLine',
    'fixedLineColor',
    'fixedMode',
    'data'
  ]),
  ...members('overlays', 'DescriptorHandle', ['id', 'visible', 'update', 'setPosition', 'show', 'hide', 'close', 'on', 'destroy']),
  ...members('overlays', 'DescriptorListItem', ['label', 'value', 'color', 'className']),
  ...members('overlays', 'DescriptorEvent', ['type', 'descriptor', 'data', 'item', 'index'], '事件'),

  ...members('utilities', 'math', ['add2', 'closeRing', 'degToRad', 'lerp2', 'quadraticBezier2', 'radToDeg', 'scale2', 'trimClosingCoordinate']),
  ...members('utilities', 'createId', ['crypto', 'fallback']),
  ...members('utilities', 'throttle', ['call', 'cancel', 'flush']),
  ...members('utilities', 'ThrottledFunction', ['cancel', 'flush']),
  ...members('utilities', 'ThrottleOptions', ['leading', 'trailing']),
  ...members(
    'utilities',
    'errors',
    [
      'CapabilityError',
      'DuplicateElementIdError',
      'InteractionConflictError',
      'InvalidArgumentError',
      'InvalidSelectorError',
      'ObjectDisposedError',
      'UnsupportedOperationError'
    ],
    '错误'
  )
];

export const rootValueExports = Object.freeze(Object.values(valueGroups).flat());
export const rootTypeExports = Object.freeze(Object.values(typeGroups).flat());

export const coverageItems = Object.freeze([...exportsOf(valueGroups, 'export', '编译'), ...exportsOf(typeGroups, 'type', '编译'), ...memberCoverage]);

export function coverageForScenario(scenario: string): readonly CoverageItem[] {
  return coverageItems.filter((item) => item.scenario === scenario);
}

export function coverageSummary(): Readonly<{ total: number; scenarios: number }> {
  return Object.freeze({ total: coverageItems.length, scenarios: new Set(coverageItems.map((item) => item.scenario)).size });
}
