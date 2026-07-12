import { generatedApi } from '../generated/api';

interface MethodRow extends Record<string, string> {
  name: string;
  desc: string;
  params: string;
  returns: string;
}

interface AttributeRow extends Record<string, string> {
  name: string;
  desc: string;
  type: string;
}

const typeAnchors: Record<string, string> = {
  IPolygonParam: '#api-polygonparam',
  ISetPolygonParam: '#api-setpolygonparam',
  IGeometryFill: '/components/circle-layer#api-type-igeometryfill',
  IStroke: '/components/point-layer#api-type-istroke',
  ILabel: '/components/point-layer#api-type-ilabel'
};

function linkDocumentedTypes(value: string): string {
  return value.replace(/\b(IPolygonParam|ISetPolygonParam|IGeometryFill|IStroke|ILabel)(?:&lt;[^&]+&gt;|<[^>]+>)?/g, (type) => {
    const name = type.match(/^[A-Za-z]+/)?.[0] ?? type;
    return `<a href="${typeAnchors[name]}">${type.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`;
  });
}

export function getPolygonLayerMethodRows(rows: MethodRow[]): MethodRow[] {
  const methods = generatedApi.classes.PolygonLayer?.methods ?? {};
  return rows.map((row) => {
    const methodName = row.name.split('(', 1)[0];
    const method = methods[methodName as keyof typeof methods];
    if (!method) throw new Error(`PolygonLayer method is not documented by TypeDoc: ${methodName}`);
    return { ...row, name: methodName, params: linkDocumentedTypes(method.params), returns: linkDocumentedTypes(method.returns) };
  });
}

export function getPolygonLayerInterfaceRows(interfaceName: 'IPolygonParam' | 'ISetPolygonParam', rows: AttributeRow[]): AttributeRow[] {
  const properties = generatedApi.interfaces[interfaceName]?.properties ?? {};
  return rows.map((row) => {
    const property = properties[row.name as keyof typeof properties];
    if (!property) throw new Error(`${interfaceName} property is not documented by TypeDoc: ${row.name}`);
    return { ...row, type: linkDocumentedTypes(property.type) };
  });
}
