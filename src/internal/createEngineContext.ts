import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import { defaults as defaultInteractions } from 'ol/interaction/defaults.js';
import { fromLonLat } from 'ol/proj.js';
import { ContextMenuViewAdapter } from '../adapters/dom/ContextMenuViewAdapter.js';
import { CursorAdapter } from '../adapters/dom/CursorAdapter.js';
import { TooltipAdapter } from '../adapters/dom/TooltipAdapter.js';
import { TransformToolbarAdapter } from '../adapters/dom/TransformToolbarAdapter.js';
import { FeatureBinding } from '../adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../adapters/openlayers/GeometryCodec.js';
import { HitTestAdapter } from '../adapters/openlayers/HitTestAdapter.js';
import { InputAdapter } from '../adapters/openlayers/InputAdapter.js';
import { LayerAdapter } from '../adapters/openlayers/LayerAdapter.js';
import { MeasurementAdapter } from '../adapters/openlayers/MeasurementAdapter.js';
import { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import { OverlayAdapter } from '../adapters/openlayers/OverlayAdapter.js';
import { DrawInteractionAdapter } from '../adapters/openlayers/interactions/DrawInteractionAdapter.js';
import { EditInteractionAdapter } from '../adapters/openlayers/interactions/EditInteractionAdapter.js';
import { TransformInteractionAdapter } from '../adapters/openlayers/interactions/TransformInteractionAdapter.js';
import { LayerRenderPass } from '../adapters/openlayers/render/LayerRenderPass.js';
import { StyleCompiler } from '../adapters/openlayers/style/StyleCompiler.js';
import { TransformHitTest } from '../adapters/openlayers/transform/HitTest.js';
import { createBuiltinAnimationRegistry } from '../builtins/animations/index.js';
import { basicShapeDefinitions } from '../builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../builtins/shapes/plot/index.js';
import { stylePresets } from '../builtins/styles/presets.js';
import { runFinalizers } from '../core/common/dispose.js';
import { ElementStore } from '../core/element/ElementStore.js';
import { LayerManager } from '../core/layer/LayerManager.js';
import { ShapeRegistry } from '../core/shape/ShapeRegistry.js';
import type { ShapeState } from '../core/shape/types.js';
import { isNativeStyleRef, type ElementStyleState } from '../core/style/types.js';
import { ContextMenuFacade } from '../facade/ContextMenuFacade.js';
import { ControlServiceImpl } from '../facade/ControlService.js';
import { DrawFacade } from '../facade/DrawFacade.js';
import { ElementServiceImpl } from '../facade/ElementService.js';
import { EventFacade } from '../facade/EventFacade.js';
import { LayerServiceImpl } from '../facade/LayerService.js';
import { MeasureFacade } from '../facade/MeasureFacade.js';
import { OverlayFacade } from '../facade/OverlayFacade.js';
import { StyleFacade } from '../facade/StyleFacade.js';
import { TransformFacade } from '../facade/TransformFacade.js';
import { ViewServiceImpl } from '../facade/ViewService.js';
import type { EarthOptions } from '../facade/Earth.js';
import { AnimationManagerImpl } from '../services/animation/AnimationManager.js';
import { ContextMenuService } from '../services/context-menu/ContextMenuService.js';
import { DrawService } from '../services/draw/DrawService.js';
import { EventService } from '../services/events/EventService.js';
import { InputRouter } from '../services/events/InputRouter.js';
import { InteractionCoordinator } from '../services/events/InteractionCoordinator.js';
import { MeasureService } from '../services/measure/MeasureService.js';
import { OverlayService } from '../services/overlay/OverlayService.js';
import { assertStructuredStyleSpec, StyleService } from '../services/style/StyleService.js';
import { TransformService } from '../services/transform/TransformService.js';
import type { EngineContext } from './EngineContext.js';

/** 默认地图中心坐标。 */
const homeCenter = Object.freeze(fromLonLat([119, 39]));
/** 使用线样式预设的图形类型。 */
const lineShapes = new Set(['polyline', 'lune-polyline', 'curve-polyline']);

/** 装配单个 Earth 实例需要的地图对象、适配器与服务。 */
export function createEngineContext(options: EarthOptions = {}): EngineContext {
  const target = options.target ?? 'olContainer';
  const olView = new View({ center: [...homeCenter], zoom: 4, ...options.view });
  const interactions = defaultInteractions({ doubleClickZoom: false });
  const controls = defaultControls({ zoom: false, rotate: false, attribution: false, ...options.controls });
  const map = new Map({ target, view: olView, controls, interactions });
  const rollback: Array<() => void> = [() => cleanupMap(map)];

  try {
    const viewport = map.getViewport();
    const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
    const nativeRefs = new NativeRefRegistry();
    rollback.push(() => nativeRefs.destroy());

    const layerAdapter = new LayerAdapter(map, nativeRefs);
    rollback.push(() => layerAdapter.destroy());

    const layerManagerRef: { current?: LayerManager } = {};
    const store = new ElementStore(shapes, {
      validateElement: (state) => {
        const currentLayerManager = layerManagerRef.current;
        if (currentLayerManager === undefined) throw new Error('LayerManager is not ready');
        currentLayerManager.requireVector(state.layerId);
        if (isNativeStyleRef(state.style)) void nativeRefs.requireStyle(state.style);
        else assertStructuredStyleSpec(state.style);
      }
    });
    rollback.push(() => store.destroy());

    const layerManager = new LayerManager(store, layerAdapter);
    layerManagerRef.current = layerManager;
    rollback.push(() => layerManager.destroy());
    const layers = new LayerServiceImpl(layerManager, layerAdapter, nativeRefs);

    const geometry = new GeometryCodec(shapes);
    const styleCompiler = new StyleCompiler(nativeRefs, { getViewRotation: () => olView.getRotation() });
    const internalStyles = new StyleService(store);
    const styles = new StyleFacade(internalStyles, nativeRefs);
    const binding = new FeatureBinding(store, layerAdapter, geometry, styleCompiler);
    rollback.push(() => binding.destroy());
    const hitTest = new HitTestAdapter(map, store, layerManager, layerAdapter, binding);
    const elements = new ElementServiceImpl(store, layerManager, binding, layers, nativeRefs, hitTest);

    const render = new LayerRenderPass(map, layerAdapter, binding, styleCompiler);
    rollback.push(() => render.destroy());
    const animations = new AnimationManagerImpl({ store, shapes, render, registry: createBuiltinAnimationRegistry() });
    rollback.push(() => animations.destroy());

    const inputAdapter = new InputAdapter(map, hitTest, nativeRefs);
    rollback.push(() => inputAdapter.destroy());
    const input = new InputRouter(inputAdapter);
    rollback.push(() => input.destroy());
    const transformInput = {
      focus: (): void => input.focus(),
      on: (
        type: 'keydown',
        listener: (event: Readonly<{ key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void }>) => void
      ): (() => void) =>
        input.on(type, (event) => {
          const nativeEvent = nativeRefs.requireTransient<KeyboardEvent>('input-event', event.nativeEventRef);
          listener(
            Object.freeze({
              key: event.key,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              preventDefault: () => nativeEvent.preventDefault()
            })
          );
        })
    };
    const coordinator = new InteractionCoordinator();
    rollback.push(() => coordinator.destroy());
    const unregisterContextMenuArbiter = input.setContextMenuArbiter((event) => {
      const element = event.elementId === undefined ? undefined : store.get(event.elementId);
      return coordinator.handleContextMenu(
        Object.freeze({
          type: 'rightclick',
          coordinate: event.coordinate,
          pixel: event.pixel,
          nativeEventRef: event.nativeEventRef,
          ...(element === undefined ? {} : { element })
        })
      );
    });
    rollback.push(unregisterContextMenuArbiter);

    const internalEvents = new EventService(input, store);
    const events = new EventFacade(internalEvents, elements, layers, nativeRefs);
    rollback.push(() => events.destroy());

    const contextMenuView = new ContextMenuViewAdapter(map);
    const internalContextMenu = new ContextMenuService(internalEvents, store, contextMenuView);
    const contextMenu = new ContextMenuFacade(internalContextMenu, elements, layers);
    rollback.push(() => contextMenu.destroy());

    const overlayAdapter = new OverlayAdapter(map, nativeRefs);
    rollback.push(() => overlayAdapter.destroy());
    const internalOverlays = new OverlayService(overlayAdapter, store, animations, { descriptorLayerId: layers.ensureDefault().id });
    const overlays = new OverlayFacade(internalOverlays, nativeRefs);
    rollback.push(() => internalOverlays.destroy());

    const drawAdapter = new DrawInteractionAdapter(map, layerAdapter, styleCompiler);
    const editAdapter = new EditInteractionAdapter(map, layerAdapter, binding, styleCompiler);
    const interactionTooltip = new TooltipAdapter(map);
    const interactionCursor = new CursorAdapter(viewport);
    const internalDraw = new DrawService({
      store,
      shapes,
      styles: internalStyles,
      coordinator,
      drawPort: drawAdapter,
      editPort: editAdapter,
      input,
      tooltipPort: interactionTooltip,
      cursorPort: interactionCursor,
      defaultStyle
    });
    const draw = new DrawFacade(internalDraw, elements, nativeRefs);
    rollback.push(() => draw.destroy());

    const measurement = new MeasurementAdapter({ projection: olView.getProjection(), nativeRefs });
    const internalMeasure = new MeasureService({
      draw: internalDraw,
      store,
      styles: internalStyles,
      overlays: internalOverlays,
      measurement,
      tooltips: measurement,
      defaultLayerId: layers.ensureDefault().id
    });
    const measure = new MeasureFacade(internalMeasure);
    rollback.push(() => measure.destroy());

    const transformHitTest = new TransformHitTest(map, layerManager, layerAdapter, binding);
    const transformInteraction = new TransformInteractionAdapter(map, transformHitTest, binding, styleCompiler, render);
    const transformToolbar = new TransformToolbarAdapter(map);
    const internalTransform = new TransformService({
      store,
      shapes,
      styles: internalStyles,
      coordinator,
      interaction: transformInteraction,
      animations,
      transients: animations,
      toolbar: transformToolbar,
      tooltip: interactionTooltip,
      cursor: interactionCursor,
      input: transformInput
    });
    const transform = new TransformFacade(internalTransform, elements);
    rollback.push(() => internalTransform.destroy());

    const view = new ViewServiceImpl({ map, olView, viewport, setCursor: (cursor) => interactionCursor.setBase(cursor) }, homeCenter);
    rollback.push(() => view.destroy());
    const controlService = new ControlServiceImpl({ map });
    rollback.push(() => controlService.destroy());

    let destroyed = false;
    const destroy = (): void => {
      if (destroyed) return;
      destroyed = true;
      runFinalizers([
        () => coordinator.destroy(),
        () => internalTransform.destroy(),
        () => measure.destroy(),
        () => draw.destroy(),
        () => animations.destroy(),
        () => contextMenu.destroy(),
        () => events.destroy(),
        unregisterContextMenuArbiter,
        () => input.destroy(),
        () => inputAdapter.destroy(),
        () => internalOverlays.destroy(),
        () => overlayAdapter.destroy(),
        () => view.destroy(),
        () => controlService.destroy(),
        () => render.destroy(),
        () => elements.clear(),
        () => binding.destroy(),
        () => layerManager.destroy(),
        () => layerAdapter.destroy(),
        () => store.destroy(),
        () => nativeRefs.destroy(),
        () => cleanupMap(map)
      ]);
    };

    return Object.freeze({
      map,
      olView,
      viewport,
      target,
      elements,
      layers,
      styles,
      animations,
      draw,
      transform,
      measure,
      events,
      contextMenu,
      overlays,
      view,
      controls: controlService,
      destroy
    });
  } catch (error) {
    try {
      runFinalizers([...rollback].reverse());
    } catch {
      // 保留装配阶段的原始异常。
    }
    throw error;
  }
}

/** 按图形类型返回内置默认样式。 */
function defaultStyle(state: ShapeState): ElementStyleState {
  if (state.type === 'point') return stylePresets['point-default'];
  if (lineShapes.has(state.type)) return stylePresets['line-default'];
  return stylePresets['polygon-default'];
}

/** 清理 OpenLayers 地图持有的集合与挂载目标。 */
function cleanupMap(map: Map): void {
  map.getOverlays().clear();
  map.getInteractions().clear();
  map.getControls().clear();
  map.getLayers().clear();
  map.setTarget(undefined);
  map.dispose();
}
