import { describe, expect, it, vi } from 'vitest';
import { pathTravelAnimationDefinition } from '../src/builtins/animations/pathTravel.js';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import type { Coordinate } from '../src/core/common/types.js';
import type { ElementState } from '../src/core/element/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { RenderGeometryState, ShapeDefinition } from '../src/core/shape/types.js';
import type { StyleSpec } from '../src/core/style/types.js';
import { createAnimationFrameBuffer } from '../src/services/animation/AnimationFrameBuffer.js';
import type { AnimationFrameBuffer, AnimationFrameContext, AnimationRuntime, AnimationTargetProfile } from '../src/services/animation/types.js';
import { polylineElement } from './helpers/animationHarness.js';

describe('path-travel 多点曲率', () => {
  it('使用共享切线表达正反过弯侧重，并保留全部途经点', () => {
    const coordinates: readonly Coordinate[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [200, 100]
    ];
    const straight = retainedPath(coordinates, 0, 72);
    const positive = retainedPath(coordinates, 1, 72);
    const negative = retainedPath(coordinates, -1, 72);
    const minimumBudget = retainedPath(coordinates, 1, 1);

    expect(straight).toEqual(coordinates);
    expect(positive).toHaveLength(73);
    expect(negative).toHaveLength(positive.length);
    expect(positive[0]).toEqual(coordinates[0]);
    expect(positive.at(-1)).toEqual(coordinates.at(-1));
    expect(positive).toContainEqual([100, 0]);
    expect(positive).toContainEqual([100, 100]);
    expect(maxDistanceFromPolyline(positive, coordinates)).toBeGreaterThan(1);
    expect(maxDistanceFromPolyline(negative, coordinates)).toBeGreaterThan(1);
    expect(minimumBudget).toHaveLength(7);
    expect(maxDistanceFromPolyline(minimumBudget, coordinates)).toBeGreaterThan(1);
    expect(positive).not.toEqual(straight);
    expect(negative).not.toEqual(positive);
    expectWaypointTangentsContinuous(positive, coordinates, 0.97);
    expectWaypointTangentsContinuous(negative, coordinates, 0.97);
    expectSegmentProjectionsMonotonic(positive, coordinates);
    expectSegmentProjectionsMonotonic(negative, coordinates);
  });

  it('在折返、极端长度比和较大曲率下限制切线，避免沿原分段回退', () => {
    const cases: readonly (readonly Coordinate[])[] = [
      [
        [0, 0],
        [1, 0],
        [0, 0],
        [-1, 0]
      ],
      [
        [0, 0],
        [1, 0],
        [101, 0],
        [101, 50]
      ],
      [
        [0, 0],
        [100, 0],
        [101, 80],
        [180, 81]
      ]
    ];

    for (const coordinates of cases) {
      for (const curvature of [-2, -1, 0.45, 1, 2]) {
        const path = retainedPath(coordinates, curvature, 160);
        expect(path.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
        expectSegmentProjectionsMonotonic(path, coordinates);
      }
    }
  });

  it('沿重建后的累计弧长定位头部，使相同时间进度对应相同路径进度', () => {
    const coordinates: readonly Coordinate[] = [
      [0, 0],
      [60, 80],
      [120, -20],
      [180, 60]
    ];
    const path = retainedPath(coordinates, 1, 160);
    const { runtime, target } = createRuntime(coordinates, {
      durationMs: 1_000,
      repeat: true,
      curvature: 1,
      smoothness: 160,
      trailLength: 0.01
    });
    const buffer = createAnimationFrameBuffer(runtime.slots);

    for (const elapsedMs of [100, 250, 500, 750, 900]) {
      sample(runtime, buffer, target, elapsedMs);
      const geometry = buffer.overlay('trail-0').geometry;
      expect(geometry?.type).toBe('polyline');
      if (geometry?.type !== 'polyline') throw new Error('应生成路径尾迹');
      const head = geometry.coordinates.at(-1);
      if (head === undefined) throw new Error('路径尾迹缺少头部坐标');
      expect(locatePathProgress(path, head)).toBeCloseTo(elapsedMs / 1_000, 6);
    }

    runtime.destroy();
  });

  it('处理三维坐标、重复点和尖角时保持有限结果，零长度路径也不会失效', () => {
    const coordinates: readonly Coordinate[] = [
      [0, 0, 0],
      [50, 0, 10],
      [50, 0, 10],
      [50, 50, 20],
      [50, 50, 20],
      [100, 50, 30]
    ];
    const path = retainedPath(coordinates, 1, 80);

    expect(path[0]).toEqual([0, 0, 0]);
    expect(path.at(-1)).toEqual([100, 50, 30]);
    expect(path).toContainEqual([50, 0, 10]);
    expect(path).toContainEqual([50, 50, 20]);
    expect(path.every((coordinate) => coordinate.length === 3 && coordinate.every(Number.isFinite))).toBe(true);
    expect(path.every((coordinate, index) => index === 0 || (coordinate[2] ?? 0) >= (path[index - 1][2] ?? 0))).toBe(true);

    const stationary = retainedPath(
      [
        [5, 7, 2],
        [5, 7, 2],
        [5, 7, 2]
      ],
      1,
      20
    );
    expect(stationary).toEqual([
      [5, 7, 2],
      [5, 7, 2]
    ]);

    const sameScreenPath = retainedPath(
      [
        [0, 0, 0],
        [50, 0, 1_000],
        [100, 50, -1_000],
        [150, 50, 25]
      ],
      0.75,
      80
    );
    const changedHeight = retainedPath(
      [
        [0, 0, 500],
        [50, 0, -500],
        [100, 50, 750],
        [150, 50, -750]
      ],
      0.75,
      80
    );
    expect(sameScreenPath.map(([x, y]) => [x, y])).toEqual(changedHeight.map(([x, y]) => [x, y]));

    const screenDuplicate = retainedPath(
      [
        [0, 0, 2],
        [0, 0, 999],
        [50, 0, 10],
        [50, 50, 20]
      ],
      1,
      40
    );
    expect(screenDuplicate[0]).toEqual([0, 0, 2]);
    expect(screenDuplicate).not.toContainEqual([0, 0, 999]);
    expect(screenDuplicate.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);

    const invalidState = polylineElement('invalid-path');
    const invalidTarget = targetProfile(invalidState, [[0, 0]]);
    expect(() => pathTravelAnimationDefinition.assertCompatible(invalidTarget)).toThrow();
  });

  it('把有限输入导致的数值溢出稳定转换为 InvalidArgumentError', () => {
    expect(() =>
      createRuntime(
        [
          [0, 0],
          [100, 0],
          [100, 100]
        ],
        { durationMs: 100, curvature: Number.MAX_VALUE, smoothness: 32 }
      )
    ).toThrow(InvalidArgumentError);

    expect(() =>
      createRuntime(
        [
          [-Number.MAX_VALUE, 0],
          [0, 1],
          [Number.MAX_VALUE, 0]
        ],
        { durationMs: 100, curvature: 1, smoothness: 32 }
      )
    ).toThrow(InvalidArgumentError);

    expect(() =>
      createRuntime(
        [
          [0, 0],
          [Number.NaN, 1]
        ],
        { durationMs: 100, curvature: 0, smoothness: 32 }
      )
    ).toThrow(InvalidArgumentError);
  });

  it('仅在 Runtime 建立与 rebind 时重建曲线，稳定帧复用尾迹对象和坐标池', () => {
    const initial: readonly Coordinate[] = [
      [0, 0],
      [50, 80],
      [100, 0]
    ];
    const changed: readonly Coordinate[] = [
      [0, 0],
      [80, 100],
      [160, 20]
    ];
    const hypot = vi.spyOn(Math, 'hypot');

    try {
      const { runtime, target } = createRuntime(initial, {
        durationMs: 1_000,
        repeat: true,
        curvature: 1,
        smoothness: 64,
        trailLength: 0.5
      });
      const buffer = createAnimationFrameBuffer(runtime.slots);
      const rebuildCalls = hypot.mock.calls.length;
      expect(rebuildCalls).toBeGreaterThan(0);

      sample(runtime, buffer, target, 500);
      const geometry = buffer.overlay('trail-0').geometry;
      expect(geometry?.type).toBe('polyline');
      if (geometry?.type !== 'polyline') throw new Error('应生成路径尾迹');
      const coordinatePool = [...geometry.coordinates];
      const initialHead = [...(geometry.coordinates.at(-1) ?? [])];

      sample(runtime, buffer, target, 750);
      expect(hypot).toHaveBeenCalledTimes(rebuildCalls);
      expect(buffer.overlay('trail-0').geometry).toBe(geometry);
      expect(geometry.coordinates.every((coordinate, index) => coordinate === coordinatePool[index])).toBe(true);

      const rebound = targetProfile(polylineElement('path-rebound'), changed);
      runtime.rebind(rebound);
      expect(hypot.mock.calls.length).toBeGreaterThan(rebuildCalls);
      const reboundCalls = hypot.mock.calls.length;
      sample(runtime, buffer, rebound, 750);
      expect(hypot).toHaveBeenCalledTimes(reboundCalls);
      expect(buffer.overlay('trail-0').geometry).toBe(geometry);
      expect([...(geometry.coordinates.at(-1) ?? [])]).not.toEqual(initialHead);
      runtime.destroy();
    } finally {
      hypot.mockRestore();
    }
  });
});

function retainedPath(coordinates: readonly Coordinate[], curvature: number, smoothness: number): readonly Coordinate[] {
  const { runtime, target } = createRuntime(coordinates, {
    durationMs: 100,
    repeat: false,
    finishBehavior: 'retain',
    curvature,
    smoothness
  });
  const buffer = createAnimationFrameBuffer(runtime.slots);
  sample(runtime, buffer, target, 100);
  const geometry = buffer.overlay('retained-line').geometry;
  expect(geometry?.type).toBe('polyline');
  if (geometry?.type !== 'polyline') throw new Error('应保留完整路径');
  const path = geometry.coordinates.map((coordinate) => [...coordinate] as Coordinate);
  runtime.destroy();
  return path;
}

function createRuntime(
  coordinates: readonly Coordinate[],
  options: Omit<Parameters<typeof pathTravelAnimationDefinition.normalize>[0], 'type'>
): { readonly runtime: AnimationRuntime; readonly target: AnimationTargetProfile } {
  const state = polylineElement('curved-path', { geometry: { type: 'polyline', controlPoints: coordinates } });
  const target = targetProfile(state, coordinates);
  const spec = pathTravelAnimationDefinition.normalize({ type: 'path-travel', showStart: false, showEnd: false, ...options });
  return { runtime: pathTravelAnimationDefinition.create(target, spec), target };
}

function targetProfile(state: ElementState, coordinates: readonly Coordinate[]): AnimationTargetProfile {
  const shape = basicShapeDefinitions.find(({ type }) => type === state.type);
  if (shape === undefined) throw new Error(`未找到图形定义：${state.type}`);
  const geometry: RenderGeometryState = { type: 'polyline', coordinates };
  const style = state.style as StyleSpec;
  return { state: Object.freeze({ ...state, style }), viewShape: state.geometry, geometry, style, shape: shape as ShapeDefinition };
}

function sample(runtime: AnimationRuntime, buffer: AnimationFrameBuffer, target: AnimationTargetProfile, elapsedMs: number): void {
  const context: AnimationFrameContext = { target, elapsedMs, resolution: 1, rotation: 0, pixelRatio: 1 };
  runtime.sample(context, buffer);
}

function maxDistanceFromPolyline(path: readonly Coordinate[], source: readonly Coordinate[]): number {
  return path.reduce((maximum, coordinate) => Math.max(maximum, distanceFromPolyline(coordinate, source)), 0);
}

function distanceFromPolyline(point: Coordinate, path: readonly Coordinate[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    minimum = Math.min(minimum, pointToSegmentDistance(point, path[index - 1], path[index]));
  }
  return minimum;
}

function pointToSegmentDistance(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const squaredLength = dx * dx + dy * dy;
  const ratio = squaredLength === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / squaredLength));
  return Math.hypot(point[0] - (start[0] + dx * ratio), point[1] - (start[1] + dy * ratio));
}

function expectWaypointTangentsContinuous(path: readonly Coordinate[], waypoints: readonly Coordinate[], minimumCosine: number): void {
  const indices = locateWaypointIndices(path, waypoints);
  for (let index = 1; index < indices.length - 1; index += 1) {
    const pathIndex = indices[index];
    const before = path[pathIndex - 1];
    const waypoint = path[pathIndex];
    const after = path[pathIndex + 1];
    const incoming: Coordinate = [waypoint[0] - before[0], waypoint[1] - before[1]];
    const outgoing: Coordinate = [after[0] - waypoint[0], after[1] - waypoint[1]];
    const denominator = Math.hypot(incoming[0], incoming[1]) * Math.hypot(outgoing[0], outgoing[1]);
    expect(denominator).toBeGreaterThan(0);
    expect((incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / denominator).toBeGreaterThan(minimumCosine);
  }
}

function expectSegmentProjectionsMonotonic(path: readonly Coordinate[], waypoints: readonly Coordinate[]): void {
  const indices = locateWaypointIndices(path, waypoints);
  for (let segmentIndex = 0; segmentIndex < waypoints.length - 1; segmentIndex += 1) {
    const start = waypoints[segmentIndex];
    const end = waypoints[segmentIndex + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const squaredLength = dx * dx + dy * dy;
    if (squaredLength === 0) continue;
    let previous = Number.NEGATIVE_INFINITY;
    for (let pathIndex = indices[segmentIndex]; pathIndex <= indices[segmentIndex + 1]; pathIndex += 1) {
      const point = path[pathIndex];
      const projection = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / squaredLength;
      expect(projection + 1e-10).toBeGreaterThanOrEqual(previous);
      previous = projection;
    }
  }
}

function locateWaypointIndices(path: readonly Coordinate[], waypoints: readonly Coordinate[]): number[] {
  const indices: number[] = [];
  let from = 0;
  for (const waypoint of waypoints) {
    const relativeIndex = path.slice(from).findIndex((coordinate) => coordinate[0] === waypoint[0] && coordinate[1] === waypoint[1]);
    if (relativeIndex < 0) throw new Error(`重建路径缺少途经点：${waypoint[0]}, ${waypoint[1]}`);
    const index = from + relativeIndex;
    indices.push(index);
    from = index + 1;
  }
  return indices;
}

function locatePathProgress(path: readonly Coordinate[], point: Coordinate): number {
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    totalLength += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
    cumulativeLengths.push(totalLength);
  }

  let closestDistance = Number.POSITIVE_INFINITY;
  let closestLength = 0;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const segmentLength = cumulativeLengths[index] - cumulativeLengths[index - 1];
    const ratio =
      segmentLength <= Number.EPSILON
        ? 0
        : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (segmentLength * segmentLength)));
    const projectedX = start[0] + dx * ratio;
    const projectedY = start[1] + dy * ratio;
    const squaredDistance = (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;
    if (squaredDistance < closestDistance) {
      closestDistance = squaredDistance;
      closestLength = cumulativeLengths[index - 1] + segmentLength * ratio;
    }
  }
  return totalLength <= Number.EPSILON ? 0 : closestLength / totalLength;
}
