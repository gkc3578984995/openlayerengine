import { v1CapabilityManifest, type LegacyCapabilityId, type V1CapabilityManifestRow } from './v1CapabilityManifest.js';

export interface V2PlannedCapability {
  id: LegacyCapabilityId;
  v2Entry: string;
}

export interface V2CapabilityMatrixRow extends V1CapabilityManifestRow {
  v2Entry: string;
}

function plan(v2Entry: string, ids: readonly LegacyCapabilityId[]): V2PlannedCapability[] {
  return ids.map((id) => ({ id, v2Entry }));
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

const v2ShapePlans: V2PlannedCapability[] = v2ShapeTypes.flatMap((type) => [
  { id: `draw-shape-${type}` as LegacyCapabilityId, v2Entry: 'src/facade/drawTypes.ts | DrawService | DrawSession' },
  { id: `edit-shape-${type}` as LegacyCapabilityId, v2Entry: 'src/facade/drawTypes.ts | DrawService | EditSession' }
]);

export const v2PlannedCapabilities: readonly V2PlannedCapability[] = [
  { id: 'public-root-api', v2Entry: 'src/index.ts' },
  { id: 'public-style-explicit-entry', v2Entry: 'package.json#exports["./style.css"]' },
  { id: 'public-ol-native-escape', v2Entry: 'Earth.map | ViewService.olView | Element.olFeature | Layer.olLayer | StyleInput.nativeStyle' },
  { id: 'public-base-subclass-extension', v2Entry: 'PublicLayerSpec + StyleSpec + Layer.olLayer' },
  { id: 'public-low-level-plot-api', v2Entry: 'DrawService | DrawSession | EditSession' },
  { id: 'public-low-level-transform-interaction', v2Entry: 'TransformService | TransformSession | TransformOptions' },
  { id: 'public-feature-metadata-keys', v2Entry: 'ElementState | Selector' },
  { id: 'public-legacy-type-only-ast', v2Entry: 'src/index.ts#public-types' },

  ...plan('useEarth(options) | Earth', [
    'earth-default-instance-get-or-create',
    'earth-named-instance-get-or-create',
    'earth-instance-options-routing',
    'earth-instance-destroy-recreate'
  ]),
  { id: 'earth-explicit-unregistered-instance', v2Entry: 'new Earth(options)' },
  { id: 'earth-default-context-resolution', v2Entry: 'useEarth(options) | EngineContext' },
  ...plan('Earth.target | ViewService.olView', ['earth-target-string-or-element', 'earth-map-view-public-access']),
  ...plan('InputRouter | InputAdapter', ['earth-default-interaction-policy', 'earth-browser-contextmenu-suppression']),
  { id: 'earth-raster-osm-preset', v2Entry: "earth.layers.add({ kind: 'tile', preset: 'osm' })" },
  { id: 'earth-raster-xyz-compact-preset', v2Entry: "earth.layers.add({ kind: 'tile', preset: 'compact-xyz' })" },
  { id: 'earth-raster-custom-tile-url-function', v2Entry: "earth.layers.add({ kind: 'tile', preset: 'xyz', tileUrlFunction })" },
  { id: 'earth-layer-handle-lifecycle', v2Entry: 'earth.layers.add(...) -> LayerHandle' },
  ...plan('earth.layers', ['earth-layer-wrapper-registry', 'earth-default-layer-bundle']),
  { id: 'earth-feature-hit-at-pixel', v2Entry: 'earth.elements.atPixel' },
  { id: 'earth-cursor-control', v2Entry: 'earth.view.setCursor' },
  { id: 'earth-drag-pan-toggle', v2Entry: 'earth.view.setDragEnabled' },
  { id: 'earth-owned-service-reuse', v2Entry: 'Earth service getters' },
  { id: 'earth-destroy-lifecycle', v2Entry: 'Earth.destroy' },

  { id: 'camera-fly-home', v2Entry: 'earth.view.flyHome' },
  { id: 'camera-animate-fly-to', v2Entry: 'earth.view.animateFlyTo' },
  { id: 'camera-fly-to', v2Entry: 'earth.view.flyTo' },
  ...plan('earth.controls.*', ['control-graticule-lifecycle', 'control-scale-line-lifecycle', 'control-earth-delegation']),

  { id: 'element-metadata-id-module-data', v2Entry: 'earth.elements.add | ElementState' },
  ...plan('earth.elements.get | query | update | remove | Layer', [
    'layer-feature-query-remove',
    'layer-feature-hide-show',
    'layer-visibility-opacity-order',
    'layer-native-layer-access',
    'layer-registration-lifecycle',
    'layer-wrap-x-option',
    'layer-param-live-sync',
    'layer-param-snapshot',
    'layer-contextmenu-state-cleanup'
  ]),
  ...plan('earth.elements.add | Element', ['element-point', 'element-icon-point', 'element-polyline', 'element-polygon', 'element-circle']),

  ...plan('StyleSpec | StyleCompiler', [
    'style-stroke-basic',
    'style-stroke-dash',
    'style-stroke-fit-pattern-once',
    'style-layered-outline',
    'style-fill-solid',
    'style-fill-pattern',
    'style-label-full',
    'style-icon-full',
    'style-screen-stable-offset',
    'style-native-feature-override'
  ]),
  { id: 'style-polyline-static-arrow', v2Entry: 'StyleSpec.decorations' },

  ...plan('earth.animations.play(...) | AnimationHandle', [
    'animation-point-pulse',
    'animation-point-pulse-control',
    'animation-polyline-dash-flow',
    'animation-polyline-path-flight',
    'animation-polyline-path-control'
  ]),
  ...plan('TransformSession transient animation channel', ['transform-animation-point-pause-resume', 'transform-animation-polyline-sync']),
  { id: 'transform-bbox-active-blink', v2Entry: 'TransformSession transform-bbox channel' },

  ...plan('earth.overlays.* | OverlayHandle', [
    'overlay-add-config',
    'overlay-update',
    'overlay-position-hide',
    'overlay-query-remove',
    'overlay-default-earth-resolution'
  ]),
  ...plan('earth.overlays.createDescriptor | DescriptorHandle', [
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
  ]),

  ...v2ShapePlans,
  ...plan('src/facade/drawTypes.ts | DrawService | DrawSession', [
    'draw-session-events',
    'draw-session-rightclick-exit',
    'draw-keep-graphics',
    'draw-point-limit',
    'draw-style-preview-result-parity',
    'draw-result-query',
    'draw-result-remove',
    'draw-session-destroy'
  ]),
  ...plan('src/facade/drawTypes.ts | DrawService | EditSession', [
    'edit-session-rightclick-commit',
    'edit-session-underlay',
    'edit-session-history',
    'edit-session-control-points',
    'edit-session-world-wrap',
    'edit-session-events'
  ]),

  ...plan('src/facade/measureTypes.ts | MeasureService | MeasureSession', [
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
  ]),

  ...plan('src/facade/transformTypes.ts | TransformService | TransformSession', [
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
    'transform-low-level-advanced-options'
  ]),

  ...plan('src/services/events/** | src/facade/EventFacade.ts', [
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
  ]),

  ...plan('src/services/context-menu/** | src/facade/ContextMenuFacade.ts', [
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
    'contextmenu-registration-cleanup'
  ]),
  { id: 'contextmenu-transform-arbitration', v2Entry: 'InteractionCoordinator.handleContextMenu' },
  { id: 'contextmenu-browser-default-suppression', v2Entry: 'InputRouter | InputAdapter' },

  ...plan('src/adapters/openlayers/world.ts', ['utils-world-width-index', 'utils-feature-translate-to-pixel', 'utils-world-normalize-restore']),
  ...plan('src/utils/math.ts', ['utils-ring-close-trim', 'utils-linear-interpolation', 'utils-vector-math', 'utils-quadratic-bezier', 'utils-degree-radian']),
  { id: 'utils-guid', v2Entry: 'src/utils/id.ts' },
  { id: 'utils-arrow-style', v2Entry: 'ArrowDecorationSpec | StyleCompiler' },
  { id: 'utils-point-flash', v2Entry: 'AnimationManager pulse' },
  { id: 'utils-throttle-cancel-flush', v2Entry: 'src/utils/throttle.ts' },
  ...plan('src/adapters/openlayers/style/pattern.ts', ['utils-pattern-fill-normalize', 'utils-pattern-fill-render'])
];

const legacyMetadataById = new Map<LegacyCapabilityId, V1CapabilityManifestRow>();
for (const item of v1CapabilityManifest) legacyMetadataById.set(item.id, item);

export const v2CapabilityMatrix: readonly V2CapabilityMatrixRow[] = v2PlannedCapabilities.map((planned) => {
  const legacyMetadata = legacyMetadataById.get(planned.id);
  if (!legacyMetadata) throw new Error(`No frozen v1 metadata for planned v2 capability: ${planned.id}`);
  return { ...legacyMetadata, ...planned };
});
