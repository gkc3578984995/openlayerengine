import Point from 'ol/geom/Point.js';
import Icon from 'ol/style/Icon.js';
import { describe, expect, it } from 'vitest';
import { compileStyles } from './helpers/styleCompilerHarness.js';

const iconSource = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="24"/%3E';

describe('Icon anchor v2 回归', () => {
  it('保留显式像素锚点而不读取归一化后的内部值', () => {
    const image = compileStyles(
      {
        symbol: {
          type: 'icon',
          src: iconSource,
          size: [32, 24],
          anchor: [8, 9],
          anchorOrigin: 'top-left',
          anchorXUnits: 'pixels',
          anchorYUnits: 'pixels'
        }
      },
      new Point([0, 0])
    )[0]?.getImage();

    expect(image).toBeInstanceOf(Icon);
    expect((image as Icon).getAnchor()).toEqual([8, 9]);
  });
});
