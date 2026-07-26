import type { ShapePresentationPort } from '../../src/core/ports/ShapePresentationPort.js';
import { moveTrustedShapeState, renderTrustedShapeState } from '../../src/core/shape/trustedRender.js';
import type { ShapePresentationContext } from '../../src/core/shape/types.js';

const testContext = Object.freeze<ShapePresentationContext>({
  toPixel: (coordinate) => [coordinate[0], coordinate[1]],
  toCoordinate: (pixel, template) => (template?.length === 3 ? [pixel[0], pixel[1], template[2]] : [pixel[0], pixel[1]]),
  measureTextWidth: (_font, text) => Array.from(text).length * 10,
  measureTextHeight: () => 20
});

/** 使用 identity 像素坐标与确定性字体度量的测试 presentation。 */
export const testShapePresentation = Object.freeze<ShapePresentationPort>({
  present: (definition, state, style) =>
    definition.presentation === undefined
      ? Object.freeze({ state, geometry: renderTrustedShapeState(definition, state as never) })
      : definition.presentation.present(state as never, style, testContext),
  describeEdit: (definition, state, style) => {
    const contextual = definition.presentation?.edit;
    if (contextual !== undefined) return contextual.describe(state as never, style, testContext);
    const topology = definition.editTopology;
    if (topology === undefined) throw new Error(`Shape does not support context-free editing: ${definition.type}`);
    return topology.describe(state as never);
  },
  moveEdit: (definition, state, style, index, coordinate) => {
    const contextual = definition.presentation?.edit;
    return contextual === undefined
      ? moveTrustedShapeState(definition, state as never, index, coordinate)
      : contextual.move(state as never, index, coordinate, style, testContext);
  },
  subscribe: () => () => undefined
});

/** 兼容既有 identity Projection 命名。 */
export const identityShapePresentation = testShapePresentation;
