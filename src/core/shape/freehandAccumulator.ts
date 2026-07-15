import type { Coordinate } from '../common/types.js';
import type { ShapeFreehandPolicy } from './types.js';

/**
 * 内置自由绘制策略可注册一个只修改 DrawSession 私有采样数组的追加操作。
 * 对外策略仍保持基于快照的不可变语义。
 *
 * @internal
 */
export interface ShapeFreehandAccumulator {
  append(samples: Coordinate[], coordinate: Coordinate): void;
}

/** 以 ShapeRegistry 生成快照后仍保持稳定的公开函数身份索引内部能力。 */
const accumulators = new WeakMap<ShapeFreehandPolicy['appendSample'], ShapeFreehandAccumulator>();

/** 为可信内置策略注册会话私有累加器。 */
export function registerShapeFreehandAccumulator(appendSample: ShapeFreehandPolicy['appendSample'], accumulator: ShapeFreehandAccumulator): void {
  accumulators.set(appendSample, Object.freeze(accumulator));
}

/** 查询与快照策略函数关联的可信累加器。 */
export function shapeFreehandAccumulatorFor(appendSample: ShapeFreehandPolicy['appendSample']): ShapeFreehandAccumulator | undefined {
  return accumulators.get(appendSample);
}
