import type { AnimationEasing } from '../../core/animation/types.js';

/** 把任意进度限制到动画使用的闭区间。 */
export function clampAnimationProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 以所有 Adapter 共用的固定三次函数计算缓动进度。 */
export function applyAnimationEasing(easing: AnimationEasing, progress: number): number {
  const value = clampAnimationProgress(progress);
  switch (easing) {
    case 'linear':
      return value;
    case 'ease-in':
      return value ** 3;
    case 'ease-out':
      return 1 - (1 - value) ** 3;
    case 'ease-in-out':
      return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
  }
}

/** 计算循环或单次时间线的归一化进度。 */
export function animationProgressAt(elapsedMs: number, durationMs: number, repeat: boolean): number {
  const raw = Math.max(0, elapsedMs) / durationMs;
  return repeat ? positiveModulo(raw, 1) : clampAnimationProgress(raw);
}

/** 判断单次时间线是否已到达自然完成边界。 */
export function animationFinishedAt(elapsedMs: number, durationMs: number, repeat: boolean): boolean {
  return !repeat && elapsedMs >= durationMs;
}

/** 计算阶跃 blink 在当前时间的整体透明度乘数。 */
export function blinkOpacityAt(elapsedMs: number, periodMs: number, dutyCycle: number, minOpacity: number, maxOpacity: number, repeat: boolean): number {
  const phase = animationProgressAt(elapsedMs, periodMs, repeat);
  return phase < dutyCycle ? maxOpacity : minOpacity;
}

/** 计算 blink 下一次状态切换或自然完成的 elapsed 截止时间。 */
export function nextBlinkDeadlineAt(elapsedMs: number, periodMs: number, dutyCycle: number, repeat: boolean): number | undefined {
  if (animationFinishedAt(elapsedMs, periodMs, repeat)) return undefined;
  if (!repeat) return elapsedMs < periodMs * dutyCycle ? periodMs * dutyCycle : periodMs;
  const cycle = Math.floor(Math.max(0, elapsedMs) / periodMs);
  const cycleStart = cycle * periodMs;
  const switchAt = cycleStart + periodMs * dutyCycle;
  return elapsedMs < switchAt ? switchAt : cycleStart + periodMs;
}

/** 计算 steady 或 breathe 高亮的强度。 */
export function highlightIntensityAt(elapsedMs: number, periodMs: number, mode: 'steady' | 'breathe'): number {
  if (mode === 'steady') return 1;
  const phase = animationProgressAt(elapsedMs, periodMs, true);
  return 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase));
}

/** 告警双峰强度曲线的固定关键点。 */
export const alertIntensityKeyframes = Object.freeze([
  Object.freeze([0, 0] as const),
  Object.freeze([0.12, 1] as const),
  Object.freeze([0.24, 0] as const),
  Object.freeze([0.36, 1] as const),
  Object.freeze([0.52, 0] as const),
  Object.freeze([1, 0] as const)
]);

/** 计算固定双峰告警在当前时间的强度。 */
export function alertIntensityAt(elapsedMs: number, periodMs: number, repeat: boolean): number {
  const phase = animationProgressAt(elapsedMs, periodMs, repeat);
  for (let index = 1; index < alertIntensityKeyframes.length; index += 1) {
    const left = alertIntensityKeyframes[index - 1];
    const right = alertIntensityKeyframes[index];
    if (phase > right[0]) continue;
    const progress = (phase - left[0]) / (right[0] - left[0]);
    return left[1] + (right[1] - left[1]) * progress;
  }
  return 0;
}

/** 计算 grow 经缓动后的揭示进度。 */
export function growProgressAt(elapsedMs: number, durationMs: number, repeat: boolean, easing: AnimationEasing): number {
  return applyAnimationEasing(easing, animationProgressAt(elapsedMs, durationMs, repeat));
}

/** 计算 radar-scan 当前扫描轮次的归一化进度。 */
export function radarScanProgressAt(elapsedMs: number, periodMs: number, repeat: boolean): number {
  return animationProgressAt(elapsedMs, periodMs, repeat);
}

/** 计算 radar-scan 往返模式经过的单程数量；整数 1 和 2 分别对应折返点与返回起点。 */
export function radarScanRoundTripTravelAt(elapsedMs: number, periodMs: number, repeat: boolean): number {
  const raw = Math.max(0, elapsedMs) / periodMs;
  if (!repeat || raw <= 1) return clampAnimationProgress(raw) * 2;
  return 2 + positiveModulo(raw, 1) * 2;
}

/** 计算指定扩散环 slot 的当前进度；未发射或已结束时返回 undefined。 */
export function centerSpreadRingProgressAt(elapsedMs: number, periodMs: number, ringCount: number, slotIndex: number, repeat: boolean): number | undefined {
  const firstEmission = (slotIndex * periodMs) / ringCount;
  const elapsedSinceFirstEmission = elapsedMs - firstEmission;
  if (elapsedSinceFirstEmission < 0) return undefined;
  const progress = repeat ? positiveModulo(elapsedSinceFirstEmission / periodMs, 1) : elapsedSinceFirstEmission / periodMs;
  return progress >= 0 && progress < 1 ? progress : undefined;
}

/** 计算单次 center-spread 全部固定 slot 的完成时间。 */
export function centerSpreadFinishedAt(elapsedMs: number, periodMs: number, ringCount: number, repeat: boolean): boolean {
  const completion = periodMs + ((ringCount - 1) * periodMs) / ringCount;
  return !repeat && elapsedMs >= completion;
}

/** 计算 fade 在当前时间的整体透明度乘数。 */
export function fadeOpacityAt(elapsedMs: number, durationMs: number, direction: 'in' | 'out', easing: AnimationEasing): number {
  const progress = applyAnimationEasing(easing, Math.max(0, elapsedMs) / durationMs);
  return direction === 'in' ? progress : 1 - progress;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
