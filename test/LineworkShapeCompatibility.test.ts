import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { lineStyles } from '../src/builtins/styles/lineStyles.js';
import { ElementStore } from '../src/core/element/ElementStore.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { ShapeDefinition, ShapeType } from '../src/core/shape/types.js';
import { assertLineworkShapeCompatibility } from '../src/services/style/StyleService.js';

const definitions = [...basicShapeDefinitions, ...plotShapeDefinitions] as const;
const openTypes = ['polyline', 'lune-polyline', 'curve-polyline'] as const satisfies readonly ShapeType[];
const closedTypes = [
  'polygon',
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
  'lune-polygon'
] as const satisfies readonly ShapeType[];

describe('linework ShapeDefinition compatibility', () => {
  it('按 ShapeDefinition 的最终路径轮廓声明覆盖全部内置 path shape', () => {
    const registry = new ShapeRegistry(definitions);
    const openStyle = lineStyles.polyline({ decoration: 'tick' });
    const closedStyle = lineStyles.polygon({ decoration: 'tick' });

    for (const type of openTypes) {
      const definition = registry.get(type);
      expect(definition.pathContour).toBe('open');
      expect(() => assertLineworkShapeCompatibility(openStyle, definition)).not.toThrow();
      expect(() => assertLineworkShapeCompatibility(closedStyle, definition)).toThrow(InvalidArgumentError);
    }

    for (const type of closedTypes) {
      const definition = registry.get(type);
      expect(definition.pathContour).toBe('closed');
      expect(() => assertLineworkShapeCompatibility(closedStyle, definition)).not.toThrow();
      expect(() => assertLineworkShapeCompatibility(openStyle, definition)).toThrow(InvalidArgumentError);
    }

    for (const type of ['point', 'circle'] as const) {
      const definition = registry.get(type);
      expect(definition.pathContour).toBeUndefined();
      expect(() => assertLineworkShapeCompatibility(openStyle, definition)).toThrow(InvalidArgumentError);
      expect(() => assertLineworkShapeCompatibility(closedStyle, definition)).toThrow(InvalidArgumentError);
    }
  });

  it('ElementStore 提交时复用注册表声明，不维护 ShapeType 白名单', () => {
    const registry = new ShapeRegistry(definitions);
    const store = new ElementStore(registry, {
      validateElement: (state) => assertLineworkShapeCompatibility(state.style, registry.get(state.type))
    });

    expect(() =>
      store.add({
        id: 'ellipse-linework',
        type: 'ellipse',
        geometry: {
          type: 'ellipse',
          controlPoints: [
            [0, 0],
            [20, 10]
          ]
        },
        style: lineStyles.polygon({ lines: ['solid', 'dashed'], decoration: 'square' }),
        layerId: 'default',
        visible: true
      })
    ).not.toThrow();

    expect(() =>
      store.add({
        id: 'ellipse-open-linework',
        type: 'ellipse',
        geometry: {
          type: 'ellipse',
          controlPoints: [
            [0, 0],
            [20, 10]
          ]
        },
        style: lineStyles.polyline(),
        layerId: 'default',
        visible: true
      })
    ).toThrow(InvalidArgumentError);
  });

  it('注册表拒绝未知 path contour，并在快照中保留合法声明', () => {
    const source = definitions.find(({ type }) => type === 'polyline');
    if (source === undefined) throw new Error('Missing polyline definition');

    const registry = new ShapeRegistry([source]);
    expect(registry.get('polyline').pathContour).toBe('open');

    const invalid = { ...source, pathContour: 'loop' } as unknown as ShapeDefinition;
    expect(() => new ShapeRegistry([invalid])).toThrow(InvalidArgumentError);
  });
});
