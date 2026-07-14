import { Element } from '../../src/facade/Element.js';
import { Layer } from '../../src/facade/Layer.js';
import type { ElementCreateInput, ElementHit } from '../../src/facade/types.js';

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;

const elementConstructorIsExactlyEmpty: Equal<ConstructorParameters<typeof Element>, []> = true;
const layerConstructorIsExactlyEmpty: Equal<ConstructorParameters<typeof Layer>, []> = true;

const validPoint: ElementCreateInput<{ label: string }> = {
  geometry: { type: 'point', controlPoints: [[1, 2]] },
  data: { label: 'point' },
  style: { symbol: { type: 'circle', radius: 4 } }
};
const validCircle: ElementCreateInput = { geometry: { type: 'circle', center: [0, 0], radius: 2 }, visible: false };

// @ts-expect-error type is derived from geometry and cannot be repeated
const repeatedType: ElementCreateInput = { type: 'point', geometry: { type: 'point', controlPoints: [[0, 0]] } };
// @ts-expect-error geometry is required
const missingGeometry: ElementCreateInput = { id: 'missing' };
// @ts-expect-error unknown top-level keys are rejected by contextual typing
const unknownKey: ElementCreateInput = { geometry: { type: 'point', controlPoints: [[0, 0]] }, extra: true };
// @ts-expect-error exact optional properties reject explicit undefined
const undefinedVisible: ElementCreateInput = { geometry: { type: 'point', controlPoints: [[0, 0]] }, visible: undefined };
// @ts-expect-error circle uses center/radius instead of controlPoints
const invalidCircle: ElementCreateInput = { geometry: { type: 'circle', controlPoints: [[0, 0]] } };

declare const element: Element<{ label: string }>;
declare const layer: ElementHit<{ label: string }>['layer'];
const hit: ElementHit<{ label: string }> = { element, layer };

void [
  elementConstructorIsExactlyEmpty,
  layerConstructorIsExactlyEmpty,
  validPoint,
  validCircle,
  repeatedType,
  missingGeometry,
  unknownKey,
  undefinedVisible,
  invalidCircle,
  hit
];
