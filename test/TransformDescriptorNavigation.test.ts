import { describe, expect, expectTypeOf, it } from 'vitest';
import type Earth from '../src/Earth.js';
import type { OverlayService, TransformService } from '../src/index.js';

describe('Transform 与 Descriptor 公共服务入口', () => {
  it('通过 Earth 服务树提供稳定且相互独立的类型入口', () => {
    expectTypeOf<Earth['transform']>().toEqualTypeOf<TransformService>();
    expectTypeOf<Earth['overlays']>().toEqualTypeOf<OverlayService>();

    const selectServices = (earth: Earth) => [earth.transform, earth.overlays] as const;
    expect(selectServices).toBeTypeOf('function');
  });
});
