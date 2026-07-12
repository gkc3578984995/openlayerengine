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

type PolylineInterfaceName = 'IPolylineParam' | 'ISetPolylineParam' | 'IPolylineFlyParam';

const typeAnchors: Record<string, string> = {
  IPolylineParam: '#api-polylineparam',
  ISetPolylineParam: '#api-setpolylineparam',
  IPolylineFlyParam: '#api-polylineflyparam',
  IStroke: '/components/point-layer#api-type-istroke',
  ILabel: '/components/point-layer#api-type-ilabel'
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function linkDocumentedTypes(value: string): string {
  const escapedValue = escapeHtml(value);
  return escapedValue.replace(
    /\b(IPolylineParam|ISetPolylineParam|IPolylineFlyParam|IStroke|ILabel)\b/g,
    (type) => `<a href="${typeAnchors[type]}">${type}</a>`
  );
}

export function getPolylineLayerMethodRows(rows: MethodRow[]): MethodRow[] {
  const polylineLayer = generatedApi.classes.PolylineLayer;
  if (!polylineLayer) throw new Error('PolylineLayer is not documented by TypeDoc');

  return rows.map((row) => {
    const methodName = row.name.split('(', 1)[0];
    const method = polylineLayer.methods[methodName as keyof typeof polylineLayer.methods];
    if (!method) throw new Error(`PolylineLayer method is not documented by TypeDoc: ${methodName}`);
    const params = ['remove', 'removeFlightLine', 'hide', 'show'].includes(methodName) ? 'id?: string' : method.params;
    return { ...row, name: methodName, params: linkDocumentedTypes(params), returns: linkDocumentedTypes(method.returns) };
  });
}

export function getPolylineLayerInterfaceRows(interfaceName: PolylineInterfaceName, rows: AttributeRow[]): AttributeRow[] {
  const apiInterface = generatedApi.interfaces[interfaceName];
  if (!apiInterface) throw new Error(`${interfaceName} is not documented by TypeDoc`);

  return rows.map((row) => {
    const properties = apiInterface.properties as Record<string, { type: string }>;
    const property = properties[row.name];
    if (!property) throw new Error(`${interfaceName} property is not documented by TypeDoc: ${row.name}`);
    return { ...row, type: linkDocumentedTypes(property.type) };
  });
}
