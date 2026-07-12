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
  IOverlayParam: '#api-overlayparam',
  ISetOverlayParam: '#api-setoverlayparam'
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function linkDocumentedTypes(value: string): string {
  const escapedValue = escapeHtml(value);
  return escapedValue.replace(/\b(IOverlayParam|ISetOverlayParam)\b/g, (type) => `<a href="${typeAnchors[type]}">${type}</a>`);
}

export function getOverlayLayerMethodRows(rows: MethodRow[]): MethodRow[] {
  const overlayLayer = generatedApi.classes.OverlayLayer;
  if (!overlayLayer) throw new Error('OverlayLayer is not documented by TypeDoc');

  return rows.map((row) => {
    const methodName = row.name.split('(', 1)[0];
    const method = overlayLayer.methods[methodName as keyof typeof overlayLayer.methods];
    if (!method) throw new Error(`OverlayLayer method is not documented by TypeDoc: ${methodName}`);

    const params = methodName === 'get' || methodName === 'remove' ? 'id?: string' : method.params;
    const returns = methodName === 'get' ? 'Overlay | Overlay[]' : method.returns;
    return { ...row, name: methodName, params: linkDocumentedTypes(params), returns: linkDocumentedTypes(returns) };
  });
}

export function getOverlayLayerInterfaceRows(interfaceName: 'IOverlayParam' | 'ISetOverlayParam', rows: AttributeRow[]): AttributeRow[] {
  const apiInterface = generatedApi.interfaces[interfaceName];
  if (!apiInterface) throw new Error(`${interfaceName} is not documented by TypeDoc`);

  return rows.map((row) => {
    const property = apiInterface.properties[row.name as keyof typeof apiInterface.properties];
    if (!property) throw new Error(`${interfaceName} property is not documented by TypeDoc: ${row.name}`);
    return { ...row, type: linkDocumentedTypes(property.type) };
  });
}
