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
  IPointParam: '#api-pointparam',
  ISetPointParam: '#api-setpointparam',
  IRgbColor: '#api-type-irgbcolor',
  IFill: '#api-type-ifill',
  IStroke: '#api-type-istroke',
  ILabel: '#api-type-ilabel'
};

function linkDocumentedTypes(value: string): string {
  return value.replace(/\b(IPointParam|ISetPointParam|IRgbColor|IFill|IStroke|ILabel)(?:&lt;[^&]+&gt;|<[^>]+>)?/g, (type) => {
    const name = type.match(/^[A-Za-z]+/)?.[0] ?? type;
    return `<a href="${typeAnchors[name]}">${type.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`;
  });
}

export function getPointLayerMethodRows(rows: MethodRow[]): MethodRow[] {
  const methods = generatedApi.classes.PointLayer?.methods ?? {};
  return rows.map((row) => {
    const methodName = row.name.slice(0, row.name.indexOf('('));
    const method = methods[methodName as keyof typeof methods];
    if (!method) throw new Error(`PointLayer method is not documented by TypeDoc: ${methodName}`);
    return { ...row, params: linkDocumentedTypes(method.params), returns: linkDocumentedTypes(method.returns) };
  });
}

export function getBaseMethodRows(rows: MethodRow[]): MethodRow[] {
  const methods = generatedApi.classes.Base?.methods ?? {};
  return rows.map((row) => {
    const methodName = row.name.slice(0, row.name.indexOf('('));
    const method = methods[methodName as keyof typeof methods];
    if (!method) throw new Error(`Base method is not documented by TypeDoc: ${methodName}`);
    return { ...row, params: method.params, returns: method.returns };
  });
}

export function getPointLayerInterfaceRows(interfaceName: keyof typeof generatedApi.interfaces, rows: AttributeRow[]): AttributeRow[] {
  const properties = (generatedApi.interfaces[interfaceName]?.properties ?? {}) as Record<string, { type: string }>;
  return rows.map((row) => {
    const property = properties[row.name];
    if (!property) throw new Error(`${interfaceName} property is not documented by TypeDoc: ${row.name}`);
    return { ...row, type: linkDocumentedTypes(property.type) };
  });
}
