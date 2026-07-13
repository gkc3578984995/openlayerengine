import { describe, expect, it } from 'vitest';
import { plotShapeDefinitions } from '../src/builtins/shapes/plot/index.js';
import type { Coordinate } from '../src/core/common/types.js';
import { InvalidArgumentError } from '../src/core/errors.js';
import type { ShapeDefinition, ShapeState, ShapeType } from '../src/core/shape/types.js';
import AssaultDirectionArrow from '../src/extends/plot/geom/AssaultDirectionArrow.js';
import AttackArrow from '../src/extends/plot/geom/AttackArrow.js';
import DoubleArrow from '../src/extends/plot/geom/DoubleArrow.js';
import FineArrow from '../src/extends/plot/geom/FineArrow.js';
import TailedAttackArrow from '../src/extends/plot/geom/TailedAttackArrow.js';
import TailedSquadCombatArrow from '../src/extends/plot/geom/TailedSquadCombatArrow.js';
import AssemblePolygon from '../src/extends/plot/polygon/AssemblePolygon.js';
import ClosedCurvePolygon from '../src/extends/plot/polygon/ClosedCurvePolygon.js';
import EquilateralTrianglePolygon from '../src/extends/plot/polygon/EquilateralTrianglePolygon.js';
import LunePolygon from '../src/extends/plot/polygon/LunePolygon.js';
import RectAnglePolygon from '../src/extends/plot/polygon/RectAnglePolygon.js';
import SectorPolygon from '../src/extends/plot/polygon/SectorPolygon.js';
import TrianglePolygon from '../src/extends/plot/polygon/TrianglePolygon.js';
import CurvePolyline from '../src/extends/plot/polyline/CurvePolyline.js';
import LunePolyline from '../src/extends/plot/polyline/LunePolyline.js';

type PlotShapeType = Exclude<ShapeType, 'point' | 'polyline' | 'polygon' | 'circle' | 'ellipse'>;
type LegacyGeometry = { getCoordinates(): unknown };
type LegacyConstructor = new (coordinates: unknown, points: Coordinate[], params: Record<string, never>) => LegacyGeometry;

const representativeCases: readonly [type: PlotShapeType, legacy: LegacyConstructor, points: Coordinate[]][] = [
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

function closeLegacyPolygon(coordinates: unknown): unknown {
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return coordinates;
  const rings = structuredClone(coordinates) as Coordinate[][];
  const ring = rings[0];
  if (ring.length > 0 && (ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1])) ring.push([...ring[0]] as Coordinate);
  return rings;
}

describe('plot shape parity', () => {
  it.each(representativeCases)('%s matches the existing representative geometry algorithm', (type, Legacy, points) => {
    const legacyCoordinates = new Legacy([], structuredClone(points), {}).getCoordinates();
    const shape = definition(type);
    const state = shape.normalize({ type, controlPoints: points });
    const geometry = shape.toRenderGeometry(state);

    expect(geometry.type === 'polygon' ? geometry.coordinates : geometry.type === 'polyline' ? geometry.coordinates : undefined).toEqual(
      geometry.type === 'polygon' ? closeLegacyPolygon(legacyCoordinates) : legacyCoordinates
    );
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
  ] as const)('%s renders preview state but refuses to finalize it', (type, controlPoints) => {
    const shape = definition(type);
    const preview = shape.normalize({ type, controlPoints });

    expect(shape.isComplete(preview)).toBe(false);
    expect(shape.toRenderGeometry(preview)).toBeDefined();
    expect(() => shape.finalize?.(preview)).toThrow();
  });

  it('finalizes four clicked double-arrow points into the canonical five-point state', () => {
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
    expect(shape.finalize?.(preview)).toEqual({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0],
        [3, 3],
        [1, 3],
        [2, 0]
      ]
    });
  });

  it('finalizes a three-point double arrow after right-click into a canonical five-point state', () => {
    const shape = definition('double-arrow');
    const preview = shape.normalize({
      type: 'double-arrow',
      controlPoints: [
        [0, 0],
        [4, 0],
        [3, 3]
      ]
    });
    const finalized = shape.finalize?.(preview);

    expect(finalized?.controlPoints).toHaveLength(5);
    expect(finalized?.controlPoints.slice(0, 3)).toEqual(preview.controlPoints);
    expect(finalized?.controlPoints[4]).toEqual([2, 0]);
    expect(finalized === undefined ? false : shape.isComplete(finalized)).toBe(true);
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
    const updated = shape.updateControlPoint?.(state, 1, [2, 5]);

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

    expect(() => shape.updateControlPoint?.(state, 2, [3, 2])).toThrow(InvalidArgumentError);
    expect(() => shape.updateControlPoint?.(state, 1, [Infinity, 2])).toThrow(InvalidArgumentError);
    expect(state.controlPoints).toEqual([
      [0, 0],
      [2, 1]
    ]);
  });
});
