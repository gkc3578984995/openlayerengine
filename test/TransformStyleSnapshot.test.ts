import { describe, expect, it } from 'vitest';
import { Stroke, Style } from 'ol/style';
import { cloneStyleSnapshot } from '../src/components/transform/styleSnapshot';

describe('Transform style snapshots', () => {
  it('clones every style in a layered array', () => {
    const original = [new Style({ stroke: new Stroke({ color: '#f00', width: 8 }) }), new Style({ stroke: new Stroke({ color: '#000', width: 3 }) })];
    const copy = cloneStyleSnapshot(original) as Style[];
    expect(copy).not.toBe(original);
    expect(copy[0]).not.toBe(original[0]);
    expect(copy[0].getStroke()?.getColor()).toBe('#f00');
  });
});
