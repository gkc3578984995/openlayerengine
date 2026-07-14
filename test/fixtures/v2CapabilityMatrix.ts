import { v1CapabilityManifest, type LegacyCapabilityId, type V1CapabilityManifestRow } from './v1CapabilityManifest.js';

export interface V2PlannedCapability {
  id: LegacyCapabilityId;
  v2Entry: string;
}

export interface V2ImplementedCapability extends V2PlannedCapability {
  status: 'implemented';
  testFiles: readonly string[];
}

export interface V2CapabilityMatrixRow extends V1CapabilityManifestRow {
  status: 'implemented';
  v2Entry: string;
  testFiles: readonly string[];
}

export interface V2KnownLimitationClosure {
  id:
    | 'descriptor-custom-content'
    | 'descriptor-close-callback'
    | 'measure-text-size'
    | 'measure-total-distance-toggle'
    | 'dash-flow-single-remove-cleanup'
    | 'flight-line-listener-cleanup'
    | 'draw-remove-all-semantics';
  status: 'fixed';
  v2Entry: string;
  testFiles: readonly string[];
  evidenceMarker: string;
}

export interface V2ExcludedCapability {
  id: 'wind';
  status: 'excluded';
  reason: string;
  specificationSections: readonly ['design-spec-section-2', 'implementation-plan-task-16'];
}

function implemented(v2Entry: string, testFiles: readonly string[], ids: readonly LegacyCapabilityId[]): V2ImplementedCapability[] {
  return ids.map((id) => ({ id, status: 'implemented', v2Entry, testFiles }));
}

const v2ShapeTypes = [
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
] as const;

const v2ShapeImplementations: V2ImplementedCapability[] = v2ShapeTypes.flatMap((type) => [
  {
    id: `draw-shape-${type}` as LegacyCapabilityId,
    status: 'implemented',
    v2Entry: 'src/services/draw/DrawSession.ts',
    testFiles: ['test/ShapeDrawingParity.test.ts']
  },
  {
    id: `edit-shape-${type}` as LegacyCapabilityId,
    status: 'implemented',
    v2Entry: 'src/services/draw/EditSession.ts',
    testFiles: ['test/ShapeEditingParity.test.ts']
  }
]);

const v2ImplementedCapabilities: readonly V2ImplementedCapability[] = [
  ...implemented('src/index.ts', ['test/PackageExports.test.ts'], ['public-root-api']),
  ...implemented('package.json', ['test/PackageExports.test.ts'], ['public-style-explicit-entry']),
  ...implemented('src/core/native/types.ts', ['test/NativeStyleBoundary.test.ts'], ['public-ol-native-escape']),
  ...implemented('src/core/layer/types.ts', ['test/PackageExports.test.ts'], ['public-base-subclass-extension']),
  ...implemented('src/facade/drawTypes.ts', ['test/PackageExports.test.ts'], ['public-low-level-plot-api']),
  ...implemented('src/facade/transformTypes.ts', ['test/TransformSession.v2.test.ts'], ['public-low-level-transform-interaction']),
  ...implemented('src/core/element/types.ts', ['test/PackageExports.test.ts'], ['public-feature-metadata-keys']),
  ...implemented('src/index.ts', ['test/PackageExports.test.ts'], ['public-legacy-type-only-ast']),

  ...implemented(
    'src/facade/useEarth.ts',
    ['test/UseEarthRegistry.v2.test.ts'],
    ['earth-default-instance-get-or-create', 'earth-named-instance-get-or-create', 'earth-instance-options-routing', 'earth-instance-destroy-recreate']
  ),
  ...implemented('src/facade/Earth.ts', ['test/EarthLifecycle.v2.test.ts'], ['earth-explicit-unregistered-instance']),
  ...implemented('src/internal/EngineContext.ts', ['test/EarthContextBoundaries.v2.test.ts'], ['earth-default-context-resolution']),
  ...implemented('src/facade/Earth.ts', ['test/UseEarthRegistry.v2.test.ts'], ['earth-target-string-or-element']),
  ...implemented('src/facade/ViewService.ts', ['test/ViewService.v2.test.ts'], ['earth-map-view-public-access']),
  ...implemented(
    'src/services/events/InputRouter.ts',
    ['test/InputRouter.test.ts'],
    ['earth-default-interaction-policy', 'earth-browser-contextmenu-suppression']
  ),
  ...implemented(
    'src/core/layer/types.ts',
    ['test/LayerSpecTypes.test.ts'],
    ['earth-raster-osm-preset', 'earth-raster-xyz-compact-preset', 'earth-raster-custom-tile-url-function']
  ),
  ...implemented('src/facade/LayerService.ts', ['test/LayerFacade.test.ts'], ['earth-layer-handle-lifecycle']),
  ...implemented('src/core/layer/LayerManager.ts', ['test/LayerManager.test.ts'], ['earth-layer-wrapper-registry', 'earth-default-layer-bundle']),
  ...implemented('src/adapters/openlayers/HitTestAdapter.ts', ['test/HitTestAdapter.test.ts'], ['earth-feature-hit-at-pixel']),
  ...implemented('src/facade/ViewService.ts', ['test/ViewService.v2.test.ts'], ['earth-cursor-control', 'earth-drag-pan-toggle']),
  ...implemented('src/facade/Earth.ts', ['test/EarthServices.test.ts'], ['earth-owned-service-reuse']),
  ...implemented('src/facade/Earth.ts', ['test/EarthLifecycle.v2.test.ts'], ['earth-destroy-lifecycle']),

  ...implemented('src/facade/ViewService.ts', ['test/ViewService.v2.test.ts'], ['camera-fly-home', 'camera-animate-fly-to', 'camera-fly-to']),
  ...implemented('src/facade/ControlService.ts', ['test/ViewService.v2.test.ts'], ['control-graticule-lifecycle', 'control-scale-line-lifecycle']),
  ...implemented('src/facade/Earth.ts', ['test/EarthMultiInstance.v2.test.ts'], ['control-earth-delegation']),

  ...implemented('src/core/element/types.ts', ['test/MixedVectorLayer.test.ts'], ['element-metadata-id-module-data']),
  ...implemented('src/facade/ElementService.ts', ['test/MixedVectorLayer.test.ts'], ['layer-feature-query-remove']),
  ...implemented('src/facade/Element.ts', ['test/AnimationLifecycle.test.ts'], ['layer-feature-hide-show']),
  ...implemented('src/facade/Layer.ts', ['test/LayerFacade.test.ts'], ['layer-visibility-opacity-order']),
  ...implemented('src/facade/Layer.ts', ['test/LayerOwnership.test.ts'], ['layer-native-layer-access', 'layer-registration-lifecycle']),
  ...implemented('src/core/layer/types.ts', ['test/LayerSpecTypes.test.ts'], ['layer-wrap-x-option']),
  ...implemented('src/adapters/openlayers/FeatureBinding.ts', ['test/FeatureBinding.test.ts'], ['layer-param-live-sync']),
  ...implemented('src/facade/ElementService.ts', ['test/ElementService.test.ts'], ['layer-param-snapshot']),
  ...implemented('src/services/context-menu/ContextMenuService.ts', ['test/ContextMenuService.test.ts'], ['layer-contextmenu-state-cleanup']),
  ...implemented(
    'src/adapters/openlayers/GeometryCodec.ts',
    ['test/GeometryCodec.test.ts'],
    ['element-point', 'element-polyline', 'element-polygon', 'element-circle']
  ),
  ...implemented('src/adapters/openlayers/FeatureBinding.ts', ['test/FeatureBinding.test.ts'], ['element-icon-point']),

  ...implemented(
    'src/adapters/openlayers/style/StyleCompiler.ts',
    ['test/StyleCompiler.test.ts'],
    [
      'style-stroke-basic',
      'style-stroke-dash',
      'style-stroke-fit-pattern-once',
      'style-layered-outline',
      'style-fill-solid',
      'style-fill-pattern',
      'style-label-full',
      'style-icon-full',
      'style-screen-stable-offset',
      'style-native-feature-override',
      'style-polyline-static-arrow'
    ]
  ),

  ...implemented('src/builtins/animations/pulse.ts', ['test/AnimationBuiltins.test.ts'], ['animation-point-pulse']),
  ...implemented('src/services/animation/AnimationManager.ts', ['test/AnimationManager.test.ts'], ['animation-point-pulse-control']),
  ...implemented('src/builtins/animations/dashFlow.ts', ['test/AnimationBuiltins.test.ts'], ['animation-polyline-dash-flow']),
  ...implemented(
    'src/builtins/animations/pathTravel.ts',
    ['test/AnimationBuiltins.test.ts'],
    ['animation-polyline-path-flight', 'animation-polyline-path-control']
  ),
  ...implemented(
    'src/services/transform/TransformSession.ts',
    ['test/TransformSession.v2.test.ts'],
    ['transform-animation-point-pause-resume', 'transform-animation-polyline-sync', 'transform-bbox-active-blink']
  ),

  ...implemented(
    'src/services/overlay/OverlayService.ts',
    ['test/OverlayService.test.ts'],
    ['overlay-add-config', 'overlay-update', 'overlay-position-hide', 'overlay-query-remove', 'overlay-default-earth-resolution']
  ),
  ...implemented(
    'src/services/overlay/DescriptorHandle.ts',
    ['test/DescriptorLifecycle.test.ts'],
    [
      'descriptor-list-content',
      'descriptor-set-update',
      'descriptor-drag',
      'descriptor-fixed-line',
      'descriptor-position-fixed-mode',
      'descriptor-pixel-fixed-mode',
      'descriptor-close-control',
      'descriptor-show-hide',
      'descriptor-destroy-lifecycle',
      'descriptor-element-target'
    ]
  ),

  ...v2ShapeImplementations,
  ...implemented(
    'src/services/draw/DrawSession.ts',
    ['test/DrawSession.test.ts'],
    [
      'draw-session-events',
      'draw-session-rightclick-exit',
      'draw-keep-graphics',
      'draw-point-limit',
      'draw-style-preview-result-parity',
      'draw-result-query',
      'draw-result-remove',
      'draw-session-destroy'
    ]
  ),
  ...implemented(
    'src/services/draw/EditSession.ts',
    ['test/EditSession.test.ts'],
    [
      'edit-session-rightclick-commit',
      'edit-session-underlay',
      'edit-session-history',
      'edit-session-control-points',
      'edit-session-world-wrap',
      'edit-session-events'
    ]
  ),

  ...implemented(
    'src/services/measure/MeasureSession.ts',
    ['test/MeasureSession.test.ts'],
    [
      'measure-distance-segments',
      'measure-distance-total',
      'measure-distance-radial',
      'measure-area',
      'measure-dynamic-tooltip',
      'measure-point-markers',
      'measure-line-style',
      'measure-text-style',
      'measure-result-payload',
      'measure-rightclick-finish',
      'measure-clear-reuse'
    ]
  ),

  ...implemented(
    'src/services/transform/TransformSession.ts',
    ['test/TransformSession.v2.test.ts'],
    [
      'transform-target-filter',
      'transform-translate-modes',
      'transform-scale-stretch-rotate',
      'transform-select-lifecycle',
      'transform-handle-cursor-events',
      'transform-operation-events'
    ]
  ),
  ...implemented(
    'src/services/transform/TransformSession.ts',
    ['test/TransformShapeCapabilities.test.ts'],
    ['transform-vertex-edit-delegation', 'transform-plot-control-point-sync']
  ),
  ...implemented(
    'src/services/transform/TransformHistory.ts',
    ['test/TransformHistory.v2.test.ts'],
    [
      'transform-history-selection-scope',
      'transform-style-snapshot',
      'transform-undo-redo',
      'transform-copy-preview',
      'transform-copy-cut-paste-remove',
      'transform-replace-editing-feature'
    ]
  ),
  ...implemented(
    'src/services/transform/TransformSession.ts',
    ['test/TransformSession.v2.test.ts'],
    [
      'transform-toolbar-actions',
      'transform-toolbar-view-sync',
      'transform-rightclick-priority',
      'transform-multi-earth-isolation',
      'transform-lifecycle-cleanup',
      'transform-event-subscription',
      'transform-low-level-advanced-options'
    ]
  ),

  ...implemented(
    'src/services/events/EventService.ts',
    ['test/EventService.test.ts'],
    [
      'event-global-move',
      'event-global-click',
      'event-global-left-down',
      'event-global-left-up',
      'event-global-double-click',
      'event-global-right-click',
      'event-module-move',
      'event-module-click',
      'event-module-left-down',
      'event-module-left-up',
      'event-module-double-click',
      'event-module-right-click',
      'event-global-key-down',
      'event-module-routing-payload',
      'event-module-hover-transition',
      'event-listener-auto-enable',
      'event-listener-disposer',
      'event-once-click',
      'event-once-click-cancelable',
      'event-once-right-click',
      'event-once-right-click-cancelable',
      'event-listener-state-query',
      'event-module-scoped-cleanup',
      'event-manual-enable-disable'
    ]
  ),

  ...implemented(
    'src/services/context-menu/ContextMenuService.ts',
    ['test/ContextMenuService.test.ts'],
    [
      'contextmenu-default-menu',
      'contextmenu-module-menu',
      'contextmenu-nested-items',
      'contextmenu-disabled-items',
      'contextmenu-before-guard',
      'contextmenu-default-item-state',
      'contextmenu-feature-item-state',
      'contextmenu-mutex-state',
      'contextmenu-theme',
      'contextmenu-map-anchored-position',
      'contextmenu-callback-payload',
      'contextmenu-close-triggers',
      'contextmenu-event-isolation',
      'contextmenu-registration-cleanup',
      'contextmenu-transform-arbitration'
    ]
  ),
  ...implemented('src/services/events/InputRouter.ts', ['test/InputRouter.test.ts'], ['contextmenu-browser-default-suppression']),

  ...implemented(
    'src/adapters/openlayers/world.ts',
    ['test/ViewService.v2.test.ts'],
    ['utils-world-width-index', 'utils-feature-translate-to-pixel', 'utils-world-normalize-restore']
  ),
  ...implemented(
    'src/utils/math.ts',
    ['test/Utils.test.ts'],
    ['utils-ring-close-trim', 'utils-linear-interpolation', 'utils-vector-math', 'utils-quadratic-bezier', 'utils-degree-radian']
  ),
  ...implemented('src/utils/id.ts', ['test/Utils.test.ts'], ['utils-guid']),
  ...implemented('src/core/style/types.ts', ['test/Utils.test.ts'], ['utils-arrow-style']),
  ...implemented('src/services/animation/AnimationManager.ts', ['test/Utils.test.ts'], ['utils-point-flash']),
  ...implemented('src/utils/throttle.ts', ['test/Throttle.test.ts'], ['utils-throttle-cancel-flush']),
  ...implemented('src/adapters/openlayers/style/pattern.ts', ['test/StyleCompiler.test.ts'], ['utils-pattern-fill-normalize', 'utils-pattern-fill-render'])
];

export const v2PlannedCapabilities: readonly V2PlannedCapability[] = v2ImplementedCapabilities.map(({ id, v2Entry }) => ({ id, v2Entry }));

const legacyMetadataById = new Map<LegacyCapabilityId, V1CapabilityManifestRow>();
for (const item of v1CapabilityManifest) legacyMetadataById.set(item.id, item);

export const v2CapabilityMatrix: readonly V2CapabilityMatrixRow[] = v2ImplementedCapabilities.map((implementation) => {
  const legacyMetadata = legacyMetadataById.get(implementation.id);
  if (!legacyMetadata) throw new Error(`No frozen v1 metadata for implemented v2 capability: ${implementation.id}`);
  return { ...legacyMetadata, ...implementation };
});

export const v2KnownLimitations: readonly V2KnownLimitationClosure[] = [
  {
    id: 'descriptor-custom-content',
    status: 'fixed',
    v2Entry: 'src/services/overlay/DescriptorHandle.ts',
    testFiles: ['test/DescriptorLifecycle.test.ts'],
    evidenceMarker: 'actually attaches custom strings and HTMLElements and replaces wrappers through provisional handoff'
  },
  {
    id: 'descriptor-close-callback',
    status: 'fixed',
    v2Entry: 'src/services/overlay/DescriptorHandle.ts',
    testFiles: ['test/DescriptorLifecycle.test.ts'],
    evidenceMarker: 'implements explicit close on the public handle and invokes the public callback before hide'
  },
  {
    id: 'measure-text-size',
    status: 'fixed',
    v2Entry: 'src/services/measure/MeasureSession.ts',
    testFiles: ['test/MeasureSession.test.ts'],
    evidenceMarker: 'implements measure-text-size and measure-total-distance-toggle with line and point styles'
  },
  {
    id: 'measure-total-distance-toggle',
    status: 'fixed',
    v2Entry: 'src/services/measure/MeasureSession.ts',
    testFiles: ['test/MeasureSession.test.ts'],
    evidenceMarker: 'implements measure-text-size and measure-total-distance-toggle with line and point styles'
  },
  {
    id: 'dash-flow-single-remove-cleanup',
    status: 'fixed',
    v2Entry: 'src/services/animation/AnimationManager.ts',
    testFiles: ['test/AnimationLifecycle.test.ts'],
    evidenceMarker: 'stop/remove'
  },
  {
    id: 'flight-line-listener-cleanup',
    status: 'fixed',
    v2Entry: 'src/services/animation/AnimationManager.ts',
    testFiles: ['test/AnimationLifecycle.test.ts'],
    evidenceMarker: 'stop/remove'
  },
  {
    id: 'draw-remove-all-semantics',
    status: 'fixed',
    v2Entry: 'src/facade/DrawFacade.ts',
    testFiles: ['test/DrawFacade.test.ts'],
    evidenceMarker: 'clears only matching draw-owned entries'
  }
];

export const v2ExcludedCapabilities: readonly V2ExcludedCapability[] = [
  {
    id: 'wind',
    status: 'excluded',
    reason: '已批准删除',
    specificationSections: ['design-spec-section-2', 'implementation-plan-task-16']
  }
];
