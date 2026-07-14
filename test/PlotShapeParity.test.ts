import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import { bezierPoints, cubicValue, isClockWise, quadraticBSplinePoints } from '../src/builtins/shapes/plot/math.js';
import type { Coordinate } from '../src/core/common/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';

type PlotShapeType = Exclude<ShapeType, 'point' | 'polyline' | 'polygon' | 'circle' | 'ellipse'>;
type GoldenDigest = string;

const AttackArrow = 'cc5ec9c94bdc16259539cb6291eb0a0eacc1fd6968237522d97a1a0d66590801';
const TailedAttackArrow = '1d67f801db9ada98ae1428ae82cdca3732f817b6d3ba8de1ca98aa2302bdf8ef';
const FineArrow = 'bd0b3ee618e3c4b311809abcff095830870bd089929c60014f6b0f4478ddc3ec';
const TailedSquadCombatArrow = '71928505cddf47267dce24c756202e4244eadbf08c2b62ced27bd087b43a98d7';
const AssaultDirectionArrow = '147223ec87e22f47e1b8fde5808130160f8b18533e6d582d15920891e1c52732';
const DoubleArrow = '39120164d999fc8f02d7a34b5765addb96ace9b0a9857bb978bf146ee21a86b2';
const RectAnglePolygon = '291abc7852dbdedf453ce62047fc064bb2e8acf7129c784ef86da811e05a92a1';
const TrianglePolygon = 'e3850150b01a23d5ed37b0456922b7a985bb9e58e9e1b7185cb822d60e605156';
const EquilateralTrianglePolygon = '283f237fdf7f18036f0af10f413dc1b3c949a9af9cdce6ca28469247f9a8d701';
const AssemblePolygon = '868cb4ebed90bbb976277b2e39fbbe77eb09d24fdba80df14ae03f4d2e6f2897';
const ClosedCurvePolygon = '0125b1f3c45489e5e7424ae191216a3b8259513b199803a6e7cae8216b2b17dd';
const SectorPolygon = '7c150d07c084dece6c98e8a9da37796a8ddae9d6ea26a75607b8437dff30d7ed';
const LunePolygon = '09a299184625c7714921cae4a416615e9f3fb788358e673b29d2346696792b62';
const LunePolyline = 'bfd482eef1a846c88b115c61215e81769043c65de31b2d2fcb89b759dc800da7';
const CurvePolyline = '756bc18703f229b3d146a1659e53d41e6be87eec5b7109857773e5088ec223f2';

function stableGeometryDigest(geometry: unknown): string {
  const serialized = JSON.stringify(geometry, (_key, value) => (typeof value === 'number' ? Number(value.toPrecision(14)) : value));
  if (serialized === undefined) throw new TypeError('几何快照无法序列化');
  return createHash('sha256').update(serialized).digest('hex');
}

const representativeCases: readonly [type: PlotShapeType, goldenDigest: GoldenDigest, points: Coordinate[]][] = [
  [
    'attack-arrow',
    AttackArrow,
    [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  ],
  [
    'tailed-attack-arrow',
    TailedAttackArrow,
    [
      [0, 0],
      [2, 0],
      [3, 3],
      [5, 4]
    ]
  ],
  [
    'fine-arrow',
    FineArrow,
    [
      [0, 0],
      [4, 3]
    ]
  ],
  [
    'tailed-squad-combat-arrow',
    TailedSquadCombatArrow,
    [
      [0, 0],
      [4, 3]
    ]
  ],
  [
    'assault-direction-arrow',
    AssaultDirectionArrow,
    [
      [0, 0],
      [4, 3]
    ]
  ],
  [
    'double-arrow',
    DoubleArrow,
    [
      [0, 0],
      [4, 0],
      [3, 3],
      [1, 3],
      [2, 0]
    ]
  ],
  [
    'rectangle',
    RectAnglePolygon,
    [
      [0, 0],
      [4, 3]
    ]
  ],
  [
    'triangle',
    TrianglePolygon,
    [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  ],
  [
    'equilateral-triangle',
    EquilateralTrianglePolygon,
    [
      [0, 0],
      [4, 0]
    ]
  ],
  [
    'assemble-polygon',
    AssemblePolygon,
    [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  ],
  [
    'closed-curve-polygon',
    ClosedCurvePolygon,
    [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3]
    ]
  ],
  [
    'sector',
    SectorPolygon,
    [
      [0, 0],
      [4, 0],
      [0, 4]
    ]
  ],
  [
    'lune-polygon',
    LunePolygon,
    [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  ],
  [
    'lune-polyline',
    LunePolyline,
    [
      [0, 0],
      [4, 0],
      [2, 3]
    ]
  ],
  [
    'curve-polyline',
    CurvePolyline,
    [
      [0, 0],
      [2, 3],
      [4, 0]
    ]
  ]
];

function definition<T extends PlotShapeType>(type: T): ShapeDefinition<ShapeState<T>> {
  const found = plotShapeDefinitions.find((candidate) => candidate.type === type);
  if (found === undefined) throw new Error(`Missing plot shape definition: ${type}`);
  return found as ShapeDefinition<ShapeState<T>>;
}

describe('plot shape parity', () => {
  it('keeps convex curve primitives finite and inside their control bounds near Number.MAX_VALUE', () => {
    const lower = 1.7976931348623153e308;
    const upper = 1.7976931348623155e308;
    const controlPoints: Coordinate[] = [
      [upper, upper],
      [lower, upper],
      [upper, lower],
      [lower, lower]
    ];
    const samples = [
      [
        'cubic',
        Array.from({ length: 10_001 }, (_value, index) => cubicValue(index / 10_000, controlPoints[0], controlPoints[1], controlPoints[2], controlPoints[3]))
      ],
      ['bezier', bezierPoints(controlPoints)],
      ['quadratic B-spline', quadraticBSplinePoints(controlPoints.slice(0, 3))]
    ] as const;

    for (const [label, points] of samples) {
      expect(
        points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= lower && x <= upper && y >= lower && y <= upper),
        `${label} escaped its finite convex bounds`
      ).toBe(true);
    }
  });

  it('preserves representable subnormal contributions in convex curve primitives', () => {
    const zero: Coordinate = [0, 0];
    const minimum: Coordinate = [Number.MIN_VALUE, Number.MIN_VALUE];

    expect(cubicValue(0.5, zero, minimum, minimum, minimum)).toEqual(minimum);
    expect(bezierPoints([zero, minimum, minimum, minimum])[50]).toEqual(minimum);
    expect(quadraticBSplinePoints([zero, minimum, minimum])[11]).toEqual(minimum);
  });

  it('renders a narrow but representable sector without collapsing its rays', () => {
    const type = 'sector';
    const controlPoints: Coordinate[] = [
      [0, 0],
      [1e-9, 1],
      [2e-9, 1]
    ];
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));

    expect(geometry.type).toBe('polygon');
    if (geometry.type === 'polygon') {
      expect(new Set(geometry.coordinates[0].map(([x, y]) => `${x},${y}`)).size).toBeGreaterThan(2);
    }
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s renders when narrow but distinct bone directions are representable', (type) => {
    const controlPoints: Coordinate[] = [
      [0, 1],
      [2e-9, 1],
      [0, 0],
      [2e-9, 1]
    ];
    const shape = definition(type);

    expect(() => shape.toRenderGeometry(shape.normalize({ type, controlPoints }))).not.toThrow();
  });

  it.each(['lune-polygon', 'lune-polyline'] as const)('%s rejects a derived circle outside the finite coordinate range', (type) => {
    const controlPoints: Coordinate[] = [
      [0, 0],
      [1, -100],
      [0, 1e308]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each(['lune-polygon', 'lune-polyline'] as const)('%s preserves a representable subnormal arc with stable azimuths', (type) => {
    const controlPoints = [
      [237, 5],
      [243, 5],
      [176, 178]
    ].map(([x, y]) => [x * Number.MIN_VALUE, y * Number.MIN_VALUE] as Coordinate);
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : geometry.type === 'polyline' ? geometry.coordinates : [];

    expect(new Set(coordinates.map(([x, y]) => `${x},${y}`)).size).toBeGreaterThan(1);
  });

  it('rejects a sector whose selected arc leaves the finite coordinate range', () => {
    const type = 'sector';
    const controlPoints: Coordinate[] = [
      [1.7e308, 0],
      [0.7e308, 0],
      [1.7e308, 1e308]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s rejects complete states whose derived head directions collapse near MAX', (type) => {
    const origin = 1e300;
    const step = 1e285;
    const controlPoints: Coordinate[] = [
      [origin, origin],
      [origin + 2 * step, origin],
      [origin + 3 * step, origin + 3 * step],
      [origin + 5 * step, origin + 4 * step]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s rejects finite paths whose derived body width overflows near a foldback', (type) => {
    const controlPoints: Coordinate[] = [
      [0, -1e300],
      [0, 1e300],
      [1e300, 0],
      [0, 1e288]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it('rejects a complete double arrow whose derived head directions collapse near MAX', () => {
    const type = 'double-arrow';
    const origin = 1e300;
    const step = 1e285;
    const controlPoints: Coordinate[] = [
      [origin, origin],
      [origin + 4 * step, origin],
      [origin + 3 * step, origin + 3 * step],
      [origin + step, origin + 3 * step],
      [origin + 2 * step, origin]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it('rejects a completed double arrow whose generated canonical state cannot render', () => {
    const type = 'double-arrow';
    const shape = definition(type);

    expect(() => {
      const state = shape.normalize({
        type,
        controlPoints: [
          [1.7976931348623125e308, 1.7976931348623125e308],
          [1.7976931348623141e308, 1.7976931348623125e308],
          [1.7976931348623137e308, 1.7976931348623137e308]
        ]
      });
      shape.tryComplete(state);
    }).toThrow(InvalidArgumentError);
  });

  it('rejects a double arrow with an unrepresentable branch-tail distance', () => {
    const type = 'double-arrow';
    const controlPoints: Coordinate[] = [
      [1e308, 1e308],
      [1.1e308, 1e308],
      [1.08e308, 1.1e308],
      [1.02e308, 1.1e308],
      [-1e308, -1e308]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each(['assemble-polygon', 'lune-polygon'] as const)('%s rejects two-point previews whose derived control point cannot be represented', (type) => {
    const cases: readonly Coordinate[][] = [
      [
        [1e16, 1e16],
        [1e16 + 2, 1e16]
      ],
      [
        [1e8, 1e8],
        [1e8 + 2 ** -26, 1e8]
      ],
      [
        [-Number.MAX_VALUE, 0],
        [Number.MAX_VALUE, 0]
      ]
    ];

    for (const controlPoints of cases) {
      expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
    }
  });

  it.each(['assemble-polygon', 'closed-curve-polygon', 'curve-polyline'] as const)(
    '%s rejects states whose derived curve controls leave the finite range near MAX',
    (type) => {
      const controlPoints: Coordinate[] = [
        [1.7976931348623093e308, 1.7976931348623093e308],
        [Number.MAX_VALUE, 1.7976931348623093e308],
        [1.7976931348623125e308, 1.7976931348623141e308]
      ];

      expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
    }
  );

  it.each(representativeCases)('%s matches the frozen representative v2 geometry', (type, goldenDigest, points) => {
    const shape = definition(type);
    const state = shape.normalize({ type, controlPoints: points });
    const geometry = shape.toRenderGeometry(state);

    expect(stableGeometryDigest(geometry)).toBe(goldenDigest);
  });

  it('uses complete minimum control points without mutating them and always closes polygon rings', () => {
    const boundaryCases: readonly [PlotShapeType, Coordinate[]][] = [
      [
        'attack-arrow',
        [
          [0, 0],
          [2, 0],
          [3, 3]
        ]
      ],
      [
        'tailed-attack-arrow',
        [
          [0, 0],
          [2, 0],
          [3, 3]
        ]
      ],
      [
        'fine-arrow',
        [
          [0, 0],
          [2, 0]
        ]
      ],
      [
        'tailed-squad-combat-arrow',
        [
          [0, 0],
          [2, 0]
        ]
      ],
      [
        'assault-direction-arrow',
        [
          [0, 0],
          [2, 0]
        ]
      ],
      [
        'double-arrow',
        [
          [0, 0],
          [4, 0],
          [3, 3],
          [1, 3],
          [2, 0]
        ]
      ],
      [
        'rectangle',
        [
          [0, 0],
          [2, 1]
        ]
      ],
      [
        'triangle',
        [
          [0, 0],
          [2, 0],
          [1, 1]
        ]
      ],
      [
        'equilateral-triangle',
        [
          [0, 0],
          [2, 0]
        ]
      ],
      [
        'assemble-polygon',
        [
          [0, 0],
          [1, 2],
          [2, 0]
        ]
      ],
      [
        'closed-curve-polygon',
        [
          [0, 0],
          [2, 0],
          [1, 2]
        ]
      ],
      [
        'sector',
        [
          [0, 0],
          [2, 0],
          [0, 2]
        ]
      ],
      [
        'lune-polygon',
        [
          [0, 0],
          [2, 0],
          [1, 2]
        ]
      ],
      [
        'lune-polyline',
        [
          [0, 0],
          [2, 0],
          [1, 2]
        ]
      ],
      [
        'curve-polyline',
        [
          [0, 0],
          [2, 0]
        ]
      ]
    ];

    for (const [type, points] of boundaryCases) {
      const before = structuredClone(points);
      const shape = definition(type);
      const state = shape.normalize({ type, controlPoints: points });
      const geometry = shape.toRenderGeometry(state);

      expect(points, `${type} mutated caller control points`).toEqual(before);
      if (geometry.type === 'polygon') {
        const ring = geometry.coordinates[0];
        expect(ring[0], `${type} emitted an empty polygon`).toBeDefined();
        expect(ring.at(-1), `${type} left its polygon open`).toEqual(ring[0]);
      }
    }
  });

  it.each([
    [
      'attack-arrow',
      [
        [0, 0],
        [2, 0]
      ]
    ],
    [
      'tailed-attack-arrow',
      [
        [0, 0],
        [2, 0]
      ]
    ],
    [
      'assemble-polygon',
      [
        [0, 0],
        [2, 1]
      ]
    ],
    [
      'closed-curve-polygon',
      [
        [0, 0],
        [2, 0]
      ]
    ],
    [
      'sector',
      [
        [0, 0],
        [2, 0]
      ]
    ],
    [
      'lune-polygon',
      [
        [0, 0],
        [2, 0]
      ]
    ],
    [
      'lune-polyline',
      [
        [0, 0],
        [2, 0]
      ]
    ]
  ] as const)('%s renders preview state but reports it incomplete', (type, controlPoints) => {
    const shape = definition(type);
    const preview = shape.normalize({ type, controlPoints });

    expect(shape.isComplete(preview)).toBe(false);
    expect(shape.toRenderGeometry(preview)).toBeDefined();
    expect(shape.tryComplete(preview)).toEqual({ status: 'incomplete' });
  });

  it('completes four clicked double-arrow points into the canonical five-point state', () => {
    const shape = definition('double-arrow');
    const preview = shape.normalize({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0],
        [3, 3],
        [1, 3]
      ]
    });

    expect(shape.controlPointPolicy).toEqual({ previewMin: 2, completeMin: 5, completeMax: 5, autoFinish: 4 });
    expect(shape.isComplete(preview)).toBe(false);
    expect(shape.tryComplete(preview)).toEqual({
      status: 'complete',
      state: {
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
  });

  it('reports an incomplete two-point double arrow without throwing', () => {
    const shape = definition('double-arrow');
    const preview = shape.normalize({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0]
      ]
    });

    expect(shape.isComplete(preview)).toBe(false);
    expect(shape.toRenderGeometry(preview)).toEqual({
      type: 'polygon',
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [0, 0]
        ]
      ]
    });
    expect(shape.tryComplete(preview)).toEqual({ status: 'incomplete' });
  });

  it('keeps an already canonical five-point double arrow complete', () => {
    const shape = definition('double-arrow');
    const state = shape.normalize({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0],
        [3, 3],
        [1, 3],
        [2, 0]
      ]
    });

    expect(shape.isComplete(state)).toBe(true);
    expect(shape.tryComplete(state)).toEqual({ status: 'complete', state });
  });

  it('completes a three-point double arrow after right-click into a canonical five-point state', () => {
    const shape = definition('double-arrow');
    const preview = shape.normalize({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0],
        [3, 3]
      ]
    });
    const completion = shape.tryComplete(preview);

    expect(completion.status).toBe('complete');
    if (completion.status !== 'complete') throw new Error('Expected complete double arrow');
    expect(completion.state.controlPoints).toHaveLength(5);
    expect(completion.state.controlPoints.slice(0, 3)).toEqual(preview.controlPoints);
    expect(completion.state.controlPoints[4]).toEqual([2, 0]);
    expect(shape.isComplete(completion.state)).toBe(true);
  });

  it('clone and control-point updates remain independent for curved plot shapes', () => {
    const shape = definition('curve-polyline');
    const state = shape.normalize({
      type: 'curve-polyline',
      controlPoints: [
        [0, 0],
        [2, 3],
        [4, 0]
      ]
    });
    const clone = shape.clone(state);
    const updated = shape.editTopology?.move(state, 1, [2, 5]);

    expect(clone.controlPoints[0]).not.toBe(state.controlPoints[0]);
    expect(updated?.controlPoints).toEqual([
      [0, 0],
      [2, 5],
      [4, 0]
    ]);
    expect(state.controlPoints).toEqual([
      [0, 0],
      [2, 3],
      [4, 0]
    ]);
  });

  it('validates non-degenerate plot shapes independently of scale and translation', () => {
    const cases: readonly [PlotShapeType, Coordinate[]][] = [
      [
        'triangle',
        [
          [0, 0],
          [4, 0],
          [2, 3]
        ]
      ],
      [
        'assemble-polygon',
        [
          [0, 0],
          [2, 3],
          [4, 0]
        ]
      ],
      [
        'closed-curve-polygon',
        [
          [0, 0],
          [2, 3],
          [4, 0]
        ]
      ],
      [
        'lune-polygon',
        [
          [0, 0],
          [4, 0],
          [2, 3]
        ]
      ],
      [
        'lune-polyline',
        [
          [0, 0],
          [4, 0],
          [2, 3]
        ]
      ],
      [
        'double-arrow',
        [
          [0, 0],
          [4, 0],
          [3, 3],
          [1, 3],
          [2, 0]
        ]
      ],
      [
        'rectangle',
        [
          [0, 0],
          [4, 3]
        ]
      ]
    ];

    for (const scale of [1e-8, 1, 1e8]) {
      for (const translation of [0, scale * 1e8]) {
        for (const [type, source] of cases) {
          const controlPoints = source.map(([x, y]) => [x * scale + translation, y * scale - translation] as Coordinate);
          const shape = definition(type);
          const state = shape.normalize({ type, controlPoints });
          const geometry = shape.toRenderGeometry(state);
          const coordinates =
            geometry.type === 'polygon'
              ? geometry.coordinates.flat()
              : geometry.type === 'polyline'
                ? geometry.coordinates
                : geometry.type === 'point'
                  ? [geometry.coordinates]
                  : [geometry.center];

          expect(coordinates.length, `${type} emitted no coordinates at scale ${scale}`).toBeGreaterThan(0);
          expect(
            coordinates.every((coordinate) => coordinate.every(Number.isFinite)),
            `${type} emitted non-finite coordinates at scale ${scale} and translation ${translation}`
          ).toBe(true);
        }
      }
    }
  });

  it.each(['lune-polygon', 'lune-polyline', 'sector'] as const)(
    '%s rejects axis-aligned near-collinear control points at every scale and translation',
    (type) => {
      for (const scale of [1e-8, 1, 1e8]) {
        for (const translation of [0, scale / 4]) {
          const controlPoints: Coordinate[] = [
            [translation, -translation],
            [translation + scale, -translation],
            [translation + scale * 2, -translation + scale * Number.EPSILON]
          ];

          expect(() => definition(type).normalize({ type, controlPoints }), `${type} accepted a numerically collinear state at scale ${scale}`).toThrow(
            InvalidArgumentError
          );
        }
      }
    }
  );

  it.each(['lune-polygon', 'lune-polyline', 'sector'] as const)('%s rejects translated non-axis collinear points despite decimal roundoff', (type) => {
    for (const offset of [10, 1000, 1e6]) {
      const controlPoints: Coordinate[] = [
        [0, offset],
        [0.1, offset + 0.2],
        [0.2, offset + 0.4]
      ];

      expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
    }
  });

  it.each(['lune-polygon', 'lune-polyline', 'sector'] as const)('%s accepts a representable right angle at a large translation', (type) => {
    const offset = 5e14;
    const controlPoints: Coordinate[] = [
      [offset, offset],
      [offset + 1, offset],
      [offset, offset + 1]
    ];
    const shape = definition(type);

    expect(() => {
      const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
      const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : geometry.type === 'polyline' ? geometry.coordinates : [];
      expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
    }).not.toThrow();
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s accepts a representable turn at a large translation', (type) => {
    const offset = 5e14;
    const controlPoints: Coordinate[] = [
      [offset, offset],
      [offset + 100, offset],
      [offset + 49, offset + 2],
      [offset + 50, offset + 2]
    ];
    const shape = definition(type);

    expect(() => shape.toRenderGeometry(shape.normalize({ type, controlPoints }))).not.toThrow();
  });

  it('accepts a representable double arrow at a large translation', () => {
    const type = 'double-arrow';
    const offset = 5e14;
    const controlPoints: Coordinate[] = [
      [offset, offset],
      [offset + 2, offset],
      [offset + 1.5, offset + 1],
      [offset + 0.5, offset + 1],
      [offset + 1, offset]
    ];
    const shape = definition(type);

    expect(() => shape.toRenderGeometry(shape.normalize({ type, controlPoints }))).not.toThrow();
  });

  it.each(['fine-arrow', 'tailed-squad-combat-arrow', 'assault-direction-arrow'] as const)(
    '%s rejects complete states whose required width offsets collapse on the coordinate grid',
    (type) => {
      const cases: readonly Coordinate[][] = [
        [
          [1e16, 1e16],
          [1e16 + 2, 1e16]
        ],
        [
          [1e8, 1e8],
          [1e8 + 2 ** -26, 1e8]
        ],
        [
          [-Number.MAX_VALUE, 0],
          [Number.MAX_VALUE, 0]
        ]
      ];

      for (const controlPoints of cases) {
        expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
      }
    }
  );

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s rejects a complete state whose derived bone starts with a zero-length segment', (type) => {
    const controlPoints: Coordinate[] = [
      [0, 0],
      [2, 0],
      [1, 0],
      [2, 1]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s rejects repeated and exact-foldback points in its derived bone', (type) => {
    const states: Coordinate[][] = [
      [
        [0, 0],
        [2, 0],
        [-1, -1],
        [1, 0]
      ],
      [
        [0, 0],
        [2, 0],
        [0, -1],
        [2, 1]
      ]
    ];

    for (const controlPoints of states) expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s rejects a translated decimal foldback in its derived bone', (type) => {
    const controlPoints: Coordinate[] = [
      [0, 1000.2],
      [0.2, 1000.2],
      [0.2, 1000.4],
      [0, 1000]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it('rejects a complete double arrow whose derived right-hand bone has zero length', () => {
    const type = 'double-arrow';
    const controlPoints: Coordinate[] = [
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 1],
      [0, 2]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each([
    [0, 0],
    [2, 0]
  ] as const)('rejects a complete double arrow whose connection repeats branch tail (%s, %s)', (x, y) => {
    const type = 'double-arrow';
    const controlPoints: Coordinate[] = [
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 1],
      [x, y]
    ];

    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it('renders every complete arrow state accepted from bounded-grid and seeded fuzz cases with finite coordinates', () => {
    const failures: { readonly type: PlotShapeType; readonly controlPoints: readonly Coordinate[] }[] = [];
    const checkAcceptedRender = (type: PlotShapeType, controlPoints: Coordinate[]): void => {
      const shape = definition(type);
      try {
        const state = shape.normalize({ type, controlPoints });
        try {
          shape.toRenderGeometry(state);
        } catch {
          failures.push({ type, controlPoints });
        }
      } catch {
        // Rejected states do not participate in the normalize-implies-render property.
      }
    };
    const grid: Coordinate[] = [];
    for (const x of [-1, 0, 1, 2]) for (const y of [-1, 0, 1]) grid.push([x, y]);
    for (const type of ['attack-arrow', 'tailed-attack-arrow'] as const) {
      for (const third of grid) {
        checkAcceptedRender(type, [[0, 0], [2, 0], third]);
        for (const fourth of grid) checkAcceptedRender(type, [[0, 0], [2, 0], third, fourth]);
      }
    }

    for (const third of grid) {
      for (const fourth of grid) {
        for (const connection of grid) checkAcceptedRender('double-arrow', [[0, 0], [2, 0], third, fourth, connection]);
      }
    }

    let seed = 0x51f15e;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const randomCoordinate = (): Coordinate => [(next() % 7) - 3, (next() % 7) - 3];
    for (const type of ['attack-arrow', 'tailed-attack-arrow', 'double-arrow'] as const) {
      for (let sample = 0; sample < 2000; sample += 1) {
        const count = type === 'double-arrow' ? 5 : 3 + (next() % 4);
        const controlPoints = Array.from({ length: count }, randomCoordinate);
        checkAcceptedRender(type, controlPoints);
      }
    }

    expect(failures, `${failures.length} accepted complete arrow states failed finite rendering`).toEqual([]);
  });

  it.each([1e-200, 1e200])('renders complete arrows when squared distance would underflow or overflow at scale %s', (scale) => {
    const cases: readonly [PlotShapeType, Coordinate[]][] = [
      [
        'attack-arrow',
        [
          [0, 0],
          [1, 0],
          [2, 1]
        ]
      ],
      [
        'tailed-attack-arrow',
        [
          [0, 0],
          [1, 0],
          [2, 1]
        ]
      ],
      [
        'double-arrow',
        [
          [0, 0],
          [1, 0],
          [0.8, 0.8],
          [0.2, 0.8],
          [0.5, 0]
        ]
      ]
    ];

    for (const [type, source] of cases) {
      const controlPoints = source.map(([x, y]) => [x * scale, y * scale] as Coordinate);
      const shape = definition(type);
      const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
      const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : geometry.type === 'polyline' ? geometry.coordinates : [];

      expect(coordinates.length, `${type} emitted no coordinates at scale ${scale}`).toBeGreaterThan(0);
      expect(
        coordinates.every((coordinate) => coordinate.every(Number.isFinite)),
        `${type} emitted non-finite coordinates at scale ${scale}`
      ).toBe(true);
    }
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s renders finite coordinates when a squared distance is subnormal and inaccurate', (type) => {
    const controlPoints: Coordinate[] = [
      [-1e-160, 0],
      [1e-160, 0],
      [1e-162, 1e-160]
    ];
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : [];

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
  });

  it('keeps double-arrow topology validation stable when orientation products underflow', () => {
    const source: Coordinate[] = [
      [8, 7],
      [-2, -8],
      [2, -9],
      [-2, 8],
      [6, -10]
    ];

    for (const scale of [1, 1e-170]) {
      const controlPoints = source.map(([x, y]) => [x * scale, y * scale] as Coordinate);
      expect(isClockWise(controlPoints[0], controlPoints[1], controlPoints[2])).toBe(true);
      expect(() => definition('double-arrow').normalize({ type: 'double-arrow', controlPoints })).toThrow(InvalidArgumentError);
    }
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)('%s rejects a derived zero-length bone across subnormal scales', (type) => {
    const source: Coordinate[] = [
      [8, 7],
      [-2, -8],
      [3, -0.5],
      [4, 2]
    ];

    for (const scale of [1, 1e-170, 1e-200]) {
      const controlPoints = source.map(([x, y]) => [x * scale, y * scale] as Coordinate);
      expect(() => definition(type).normalize({ type, controlPoints }), `${type} accepted a zero-length derived bone at scale ${scale}`).toThrow(
        InvalidArgumentError
      );
    }
  });

  it.each([
    [
      'tailed-attack-arrow',
      [
        [1e308, 0],
        [1.2e308, 0],
        [1.1e308, 1e307]
      ]
    ],
    [
      'double-arrow',
      [
        [1e308, 1e308],
        [1.2e308, 1e308],
        [1.15e308, 1.1e308],
        [1.05e308, 1.1e308],
        [1.1e308, 1e308]
      ]
    ]
  ] as const)('%s renders finite coordinates when a representable midpoint has an overflowing coordinate sum', (type, controlPoints) => {
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : [];

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
  });

  it('keeps tailed-attack-arrow tail orientation stable when orientation products overflow', () => {
    const source: Coordinate[] = [
      [0, 0],
      [2, 1],
      [1, 2],
      [3, 4]
    ];

    for (const scale of [1, 1e200]) {
      const type = 'tailed-attack-arrow';
      const controlPoints = source.map(([x, y]) => [x * scale, y * scale] as Coordinate);
      const shape = definition(type);
      const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));

      expect(geometry.type).toBe('polygon');
      if (geometry.type === 'polygon') expect(geometry.coordinates[0][0]).toEqual(controlPoints[1]);
    }
  });

  it.each([1e-200, 1e200])('renders an equilateral triangle when squared edge length would underflow or overflow at scale %s', (scale) => {
    const type = 'equilateral-triangle';
    const controlPoints: Coordinate[] = [
      [0, 0],
      [4 * scale, 3 * scale]
    ];
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : [];

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
  });

  it.each([1_000, 1_000_000])('renders an equilateral triangle without false rejection at translation %s', (translation) => {
    const type = 'equilateral-triangle';
    const controlPoints: Coordinate[] = [
      [translation, translation],
      [translation + 4, translation + 3]
    ];
    const shape = definition(type);

    expect(() => shape.toRenderGeometry(shape.normalize({ type, controlPoints }))).not.toThrow();
  });

  it('rejects an equilateral triangle whose edge or generated height exceeds the finite coordinate range', () => {
    const cases: readonly Coordinate[][] = [
      [
        [-Number.MAX_VALUE, 0],
        [Number.MAX_VALUE, 0]
      ],
      [
        [Number.MAX_VALUE - 1e308, Number.MAX_VALUE],
        [Number.MAX_VALUE, Number.MAX_VALUE]
      ],
      [
        [1e16, 1e16],
        [1e16 + 2, 1e16]
      ]
    ];

    for (const controlPoints of cases) {
      expect(() => definition('equilateral-triangle').normalize({ type: 'equilateral-triangle', controlPoints })).toThrow(InvalidArgumentError);
    }
  });

  it('renders a curve polyline with finite coordinates near Number.MAX_VALUE', () => {
    const type = 'curve-polyline';
    const controlPoints: Coordinate[] = [
      [1.7976931348623155e308, 1.7976931348623155e308],
      [1.7976931348623153e308, 1.7976931348623155e308],
      [1.7976931348623155e308, 1.7976931348623153e308]
    ];
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polyline' ? geometry.coordinates : [];

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
  });

  it.each([Number.MIN_VALUE, 1e-320])('renders a curve polyline when control-point vector squares underflow at scale %s', (scale) => {
    const type = 'curve-polyline';
    const controlPoints: Coordinate[] = [
      [0, 0],
      [4 * scale, 3 * scale],
      [8 * scale, 0]
    ];
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polyline' ? geometry.coordinates : [];

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
  });

  it.each(['lune-polygon', 'lune-polyline'] as const)('%s renders finite coordinates when same-sign midpoint sums overflow', (type) => {
    const controlPoints: Coordinate[] = [
      [1e308, 1e308],
      [1.2e308, 1e308],
      [1.1e308, 1.1e308]
    ];
    const shape = definition(type);
    const geometry = shape.toRenderGeometry(shape.normalize({ type, controlPoints }));
    const coordinates = geometry.type === 'polygon' ? geometry.coordinates.flat() : geometry.type === 'polyline' ? geometry.coordinates : [];

    expect(coordinates.length).toBeGreaterThan(0);
    expect(coordinates.every((coordinate) => coordinate.every(Number.isFinite))).toBe(true);
  });

  it.each(['attack-arrow', 'tailed-attack-arrow'] as const)(
    '%s rejects a derived path whose representable segment lengths have an unrepresentable sum',
    (type) => {
      const controlPoints: Coordinate[] = [
        [0, 0],
        [1e308, 0],
        [1e308, 1e308],
        [0, 1e308]
      ];

      expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
    }
  );

  it('rejects a double arrow whose derived offsets underflow at the minimum finite scale', () => {
    const scale = Number.MIN_VALUE;
    const controlPoints: Coordinate[] = [
      [0, 0],
      [2 * scale, 0],
      [1.6 * scale, 1.6 * scale],
      [0.4 * scale, 1.6 * scale],
      [scale, 0]
    ];

    expect(() => definition('double-arrow').normalize({ type: 'double-arrow', controlPoints })).toThrow(InvalidArgumentError);
  });

  it.each([
    [
      '3D plot coordinate',
      'fine-arrow',
      [
        [0, 0, 1],
        [2, 1, 1]
      ]
    ],
    [
      'zero attack-arrow bone',
      'attack-arrow',
      [
        [0, 0],
        [2, 0],
        [1, 0]
      ]
    ],
    [
      'zero tailed-attack-arrow bone',
      'tailed-attack-arrow',
      [
        [0, 0],
        [2, 0],
        [1, 0]
      ]
    ],
    [
      'invalid double-arrow paths',
      'double-arrow',
      [
        [0, 0],
        [4, 0],
        [2, 0],
        [3, 0],
        [2, 0]
      ]
    ],
    [
      'zero rectangle width',
      'rectangle',
      [
        [0, 0],
        [0, 2]
      ]
    ],
    [
      'zero-area triangle',
      'triangle',
      [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    ],
    [
      'coincident equilateral points',
      'equilateral-triangle',
      [
        [0, 0],
        [0, 0]
      ]
    ],
    [
      'zero-area assemble polygon',
      'assemble-polygon',
      [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    ],
    [
      'zero-area closed curve',
      'closed-curve-polygon',
      [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    ],
    [
      'zero-angle sector',
      'sector',
      [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    ],
    [
      'collinear lune polygon',
      'lune-polygon',
      [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    ],
    [
      'collinear lune polyline',
      'lune-polyline',
      [
        [0, 0],
        [1, 0],
        [2, 0]
      ]
    ],
    [
      'repeated curve segment',
      'curve-polyline',
      [
        [0, 0],
        [1, 1],
        [1, 1]
      ]
    ]
  ] as const)('rejects degenerate %s state during normalization', (_label, type, controlPoints) => {
    expect(() => definition(type).normalize({ type, controlPoints })).toThrow(InvalidArgumentError);
  });

  it('rejects invalid plot update coordinates and indexes without changing the source', () => {
    const shape = definition('fine-arrow');
    const state = shape.normalize({
      type: 'fine-arrow',
      controlPoints: [
        [0, 0],
        [2, 1]
      ]
    });

    expect(() => shape.editTopology?.move(state, 2, [3, 2])).toThrow(InvalidArgumentError);
    expect(() => shape.editTopology?.move(state, 1, [Infinity, 2])).toThrow(InvalidArgumentError);
    expect(state.controlPoints).toEqual([
      [0, 0],
      [2, 1]
    ]);
  });
});
