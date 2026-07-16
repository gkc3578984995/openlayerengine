import { getPointResolution } from 'ol/proj.js';
import type Projection from 'ol/proj/Projection.js';
import type { Coordinate } from '../../core/common/types.js';
import { CapabilityError, InvalidArgumentError } from '../../core/errors.js';
import type { ShapeProjectionPort } from '../../core/ports/ShapeProjectionPort.js';
import type { ShapeState } from '../../core/shape/types.js';

/** 在 Element 的米制状态与当前 OpenLayers View 工作状态之间转换图形。 */
export class ShapeProjectionAdapter implements ShapeProjectionPort {
  readonly #projection: Projection;

  constructor(projection: Projection) {
    this.#projection = projection;
  }

  /** 按圆心处的局部比例，把米制半径换算为 View 投影单位。 */
  toViewState(state: ShapeState): ShapeState {
    if (state.type !== 'circle') return state;
    return circleState(state.center, this.#convertRadius(state.center, state.radius, 'to-view'));
  }

  /** 按圆心处的局部比例，把 View 投影半径换算为米。 */
  toElementState(state: ShapeState, referenceState?: ShapeState): ShapeState {
    if (state.type !== 'circle') return state;
    if (referenceState?.type === 'circle') {
      const referenceViewState = this.toViewState(referenceState);
      if (referenceViewState.type === 'circle' && representsSameRadius(state.radius, referenceViewState.radius)) {
        return circleState(state.center, referenceState.radius);
      }
    }
    return circleState(state.center, this.#convertRadius(state.center, state.radius, 'to-element'));
  }

  #convertRadius(center: Coordinate, radius: number, direction: 'to-view' | 'to-element'): number {
    if (!Number.isFinite(radius) || radius < 0) throw new InvalidArgumentError('Circle radius must be a non-negative finite number');
    let metersPerProjectionUnit: number;
    try {
      metersPerProjectionUnit = getPointResolution(this.#projection, 1, [center[0], center[1]], 'm');
    } catch {
      throw new CapabilityError('View projection cannot convert circle radius at its center');
    }
    if (!Number.isFinite(metersPerProjectionUnit) || metersPerProjectionUnit <= 0) {
      throw new CapabilityError('View projection cannot convert circle radius at its center');
    }
    const converted = direction === 'to-view' ? radius / metersPerProjectionUnit : radius * metersPerProjectionUnit;
    if (!Number.isFinite(converted) || converted < 0) throw new InvalidArgumentError('Circle radius conversion exceeds the finite numeric range');
    return converted;
  }
}

/** 容忍控制点重建造成的浮点误差，避免未缩放的圆半径发生漂移。 */
function representsSameRadius(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (left === right) return true;
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return scale > 0 && Math.abs(left - right) <= scale * Number.EPSILON * 16;
}

function circleState(center: Coordinate, radius: number): ShapeState<'circle'> {
  const copiedCenter: Coordinate = center.length === 3 ? [center[0], center[1], center[2]] : [center[0], center[1]];
  return Object.freeze({ type: 'circle', center: Object.freeze(copiedCenter), radius });
}
