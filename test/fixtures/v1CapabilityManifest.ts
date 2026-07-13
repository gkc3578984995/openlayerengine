export const legacyShapeTypes = [
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

export const fixedLegacyCapabilityIds = [
  'public-root-api',
  'public-style-explicit-entry',
  'public-ol-native-escape',
  'public-base-subclass-extension',
  'public-low-level-plot-api',
  'public-low-level-transform-interaction',
  'public-feature-metadata-keys',
  'public-legacy-type-only-ast',

  'earth-default-instance-get-or-create',
  'earth-named-instance-get-or-create',
  'earth-instance-options-routing',
  'earth-instance-destroy-recreate',
  'earth-explicit-unregistered-instance',
  'earth-default-context-resolution',
  'earth-target-string-or-element',
  'earth-map-view-public-access',
  'earth-default-interaction-policy',
  'earth-browser-contextmenu-suppression',
  'earth-raster-osm-preset',
  'earth-raster-xyz-compact-preset',
  'earth-raster-custom-tile-url-function',
  'earth-layer-handle-lifecycle',
  'earth-layer-wrapper-registry',
  'earth-default-layer-bundle',
  'earth-feature-hit-at-pixel',
  'earth-cursor-control',
  'earth-drag-pan-toggle',
  'earth-owned-service-reuse',
  'earth-destroy-lifecycle',

  'camera-fly-home',
  'camera-animate-fly-to',
  'camera-fly-to',
  'control-graticule-lifecycle',
  'control-scale-line-lifecycle',
  'control-earth-delegation',

  'element-metadata-id-module-data',
  'layer-feature-query-remove',
  'layer-feature-hide-show',
  'layer-visibility-opacity-order',
  'layer-native-layer-access',
  'layer-registration-lifecycle',
  'layer-wrap-x-option',
  'layer-param-live-sync',
  'layer-param-snapshot',
  'layer-contextmenu-state-cleanup',
  'element-point',
  'element-icon-point',
  'element-polyline',
  'element-polygon',
  'element-circle',

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
  'style-polyline-static-arrow',

  'animation-point-pulse',
  'animation-point-pulse-control',
  'animation-polyline-dash-flow',
  'animation-polyline-path-flight',
  'animation-polyline-path-control',
  'transform-animation-point-pause-resume',
  'transform-animation-polyline-sync',
  'transform-bbox-active-blink',

  'overlay-add-config',
  'overlay-update',
  'overlay-position-hide',
  'overlay-query-remove',
  'overlay-default-earth-resolution',
  'descriptor-list-content',
  'descriptor-set-update',
  'descriptor-drag',
  'descriptor-fixed-line',
  'descriptor-position-fixed-mode',
  'descriptor-pixel-fixed-mode',
  'descriptor-close-control',
  'descriptor-show-hide',
  'descriptor-destroy-lifecycle',
  'descriptor-element-target',

  ...legacyShapeTypes.flatMap((type) => [`draw-shape-${type}`, `edit-shape-${type}`] as const),
  'draw-session-events',
  'draw-session-rightclick-exit',
  'draw-keep-graphics',
  'draw-point-limit',
  'draw-style-preview-result-parity',
  'draw-result-query',
  'draw-result-remove',
  'draw-session-destroy',
  'edit-session-rightclick-commit',
  'edit-session-underlay',
  'edit-session-history',
  'edit-session-control-points',
  'edit-session-world-wrap',
  'edit-session-events',

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
  'measure-clear-reuse',

  'transform-target-filter',
  'transform-translate-modes',
  'transform-scale-stretch-rotate',
  'transform-select-lifecycle',
  'transform-handle-cursor-events',
  'transform-operation-events',
  'transform-vertex-edit-delegation',
  'transform-history-selection-scope',
  'transform-style-snapshot',
  'transform-undo-redo',
  'transform-copy-preview',
  'transform-copy-cut-paste-remove',
  'transform-plot-control-point-sync',
  'transform-replace-editing-feature',
  'transform-toolbar-actions',
  'transform-toolbar-view-sync',
  'transform-rightclick-priority',
  'transform-multi-earth-isolation',
  'transform-lifecycle-cleanup',
  'transform-event-subscription',
  'transform-low-level-advanced-options',

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
  'event-manual-enable-disable',

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
  'contextmenu-transform-arbitration',
  'contextmenu-browser-default-suppression',

  'utils-world-width-index',
  'utils-feature-translate-to-pixel',
  'utils-world-normalize-restore',
  'utils-ring-close-trim',
  'utils-guid',
  'utils-linear-interpolation',
  'utils-vector-math',
  'utils-quadratic-bezier',
  'utils-arrow-style',
  'utils-point-flash',
  'utils-degree-radian',
  'utils-throttle-cancel-flush',
  'utils-pattern-fill-normalize',
  'utils-pattern-fill-render'
] as const;

export type LegacyCapabilityId = (typeof fixedLegacyCapabilityIds)[number];
export type CapabilityDisposition = 'retain' | 'replace' | 'intentional-api-break';

export interface V1CapabilityManifestRow {
  id: LegacyCapabilityId;
  legacySources: readonly string[];
  testFiles: readonly string[];
  disposition: CapabilityDisposition;
  replacementIds?: readonly string[];
  specificationSection?: string;
}

interface IntentionalApiBreak {
  replacementIds: readonly string[];
  specificationSection: string;
}

const intentionalApiBreaks: Partial<Record<LegacyCapabilityId, IntentionalApiBreak>> = {
  'public-base-subclass-extension': {
    replacementIds: ['public-ol-native-escape', 'layer-native-layer-access', 'style-native-feature-override'],
    specificationSection: 'Task 3 / PublicLayerSpec and StyleSpec'
  },
  'public-low-level-plot-api': {
    replacementIds: ['draw-session-events', 'edit-session-events'],
    specificationSection: 'Task 11 / Draw and Edit sessions'
  },
  'public-low-level-transform-interaction': {
    replacementIds: ['transform-select-lifecycle', 'transform-low-level-advanced-options', 'transform-event-subscription'],
    specificationSection: 'Task 13 / Transform session and options'
  },
  'public-feature-metadata-keys': {
    replacementIds: ['element-metadata-id-module-data', 'layer-feature-query-remove'],
    specificationSection: 'Task 3 / ElementState and Selector'
  },
  'public-legacy-type-only-ast': {
    replacementIds: ['public-root-api'],
    specificationSection: 'Task 15 / Public type whitelist'
  },
  'earth-default-context-resolution': {
    replacementIds: ['earth-default-instance-get-or-create', 'earth-explicit-unregistered-instance'],
    specificationSection: 'Task 2 / useEarth boundary and EngineContext'
  },
  'event-manual-enable-disable': {
    replacementIds: ['event-listener-auto-enable', 'event-listener-disposer', 'event-listener-state-query'],
    specificationSection: 'Task 9 / Event subscription lifecycle'
  }
};

function sourceEvidenceFor(id: LegacyCapabilityId): readonly string[] {
  if (id === 'public-style-explicit-entry') return ['package.json', 'src/assets/style/public.scss'];
  if (id === 'public-base-subclass-extension') return ['src/base/Base.ts', 'src/base/index.ts', 'website/src/views/LayerCommonView.vue'];
  if (id === 'public-low-level-plot-api') return ['src/entries/plot.ts', 'src/extends/plot/plotDraw.ts', 'src/extends/plot/plotEdit.ts'];
  if (id === 'public-low-level-transform-interaction') return ['src/entries/transform.ts', 'src/extends/transform-interaction/TransformInteraction.ts'];
  if (id === 'public-feature-metadata-keys') return ['src/common/featureKeys.ts', 'src/base/Base.ts'];
  if (id === 'public-legacy-type-only-ast') return ['src/ast.ts', 'src/index.ts'];
  if (id.startsWith('public-')) return ['src/index.ts', 'package.json', 'test/PackageExports.test.ts'];
  if (id.startsWith('earth-'))
    return ['src/Earth.ts', 'src/useEarth.ts', 'src/earthContext.ts', 'src/interface/earth.ts', 'website/src/views/EarthCreateView.vue'];
  if (id.startsWith('camera-')) return ['src/modules/Camera.ts', 'website/src/examples/CameraDemo.vue'];
  if (id === 'control-earth-delegation') return ['src/Earth.ts', 'src/modules/Controls.ts', 'website/src/examples/ControlsDemo.vue'];
  if (id.startsWith('control-')) return ['src/modules/Controls.ts', 'website/src/examples/ControlsDemo.vue'];
  if (id === 'element-icon-point') return ['src/base/BillboardLayer.ts', 'src/interface/default.ts', '.test/base/BillboardLayer.ts'];
  if (id === 'element-point') return ['src/base/PointLayer.ts', 'src/interface/default.ts', '.test/base/PointLayer.ts'];
  if (id === 'element-polyline') return ['src/base/PolylineLayer.ts', 'src/interface/default.ts', '.test/base/PolylineLayer.ts'];
  if (id === 'element-polygon') return ['src/base/PolygonLayer.ts', 'src/interface/default.ts', '.test/base/PolygonLayer.ts'];
  if (id === 'element-circle') return ['src/base/CircleLayer.ts', 'src/interface/default.ts', '.test/base/CircleLayer.ts'];
  if (id.startsWith('element-') || id.startsWith('layer-')) return ['src/base/Base.ts', 'src/common/featureKeys.ts', 'website/src/views/LayerCommonView.vue'];
  if (id === 'style-fill-pattern' || id.startsWith('utils-pattern-fill-'))
    return [
      'src/common/PatternFill.ts',
      'src/base/PolygonLayer.ts',
      'src/base/CircleLayer.ts',
      'src/interface/default.ts',
      'website/src/examples/PolygonLayerStyleDemo.vue'
    ];
  if (id === 'style-fill-solid') return ['src/base/PolygonLayer.ts', 'src/base/CircleLayer.ts', 'src/interface/default.ts'];
  if (id === 'style-icon-full') return ['src/base/BillboardLayer.ts', 'src/interface/default.ts', 'website/src/views/BillboardLayerView.vue'];
  if (id === 'style-screen-stable-offset') return ['src/base/Base.ts', 'src/base/BillboardLayer.ts', 'src/interface/default.ts'];
  if (id === 'style-polyline-static-arrow') return ['src/base/PolylineLayer.ts', 'src/common/Utils.ts', 'src/interface/default.ts'];
  if (id === 'style-layered-outline') return ['src/base/PolylineLayer.ts', 'src/base/PolygonLayer.ts', 'src/interface/default.ts'];
  if (id.startsWith('style-'))
    return ['src/interface/default.ts', 'src/base/PointLayer.ts', 'src/base/PolylineLayer.ts', 'website/src/views/PointLayerView.vue'];
  if (id.startsWith('animation-point-')) return ['src/base/PointLayer.ts', 'src/common/Utils.ts', 'website/src/examples/PointLayerFlashDemo.vue'];
  if (id.startsWith('animation-polyline-'))
    return ['src/base/PolylineLayer.ts', 'src/extends/flight-line/FlightLine.ts', 'website/src/examples/PolylineLayerFlightDemo.vue'];
  if (id.startsWith('transform-animation-') || id === 'transform-bbox-active-blink') return ['src/components/Transform.ts', '.test/components/Transform.ts'];
  if (id.startsWith('overlay-')) return ['src/base/OverlayLayer.ts', 'src/interface/default.ts', 'website/src/views/OverlayLayerView.vue'];
  if (id.startsWith('descriptor-'))
    return ['src/components/Descriptor.ts', 'src/interface/descriptor.ts', 'website/src/views/DescriptorView.vue', '.test/components/Descriptor.ts'];
  if (id.startsWith('draw-shape-') || id.startsWith('edit-shape-'))
    return ['src/components/DynamicDraw.ts', 'src/interface/dynamicDraw.ts', 'website/src/config/dynamicDrawGeometries.ts'];
  if (id.startsWith('draw-') || id.startsWith('edit-'))
    return ['src/components/DynamicDraw.ts', 'src/components/index.ts', 'src/interface/dynamicDraw.ts', 'website/src/views/DynamicDrawView.vue'];
  if (id.startsWith('measure-'))
    return [
      'src/components/Measure.ts',
      'src/components/index.ts',
      'src/interface/default.ts',
      'website/src/views/MeasureView.vue',
      '.test/components/Measure.ts'
    ];
  if (id.startsWith('transform-'))
    return [
      'src/components/Transform.ts',
      'src/components/index.ts',
      'src/extends/transform-interaction/TransformInteraction.ts',
      'website/src/views/TransformView.vue',
      '.test/components/Transform.ts'
    ];
  if (id.startsWith('event-'))
    return ['src/components/GlobalEvent.ts', 'src/components/index.ts', 'website/src/views/GlobalEventView.vue', '.test/components/GlobalEvent.ts'];
  if (id === 'contextmenu-browser-default-suppression')
    return ['src/Earth.ts', 'src/components/ContextMenu.ts', 'website/src/views/ContextMenuOverviewView.vue'];
  if (id === 'contextmenu-transform-arbitration')
    return ['src/components/ContextMenu.ts', 'src/components/Transform.ts', 'website/src/views/TransformView.vue'];
  if (id.startsWith('contextmenu-'))
    return ['src/components/ContextMenu.ts', 'src/components/index.ts', 'website/src/views/ContextMenuOverviewView.vue', '.test/components/ContextMenu.ts'];
  if (id.startsWith('utils-')) return ['src/common/Utils.ts', 'src/common/index.ts'];
  throw new Error(`No audited legacy source evidence for ${id}`);
}

function testEvidenceFor(id: LegacyCapabilityId): readonly string[] {
  if (id.startsWith('public-')) return ['test/PackageExports.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id === 'earth-browser-contextmenu-suppression' || id === 'earth-target-string-or-element') return ['test/EarthElementTarget.test.ts'];
  if (id === 'earth-layer-handle-lifecycle') return ['test/EarthLayerHandle.test.ts'];
  if (id.startsWith('earth-')) return ['test/V1CapabilityBaseline.test.ts', 'test/UseEarthRegistry.test.ts', 'test/EarthContextBoundaries.test.ts'];
  if (id.startsWith('camera-')) return ['test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('control-')) return ['test/Controls.test.ts'];
  if (id.startsWith('element-') || id.startsWith('layer-')) return ['test/Base.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id === 'style-fill-pattern' || id.startsWith('utils-pattern-fill-')) return ['test/PatternFill.test.ts'];
  if (id === 'style-layered-outline') return ['test/LayeredOutline.test.ts'];
  if (id.startsWith('style-')) return ['test/Base.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('animation-')) return ['test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('overlay-') || id.startsWith('descriptor-')) return ['test/V1CapabilityBaseline.test.ts', 'test/EarthElementTarget.test.ts'];
  if (id.startsWith('draw-shape-') || id.startsWith('edit-shape-')) return ['test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('draw-')) return ['test/DynamicDraw.lifecycle.test.ts', 'test/DynamicDrawPolygonStyle.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('edit-')) return ['test/DynamicDraw.edit-session.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('measure-')) return ['test/MeasureLifecycle.test.ts', 'test/Measure.lifecycle.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('transform-')) {
    return [
      'test/TransformGeometry.test.ts',
      'test/TransformHistory.test.ts',
      'test/TransformStyleSnapshot.test.ts',
      'test/TransformContextMenu.test.ts',
      'test/TransformMultiEarth.test.ts',
      'test/Transform.lifecycle.test.ts',
      'test/GeometryTransform.test.ts',
      'test/V1CapabilityBaseline.test.ts'
    ];
  }
  if (id.startsWith('event-')) return ['test/GlobalEvent.test.ts', 'test/V1CapabilityBaseline.test.ts'];
  if (id === 'contextmenu-browser-default-suppression') return ['test/EarthElementTarget.test.ts'];
  if (id === 'contextmenu-transform-arbitration') return ['test/TransformContextMenu.test.ts'];
  if (id.startsWith('contextmenu-')) return ['test/ContextMenu.test.ts', 'test/TransformContextMenu.test.ts', 'test/EarthElementTarget.test.ts'];
  if (id === 'utils-arrow-style' || id === 'utils-point-flash' || id === 'utils-throttle-cancel-flush') return ['test/V1CapabilityBaseline.test.ts'];
  if (id.startsWith('utils-')) return ['test/Utils.test.ts'];
  throw new Error(`No audited legacy test evidence for ${id}`);
}

function buildManifestRow(id: LegacyCapabilityId): V1CapabilityManifestRow {
  const intentionalBreak = intentionalApiBreaks[id];
  return {
    id,
    legacySources: sourceEvidenceFor(id),
    testFiles: testEvidenceFor(id),
    disposition: intentionalBreak ? 'intentional-api-break' : 'retain',
    ...(intentionalBreak ?? {})
  };
}

export const v1CapabilityManifest = fixedLegacyCapabilityIds.map(buildManifestRow);

export const v1KnownLimitations = [
  'descriptor-custom-content',
  'descriptor-close-callback',
  'measure-text-size',
  'measure-total-distance-toggle',
  'dash-flow-single-remove-cleanup',
  'flight-line-listener-cleanup',
  'draw-remove-all-semantics'
].map((id) => ({ id, resolution: 'must-fix-in-v2' as const }));

export const v1ExcludedCapabilities = [{ id: 'wind', reason: '已批准删除' as const }];
