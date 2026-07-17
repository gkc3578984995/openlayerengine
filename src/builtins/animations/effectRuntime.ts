import { CapabilityError, UnsupportedOperationError } from '../../core/errors.js';
import type { RenderGeometryState, ShapeRadialFrame } from '../../core/shape/types.js';
import { isNativeStyleRef } from '../../core/style/types.js';
import type {
  AnimationInteractionPolicy,
  AnimationSample,
  AnimationTargetCapability,
  AnimationTargetProfile,
  AnimationWriteDomain
} from '../../services/animation/types.js';

/** 新增效果在 Edit 和 Transform 中统一让出临时视觉所有权。 */
export const pauseAndSuppressInteractionPolicy = Object.freeze({
  edit: 'pause-and-suppress',
  transform: 'pause-and-suppress'
} as const satisfies Readonly<{ edit: AnimationInteractionPolicy; transform: AnimationInteractionPolicy }>);

/** 创建不可变的写入域声明。 */
export function writeDomains(...values: AnimationWriteDomain[]): ReadonlySet<AnimationWriteDomain> {
  return new Set(values);
}

/** 创建不可变的目标能力声明。 */
export function requirements(...values: AnimationTargetCapability[]): ReadonlySet<AnimationTargetCapability> {
  return new Set(values);
}

/** 校验目标使用引擎可编译的结构化样式。 */
export function assertStructuredPresentation(target: AnimationTargetProfile): void {
  if (isNativeStyleRef(target.state.style)) throw new UnsupportedOperationError('Animation requires a structured StyleSpec');
}

/** 校验目标最终渲染为非退化闭合面。 */
export function assertClosedSurface(target: AnimationTargetProfile): void {
  assertStructuredPresentation(target);
  if (target.geometry.type === 'circle' && Number.isFinite(target.geometry.radius) && target.geometry.radius > 0) return;
  if (target.geometry.type === 'polygon' && target.geometry.coordinates.some(nonDegenerateRing)) return;
  throw new CapabilityError('Animation requires non-degenerate closed-surface render geometry');
}

/** 校验并读取目标的径向语义。 */
export function radialFrameFor(target: AnimationTargetProfile): ShapeRadialFrame {
  assertStructuredPresentation(target);
  const frame = target.shape.animation?.radialFrame?.(target.viewShape);
  if (
    frame === undefined ||
    !finiteCoordinate(frame.center) ||
    !Number.isFinite(frame.radius) ||
    frame.radius <= 0 ||
    !Number.isFinite(frame.startAngleRad) ||
    !Number.isFinite(frame.sweepAngleRad) ||
    frame.sweepAngleRad <= 0 ||
    frame.sweepAngleRad > Math.PI * 2
  ) {
    throw new CapabilityError('Animation requires a finite non-degenerate radial-frame provider');
  }
  return frame;
}

/** 校验目标可以生成从空到完整状态的中间几何。 */
export function assertRevealGeometry(target: AnimationTargetProfile): void {
  assertStructuredPresentation(target);
  if (target.geometry.type === 'polyline' && polylineLength(target.geometry) > Number.EPSILON) return;
  if (target.shape.animation?.createRevealSession !== undefined || target.shape.animation?.revealGeometry !== undefined) return;
  throw new CapabilityError('Grow animation requires non-degenerate polyline geometry or a reveal-geometry provider');
}

/** 连续运行的未完成采样。 */
export const continuousSample = Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }) }) satisfies AnimationSample;

/** 持续请求渲染帧，同时保证无帧时也能到达自然结束边界。 */
export function continuousUntil(wakeAtElapsedMs: number): AnimationSample {
  return Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'continuous' as const }), wakeAtElapsedMs });
}

/** 稳定等待的未完成采样。 */
export const stableSample = Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'stable' as const }) }) satisfies AnimationSample;

/** 不请求渲染帧，但仍在自然结束边界唤醒。 */
export function stableUntil(wakeAtElapsedMs: number): AnimationSample {
  return Object.freeze({ finished: false, schedule: Object.freeze({ kind: 'stable' as const }), wakeAtElapsedMs });
}

/** 已完成并移除展示结果的采样。 */
export const finishedSample = Object.freeze({ finished: true, schedule: Object.freeze({ kind: 'stable' as const }) }) satisfies AnimationSample;

/** 已完成且保留最终展示结果的采样。 */
export const retainedFinishedSample = Object.freeze({
  finished: true,
  retain: true,
  schedule: Object.freeze({ kind: 'stable' as const })
}) satisfies AnimationSample;

/** 计算折线二维总长度。 */
export function polylineLength(geometry: Extract<RenderGeometryState, { type: 'polyline' }>): number {
  let result = 0;
  for (let index = 1; index < geometry.coordinates.length; index += 1) {
    result += Math.hypot(
      geometry.coordinates[index][0] - geometry.coordinates[index - 1][0],
      geometry.coordinates[index][1] - geometry.coordinates[index - 1][1]
    );
  }
  return result;
}

function nonDegenerateRing(ring: readonly (readonly number[])[]): boolean {
  if (ring.length < 3) return false;
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const next = ring[(index + 1) % ring.length];
    area += ring[index][0] * next[1] - next[0] * ring[index][1];
  }
  return Number.isFinite(area) && Math.abs(area) > Number.EPSILON;
}

function finiteCoordinate(value: readonly number[]): boolean {
  return (value.length === 2 || value.length === 3) && value.every(Number.isFinite);
}
