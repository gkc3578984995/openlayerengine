export interface AnimationFrameStats {
  readonly intervalCount: number;
  readonly averageMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly longFrameCount: number;
  readonly longFrameRatio: number;
}

export interface AnimationFrameBudget {
  readonly averageFrameIntervalMs: number;
  readonly p95FloorMs: number;
  readonly idleP95Multiplier: number;
  readonly longFrameMs: number;
  readonly longFrameRatio: number;
}

export interface AnimationFrameBudgetEvaluation {
  readonly passed: boolean;
  readonly limits: Readonly<{
    averageMs: number;
    p95Ms: number;
    longFrameRatio: number;
  }>;
  readonly violations: readonly string[];
}

/** 对实际 map frame time 的相邻间隔计算稳定统计。 */
export function summarizeAnimationFrameIntervals(intervals: readonly number[], longFrameMs: number): AnimationFrameStats {
  if (!Number.isFinite(longFrameMs) || longFrameMs < 0) throw new Error('动画基准长帧阈值必须是有限非负数');
  if (intervals.length === 0) throw new Error('动画基准至少需要一个帧间隔');
  if (intervals.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('动画基准帧间隔必须是有限非负数');
  const sorted = [...intervals].sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * 0.95));
  const longFrameCount = intervals.filter((value) => value > longFrameMs).length;
  return Object.freeze({
    intervalCount: intervals.length,
    averageMs: intervals.reduce((total, value) => total + value, 0) / intervals.length,
    p95Ms: sorted[p95Index],
    maxMs: sorted.at(-1) ?? 0,
    longFrameCount,
    longFrameRatio: longFrameCount / intervals.length
  });
}

/** 按批准规格把场景统计与同机 idle P95 组合为可审计结果。 */
export function evaluateAnimationFrameBudget(
  active: AnimationFrameStats,
  idle: AnimationFrameStats,
  budget: AnimationFrameBudget
): AnimationFrameBudgetEvaluation {
  const values = [budget.averageFrameIntervalMs, budget.p95FloorMs, budget.idleP95Multiplier, budget.longFrameMs, budget.longFrameRatio];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || budget.longFrameRatio > 1) {
    throw new Error('动画基准门槛必须是有效的有限非负数');
  }
  const limits = Object.freeze({
    averageMs: budget.averageFrameIntervalMs,
    p95Ms: Math.max(budget.p95FloorMs, idle.p95Ms * budget.idleP95Multiplier),
    longFrameRatio: budget.longFrameRatio
  });
  const violations: string[] = [];
  if (active.averageMs > limits.averageMs) violations.push(`平均帧间隔 ${format(active.averageMs)}ms > ${format(limits.averageMs)}ms`);
  if (active.p95Ms > limits.p95Ms) violations.push(`P95 ${format(active.p95Ms)}ms > ${format(limits.p95Ms)}ms`);
  if (active.longFrameRatio > limits.longFrameRatio) {
    violations.push(`超过 ${format(budget.longFrameMs)}ms 的帧占比 ${format(active.longFrameRatio * 100)}% > ${format(limits.longFrameRatio * 100)}%`);
  }
  return Object.freeze({ passed: violations.length === 0, limits, violations: Object.freeze(violations) });
}

function format(value: number): string {
  return value
    .toFixed(3)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}
