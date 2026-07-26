import type { ShapePresentationPort } from '../../src/core/ports/ShapePresentationPort.js';
import { moveTrustedShapeState, renderTrustedShapeState } from '../../src/core/shape/trustedRender.js';
import type { ShapePresentationContext } from '../../src/core/shape/types.js';

/** 使用 identity 像素坐标、确定性字体度量和可控 resolution 的测试 presentation。 */
export function createTestShapePresentation(getResolution: () => number = () => 1): ShapePresentationPort {
  const context = Object.freeze<ShapePresentationContext>({
    toPixel: (coordinate) => [coordinate[0], coordinate[1]],
    toCoordinate: (pixel, template) => (template?.length === 3 ? [pixel[0], pixel[1], template[2]] : [pixel[0], pixel[1]]),
    measureTextWidth: (_font, text) => Array.from(text).length * 10,
    measureTextHeight: () => 20,
    getResolution
  });
  const presentation: ShapePresentationPort = {
    materialize: (definition, input, referenceState) => {
      const materialize = definition.presentation?.materialize;
      const state = materialize === undefined ? definition.normalize(input) : materialize(input, context, referenceState as never);
      return definition.normalize(state);
    },
    present: (definition, state, style) =>
      definition.presentation === undefined
        ? Object.freeze({ state, geometry: renderTrustedShapeState(definition, state as never) })
        : definition.presentation.present(state as never, style, context),
    describeEdit: (definition, state, style) => {
      const contextual = definition.presentation?.edit;
      if (contextual !== undefined) return contextual.describe(state as never, style, context);
      const topology = definition.editTopology;
      if (topology === undefined) throw new Error(`Shape does not support context-free editing: ${definition.type}`);
      return topology.describe(state as never);
    },
    moveEdit: (definition, state, style, index, coordinate) => {
      const contextual = definition.presentation?.edit;
      return contextual === undefined
        ? moveTrustedShapeState(definition, state as never, index, coordinate)
        : contextual.move(state as never, index, coordinate, style, context);
    },
    subscribe: () => () => undefined
  };
  return Object.freeze(presentation);
}

export const testShapePresentation = createTestShapePresentation();

/** 兼容既有 identity Projection 命名。 */
export const identityShapePresentation = testShapePresentation;
