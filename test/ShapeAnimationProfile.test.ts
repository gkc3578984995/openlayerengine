import { describe, expect, it } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import type { Coordinate } from '../src/core/common/types.js';
import type { RenderGeometryState, ShapeAnimationProfile, ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

const registry = new ShapeRegistry([...basicShapeDefinitions, ...plotShapeDefinitions]);

type ArrowShapeType = 'attack-arrow' | 'tailed-attack-arrow' | 'fine-arrow' | 'tailed-squad-combat-arrow' | 'assault-direction-arrow' | 'double-arrow';

const arrowTypes = Object.freeze([
  'attack-arrow',
  'tailed-attack-arrow',
  'fine-arrow',
  'tailed-squad-combat-arrow',
  'assault-direction-arrow',
  'double-arrow'
] as const satisfies readonly ArrowShapeType[]);

const arrowInputs: Readonly<Record<ArrowShapeType, unknown>> = Object.freeze({
  'attack-arrow': {
    type: 'attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'tailed-attack-arrow': {
    type: 'tailed-attack-arrow',
    controlPoints: [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  },
  'fine-arrow': {
    type: 'fine-arrow',
    controlPoints: [
      [0, 0],
      [10, 0]
    ]
  },
  'tailed-squad-combat-arrow': {
    type: 'tailed-squad-combat-arrow',
    controlPoints: [
      [0, 0],
      [10, 0]
    ]
  },
  'assault-direction-arrow': {
    type: 'assault-direction-arrow',
    controlPoints: [
      [0, 0],
      [10, 0]
    ]
  },
  'double-arrow': {
    type: 'double-arrow',
    controlPoints: [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ]
  }
});

function polygonGeometry(geometry: RenderGeometryState | undefined): Extract<RenderGeometryState, { type: 'polygon' }> {
  if (geometry?.type !== 'polygon') throw new Error('Expected polygon reveal geometry');
  return geometry;
}

function ringArea(ring: readonly Coordinate[]): number {
  let doubledArea = 0;
  for (let index = 1; index < ring.length; index += 1) {
    doubledArea += ring[index - 1][0] * ring[index][1] - ring[index][0] * ring[index - 1][1];
  }
  return Math.abs(doubledArea) / 2;
}

function containsCoordinate(ring: readonly Coordinate[], coordinate: Coordinate): boolean {
  return ring.some((candidate) => candidate[0] === coordinate[0] && candidate[1] === coordinate[1]);
}

function expectPolygonClose(actual: RenderGeometryState | undefined, expected: RenderGeometryState | undefined): void {
  const actualRing = polygonGeometry(actual).coordinates[0];
  const expectedRing = polygonGeometry(expected).coordinates[0];
  expect(actualRing).toHaveLength(expectedRing.length);
  for (let index = 0; index < actualRing.length; index += 1) {
    expect(actualRing[index][0]).toBeCloseTo(expectedRing[index][0], 12);
    expect(actualRing[index][1]).toBeCloseTo(expectedRing[index][1], 12);
  }
}

function pointDefinition(animation?: ShapeAnimationProfile<ShapeState<'point'>>): ShapeDefinition<ShapeState<'point'>> {
  const source = registry.get('point');
  return {
    type: source.type,
    capabilities: new Set(['draw']),
    ...(animation === undefined ? {} : { animation }),
    createDraft: source.createDraft,
    normalize: source.normalize,
    clone: source.clone,
    isComplete: source.isComplete,
    tryComplete: source.tryComplete,
    toRenderGeometry: source.toRenderGeometry
  };
}

describe('Shape animation profile contract', () => {
  it('snapshots and freezes provider functions without duplicating Shape capabilities', () => {
    const originalProvider: NonNullable<ShapeAnimationProfile<ShapeState<'point'>>['revealGeometry']> = (state) => ({
      type: 'point',
      coordinates: state.controlPoints[0]
    });
    const originalSessionFactory: NonNullable<ShapeAnimationProfile<ShapeState<'point'>>['createRevealSession']> = () => ({
      rebind() {},
      reveal: () => undefined,
      destroy() {}
    });
    const animation: ShapeAnimationProfile<ShapeState<'point'>> = { revealGeometry: originalProvider, createRevealSession: originalSessionFactory };
    const snapshot = new ShapeRegistry([pointDefinition(animation)]).get('point');
    animation.revealGeometry = () => undefined;
    animation.createRevealSession = () => ({ rebind() {}, reveal: () => undefined, destroy() {} });

    expect(Object.isFrozen(snapshot.animation)).toBe(true);
    expect(snapshot.animation?.revealGeometry).toBe(originalProvider);
    expect(snapshot.animation?.createRevealSession).toBe(originalSessionFactory);
    expect(snapshot.animation?.revealGeometry?.({ type: 'point', controlPoints: [[3, 4]] }, 1, 'forward')).toEqual({
      type: 'point',
      coordinates: [3, 4]
    });
    expect([...snapshot.capabilities]).toEqual(['draw']);
  });

  it('rejects empty, non-function, accessor-backed, and symbol-backed profiles without invoking getters', () => {
    let reads = 0;
    const accessorProfile = {} as Record<PropertyKey, unknown>;
    Object.defineProperty(accessorProfile, 'radialFrame', {
      enumerable: true,
      get() {
        reads += 1;
        return () => ({ center: [0, 0], radius: 1, startAngleRad: 0, sweepAngleRad: Math.PI });
      }
    });
    const symbolProfile = { revealGeometry: () => undefined } as Record<PropertyKey, unknown>;
    symbolProfile[Symbol('provider')] = () => undefined;

    expect(() => new ShapeRegistry([pointDefinition({} as ShapeAnimationProfile<ShapeState<'point'>>)])).toThrow(InvalidArgumentError);
    expect(() => new ShapeRegistry([pointDefinition({ revealGeometry: 1 } as unknown as ShapeAnimationProfile<ShapeState<'point'>>)])).toThrow(
      InvalidArgumentError
    );
    expect(() => new ShapeRegistry([pointDefinition({ createRevealSession: 1 } as unknown as ShapeAnimationProfile<ShapeState<'point'>>)])).toThrow(
      InvalidArgumentError
    );
    expect(() => new ShapeRegistry([pointDefinition(accessorProfile as unknown as ShapeAnimationProfile<ShapeState<'point'>>)])).toThrow(InvalidArgumentError);
    expect(() => new ShapeRegistry([pointDefinition(symbolProfile as unknown as ShapeAnimationProfile<ShapeState<'point'>>)])).toThrow(InvalidArgumentError);
    expect(reads).toBe(0);
  });

  it('declares reveal and radial providers only on the shapes that own those semantics', () => {
    const revealTypes = new Set<ShapeType>(arrowTypes);
    const radialTypes = new Set<ShapeType>(['circle', 'sector']);

    for (const type of registry.types()) {
      const animation = registry.get(type).animation;
      expect(animation?.revealGeometry !== undefined, `${type} reveal provider drifted`).toBe(revealTypes.has(type));
      expect(animation?.createRevealSession !== undefined, `${type} reveal session drifted`).toBe(revealTypes.has(type));
      expect(animation?.radialFrame !== undefined, `${type} radial provider drifted`).toBe(radialTypes.has(type));
    }
  });
});

describe('built-in arrow reveal providers', () => {
  it.each(arrowTypes)('%s returns only finite, closed, non-degenerate bounded polygons', (type) => {
    const shape = registry.get(type) as ShapeDefinition;
    const state = shape.normalize(arrowInputs[type]);
    const snapshot = JSON.stringify(state);
    const reveal = shape.animation?.revealGeometry;
    if (reveal === undefined) throw new Error(`Missing reveal provider: ${type}`);
    const full = polygonGeometry(shape.toRenderGeometry(state));

    expect(reveal(state, 0, 'forward')).toBeUndefined();
    expect(reveal(state, 0, 'reverse')).toBeUndefined();
    expect(reveal(state, -1, 'forward')).toBeUndefined();
    for (const direction of ['forward', 'reverse'] as const) {
      for (const progress of Array.from({ length: 19 }, (_, index) => (index + 1) / 20)) {
        const geometry = polygonGeometry(reveal(state, progress, direction));
        const ring = geometry.coordinates[0];
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        expect(ring.flat().every(Number.isFinite)).toBe(true);
        expect(ringArea(ring)).toBeGreaterThan(0);
        expect(ring.length).toBeLessThanOrEqual(full.coordinates[0].length);
      }
      expect(reveal(state, 1, direction)).toEqual(full);
      expect(reveal(state, 2, direction)).toEqual(full);
    }
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(() => reveal(state, Number.NaN, 'forward')).toThrow(InvalidArgumentError);
    expect(() => reveal(state, 0.5, 'sideways' as never)).toThrow(InvalidArgumentError);
  });

  it.each(arrowTypes)('%s reuses one polygon workspace across both directions and rebind', (type) => {
    const shape = registry.get(type) as ShapeDefinition;
    const state = shape.normalize(arrowInputs[type]);
    const reveal = shape.animation?.revealGeometry;
    const createSession = shape.animation?.createRevealSession;
    if (reveal === undefined || createSession === undefined) throw new Error(`Missing reveal session: ${type}`);
    const session = createSession(state);
    const full = polygonGeometry(session.reveal(1, 'forward'));
    const stableGeometry = full;
    const stableRing = full.coordinates[0];
    const stableCoordinates = [...stableRing];

    for (const direction of ['forward', 'reverse'] as const) {
      for (const progress of [0.05, 0.2, 0.45, 0.7, 0.95]) {
        const actual = polygonGeometry(session.reveal(progress, direction));
        expectPolygonClose(actual, reveal(state, progress, direction));
        expect(actual).toBe(stableGeometry);
        expect(actual.coordinates[0]).toBe(stableRing);
        expect(actual.coordinates[0].every((coordinate, index) => coordinate === stableCoordinates[index])).toBe(true);
      }
    }

    const rebound = shape.normalize({
      type,
      controlPoints: state.controlPoints.map(([x, y]) => [x + 17, y - 9])
    });
    session.rebind(rebound);
    const reboundGeometry = polygonGeometry(session.reveal(0.65, 'reverse'));
    expectPolygonClose(reboundGeometry, reveal(rebound, 0.65, 'reverse'));
    expect(reboundGeometry).toBe(stableGeometry);
    expect(reboundGeometry.coordinates[0]).toBe(stableRing);
    expect(reboundGeometry.coordinates[0].every((coordinate, index) => coordinate === stableCoordinates[index])).toBe(true);

    session.destroy();
    session.destroy();
    expect(() => session.reveal(0.5, 'forward')).toThrow();
  });

  it('reveals fixed arrows from opposite semantic ends without reversing their final orientation', () => {
    const shape = registry.get('fine-arrow');
    const state = shape.normalize(arrowInputs['fine-arrow']);
    const reveal = shape.animation?.revealGeometry;
    if (reveal === undefined) throw new Error('Missing fine-arrow reveal provider');
    const forward = polygonGeometry(reveal(state, 0.5, 'forward')).coordinates[0];
    const reverse = polygonGeometry(reveal(state, 0.5, 'reverse')).coordinates[0];

    expect(Math.max(...forward.map((coordinate) => coordinate[0]))).toBeCloseTo(5);
    expect(Math.min(...reverse.map((coordinate) => coordinate[0]))).toBeCloseTo(5);
    expect(Math.max(...reverse.map((coordinate) => coordinate[0]))).toBeCloseTo(10);
  });

  it('keeps the original head fixed only for reverse AttackArrow reveal', () => {
    const shape = registry.get('attack-arrow');
    const state = shape.normalize(arrowInputs['attack-arrow']);
    const reveal = shape.animation?.revealGeometry;
    if (reveal === undefined) throw new Error('Missing attack-arrow reveal provider');
    const head = state.controlPoints[state.controlPoints.length - 1];
    const forward = polygonGeometry(reveal(state, 0.5, 'forward')).coordinates[0];
    const reverse = polygonGeometry(reveal(state, 0.5, 'reverse')).coordinates[0];

    expect(containsCoordinate(forward, head)).toBe(false);
    expect(containsCoordinate(reverse, head)).toBe(true);
  });

  it('reveals both DoubleArrow branches in parallel instead of slicing its final outer ring', () => {
    const shape = registry.get('double-arrow');
    const state = shape.normalize(arrowInputs['double-arrow']);
    const reveal = shape.animation?.revealGeometry;
    if (reveal === undefined) throw new Error('Missing double-arrow reveal provider');
    const [head1, head2] = state.controlPoints.slice(2, 4);
    const forward = polygonGeometry(reveal(state, 0.5, 'forward')).coordinates[0];
    const reverse = polygonGeometry(reveal(state, 0.5, 'reverse')).coordinates[0];
    const forwardStart = polygonGeometry(reveal(state, 0.01, 'forward')).coordinates[0];
    const reverseStart = polygonGeometry(reveal(state, 0.01, 'reverse')).coordinates[0];
    const full = polygonGeometry(shape.toRenderGeometry(state));

    expect(containsCoordinate(forward, head1)).toBe(false);
    expect(containsCoordinate(forward, head2)).toBe(false);
    expect(containsCoordinate(reverse, head1)).toBe(true);
    expect(containsCoordinate(reverse, head2)).toBe(true);
    expect(ringArea(forwardStart)).toBeLessThan(ringArea(full.coordinates[0]) * 0.1);
    expect(ringArea(reverseStart)).toBeLessThan(ringArea(full.coordinates[0]) * 0.1);
    expect(reveal(state, 1, 'forward')).toEqual(full);
    expect(reveal(state, 1, 'reverse')).toEqual(full);
  });
});

describe('built-in radial providers', () => {
  it('uses the already projected Circle radius and clones its center', () => {
    const shape = registry.get('circle');
    const state = shape.normalize({ type: 'circle', center: [120, 30, 7], radius: 37.5 });
    const frame = shape.animation?.radialFrame?.(state);
    if (frame === undefined) throw new Error('Missing circle radial provider');

    expect(frame).toEqual({ center: [120, 30, 7], radius: 37.5, startAngleRad: Math.PI / 2, sweepAngleRad: Math.PI * 2 });
    expect(frame.center).not.toBe(state.center);
    expect(shape.animation?.radialFrame?.({ type: 'circle', center: [0, 0], radius: 0 }).radius).toBe(0);
  });

  it('derives Sector radius and positive sweep from its semantic boundary rays', () => {
    const shape = registry.get('sector');
    const quarter = shape.normalize({
      type: 'sector',
      controlPoints: [
        [0, 0],
        [4, 0],
        [0, 9]
      ]
    });
    const wrapped = shape.normalize({
      type: 'sector',
      controlPoints: [
        [0, 0],
        [0, 4],
        [4, 0]
      ]
    });
    const quarterFrame = shape.animation?.radialFrame?.(quarter);
    const wrappedFrame = shape.animation?.radialFrame?.(wrapped);

    expect(quarterFrame?.center).toEqual([0, 0]);
    expect(quarterFrame?.center).not.toBe(quarter.controlPoints[0]);
    expect(quarterFrame?.radius).toBe(4);
    expect(quarterFrame?.startAngleRad).toBeCloseTo(0);
    expect(quarterFrame?.sweepAngleRad).toBeCloseTo(Math.PI / 2);
    expect(wrappedFrame?.startAngleRad).toBeCloseTo(Math.PI / 2);
    expect(wrappedFrame?.sweepAngleRad).toBeCloseTo(Math.PI * 1.5);
  });
});
