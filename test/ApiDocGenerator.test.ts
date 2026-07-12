import { describe, expect, it } from 'vitest';
import { extractApiModel } from '../scripts/docs/api-docs.mjs';

describe('extractApiModel', () => {
  it('extracts class method signatures from TypeDoc reflections', () => {
    const source = {
      children: [
        {
          kindString: 'Class',
          name: 'PointLayer',
          children: [
            {
              kindString: 'Method',
              name: 'add',
              signatures: [
                {
                  parameters: [{ name: 'param', type: { type: 'reference', name: 'IPointParam' } }],
                  type: { type: 'reference', name: 'Feature', typeArguments: [{ type: 'reference', name: 'Point' }] }
                }
              ]
            },
            {
              kindString: 'Method',
              name: 'remove',
              signatures: [{ parameters: [{ name: 'id', flags: { isOptional: true }, type: { type: 'intrinsic', name: 'string' } }], type: { type: 'intrinsic', name: 'void' } }]
            }
          ]
        },
        {
          kindString: 'Interface',
          name: 'IPointParam',
          children: [{ kindString: 'Property', name: 'id', type: { type: 'intrinsic', name: 'string' } }]
        }
      ]
    };

    expect(extractApiModel(source)).toEqual({
      classes: {
        PointLayer: {
          methods: {
            add: { params: 'param: IPointParam', returns: 'Feature<Point>' },
            remove: { params: 'id?: string', returns: 'void' }
          }
        }
      },
      interfaces: { IPointParam: { properties: { id: { type: 'string' } } } }
    });
  });
});
