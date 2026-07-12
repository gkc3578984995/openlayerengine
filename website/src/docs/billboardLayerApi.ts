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
  IBillboardParam: '#api-billboardparam',
  ISetBillboardParam: '#api-setbillboardparam',
  ILabel: '/components/point-layer#api-type-ilabel'
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function linkDocumentedTypes(value: string): string {
  const escapedValue = escapeHtml(value);
  return escapedValue.replace(/\b(IBillboardParam|ISetBillboardParam|ILabel)\b/g, (type) => `<a href="${typeAnchors[type]}">${type}</a>`);
}

export function getBillboardLayerMethodRows(rows: MethodRow[]): MethodRow[] {
  const billboardLayer = generatedApi.classes.BillboardLayer;
  if (!billboardLayer) throw new Error('BillboardLayer is not documented by TypeDoc');

  return rows.map((row) => {
    const methodName = row.name.split('(', 1)[0];
    const method = billboardLayer.methods[methodName as keyof typeof billboardLayer.methods];
    if (!method) throw new Error(`BillboardLayer method is not documented by TypeDoc: ${methodName}`);
    const returns = methodName === 'getIconExtent' && method.returns === 'null | unknown' ? '[number, number, number, number] | null' : method.returns;
    return { ...row, name: methodName, params: linkDocumentedTypes(method.params), returns: linkDocumentedTypes(returns) };
  });
}

export function getBillboardLayerInterfaceRows(interfaceName: 'IBillboardParam' | 'ISetBillboardParam', rows: AttributeRow[]): AttributeRow[] {
  const apiInterface = generatedApi.interfaces[interfaceName];
  if (!apiInterface) throw new Error(`${interfaceName} is not documented by TypeDoc`);

  return rows.map((row) => {
    const property = apiInterface.properties[row.name as keyof typeof apiInterface.properties];
    if (!property) throw new Error(`${interfaceName} property is not documented by TypeDoc: ${row.name}`);
    return { ...row, type: linkDocumentedTypes(property.type) };
  });
}
