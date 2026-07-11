import { describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { TransformHistory } from '../src/components/transform/history';

const snapshot = (id: string, x: number) => ({ id, feature: new Feature(new Point([x, 0])) });

describe('TransformHistory', () => {
  it('moves snapshots between undo and redo stacks', () => {
    const history = new TransformHistory(() => 10);
    history.record(snapshot('a', 0));
    history.record(snapshot('a', 1));
    expect(history.undo()?.feature.getGeometry()?.getCoordinates()).toEqual([0, 0]);
    expect(history.canRedo).toBe(true);
    expect(history.takeRedo()?.feature.getGeometry()?.getCoordinates()).toEqual([1, 0]);
  });

  it('enforces the configured history limit', () => {
    const history = new TransformHistory(() => 2);
    history.record(snapshot('a', 0));
    history.record(snapshot('a', 1));
    history.record(snapshot('a', 2));
    expect(history.undoCount).toBe(1);
    expect(history.undo()?.feature.getGeometry()?.getCoordinates()).toEqual([1, 0]);
  });
});
