import type { ShapeProjectionPort } from '../../src/core/ports/ShapeProjectionPort.js';

/** 单元测试使用的恒等比例投影端口：1 个投影单位对应 1 米。 */
export const identityShapeProjection: ShapeProjectionPort = Object.freeze<ShapeProjectionPort>({
  toViewState: (state) => state,
  toElementState: (state) => state
});
