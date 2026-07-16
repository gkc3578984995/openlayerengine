import type { ShapeProjectionPort } from '../../src/core/ports/ShapeProjectionPort.js';

/** 单元测试使用的一投影单位等于一米图形投影端口。 */
export const identityShapeProjection: ShapeProjectionPort = Object.freeze<ShapeProjectionPort>({
  toViewState: (state) => state,
  toElementState: (state) => state
});
