import { describe, expect, it } from 'vitest';
import { extractApiModel, renderType } from '../scripts/docs/api-docs.mjs';

const summary = (text: string) => ({ summary: [{ kind: 'text', text }] });

describe('extractApiModel', () => {
  it('keeps the compatible class and interface API model', () => {
    const source = {
      children: [
        {
          kindString: 'Class',
          name: 'PointLayer',
          comment: summary('点图层。'),
          sources: [{ fileName: 'src/PointLayer.ts' }],
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
              signatures: [
                {
                  parameters: [{ name: 'id', flags: { isOptional: true }, type: { type: 'intrinsic', name: 'string' } }],
                  type: { type: 'intrinsic', name: 'void' }
                }
              ]
            },
            {
              kindString: 'Method',
              name: 'inheritedMethod',
              flags: { isInherited: true, isExternal: true },
              signatures: [{ type: { type: 'intrinsic', name: 'void' } }]
            }
          ]
        },
        {
          kindString: 'Interface',
          name: 'IPointParam',
          comment: summary('点参数。'),
          sources: [{ fileName: 'src/types.ts' }],
          children: [
            { kindString: 'Property', name: 'id', type: { type: 'intrinsic', name: 'string' } },
            {
              kindString: 'Property',
              name: 'inheritedProperty',
              flags: { isInherited: true, isExternal: true },
              type: { type: 'intrinsic', name: 'string' }
            }
          ]
        }
      ]
    };

    const model = extractApiModel(source);
    expect(model.classes).toEqual({
      PointLayer: {
        methods: {
          add: { params: 'param: IPointParam', returns: 'Feature<Point>' },
          remove: { params: 'id?: string', returns: 'void' }
        }
      }
    });
    expect(model.interfaces).toEqual({ IPointParam: { properties: { id: { type: 'string' } } } });
  });

  it('builds a root-export-only catalog with summaries, overloads and stable anchors', () => {
    const source = {
      children: [
        {
          kind: 128,
          name: 'ExampleService',
          comment: summary('示例服务。'),
          sources: [{ fileName: 'src/ExampleService.ts' }],
          typeParameters: [{ name: 'TValue', comment: summary('业务数据。'), default: { type: 'intrinsic', name: 'unknown' } }],
          children: [
            {
              kind: 512,
              name: 'constructor',
              signatures: [
                {
                  comment: summary('创建服务。'),
                  parameters: [{ name: 'options', comment: summary('创建选项。'), defaultValue: '{}', type: { type: 'reference', name: 'ExampleOptions' } }],
                  type: { type: 'reference', name: 'ExampleService' }
                }
              ]
            },
            {
              kind: 262144,
              name: 'state',
              getSignature: { comment: summary('当前状态。'), type: { type: 'intrinsic', name: 'string' } }
            },
            {
              kind: 2048,
              name: 'query',
              signatures: [
                {
                  comment: summary('查询全部。'),
                  parameters: [{ name: 'options', flags: { isOptional: true }, type: { type: 'reference', name: 'ExampleOptions' } }],
                  type: { type: 'array', elementType: { type: 'reference', name: 'TValue' } }
                },
                {
                  comment: summary('按 ID 查询。'),
                  parameters: [{ name: 'id', type: { type: 'intrinsic', name: 'string' } }],
                  type: { type: 'reference', name: 'TValue' }
                }
              ]
            },
            {
              kind: 256,
              name: 'NestedInternalType',
              children: []
            }
          ]
        },
        {
          kind: 256,
          name: 'ExampleOptions',
          comment: summary('示例选项。'),
          sources: [{ fileName: 'src/types.ts' }],
          children: [
            {
              kind: 1024,
              name: 'target',
              flags: { isOptional: true, isReadonly: true },
              comment: summary('目标名称。'),
              type: { type: 'intrinsic', name: 'string' }
            }
          ]
        },
        {
          kind: 2097152,
          name: 'ExampleKind',
          comment: summary('示例类型。'),
          sources: [{ fileName: 'src/types.ts' }],
          type: {
            type: 'union',
            types: [
              { type: 'literal', value: 'first' },
              { type: 'literal', value: 'second' }
            ]
          }
        }
      ]
    };

    const model = extractApiModel(source);
    expect(model.apiCatalog.map((entry) => entry.name)).toEqual(['ExampleKind', 'ExampleOptions', 'ExampleService']);
    expect(model.apiCatalog.some((entry) => entry.name === 'NestedInternalType')).toBe(false);
    expect(model.publicTypeAnchors).toEqual({
      ExampleKind: 'api-type-example-kind',
      ExampleOptions: 'api-type-example-options',
      ExampleService: 'api-type-example-service'
    });

    const service = model.apiCatalog.find((entry) => entry.name === 'ExampleService');
    expect(service).toMatchObject({
      kind: 'class',
      anchor: 'api-type-example-service',
      summary: '示例服务。',
      source: 'src/ExampleService.ts',
      typeParameters: [{ name: 'TValue', summary: '业务数据。', constraint: '', default: 'unknown' }],
      accessors: [{ name: 'state', anchor: 'api-type-example-service-property-state', type: 'string', readonly: true, summary: '当前状态。' }]
    });
    expect(service?.constructors[0]).toMatchObject({
      anchor: 'api-type-example-service-constructor',
      signatures: [
        {
          parameters: [
            {
              name: 'options',
              anchor: 'api-type-example-service-constructor-parameter-options',
              type: 'ExampleOptions',
              defaultValue: '{}',
              summary: '创建选项。'
            }
          ]
        }
      ]
    });
    expect(service?.methods[0].signatures).toHaveLength(2);
    expect(service?.methods[0].signatures[0].parameters[0].anchor).toBe('api-type-example-service-method-query-parameter-options');
    expect(service?.methods[0].signatures[1].parameters[0].anchor).toBe('api-type-example-service-method-query-overload-2-parameter-id');
    expect(model.apiCatalog.find((entry) => entry.name === 'ExampleOptions')?.properties[0]).toEqual({
      name: 'target',
      anchor: 'api-type-example-options-property-target',
      type: 'string',
      optional: true,
      readonly: true,
      defaultValue: '',
      summary: '目标名称。'
    });
    expect(model.apiCatalog.find((entry) => entry.name === 'ExampleKind')?.type).toBe('"first" | "second"');
  });

  it('expands object branches in public aliases and includes runtime exports', () => {
    const source = {
      children: [
        {
          id: 1,
          kind: 256,
          name: 'PointOptions',
          comment: summary('点配置。'),
          sources: [{ fileName: 'src/types.ts' }],
          children: [
            { kind: 1024, name: 'type', flags: { isReadonly: true }, type: { type: 'literal', value: 'point' } },
            { kind: 1024, name: 'size', flags: { isOptional: true }, type: { type: 'intrinsic', name: 'number' } }
          ]
        },
        {
          kind: 2097152,
          name: 'ExampleInput',
          comment: summary('示例输入。'),
          sources: [{ fileName: 'src/types.ts' }],
          type: {
            type: 'union',
            types: [
              { type: 'reference', target: 1, name: 'PointOptions' },
              {
                type: 'reflection',
                declaration: {
                  name: '__type',
                  children: [
                    { kind: 1024, name: 'type', type: { type: 'literal', value: 'circle' } },
                    { kind: 1024, name: 'radius', type: { type: 'intrinsic', name: 'number' } }
                  ]
                }
              }
            ]
          }
        },
        {
          kind: 64,
          name: 'createExample',
          comment: summary('创建示例。'),
          sources: [{ fileName: 'src/index.ts' }],
          signatures: [
            {
              parameters: [{ name: 'input', type: { type: 'reference', name: 'ExampleInput' } }],
              type: { type: 'intrinsic', name: 'void' }
            }
          ]
        },
        {
          kind: 32,
          name: 'exampleTypes',
          comment: summary('示例类型列表。'),
          sources: [{ fileName: 'src/index.ts' }],
          type: {
            type: 'tuple',
            elements: [
              { type: 'literal', value: 'point' },
              { type: 'literal', value: 'circle' }
            ]
          }
        }
      ]
    };

    const model = extractApiModel(source);
    const input = model.apiCatalog.find((entry) => entry.name === 'ExampleInput');
    expect(input?.variants).toHaveLength(2);
    expect(input?.variants[0].properties.map((property) => property.name)).toEqual(['type', 'size']);
    expect(input?.variants[1].properties.map((property) => property.name)).toEqual(['type', 'radius']);
    expect(model.apiRuntimeExports).toMatchObject([
      { name: 'createExample', kind: 'function', anchor: 'api-function-create-example' },
      { name: 'exampleTypes', kind: 'variable', anchor: 'api-value-example-types', type: '["point", "circle"]' }
    ]);
  });
});

describe('renderType', () => {
  it('renders common TypeDoc type nodes as TypeScript expressions', () => {
    expect(
      renderType({
        type: 'array',
        elementType: {
          type: 'union',
          types: [
            { type: 'intrinsic', name: 'string' },
            { type: 'intrinsic', name: 'number' }
          ]
        }
      })
    ).toBe('(string | number)[]');
    expect(
      renderType({
        type: 'tuple',
        elements: [
          { type: 'namedTupleMember', name: 'x', isOptional: false, element: { type: 'intrinsic', name: 'number' } },
          { type: 'namedTupleMember', name: 'label', isOptional: true, element: { type: 'intrinsic', name: 'string' } }
        ]
      })
    ).toBe('[x: number, label?: string]');
    expect(
      renderType({
        type: 'conditional',
        checkType: { type: 'reference', name: 'T' },
        extendsType: { type: 'intrinsic', name: 'string' },
        trueType: { type: 'intrinsic', name: 'number' },
        falseType: { type: 'intrinsic', name: 'never' }
      })
    ).toBe('T extends string ? number : never');
    expect(
      renderType({
        type: 'mapped',
        parameter: 'K',
        parameterType: { type: 'typeOperator', operator: 'keyof', target: { type: 'reference', name: 'Source' } },
        templateType: { type: 'indexedAccess', objectType: { type: 'reference', name: 'Source' }, indexType: { type: 'reference', name: 'K' } },
        optionalModifier: '+'
      })
    ).toBe('{ [K in keyof Source]?: Source[K] }');
    expect(
      renderType({
        type: 'reflection',
        declaration: {
          signatures: [
            {
              parameters: [{ name: 'value', type: { type: 'intrinsic', name: 'number' } }],
              type: { type: 'intrinsic', name: 'string' }
            }
          ]
        }
      })
    ).toBe('(value: number) => string');
  });
});
