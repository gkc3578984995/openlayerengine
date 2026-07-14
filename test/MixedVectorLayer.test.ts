import { describe, expect, it } from 'vitest';
import { FeatureBinding } from '../src/adapters/openlayers/FeatureBinding.js';
import { GeometryCodec } from '../src/adapters/openlayers/GeometryCodec.js';
import { LayerAdapter } from '../src/adapters/openlayers/LayerAdapter.js';
import { NativeRefRegistry } from '../src/adapters/openlayers/NativeRefRegistry.js';
import { StyleCompiler } from '../src/adapters/openlayers/style/StyleCompiler.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import type { ElementState } from '../src/core/element/types.js';
import { LayerManager } from '../src/core/layer/LayerManager.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { shapeTypes, type ShapeState, type ShapeType } from '../src/core/shape/types.js';
import { assertStructuredStyleSpec } from '../src/services/style/StyleService.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import { createTestMap } from './fixtures/Task8Map.js';

const geometry: Record<ShapeType, ShapeState> = {
  point: { type: 'point', controlPoints: [[1, 2]] },
  polyline: {
    type: 'polyline',
    controlPoints: [
      [0, 0],
      [2, 1]
    ]
  },
  polygon: {
    type: 'polygon',
    controlPoints: [
      [0, 0],
      [3, 0],
      [1, 2]
    ]
  },
  circle: { type: 'circle', center: [0, 0], radius: 2 },
  ellipse: {
    type: 'ellipse',
    controlPoints: [
      [0, 0],
      [3, 2]
    ]
  },
  'attack-arrow': {
    type: 'attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'tailed-attack-arrow': {
    type: 'tailed-attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'fine-arrow': {
    type: 'fine-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'tailed-squad-combat-arrow': {
    type: 'tailed-squad-combat-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'assault-direction-arrow': {
    type: 'assault-direction-arrow',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  'double-arrow': {
    type: 'double-arrow',
    controlPoints: [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ]
  },
  rectangle: {
    type: 'rectangle',
    controlPoints: [
      [0, 0],
      [4, 3]
    ]
  },
  triangle: {
    type: 'triangle',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'equilateral-triangle': {
    type: 'equilateral-triangle',
    controlPoints: [
      [0, 0],
      [4, 0]
    ]
  },
  'assemble-polygon': {
    type: 'assemble-polygon',
    controlPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  },
  'closed-curve-polygon': {
    type: 'closed-curve-polygon',
    controlPoints: [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3]
    ]
  },
  sector: {
    type: 'sector',
    controlPoints: [
      [0, 0],
      [4, 0],
      [0, 4]
    ]
  },
  'lune-polygon': {
    type: 'lune-polygon',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'lune-polyline': {
    type: 'lune-polyline',
    controlPoints: [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  },
  'curve-polyline': {
    type: 'curve-polyline',
    controlPoints: [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  }
};

describe('mixed vector layer', () => {
  coversCapabilities('layer-feature-query-remove', 'element-metadata-id-module-data');

  it('keeps all 20 shape kinds together while query/update/remove remain Store-driven', () => {
    const shapes = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);
    const refs = new NativeRefRegistry();
    const store = new ElementStore(shapes, {
      validateElement(state) {
        manager.requireVector(state.layerId);
        assertStructuredStyleSpec(state.style);
      }
    });
    const adapter = new LayerAdapter(createTestMap(), refs);
    const manager = new LayerManager(store, adapter);
    manager.ensureDefaultVector();
    const binding = new FeatureBinding(store, adapter, new GeometryCodec(shapes), new StyleCompiler(refs));

    store.transaction((transaction) => {
      for (const [index, type] of shapeTypes.entries()) {
        transaction.add({
          id: `shape-${type}`,
          type,
          geometry: geometry[type],
          style: {},
          data: { index, label: type },
          module: index % 2 === 0 ? 'even' : 'odd',
          layerId: 'default',
          visible: true
        } as ElementState);
      }
    });

    expect(adapter.requireVectorSource('default').getFeatures()).toHaveLength(20);
    expect(shapeTypes.map((type) => binding.requireFeature(`shape-${type}`).getId())).toEqual(shapeTypes.map((type) => `shape-${type}`));
    expect(store.query({ module: 'even' })).toHaveLength(10);
    const updated = store.update({ module: 'even' }, { visible: false });
    expect(updated.changes).toHaveLength(10);
    expect(adapter.requireVectorSource('default').getFeatures()).toHaveLength(10);
    expect(store.get<{ index: number; label: string }>('shape-point')?.data).toEqual({ index: 0, label: 'point' });

    const removed = store.remove({ module: 'odd' });
    expect(removed.changes).toHaveLength(10);
    expect(store.query()).toHaveLength(10);
    expect(adapter.requireVectorSource('default').getFeatures()).toEqual([]);
  });
});
