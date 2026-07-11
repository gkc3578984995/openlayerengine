import { describe, expect, it } from 'vitest';
import { resolvePolylineWidth } from '../src/base/PolylineLayer';

describe('Polyline width precedence', () => {
  it('prefers stroke.width and falls back to the deprecated width parameter', () => {
    expect(resolvePolylineWidth({ width: 4 }, 9)).toBe(4);
    expect(resolvePolylineWidth(undefined, 9)).toBe(9);
    expect(resolvePolylineWidth(undefined, undefined)).toBe(2);
  });
});
