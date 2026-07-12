import { generatedApi } from '../generated/api';

interface MethodRow extends Record<string, string> {
  name: string;
  desc: string;
  params: string;
  returns: string;
}

export function getPointLayerMethodRows(rows: MethodRow[]): MethodRow[] {
  const methods = generatedApi.classes.PointLayer?.methods ?? {};
  return rows.map((row) => {
    const methodName = row.name.slice(0, row.name.indexOf('('));
    const method = methods[methodName as keyof typeof methods];
    if (!method) throw new Error(`PointLayer method is not documented by TypeDoc: ${methodName}`);
    return { ...row, params: method.params, returns: method.returns };
  });
}
