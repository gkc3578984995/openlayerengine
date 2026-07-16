import { describe, expect, it, vi } from 'vitest';
import { basicShapeDefinitions } from '../src/builtins/shapes/basic.js';
import { createControlPointDefinition } from '../src/builtins/shapes/definition.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import { ShapeRegistry } from '../src/core/shape/ShapeRegistry.js';
import { isTrustedTransformDefinition, moveTrustedShapeState, renderTrustedShapeState } from '../src/core/shape/trustedRender.js';
import type { ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

function definition<T extends ShapeType>(type: T): ShapeDefinition<ShapeState<T>> {
  const found = basicShapeDefinitions.find((candidate) => candidate.type === type);
  if (found === undefined) throw new Error(`Missing basic shape definition: ${type}`);
  return found as ShapeDefinition<ShapeState<T>>;
}

describe('basic shape definitions', () => {
  it('allows trusted transform derivation only for the registered built-in definition identity', () => {
    const builtIn = new ShapeRegistry([definition('polyline')]).get('polyline');
    const custom = createControlPointDefinition({
      type: 'polyline',
      previewMin: 1,
      completeMin: 2,
      render: (points) => ({ type: 'polyline', coordinates: points })
    });
    const customSnapshot = new ShapeRegistry([custom]).get('polyline');

    expect(isTrustedTransformDefinition(builtIn)).toBe(true);
    expect(isTrustedTransformDefinition(customSnapshot)).toBe(false);
  });

  it('inherits trusted move and render paths across ShapeRegistry snapshots while validating only the moved state', () => {
    const validate = vi.fn();
    const render = vi.fn((points: ShapeState<'polyline'>['controlPoints']) => ({ type: 'polyline' as const, coordinates: points }));
    const source = createControlPointDefinition({
      type: 'polyline',
      previewMin: 2,
      completeMin: 2,
      validate,
      render
    });
    const firstSnapshot = new ShapeRegistry([source]).get('polyline');
    const registered = new ShapeRegistry([firstSnapshot]).get('polyline');
    const state = registered.normalize({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [4, 0]
      ]
    });
    validate.mockClear();
    render.mockClear();

    const moved = moveTrustedShapeState(registered, state, 1, [5, 2]);
    const geometry = renderTrustedShapeState(registered, moved);

    expect(moved.controlPoints).toEqual([
      [0, 0],
      [5, 2]
    ]);
    expect(geometry).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [5, 2]
      ]
    });
    expect(validate).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();

    validate.mockClear();
    registered.editTopology?.move(state, 1, [5, 2]);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('falls back to copied public methods when a custom definition reuses a trusted definition', () => {
    const source = createControlPointDefinition({
      type: 'polyline',
      previewMin: 2,
      completeMin: 2,
      render: (points) => ({ type: 'polyline', coordinates: points })
    });
    const sourceTopology = source.editTopology;
    if (sourceTopology === undefined) throw new Error('Missing source edit topology');
    const move = vi.fn(sourceTopology.move);
    const toRenderGeometry = vi.fn(source.toRenderGeometry);
    const custom: ShapeDefinition<ShapeState<'polyline'>> = Object.freeze({
      ...source,
      editTopology: Object.freeze({ ...sourceTopology, move }),
      toRenderGeometry
    });
    const registered = new ShapeRegistry([custom]).get('polyline');
    const state = registered.normalize({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [4, 0]
      ]
    });

    const moved = moveTrustedShapeState(registered, state, 1, [6, 3]);
    const geometry = renderTrustedShapeState(registered, moved);

    expect(move).toHaveBeenCalledOnce();
    expect(toRenderGeometry).toHaveBeenCalledOnce();
    expect(moved.controlPoints[1]).toEqual([6, 3]);
    expect(geometry).toEqual({ type: 'polyline', coordinates: moved.controlPoints });
  });

  it('rejects a custom complete outcome that remains incomplete', () => {
    const shape = createControlPointDefinition({
      type: 'polyline',
      previewMin: 1,
      completeMin: 2,
      render: (points) => ({ type: 'polyline', coordinates: points }),
      complete: (state) => ({ status: 'complete', state })
    });
    const preview = shape.normalize({ type: 'polyline', controlPoints: [[0, 0]] });

    expect(() => shape.tryComplete(preview)).toThrow(InvalidArgumentError);
  });

  it('normalize validates and copies coordinates without mutating caller data', () => {
    const input = {
      type: 'polyline',
      controlPoints: [
        [0, 1, 2],
        [2, 3, 4]
      ]
    };
    const before = structuredClone(input);

    const state = definition('polyline').normalize(input);

    expect(input).toEqual(before);
    expect(state).toEqual(input);
    expect(state).not.toBe(input);
    expect(state.controlPoints).not.toBe(input.controlPoints);
    expect(state.controlPoints[0]).not.toBe(input.controlPoints[0]);
  });

  it('rejects sparse coordinate and control-point arrays', () => {
    const sparseCoordinate: unknown[] = [];
    sparseCoordinate.length = 2;
    sparseCoordinate[0] = 1;
    const sparseControlPoints: unknown[] = [];
    sparseControlPoints.length = 2;
    sparseControlPoints[0] = [0, 0];

    expect(() => definition('point').normalize({ type: 'point', controlPoints: [sparseCoordinate] })).toThrow(InvalidArgumentError);
    expect(() => definition('polyline').normalize({ type: 'polyline', controlPoints: sparseControlPoints })).toThrow(InvalidArgumentError);
  });

  it('rejects accessors without invoking them', () => {
    let stateReads = 0;
    let coordinateReads = 0;
    const accessorState = { type: 'point' } as Record<string, unknown>;
    Object.defineProperty(accessorState, 'controlPoints', {
      enumerable: true,
      get() {
        stateReads += 1;
        return [[0, 0]];
      }
    });
    const accessorCoordinate: unknown[] = [];
    accessorCoordinate.length = 2;
    Object.defineProperty(accessorCoordinate, '0', {
      enumerable: true,
      get() {
        coordinateReads += 1;
        return 0;
      }
    });
    accessorCoordinate[1] = 0;

    expect(() => definition('point').normalize(accessorState)).toThrow(InvalidArgumentError);
    expect(() => definition('point').normalize({ type: 'point', controlPoints: [accessorCoordinate] })).toThrow(InvalidArgumentError);
    expect(stateReads).toBe(0);
    expect(coordinateReads).toBe(0);
  });

  it('snapshots caller descriptors once without using proxy property reads', () => {
    const descriptorReads = new Map<PropertyKey, number>();
    let propertyReads = 0;
    const coordinate = new Proxy([0, 0], {
      get(target, key, receiver) {
        propertyReads += 1;
        return Reflect.get(target, key, receiver);
      }
    });
    const controlPoints = new Proxy([coordinate], {
      get(target, key, receiver) {
        propertyReads += 1;
        return Reflect.get(target, key, receiver);
      }
    });
    const target = { type: 'point', controlPoints };
    const state = new Proxy(target, {
      getOwnPropertyDescriptor(source, key) {
        const count = (descriptorReads.get(key) ?? 0) + 1;
        descriptorReads.set(key, count);
        if (count > 1) {
          return {
            configurable: true,
            enumerable: true,
            get() {
              propertyReads += 1;
              return Reflect.get(source, key);
            }
          };
        }
        return Reflect.getOwnPropertyDescriptor(source, key);
      }
    });

    expect(definition('point').normalize(state)).toEqual({ type: 'point', controlPoints: [[0, 0]] });
    expect(descriptorReads).toEqual(
      new Map<PropertyKey, number>([
        ['type', 1],
        ['controlPoints', 1]
      ])
    );
    expect(propertyReads).toBe(0);
  });

  it('rejects array subclasses and attached caller methods without invoking them', () => {
    class CallerArray<T> extends Array<T> {}
    const subclass = new CallerArray<unknown>();
    subclass.push([0, 0], [1, 1]);
    let mapCalls = 0;
    let everyCalls = 0;
    const customControlPoints = [
      [0, 0],
      [1, 1]
    ] as unknown[];
    Object.defineProperty(customControlPoints, 'map', {
      value() {
        mapCalls += 1;
        return [
          [0, 0],
          [1, 1]
        ];
      }
    });
    const customCoordinate = [0, 0] as unknown[];
    Object.defineProperty(customCoordinate, 'every', {
      value() {
        everyCalls += 1;
        return true;
      }
    });

    expect(() => definition('polyline').normalize({ type: 'polyline', controlPoints: subclass })).toThrow(InvalidArgumentError);
    expect(() => definition('polyline').normalize({ type: 'polyline', controlPoints: customControlPoints })).toThrow(InvalidArgumentError);
    expect(() => definition('point').normalize({ type: 'point', controlPoints: [customCoordinate] })).toThrow(InvalidArgumentError);
    expect(mapCalls).toBe(0);
    expect(everyCalls).toBe(0);
  });

  it('rejects non-plain state records and returns stable ordinary dense arrays', () => {
    const inherited = Object.create({ inherited: true }) as Record<string, unknown>;
    inherited.type = 'polyline';
    inherited.controlPoints = [
      [0, 0],
      [1, 1]
    ];

    expect(() => definition('polyline').normalize(inherited)).toThrow(InvalidArgumentError);

    const normalized = definition('polyline').normalize({
      type: 'polyline',
      controlPoints: [
        [0, 0],
        [1, 1]
      ]
    });
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(normalized.controlPoints)).toBe(Array.prototype);
    expect(
      normalized.controlPoints.every((coordinate, index) => index in normalized.controlPoints && Object.getPrototypeOf(coordinate) === Array.prototype)
    ).toBe(true);
  });

  it('applies descriptor-safe plain-data parsing to circle state', () => {
    let centerReads = 0;
    const accessorCircle = { type: 'circle', radius: 2 } as Record<string, unknown>;
    Object.defineProperty(accessorCircle, 'center', {
      enumerable: true,
      get() {
        centerReads += 1;
        return [0, 0];
      }
    });

    expect(() => definition('circle').normalize(accessorCircle)).toThrow(InvalidArgumentError);
    expect(centerReads).toBe(0);
    expect(() => definition('circle').normalize(Object.assign(Object.create({}), { type: 'circle', center: [0, 0], radius: 2 }))).toThrow(InvalidArgumentError);
  });

  it('requires uniform dimensions, keeps direct 3D shapes, and makes ellipse explicitly 2D', () => {
    expect(() =>
      definition('polyline').normalize({
        type: 'polyline',
        controlPoints: [
          [0, 0],
          [1, 1, 1]
        ]
      })
    ).toThrow(InvalidArgumentError);
    expect(() =>
      definition('polygon').normalize({
        type: 'polygon',
        controlPoints: [
          [0, 0, 0],
          [2, 0],
          [1, 1, 0]
        ]
      })
    ).toThrow(InvalidArgumentError);
    expect(() =>
      definition('ellipse').normalize({
        type: 'ellipse',
        controlPoints: [
          [0, 0, 1],
          [2, 1, 1]
        ]
      })
    ).toThrow(InvalidArgumentError);

    expect(definition('point').normalize({ type: 'point', controlPoints: [[1, 2, 3]] }).controlPoints).toEqual([[1, 2, 3]]);
    expect(
      definition('polyline').normalize({
        type: 'polyline',
        controlPoints: [
          [0, 0, 1],
          [1, 1, 2]
        ]
      }).controlPoints
    ).toEqual([
      [0, 0, 1],
      [1, 1, 2]
    ]);
    expect(
      definition('polygon').toRenderGeometry(
        definition('polygon').normalize({
          type: 'polygon',
          controlPoints: [
            [0, 0, 1],
            [2, 0, 2],
            [1, 1, 3]
          ]
        })
      )
    ).toEqual({
      type: 'polygon',
      coordinates: [
        [
          [0, 0, 1],
          [2, 0, 2],
          [1, 1, 3],
          [0, 0, 1]
        ]
      ]
    });
  });

  it('keeps concave polygons valid across scales and translations', () => {
    const polygon = definition('polygon');
    const source = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 2],
      [0, 4]
    ] as const;

    for (const scale of [1e-8, 1, 1e8]) {
      for (const translation of [0, scale * 1e8]) {
        const controlPoints = source.map(([x, y]) => [x * scale + translation, y * scale - translation]);
        const state = polygon.normalize({ type: 'polygon', controlPoints });
        const geometry = polygon.toRenderGeometry(state);
        expect(geometry.type).toBe('polygon');
      }
    }
  });

  it('clone creates independent coordinates and topology move leaves the source unchanged', () => {
    const polygon = definition('polygon');
    const state = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [4, 0],
        [2, 3]
      ]
    });
    const cloned = polygon.clone(state);
    const updated = polygon.editTopology?.move(state, 1, [5, 1]);

    expect(cloned).toEqual(state);
    expect(cloned).not.toBe(state);
    expect(cloned.controlPoints[0]).not.toBe(state.controlPoints[0]);
    expect(updated?.controlPoints).toEqual([
      [0, 0],
      [5, 1],
      [2, 3]
    ]);
    expect(state.controlPoints).toEqual([
      [0, 0],
      [4, 0],
      [2, 3]
    ]);
  });

  it('emits canonical point, polyline, closed polygon, circle, and ellipse geometry', () => {
    expect(definition('point').toRenderGeometry(definition('point').normalize({ type: 'point', controlPoints: [[3, 4]] }))).toEqual({
      type: 'point',
      coordinates: [3, 4]
    });
    expect(
      definition('polyline').toRenderGeometry(
        definition('polyline').normalize({
          type: 'polyline',
          controlPoints: [
            [0, 0],
            [2, 1]
          ]
        })
      )
    ).toEqual({
      type: 'polyline',
      coordinates: [
        [0, 0],
        [2, 1]
      ]
    });
    expect(
      definition('polygon').toRenderGeometry(
        definition('polygon').normalize({
          type: 'polygon',
          controlPoints: [
            [0, 0],
            [2, 0],
            [1, 1]
          ]
        })
      )
    ).toEqual({
      type: 'polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [1, 1],
          [0, 0]
        ]
      ]
    });
    expect(definition('circle').toRenderGeometry(definition('circle').normalize({ type: 'circle', center: [3, 4], radius: 5 }))).toEqual({
      type: 'circle',
      center: [3, 4],
      radius: 5
    });

    const ellipseGeometry = definition('ellipse').toRenderGeometry(
      definition('ellipse').normalize({
        type: 'ellipse',
        controlPoints: [
          [0, 0],
          [3, 2]
        ]
      })
    );
    expect(ellipseGeometry.type).toBe('polygon');
    if (ellipseGeometry.type !== 'polygon') throw new Error('Expected ellipse polygon');
    expect(ellipseGeometry.coordinates[0]).toHaveLength(101);
    expect(ellipseGeometry.coordinates[0][0]).toEqual(ellipseGeometry.coordinates[0].at(-1));
  });

  it('keeps circle canonical while exposing editable center and radius handles', () => {
    const circle = definition('circle');
    const state = circle.normalize({ type: 'circle', center: [2, 3], radius: 4 });

    expect('controlPoints' in state).toBe(false);
    expect(circle.editTopology?.describe(state).handles.map(({ coordinate }) => coordinate)).toEqual([
      [2, 3],
      [6, 3]
    ]);
    expect(circle.editTopology?.move(state, 0, [7, 8])).toEqual({ type: 'circle', center: [7, 8], radius: 4 });
    expect(circle.editTopology?.move(state, 1, [2, 8])).toEqual({ type: 'circle', center: [2, 3], radius: 5 });
  });

  it('keeps circle methods detached-safe and preserves 3D handles', () => {
    const circle = definition('circle');
    const { clone, editTopology, isComplete, toRenderGeometry, tryComplete } = circle;
    if (editTopology === undefined) throw new Error('Expected circle edit topology');
    const { describe, move } = editTopology;
    const state = circle.normalize({ type: 'circle', center: [2, 3, 9], radius: 4 });

    expect(circle.controlPointPolicy).toEqual({ previewMin: 2, completeMin: 2, completeMax: 2, autoFinish: 2 });
    expect(clone(state)).toEqual(state);
    expect(isComplete(state)).toBe(true);
    expect(tryComplete(state)).toEqual({ status: 'complete', state });
    expect(toRenderGeometry(state)).toEqual({ type: 'circle', center: [2, 3, 9], radius: 4 });
    expect(describe(state).handles.map(({ coordinate }) => coordinate)).toEqual([
      [2, 3, 9],
      [6, 3, 9]
    ]);
    expect(move(state, 0, [7, 8, 9])).toEqual({ type: 'circle', center: [7, 8, 9], radius: 4 });
    expect(move(state, 1, [2, 8, 9])).toEqual({ type: 'circle', center: [2, 3, 9], radius: 5 });
    expect(() => move(state, 1, [2, 8, 99])).toThrow(InvalidArgumentError);

    const zero = circle.normalize({ type: 'circle', center: [2, 3, 9], radius: 0 });
    expect(describe(zero).handles.map(({ coordinate }) => coordinate)).toEqual([
      [2, 3, 9],
      [2, 3, 9]
    ]);
  });

  it('keeps accepted extreme circle states finite and rejects an unrepresentable radius update', () => {
    const circle = definition('circle');
    const maximum = Number.MAX_VALUE;
    const state = circle.normalize({ type: 'circle', center: [maximum, maximum, maximum], radius: maximum });
    const geometry = circle.toRenderGeometry(state);
    const handles = circle.editTopology?.describe(state).handles.map(({ coordinate }) => coordinate);

    expect(geometry.type).toBe('circle');
    expect(geometry.type === 'circle' && geometry.center.every(Number.isFinite) && Number.isFinite(geometry.radius)).toBe(true);
    expect(handles?.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
    expect(() => circle.editTopology?.move(state, 1, [-maximum, maximum, maximum])).toThrow(InvalidArgumentError);
  });

  it('chooses a representable radius-handle direction at extreme circle centers', () => {
    const circle = definition('circle');
    const state = circle.normalize({ type: 'circle', center: [Number.MAX_VALUE, 0], radius: 1 });
    const handles = circle.editTopology?.describe(state).handles.map(({ coordinate }) => coordinate);
    if (handles === undefined) throw new Error('Expected circle control points');

    expect(handles[1]).not.toEqual(handles[0]);
    expect(Math.hypot(handles[1][0] - handles[0][0], handles[1][1] - handles[0][1])).toBe(1);
    expect(circle.editTopology?.move(state, 1, handles[1])).toEqual(state);

    const unrepresentable = circle.normalize({ type: 'circle', center: [Number.MAX_VALUE, Number.MAX_VALUE], radius: 1 });
    expect(() => circle.editTopology?.describe(unrepresentable)).toThrow(InvalidArgumentError);
    const imprecise = circle.normalize({ type: 'circle', center: [1e16, 1e16], radius: 1.5 });
    expect(() => circle.editTopology?.describe(imprecise)).toThrow(InvalidArgumentError);

    const diagonal = circle.normalize({ type: 'circle', center: [1e16, 1e16], radius: Math.hypot(2, 2) });
    const diagonalHandles = circle.editTopology?.describe(diagonal).handles.map(({ coordinate }) => coordinate);
    if (diagonalHandles === undefined) throw new Error('Expected diagonal circle control points');
    expect(circle.editTopology?.move(diagonal, 1, diagonalHandles[1])).toEqual(diagonal);

    for (const [deltaX, deltaY] of [
      [4, 2],
      [6, 2],
      [6, 4],
      [8, 4]
    ] as const) {
      const lattice = circle.normalize({ type: 'circle', center: [1e16, 1e16], radius: Math.hypot(deltaX, deltaY) });
      const latticeHandles = circle.editTopology?.describe(lattice).handles.map(({ coordinate }) => coordinate);
      if (latticeHandles === undefined) throw new Error('Expected lattice circle control points');
      expect(circle.editTopology?.move(lattice, 1, latticeHandles[1])).toEqual(lattice);
    }
  });

  it('keeps successful small-lattice circle handle updates canonically editable', () => {
    const circle = definition('circle');
    const center: Coordinate = [1e16, 1e16];
    const initial = circle.normalize({ type: 'circle', center, radius: 0 });

    for (let deltaX = 2; deltaX <= 16; deltaX += 2) {
      for (let deltaY = 2; deltaY <= 16; deltaY += 2) {
        const updated = circle.editTopology?.move(initial, 1, [center[0] + deltaX, center[1] + deltaY]);
        if (updated === undefined) throw new Error('Expected circle control-point updates');
        const handles = circle.editTopology?.describe(updated).handles.map(({ coordinate }) => coordinate);
        if (handles === undefined) throw new Error('Expected canonical circle handles');
        expect(circle.editTopology?.move(updated, 1, handles[1])).toEqual(updated);
      }
    }
  });

  it('rejects a circle center update that would leave no stable canonical radius handle', () => {
    const circle = definition('circle');
    const state = circle.normalize({ type: 'circle', center: [0, 0], radius: 1.5 });

    expect(() => circle.editTopology?.move(state, 0, [1e16, 1e16])).toThrow(InvalidArgumentError);
  });

  it('renders extreme ellipses with finite coordinates using overflow-safe bounds', () => {
    const ellipse = definition('ellipse');
    const maximum = Number.MAX_VALUE;
    const bounds = [
      [
        [maximum, maximum],
        [maximum / 2, maximum / 2]
      ],
      [
        [-maximum, -maximum],
        [maximum, maximum]
      ]
    ] as const;

    for (const controlPoints of bounds) {
      const geometry = ellipse.toRenderGeometry(ellipse.normalize({ type: 'ellipse', controlPoints }));
      expect(geometry.type).toBe('polygon');
      expect(geometry.type === 'polygon' && geometry.coordinates.flat().every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
    }
  });

  it.each([1, 3, 5])('preserves ellipse bounds whose half-span would underflow at %s minimum-value units', (multiplier) => {
    const ellipse = definition('ellipse');
    const upper = Number.MIN_VALUE * multiplier;
    const controlPoints: Coordinate[] = [
      [0, 0],
      [upper, upper]
    ];
    const geometry = ellipse.toRenderGeometry(ellipse.normalize({ type: 'ellipse', controlPoints }));

    expect(geometry.type).toBe('polygon');
    if (geometry.type !== 'polygon') throw new Error('Expected ellipse polygon');
    const coordinates = geometry.coordinates.flat();
    expect([Math.min(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([x]) => x))]).toEqual([0, upper]);
    expect([Math.min(...coordinates.map(([, y]) => y)), Math.max(...coordinates.map(([, y]) => y))]).toEqual([0, upper]);
  });

  it('preserves adjacent representable ellipse bounds at a large center', () => {
    const ellipse = definition('ellipse');
    const lower = 1e16;
    const upper = lower + 2;
    const controlPoints: Coordinate[] = [
      [lower, lower],
      [upper, upper]
    ];
    const geometry = ellipse.toRenderGeometry(ellipse.normalize({ type: 'ellipse', controlPoints }));

    expect(geometry.type).toBe('polygon');
    if (geometry.type !== 'polygon') throw new Error('Expected ellipse polygon');
    const coordinates = geometry.coordinates.flat();
    expect([Math.min(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([x]) => x))]).toEqual([lower, upper]);
    expect([Math.min(...coordinates.map(([, y]) => y)), Math.max(...coordinates.map(([, y]) => y))]).toEqual([lower, upper]);
  });

  it('accepts distinct ellipse bounds whose reconstructed endpoints differ only by large-coordinate rounding', () => {
    const ellipse = definition('ellipse');
    const lower = 1e16;

    for (const span of [6, 10, 14, 18]) {
      const controlPoints: Coordinate[] = [
        [lower, lower],
        [lower + span, lower + span]
      ];
      const geometry = ellipse.toRenderGeometry(ellipse.normalize({ type: 'ellipse', controlPoints }));

      expect(geometry.type).toBe('polygon');
      if (geometry.type !== 'polygon') throw new Error('Expected ellipse polygon');
      const coordinates = geometry.coordinates.flat();
      expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
      expect([Math.min(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([x]) => x))]).toEqual([lower, lower + span]);
      expect([Math.min(...coordinates.map(([, y]) => y)), Math.max(...coordinates.map(([, y]) => y))]).toEqual([lower, lower + span]);
    }
  });

  it('rejects non-finite render output from a custom control-point definition', () => {
    const shape = createControlPointDefinition({
      type: 'point',
      previewMin: 1,
      completeMin: 1,
      completeMax: 1,
      render: () => ({ type: 'point', coordinates: [Infinity, 0] })
    });
    const state = shape.normalize({ type: 'point', controlPoints: [[0, 0]] });

    expect(() => shape.toRenderGeometry(state)).toThrow(InvalidArgumentError);
    expect(() => renderTrustedShapeState(shape, state)).toThrow(InvalidArgumentError);
  });

  it('does not inherit a trusted renderer when a custom definition reuses a built-in render function', () => {
    const builtIn = definition('polyline');
    const acceptUnvalidated = (input: unknown): ShapeState<'polyline'> => input as ShapeState<'polyline'>;
    const custom = Object.freeze<ShapeDefinition<ShapeState<'polyline'>>>({
      ...builtIn,
      normalize: acceptUnvalidated,
      clone: acceptUnvalidated,
      isComplete: () => true,
      tryComplete: (state) => ({ status: 'complete', state })
    });
    const registered = new ShapeRegistry([custom]).get('polyline');
    const nonFinite = Object.freeze({
      type: 'polyline' as const,
      controlPoints: Object.freeze([Object.freeze([Number.POSITIVE_INFINITY, 0]), Object.freeze([1, 1])])
    });

    expect(registered.toRenderGeometry).toBe(builtIn.toRenderGeometry);
    expect(() => renderTrustedShapeState(registered, nonFinite)).toThrow(InvalidArgumentError);
  });

  it.each([
    ['point arity', 'point', { type: 'point', controlPoints: [] }],
    ['polyline arity', 'polyline', { type: 'polyline', controlPoints: [[0, 0]] }],
    ['polygon arity', 'polygon', { type: 'polygon', controlPoints: [[0, 0]] }],
    ['non-finite coordinate', 'point', { type: 'point', controlPoints: [[Number.NaN, 0]] }],
    ['negative circle radius', 'circle', { type: 'circle', center: [0, 0], radius: -1 }]
  ] as const)('rejects invalid %s input', (_label, type, input) => {
    expect(() => definition(type).normalize(input)).toThrow(InvalidArgumentError);
  });

  it('rejects unsafe control-point indexes and invalid replacement coordinates', () => {
    const polygon = definition('polygon');
    const state = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [4, 0],
        [2, 3]
      ]
    });

    expect(() => polygon.editTopology?.move(state, -1, [1, 1])).toThrow(InvalidArgumentError);
    expect(() => polygon.editTopology?.move(state, 3, [1, 1])).toThrow(InvalidArgumentError);
    expect(() => polygon.editTopology?.move(state, 1, [Infinity, 1])).toThrow(InvalidArgumentError);
  });

  it('distinguishes renderable previews from complete canonical states', () => {
    const polygon = definition('polygon');
    const preview = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [2, 0]
      ]
    });
    const complete = polygon.normalize({
      type: 'polygon',
      controlPoints: [
        [0, 0],
        [2, 0],
        [1, 1]
      ]
    });

    expect(polygon.controlPointPolicy).toEqual({ previewMin: 2, completeMin: 3 });
    expect(polygon.isComplete(preview)).toBe(false);
    expect(polygon.isComplete(complete)).toBe(true);
    expect(polygon.tryComplete(preview)).toEqual({ status: 'incomplete' });
    expect(polygon.tryComplete(complete)).toEqual({ status: 'complete', state: complete });
  });

  it.each([
    [
      'ellipse without width',
      'ellipse',
      {
        type: 'ellipse',
        controlPoints: [
          [0, 0],
          [0, 2]
        ]
      }
    ],
    [
      'ellipse without height',
      'ellipse',
      {
        type: 'ellipse',
        controlPoints: [
          [0, 0],
          [2, 0]
        ]
      }
    ],
    [
      'degenerate polygon',
      'polygon',
      {
        type: 'polygon',
        controlPoints: [
          [0, 0],
          [1, 0],
          [2, 0]
        ]
      }
    ]
  ] as const)('rejects %s', (_label, type, input) => {
    expect(() => definition(type).normalize(input)).toThrow(InvalidArgumentError);
  });
});
