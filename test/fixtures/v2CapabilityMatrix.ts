import { v1CapabilityManifest, type LegacyCapabilityId, type V1CapabilityManifestRow } from './v1CapabilityManifest.js';

export interface V2CapabilityMatrixRow extends V1CapabilityManifestRow {
  v2Entry: string;
}

function plannedV2EntryFor(id: LegacyCapabilityId): string {
  const publicEntries: Partial<Record<LegacyCapabilityId, string>> = {
    'public-root-api': 'src/index.ts',
    'public-style-explicit-entry': 'package.json#exports["./style.css"]',
    'public-ol-native-escape': 'Earth.map | ViewService.olView | Element.olFeature | Layer.olLayer | StyleInput.nativeStyle',
    'public-base-subclass-extension': 'PublicLayerSpec + StyleSpec + Layer.olLayer',
    'public-low-level-plot-api': 'DrawService | DrawSession | EditSession',
    'public-low-level-transform-interaction': 'TransformService | TransformSession | TransformOptions',
    'public-feature-metadata-keys': 'ElementState | Selector',
    'public-legacy-type-only-ast': 'src/index.ts#public-types'
  };
  if (publicEntries[id]) return publicEntries[id];
  if (id === 'earth-explicit-unregistered-instance') return 'new Earth(options)';
  if (id === 'earth-default-context-resolution') return 'useEarth(options) | EngineContext';
  if (id === 'earth-target-string-or-element' || id === 'earth-map-view-public-access') return 'Earth.target | ViewService.olView';
  if (id === 'earth-default-interaction-policy' || id === 'earth-browser-contextmenu-suppression') return 'InputRouter | InputAdapter';
  if (id === 'earth-raster-osm-preset') return "earth.layers.add({ kind: 'tile', preset: 'osm' })";
  if (id === 'earth-raster-xyz-compact-preset') return "earth.layers.add({ kind: 'tile', preset: 'compact-xyz' })";
  if (id === 'earth-raster-custom-tile-url-function') return "earth.layers.add({ kind: 'tile', preset: 'xyz', tileUrlFunction })";
  if (id === 'earth-layer-handle-lifecycle') return 'earth.layers.add(...) -> LayerHandle';
  if (id === 'earth-layer-wrapper-registry' || id === 'earth-default-layer-bundle') return 'earth.layers';
  if (id === 'earth-feature-hit-at-pixel') return 'earth.elements.atPixel';
  if (id === 'earth-cursor-control') return 'earth.view.setCursor';
  if (id === 'earth-drag-pan-toggle') return 'earth.view.setDragEnabled';
  if (id === 'earth-owned-service-reuse') return 'Earth service getters';
  if (id === 'earth-destroy-lifecycle') return 'Earth.destroy';
  if (id.startsWith('earth-')) return 'useEarth(options) | Earth';
  if (id === 'camera-fly-home') return 'earth.view.flyHome';
  if (id === 'camera-animate-fly-to') return 'earth.view.animateFlyTo';
  if (id === 'camera-fly-to') return 'earth.view.flyTo';
  if (id.startsWith('control-')) return 'earth.controls.*';
  if (id.startsWith('element-')) return 'earth.elements.add | Element';
  if (id.startsWith('layer-')) return 'earth.elements.get | query | update | remove | Layer';
  if (id === 'style-polyline-static-arrow') return 'StyleSpec.decorations';
  if (id.startsWith('style-')) return 'StyleSpec | StyleCompiler';
  if (id.startsWith('animation-')) return 'earth.animations.play(...) | AnimationHandle';
  if (id.startsWith('transform-animation-')) return 'TransformSession transient animation channel';
  if (id === 'transform-bbox-active-blink') return 'TransformSession transform-bbox channel';
  if (id.startsWith('overlay-')) return 'earth.overlays.* | OverlayHandle';
  if (id.startsWith('descriptor-')) return 'earth.overlays.createDescriptor | DescriptorHandle';
  if (id.startsWith('draw-')) return 'src/facade/drawTypes.ts | DrawService | DrawSession';
  if (id.startsWith('edit-')) return 'src/facade/drawTypes.ts | DrawService | EditSession';
  if (id.startsWith('measure-')) return 'src/facade/measureTypes.ts | MeasureService | MeasureSession';
  if (id.startsWith('transform-')) return 'src/facade/transformTypes.ts | TransformService | TransformSession';
  if (id.startsWith('event-')) return 'src/services/events/** | src/facade/EventFacade.ts';
  if (id === 'contextmenu-browser-default-suppression') return 'InputRouter | InputAdapter';
  if (id === 'contextmenu-transform-arbitration') return 'InteractionCoordinator.handleContextMenu';
  if (id.startsWith('contextmenu-')) return 'src/services/context-menu/** | src/facade/ContextMenuFacade.ts';
  if (id.startsWith('utils-world-') || id === 'utils-feature-translate-to-pixel') return 'src/adapters/openlayers/world.ts';
  if (id === 'utils-guid') return 'src/utils/id.ts';
  if (id === 'utils-throttle-cancel-flush') return 'src/utils/throttle.ts';
  if (id === 'utils-arrow-style') return 'ArrowDecorationSpec | StyleCompiler';
  if (id === 'utils-point-flash') return 'AnimationManager pulse';
  if (id.startsWith('utils-pattern-fill-')) return 'src/adapters/openlayers/style/pattern.ts';
  if (id.startsWith('utils-')) return 'src/utils/math.ts';
  throw new Error(`No planned v2 entry for ${id}`);
}

export const v2CapabilityMatrix: readonly V2CapabilityMatrixRow[] = v1CapabilityManifest.map((item) => ({
  ...item,
  v2Entry: plannedV2EntryFor(item.id)
}));
