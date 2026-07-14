import { describe, expect, it } from 'vitest';
import {
  canonicalizeWorldEdit,
  horizontalWorldFromExtent,
  horizontalWorldIndex,
  placeCoordinateInEditWorld,
  prepareWorldEdit,
  shiftCoordinateToNearestWorld,
  shiftCoordinatesToCanonicalWorld,
  shiftCoordinatesToViewWorld
} from '../src/core/common/worldWrap.js';
import type { Coordinate } from '../src/core/common/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';

describe('world-wrap coordinate helpers', () => {
  coversCapabilities('edit-session-world-wrap');

  it('uses the projection minimum X as the world origin and shifts the whole shape into the view world', () => {
    const source: readonly Coordinate[] = [
      [450, 10],
      [470, 20]
    ];

    const shifted = shiftCoordinatesToViewWorld(source, {
      extent: [100, -90, 460, 90],
      viewCenterX: 850
    });

    expect(shifted).toEqual([
      [810, 10],
      [830, 20]
    ]);
    expect(shifted[1][0] - shifted[0][0]).toBe(20);
    expect(source).toEqual([
      [450, 10],
      [470, 20]
    ]);
  });

  it('restores the current copy to canonical world zero without collapsing a dateline-crossing shape', () => {
    const current: readonly Coordinate[] = [
      [810, 10, 7],
      [830, 20, 8]
    ];

    const canonical = shiftCoordinatesToCanonicalWorld(current, [100, -90, 460, 90]);

    expect(canonical).toEqual([
      [450, 10, 7],
      [470, 20, 8]
    ]);
    expect(canonical[1][0] - canonical[0][0]).toBe(20);
  });

  it('supports negative world copies and preserves dimensions', () => {
    const source: readonly Coordinate[] = [
      [-250, 1, 4],
      [-240, 2, 5]
    ];

    expect(
      shiftCoordinatesToViewWorld(source, {
        extent: [100, -90, 460, 90],
        viewCenterX: 280
      })
    ).toEqual([
      [110, 1, 4],
      [120, 2, 5]
    ]);
  });

  it('maps each newly drawn coordinate to the world copy nearest the preceding point', () => {
    const extent = [100, -90, 460, 90] as const;

    expect(shiftCoordinateToNearestWorld([450, 1], [110, 2, 9], extent)).toEqual([470, 2, 9]);
    expect(shiftCoordinateToNearestWorld([110, 1], [450, 2], extent)).toEqual([90, 2]);
  });

  it('freezes the horizontal world boundary and makes edit handoff canonicalization idempotent', () => {
    const world = horizontalWorldFromExtent([100, -90, 460, 90], true);
    expect(world).toEqual({ minX: 100, width: 360 });
    if (world === undefined) throw new Error('Expected a horizontal world');
    expect(horizontalWorldIndex(99, world)).toBe(-1);
    expect(horizontalWorldIndex(100, world)).toBe(0);
    expect(horizontalWorldIndex(459.999, world)).toBe(0);
    expect(horizontalWorldIndex(460, world)).toBe(1);

    const prepared = prepareWorldEdit(
      [
        [450, 10, 7],
        [470, 20, 8]
      ],
      { world, referenceX: 850 }
    );
    expect(prepared.controlPoints).toEqual([
      [810, 10, 7],
      [830, 20, 8]
    ]);
    expect(placeCoordinateInEditWorld([110, 30, 9], 830, prepared.handoff)).toEqual([830, 30, 9]);

    const canonical = canonicalizeWorldEdit(prepared.controlPoints, prepared.handoff);
    expect(canonical).toEqual([
      [450, 10, 7],
      [470, 20, 8]
    ]);
    expect(canonicalizeWorldEdit(canonical, prepared.handoff)).toEqual(canonical);
  });

  it('uses an identity handoff when wrapping is disabled', () => {
    expect(horizontalWorldFromExtent([100, -90, 460, 90], false)).toBeUndefined();
    const source: readonly Coordinate[] = [[810, 10]];
    const prepared = prepareWorldEdit(source, { referenceX: 0 });

    expect(prepared).toEqual({ controlPoints: [[810, 10]], handoff: { kind: 'identity' } });
    expect(prepared.controlPoints).not.toBe(source);
    expect(canonicalizeWorldEdit(prepared.controlPoints, prepared.handoff)).toEqual(source);
  });

  it('returns detached clones when wrapping is unavailable and rejects an invalid active reference', () => {
    const source: readonly Coordinate[] = [
      [1, 2],
      [3, 4, 5]
    ];
    const contexts = [
      { extent: [0, 0, 0, 1] as const, viewCenterX: 1 },
      { extent: [0, 0, Infinity, 1] as const, viewCenterX: 1 },
      { extent: [-Number.MAX_VALUE, 0, Number.MAX_VALUE, 1] as const, viewCenterX: 0 }
    ];

    for (const context of contexts) {
      const shifted = shiftCoordinatesToViewWorld(source, context);
      expect(shifted).toEqual(source);
      expect(shifted).not.toBe(source);
      expect(shifted[0]).not.toBe(source[0]);
    }

    const canonical = shiftCoordinatesToCanonicalWorld(source, [0, 0, 0, 1]);
    expect(canonical).toEqual(source);
    expect(canonical[0]).not.toBe(source[0]);
    expect(() => shiftCoordinatesToViewWorld(source, { extent: [0, 0, 360, 1], viewCenterX: Number.NaN })).toThrow();
  });

  it('handles an empty control-point set without inventing an anchor', () => {
    expect(shiftCoordinatesToViewWorld([], { extent: [0, 0, 360, 180], viewCenterX: 720 })).toEqual([]);
    expect(shiftCoordinatesToCanonicalWorld([], [0, 0, 360, 180])).toEqual([]);
  });

  it('captures an immutable detached world snapshot for the edit handoff', () => {
    const world = { minX: -180, width: 360 };
    const prepared = prepareWorldEdit(
      [
        [170, 10],
        [190, 20]
      ],
      { world, referenceX: 540 }
    );
    if (prepared.handoff.kind !== 'wrapped') throw new Error('Expected a wrapped handoff');

    expect(prepared.handoff.world).not.toBe(world);
    expect(Object.isFrozen(prepared.handoff.world)).toBe(true);
    world.minX = 0;
    world.width = 100;

    expect(canonicalizeWorldEdit(prepared.controlPoints, prepared.handoff)).toEqual([
      [170, 10],
      [190, 20]
    ]);
  });

  it('validates every coordinate even when wrapping is inactive or unavailable', () => {
    const invalidCoordinates = [[Number.NaN, 0], [0, Number.NaN], [0, 0, Number.POSITIVE_INFINITY], [0], [0, 0, 0, 0]] as unknown as Coordinate[];

    for (const coordinate of invalidCoordinates) {
      expect(() => prepareWorldEdit([coordinate], {})).toThrowError(InvalidArgumentError);
    }

    const invalid = [0, Number.NaN] as unknown as Coordinate;
    expect(() => placeCoordinateInEditWorld(invalid, 0, { kind: 'identity' })).toThrowError(InvalidArgumentError);
    expect(() => canonicalizeWorldEdit([invalid], { kind: 'identity' })).toThrowError(InvalidArgumentError);
    expect(() => shiftCoordinateToNearestWorld([0, 0], invalid, [0, 0, 0, 1])).toThrowError(InvalidArgumentError);
    expect(() => shiftCoordinateToNearestWorld(invalid, [0, 0], [0, 0, 0, 1])).toThrowError(InvalidArgumentError);
  });

  it('validates an explicit wrapped world even for empty control points', () => {
    const invalidWorlds = [
      { minX: Number.NaN, width: 360 },
      { minX: 0, width: 0 },
      { minX: 0, width: -1 },
      { minX: 0, width: Number.NaN },
      { minX: 0, width: Number.POSITIVE_INFINITY }
    ];

    for (const world of invalidWorlds) {
      expect(() => prepareWorldEdit([], { world })).toThrowError(InvalidArgumentError);
      expect(() => canonicalizeWorldEdit([], { kind: 'wrapped', world })).toThrowError(InvalidArgumentError);
    }
  });
});
