import { FeatureBinding } from '../../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../../src/builtins/shapes/basic.js';
import { ElementStore } from '../../src/core/element/ElementStore.js';
import type { HitTestPort } from '../../src/core/ports/HitTestPort.js';
import type { ShapeProjectionPort } from '../../src/core/ports/ShapeProjectionPort.js';
import { LayerManager } from '../../src/core/layer/LayerManager.js';
import { ShapeRegistry } from '../../src/core/shape/ShapeRegistry.js';
import { isNativeStyleRef } from '../../src/core/style/types.js';
import { ElementServiceImpl } from '../../src/facade/ElementService.js';
import { LayerServiceImpl } from '../../src/facade/LayerService.js';
import { assertStructuredStyleSpec } from '../../src/services/style/StyleService.js';
import { createTestMap } from '../fixtures/Task8Map.js';
import { identityShapeProjection } from './shapeProjection.js';

class EmptyHitTest implements HitTestPort {
  atPixel(): undefined {
    return undefined;
  }

  getScreenExtent(): undefined {
    return undefined;
  }
}

export function createFacadeHarness(shapeProjection: ShapeProjectionPort = identityShapeProjection) {
  const map = createTestMap();
  const refs = new NativeRefRegistry();
  const shapes = new ShapeRegistry(basicShapeDefinitions);
  const context: { manager?: LayerManager } = {};
  const store = new ElementStore(shapes, {
    validateElement(state) {
      const manager = context.manager;
      if (manager === undefined) throw new Error('LayerManager is not initialized');
      manager.requireVector(state.layerId);
      if (isNativeStyleRef(state.style)) void refs.requireStyle(state.style);
      else assertStructuredStyleSpec(state.style);
    }
  });
  const adapter = new LayerAdapter(map, refs);
  const manager = new LayerManager(store, adapter);
  context.manager = manager;
  const layers = new LayerServiceImpl(manager, adapter, refs);
  const geometry = new GeometryCodec(shapes, shapeProjection);
  const binding = new FeatureBinding(store, adapter, geometry, new StyleCompiler(refs));
  const elements = new ElementServiceImpl(store, manager, binding, geometry, layers, refs, new EmptyHitTest());

  const destroy = () => {
    elements.clear();
    binding.destroy();
    manager.destroy();
    adapter.destroy();
    store.destroy();
    refs.destroy();
  };

  return { adapter, binding, destroy, elements, layers, manager, map, refs, shapes, store };
}
